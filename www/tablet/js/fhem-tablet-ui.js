/* FHEM tablet ui */
/**
* UI builder framework for FHEM
*
* Version: 2.1.1
*
* Copyright (c) 2015-2016 Mario Stephan <mstephan@shared-files.de>
* Under MIT License (http://www.opensource.org/licenses/mit-license.php)
*
*/

/* ToDo:
    -
*/

// -------- Widget Base---------
var Modul_widget = function () {

    function init() {
        var me = this;
        ftui.log(1,"init widget: "+this.widgetname);
        this.elements = $('div[data-type="'+this.widgetname+'"]',this.area);
        this.elements.each(function(index) {
            me.init_attr($(this));
            me.init_ui($(this));
        });
    };

    function init_attr(elem) {};
    function init_ui(elem) {elem.text(this.widgetname);};

    function addReading(elem,key) {
            var data = elem.data(key);
            if (data && $.isArray(data) || !data.match(/^[#\.\[].*/)){
                var device = elem.data('device');
                if(! $.isArray(data)) {
                    data = new Array(data);
                }
                for(var i=0,len=data.length; i<len; i++) {
                    var reading = data[i];
                    // fully qualified readings => DEVICE:READING
                    if(reading.match(/:/)) {
                        var fqreading = reading.split(':');
                        device = fqreading[0]
                        reading = fqreading[1];
                    }
                    // fill objects for mapping from FHEMWEB paramid to device + reading
                    if (isValid(device) && isValid(reading)){
                        var paramid = (reading==='STATE') ? device : [device,reading].join('-');
                        this.subscriptions[paramid]={};
                        this.subscriptions[paramid].device=device;
                        this.subscriptions[paramid].reading=reading;
                    }
                }
            }
    };

    function update (dev,par) {ftui.log(1,'warning: '+this.widgetname+' does not implement update function');};

    return {
        widgetname: 'widget',
        area: '',
        init: init,
        init_attr:init_attr,
        init_ui:init_ui,
        update: update,
        addReading:addReading,
        subscriptions: {},
    };
};

// ------- Plugins --------
var plugins = {
  modules: [],
  addModule: function (module) {
    this.modules.push(module);
  },
  removeArea: function (area) {
    for (var i = this.modules.length - 1; i >= 0; i -= 1) {
      if (this.modules[i].area === area) {
          this.modules.splice(i, 1);
      }
    }
  },
  updateParameters: function () {
    ftui.subscriptions={};
    ftui.subscriptionTs={};
    for (var i = this.modules.length - 1; i >= 0; i -= 1) {
        var module = this.modules[i];
        for (var key in module.subscriptions) {
          ftui.subscriptions[key]=module.subscriptions[key];
          ftui.subscriptionTs[key+'-ts']=module.subscriptions[key];
        }
    }
  },
  load: function (area,name) {
    ftui.log(2,'Load widget : '+name);
    return ftui.loadplugin('widget_'+name, function () {
        ftui.log(2,'Create widget : '+name);
        var module = (window["Modul_"+name]) ? new window["Modul_"+name]() : new window["Modul_widget"]();
        if (module){
            plugins.addModule(module);
            if (isValid(area))
                module.area = area;

            module.init();

            //update all what we have until now
            for (var key in module.subscriptions) {
               module.update(module.subscriptions[key].device,module.subscriptions[key].reading);
            }
            ftui.log(1,'Loaded plugin: '+ name);
        }
        else
          ftui.log(1,'Failed to create widget: '+ name);
    },function () {
        ftui.log(1,'Failed to load plugin : '+name+'  - add <script src="/fhem/tablet/js/widget_'+name+'.js" defer></script> do your page, to see more informations about this');
    },true);
  },
  update: function (dev,par) {  
    $.each(this.modules, function (index, module) {
      //Iterate each module and run update function
      module.update(dev,par);
    });
      ftui.log(1,'update done for "'+dev+':'+par+'"');
  }
}

// -------- FTUI ----------

var ftui = {
   config: {
        DEBUG: false,
        DEMO:false,
        dir:'',
        filename:'',
        fhem_dir:'',
        debuglevel:0,
        doLongPoll:false,
        shortpollInterval:0,
        styleCollection:{},
        stdColors:["green","orange","red","ligthblue","blue","gray"],
    },
    poll: {currLine:0,xhr:null,longPollRequest:null,shortPollTimer:null,longPollTimer:null,},
    states: {'lastSetOnline':0,'lastShortpoll':0,'longPollRestart':false},
    deviceStates:{},
    paramIdMap:{},
    timestampMap:{},
    subscriptions:{},
    subscriptionTs:{},
    gridster:{instances:{},instance:null,wx:0,wy:0,wm:5,mincols:0},

    init: function() {
        ftui.paramIdMap={};
        ftui.timestampMap={};
        ftui.loadStyleSchema();
        ftui.gridster.wx = parseInt( $("meta[name='widget_base_width']").attr("content") || 74);
        ftui.gridster.wy = parseInt( $("meta[name='widget_base_height']").attr("content") || 71);
        ftui.gridster.mincols = parseInt( $("meta[name='widget_min_cols']").attr("content") || $(window).width()/ftui.gridster.wx  );
        if ( $("meta[name='widget_margin']").attr("content") )
          ftui.gridster.wm = parseInt( $("meta[name='widget_margin']").attr("content") );
        ftui.config.doLongPoll = ($("meta[name='longpoll']").attr("content") == '1');
        ftui.config.DEMO = ($("meta[name='demo']").attr("content") == '1');
        ftui.config.debuglevel  = $("meta[name='debug']").attr("content") || 0;
        ftui.config.DEBUG = ( ftui.config.debuglevel>0 );
        ftui.config.TOAST  = ($("meta[name='toast']").attr("content") != '0');
        ftui.config.shortpollInterval  = $("meta[name='shortpoll-only-interval']").attr("content") || 30;
        //self path
        ftui.config.dir = $('script[src*="fhem-tablet-ui"]').attr('src');
        var name = ftui.config.dir.split('/').pop();
        ftui.config.dir = ftui.config.dir.replace('/'+name,"");
        ftui.log(1,'Plugin dir: '+ftui.config.dir);
        var url = window.location.pathname;
        ftui.config.filename = url.substring(url.lastIndexOf('/')+1);
        ftui.log(1,'Filename: '+ftui.config.filename);
        ftui.config.fhem_dir = $("meta[name='fhemweb_url']").attr("content") || "/fhem/";
        ftui.log(1,'FHEM dir: '+ftui.config.fhem_dir);

        //add background for modal dialogs
        $("<div id='shade' />").prependTo('body').hide();
        $("#shade").on('click',function() {
            $(document).trigger("shadeClicked");
        });

        ftui.readStatesLocal();
        ftui.initPage();
        $(document).on("initWidgetsDone",function(){
            // refresh every x secs
           ftui.startShortPollInterval(1000);
        });

        $(document).one("updateDone",function(){
           ftui.initLongpoll();
        });

        $("*:not(select)").focus(function(){
            $(this).blur();
        });

        if (ftui.config.debuglevel>0){
            setInterval(function () {
                //get current values of readings every x seconds
                ftui.healthCheck();
             }, 60000);

        }
    },

    initGridster: function(area){
        if ($.fn.gridster){
            if (ftui.gridster.instances[area])
                ftui.gridster.instances[area].destroy();
            ftui.gridster.instances[area] = $(".gridster > ul",area).gridster({
              widget_base_dimensions: [ftui.gridster.wx, ftui.gridster.wy],
              widget_margins: [ftui.gridster.wm, ftui.gridster.wm],
              draggable: {
                handle: '.gridster li > header'
              },
              min_cols:parseInt(ftui.gridster.mincols),
            }).data('gridster');
            if (ftui.gridster.instances[area]){
                if($("meta[name='gridster_disable']").attr("content") == '1') {
                    ftui.gridster.instances[area].disable();
                }
                if($("meta[name='gridster_starthidden']").attr("content") == '1') {
                    $('.gridster').hide();
                }
            }
        }
    },

    initPage: function(area){

        //init gridster
        area = (isValid(area)) ? area : '';
        console.time('initPage');
        console.log('initPage - area=',area);

        // postpone shortpoll start
        ftui.startShortPollInterval();

        ftui.initGridster(area);

        //include extern html code
        var total = $('[data-template]',area).length;
        ftui.log(2,'count of templates:',total);

        if (total>0){
            $('[data-template]',area).each(function(index) {
                var tempelem = $(this);
                $.get(
                    tempelem.data('template'),
                    {},
                    function (data) {
                        var parValues = tempelem.data('parameter');
                        for (var key in parValues) {
                            data = data.replace(new RegExp(key, 'g'), parValues[key]);
                        }
                        tempelem.html(data);
                        if (index === total - 1) {
                            //continue after loading the includes
                            ftui.initWidgets(area);
                        }
                    }
                );
            });
        }
        else{
           //continue immediately with initWidgets
          ftui.initWidgets(area);
        }
    },

    initWidgets: function(area) {

        area = (isValid(area)) ? area : '';
        var types = [];
        ftui.log(3,plugins);
        plugins.removeArea(area);
        ftui.log(3,plugins);

        //collect required widgets types
        $('div[data-type]',area).each(function(index){
            var type = $(this).data("type");
            if (types.indexOf(type)<0){
                  types.push(type);
            }
        });

        //init widgets
        var deferredArr = $.map(types, function(widget_type, i) {
            return plugins.load(area,widget_type);
        });

        //get current values of readings not before all widgets are loaded
        $.when.apply(this, deferredArr).then(function() {
            setTimeout(function(){
                plugins.updateParameters();
                ftui.log(1,'initWidgets - Done')
                console.timeEnd('initPage');
                $(document).trigger("initWidgetsDone");
            }, 50);
        });
    },

    initLongpoll: function(){
        if ( ftui.config.doLongPoll ){
            var longpollDelay = $("meta[name='longpoll-delay']").attr("content");
            longpollDelay = ($.isNumeric(longpollDelay)) ? longpollDelay * 1000 : 100;
            ftui.startLongPollInterval(longpollDelay);
        }
    },

    startShortPollInterval: function(delay) {
        ftui.log(1,'start shortpoll in (ms):'+ (delay || ftui.config.shortpollInterval*1000));
        clearInterval(ftui.shortPollTimer);
        ftui.shortPollTimer = setTimeout(function () {
            //get current values of readings every x seconds
            ftui.shortPoll();
            ftui.startShortPollInterval() ;
         }, (delay || ftui.config.shortpollInterval*1000));
    },

    startLongPollInterval: function(interval) {
        if (ftui.config.DEBUG && interval>999) ftui.toast("Start Longpoll in " + interval/1000 + "s");
        clearInterval(ftui.longPollTimer);
        ftui.longPollTimer = setTimeout(function() {
            ftui.longPoll();
        }, interval);
        ftui.config.shortpollInterval = $("meta[name='shortpoll-interval']").attr("content") || 15 * 60; // 15 minutes
    },

    shortPoll: function() {
        var ltime = new Date().getTime() / 1000;
        if ((ltime - ftui.states.lastShortpoll) < ftui.config.shortpollInterval)
            return;
        ftui.log(1,'start shortpoll');
        var startTime = new Date();

        // invalidate all readings for detection of outdated ones
        for (var device in ftui.deviceStates) {
            var params = ftui.deviceStates[device];
            for (reading in params) {
                params[reading].valid = false;
            }
        }
        //Request all devices from FHEM
        console.time('get jsonlist2');
        $.getJSON(ftui.config.fhem_dir,
                  {cmd: 'jsonlist2',
                   XHR:1,
                   timeout: 30000},  function (fhemJSON) {
           console.timeEnd('get jsonlist2');
           console.time('read jsonlist2');

            // function to import data
            function checkReading(device,section){
               for (var reading in section) {
                 var isUpdated = false;
                 var paramid = (reading==='STATE') ? device : [device,reading].join('-');
                 var newParam = section[reading];
                 if (typeof newParam!=='object')
                       newParam={"Value": newParam,"Time": ''};

                 // is there a subscription, then check and update widgets
                 if( ftui.subscriptions[paramid] ){
                       var oldParam = ftui.getParameters(device,reading);
                       isUpdated = (!oldParam || oldParam.val!==newParam.Value || oldParam.date!==newParam.Time);
                 }
                 //write into internal cache object
                 var params = ftui.deviceStates[device] || {};
                 var param = params[reading]  || {};
                 param.date = newParam.Time;
                 param.val = newParam.Value;
                 param.valid = true;
                 params[reading] = param;
                 ftui.deviceStates[device]= params;

                 ftui.paramIdMap[paramid]={};
                 ftui.paramIdMap[paramid].device=device;
                 ftui.paramIdMap[paramid].reading=reading;
                 ftui.timestampMap[paramid+'-ts']={};
                 ftui.timestampMap[paramid+'-ts'].device=device;
                 ftui.timestampMap[paramid+'-ts'].reading=reading;

                 //update widgets only if necessary
                 if(isUpdated){
                    plugins.update(device,reading);
                 }
               }

            }

            // import the whole fhemJSON
            var len = fhemJSON.Results.length;
            ftui.log(1,'shortpoll: json-len='+len);
            var results = fhemJSON.Results;
            for(var i = 0; i < len; i++){
              var res = results[i];
              var devName = res.Name;
              if (devName.indexOf('FHEMWEB') !== 0){
                   checkReading(devName,res.Readings);
                   checkReading(devName,res.Internals);
                   checkReading(devName,res.Attributes);
              }
            }

            // finished
            if (ftui.config.DEBUG) {
                var duration = diffSeconds(startTime,new Date());
                var paramCount = Object.keys(ftui.paramIdMap).length;
                ftui.toast("Full refresh done in "
                       +duration+"s for "
                       +paramCount+" parameter(s)");
            }
            ftui.log(1,'shortPoll - Done');
            ftui.onUpdateDone();
            ftui.states.lastShortpoll = ltime;
            console.timeEnd('read jsonlist2');
        });
    },

    longPoll: function() {
        if (ftui.config.DEMO) {console.log('DEMO-Mode: no longpoll');return;}
        if (ftui.xhr){
            console.log('valid ftui.xhr found');
            //ftui.xhr.abort();
            return;
        }
        if (ftui.longPollRequest){
            console.log('valid ftui.longPollRequest found');
            //ftui.longPollRequest.abort();
            return;
        }
        ftui.poll.currLine=0;
        if (ftui.config.DEBUG) {
            if (ftui.states.longPollRestart)
                ftui.toast("Longpoll re-started");
            else
                ftui.toast("Longpoll started");
        }
        ftui.log(1,(ftui.states.longPollRestart)?"Longpoll re-started":"Longpoll started");
        ftui.states.longPollRestart=false;
        ftui.longPollRequest=$.ajax({
            url: ftui.config.fhem_dir,
            cache: false,
            async: true,
            data: {
                XHR:1,
                inform: "type=status;filter=.*;fmt=JSON"
            },
            xhr: function() {
                ftui.xhr = new window.XMLHttpRequest();
                ftui.xhr.addEventListener("readystatechange", function(e){
                    var data = e.target.responseText;
                    if ( e.target.readyState == 4) {
                        return;
                    }
                    if ( e.target.readyState == 3 ){
                        var lines = data.split(/\n/);//.replace(/<br>/g,"").split(/\n/);
                        lines.pop(); //remove last empty line

                        for (var i=ftui.poll.currLine, len = lines.length; i < len; i++) {
                            if (isValid(lines[i])){
                                var dataJSON = JSON.parse(lines[i]);
                                var params = null;
                                var param = null;
                                var isSTATE = ( dataJSON[1] !== dataJSON[2] );

                                ftui.log(2,dataJSON);

                                var pmap = ftui.paramIdMap[dataJSON[0]];
                                var tmap = ftui.timestampMap[dataJSON[0]];
                                // update for a paramter
                                if ( pmap ) {
                                  if (isSTATE)
                                    pmap.reading = 'STATE';
                                  params = ftui.deviceStates[pmap.device] || {};
                                  param = params[pmap.reading]  || {};
                                  param.val = dataJSON[1];
                                  param.valid = true;
                                  params[pmap.reading] = param;
                                  ftui.deviceStates[pmap.device]= params;
                                  // dont wait for timestamp for STATE paramters
                                  if (isSTATE && ftui.subscriptions[dataJSON[0]])
                                     plugins.update(pmap.device,pmap.reading);
                                }
                                // update for a timestamp
                                // STATE updates has no timestamp
                                if ( tmap  && !isSTATE ) {
                                  params = ftui.deviceStates[tmap.device] || {};
                                  param = params[tmap.reading]  || {};
                                  param.date = dataJSON[1];
                                  params[tmap.reading] = param;
                                  ftui.poll.timestamp = param.date;
                                  ftui.deviceStates[tmap.device]= params;
                                  // paramter + timestamp update now completed -> update widgets
                                  if (ftui.subscriptionTs[dataJSON[0]])
                                     plugins.update(tmap.device,tmap.reading);
                                }
                            }
                        }
                        ftui.poll.currLine = lines.length;
                        if (ftui.poll.currLine>1024){
                            ftui.states.longPollRestart=true;
                            ftui.longPollRequest.abort();
                        }
                    }
                }, false);
                return ftui.xhr;
                }
        })
        .done ( function( data ) {
            if (ftui.xhr){
                ftui.xhr.abort();
                ftui.xhr = null;
            }
            ftui.longPollRequest = null;
            if (ftui.states.longPollRestart)
                ftui.longPoll();
            else{
                ftui.log(1,"Disconnected from FHEM - poll done - "+data);
                ftui.restartLongPoll();
            }
        })
        .fail (function(jqXHR, textStatus, errorThrown) {
            if (ftui.xhr){
                ftui.xhr.abort();
                ftui.xhr = null;
            }
            ftui.longPollRequest = null;
            if (ftui.states.longPollRestart)
                ftui.longPoll();
            else{
                ftui.log(1,"Error while longpoll: " + textStatus + ": " + errorThrown);
                ftui.restartLongPoll();
            }
        });
    },

    setFhemStatus: function(cmdline) {
        if (ftui.config.DEMO) {console.log('DEMO-Mode: no setFhemStatus');return;}
        ftui.startShortPollInterval();
        cmdline = cmdline.replace('  ',' ');
        ftui.log(1,'send to FHEM: '+cmdline);
        $.ajax({
            async: true,
            cache:false,
            url: ftui.config.fhem_dir,
            data: {
                cmd: cmdline,
                XHR: "1"
            }
        })
        .fail (function(jqXHR, textStatus, errorThrown) {
                ftui.toast("Error: " + textStatus + ": " + errorThrown);
        })
        .done ( function( data ) {
            // really neccessary ?
            /*if ( !ftui.config.doLongPoll ){
                setTimeout(function(){
                    ftui.shortPoll();
                }, 4000);
            }*/
        });
    },

    loadStyleSchema: function (){
        $.each($('link[href$="-ui.css"],link[href$="-ui.min.css"]') , function (index, thisSheet) {
            if (!thisSheet || !thisSheet.sheet || !thisSheet.sheet.cssRules) return;
            var rules = thisSheet.sheet.cssRules;
            for (var r in rules){
                if (rules[r].style){
                   var styles = rules[r].style.cssText.split(';');
                   styles.pop();
                   var elmName = rules[r].selectorText;
                   var params = {};
                   for (var s in styles){
                       var param = styles[s].toString().split(':');
                       if (param[0].match(/color/)){
                          params[$.trim(param[0])]=$.trim(param[1]).replace('! important','').replace('!important','');
                       }
                   }
                   if (Object.keys(params).length>0)
                       ftui.config.styleCollection[elmName]=params;
                }
            }
        });
    },

    onUpdateDone: function(){
        $(document).trigger("updateDone");
        ftui.checkInvalidElements();
    },

    checkInvalidElements: function(){
        $('div.autohide[data-get]').each(function(index){
            var elem = $(this);
            var valid = elem.getReading('get').valid;
            if ( valid && valid===true )
                elem.removeClass('invalid');
            else
                elem.addClass('invalid');
        });
    },

    setOnline: function(){
        var ltime = new Date().getTime() / 1000;
        if ((ltime - ftui.states.lastSetOnline) > 60){
            if (ftui.config.DEBUG) ftui.toast("Network connected");
            ftui.states.lastSetOnline = ltime;
            ftui.startShortPollInterval(100);
            if (!ftui.config.doLongPoll){
                ftui.config.doLongPoll  = ($("meta[name='longpoll']").attr("content") == '1');
                if ( ftui.config.doLongPoll )
                    ftui.startLongPollInterval(100);
            }
            ftui.log(1,'FTUI is online');
        }
    },

    setOffline: function(){
        if (ftui.config.DEBUG) ftui.toast("Lost network connection");
        ftui.config.doLongPoll = false;
        clearInterval(ftui.shortPollTimer);
        clearInterval(ftui.longPollTimer);
        if (ftui.longPollRequest)
            ftui.longPollRequest.abort();
        ftui.saveStatesLocal();
        ftui.log(1,'FTUI is offline');
    },

    readStatesLocal: function(){
        if (!ftui.config.DEMO)
            ftui.deviceStates=JSON.parse(localStorage.getItem('deviceStates')) || {};
        else {
            $.ajax({async: false,url: "/fhem/tablet/data/"+ftui.config.filename.replace(".html",".dat"),})
            .done ( function( data ) {ftui.deviceStates=JSON.parse(data) || {};});
        }
    },

    saveStatesLocal: function(){
        //save deviceStates into localStorage
        var dataToStore = JSON.stringify(ftui.deviceStates);
        localStorage.setItem('deviceStates', dataToStore);
    },

    restartLongPoll: function(){
        ftui.toast("Disconnected from FHEM");
        if ( ftui.config.doLongPoll ){
            ftui.toast("Retry to connect in 10 seconds");
            setTimeout(function(){
                ftui.longPoll();
            }, 10000);
        }
    },

    getParameters: function (devname, paraname) {
        if (devname && devname.length>0){
            var params = ftui.deviceStates[devname];
            return ( params && params[paraname] ) ? params[paraname] : null;
        }
        return null;
    },

    loadplugin: function(plugin, success, error, async) {
         return ftui.dynamicload('js/'+plugin+'.js', success, error, async);
    },

    dynamicload: function(file, success, error, async) {
        var cache = (ftui.config.DEBUG) ? false : true;
        return $.ajax({
            url: ftui.config.dir + '/../' + file,
            dataType: "script",
            cache: cache,
            async: async || false,
            context:{name: name},
            success: success||function(){ return true },
            error: error||function(){ return false },
        });
    },

    healthCheck: function(){
        var d = new Date();
        d.setTime(ftui.states.lastShortpoll*1000);
        console.log('--------- start healthCheck --------------');
        console.log('Longpoll:',ftui.config.doLongPoll);
        console.log('Longpoll objects there:',(isValid(ftui.longPollRequest) && isValid(ftui.xhr)));
        console.log('Longpoll curent line:',ftui.poll.currLine);
        console.log('Longpoll last timestamp:',ftui.poll.timestamp);
        console.log('Shortpoll interval:',ftui.config.shortpollInterval);
        console.log('Shortpoll last run:',d.ago());
        console.log('FHEM dev/par count:',Object.keys(ftui.paramIdMap).length);
        console.log('Page length:',$('html').html().length);
        console.log('Widgets count:',$('div[data-type]').length);
        console.log('--------- end healthCheck ---------------');
    },

    FS20: {
        'dimmerArray':[0, 6, 12, 18, 25, 31, 37, 43, 50, 56, 62, 68, 75, 81, 87, 93, 100],
        'dimmerValue': function(value){
            var idx = indexOfNumeric(this.dimmerArray,value);
            return (idx > -1) ? this.dimmerArray[idx] : 0;
        }
    },

    rgbToHsl: function(rgb){
        var r=parseInt(rgb.substring(0,2),16);
        var g=parseInt(rgb.substring(2,4),16);
        var b=parseInt(rgb.substring(4,6),16);
        r /= 255, g /= 255, b /= 255;
        var max = Math.max(r, g, b), min = Math.min(r, g, b);
        var h, s, l = (max + min) / 2;

        if(max == min){
            h = s = 0; // achromatic
        } else {
            var d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch(max){
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h /= 6;
        }
        return [h, s, l];
    },

    hslToRgb: function(h, s, l){
        var r, g, b;
        var hex = function(x) {
            return ("0" + parseInt(x).toString(16)).slice(-2);
        }

        if(s == 0){
            r = g = b = l; // achromatic
        } else {
            function hue2rgb(p, q, t){
                if(t < 0) t += 1;
                if(t > 1) t -= 1;
                if(t < 1/6) return p + (q - p) * 6 * t;
                if(t < 1/2) return q;
                if(t < 2/3) return p + (q - p) * (2/3 - t) * 6;
                return p;
            }
                var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            var p = 2 * l - q;
            r = hue2rgb(p, q, h + 1/3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1/3);
        }
        return [hex(Math.round(r * 255)), hex(Math.round(g * 255)), hex(Math.round(b * 255))].join('');
    },

    rgbToHex: function(rgb){
     var tokens = rgb.match(/^rgba?[\s+]?\([\s+]?(\d+)[\s+]?,[\s+]?(\d+)[\s+]?,[\s+]?(\d+)[\s+]?/i);
     return (tokens && tokens.length === 4) ? "#" +
      ("0" + parseInt(tokens[1],10).toString(16)).slice(-2) +
      ("0" + parseInt(tokens[2],10).toString(16)).slice(-2) +
      ("0" + parseInt(tokens[3],10).toString(16)).slice(-2) : rgb;
    },

    getGradientColor: function(start_color, end_color, percent) {
     // strip the leading # if it's there
    start_color = this.rgbToHex(start_color).replace(/^\s*#|\s*$/g, '');
    end_color   = this.rgbToHex(end_color).replace(/^\s*#|\s*$/g, '');

     // convert 3 char codes --> 6, e.g. `E0F` --> `EE00FF`
     if(start_color.length == 3){
       start_color = start_color.replace(/(.)/g, '$1$1');
     }

     if(end_color.length == 3){
       end_color = end_color.replace(/(.)/g, '$1$1');
     }

     // get colors
     var start_red = parseInt(start_color.substr(0, 2), 16),
         start_green = parseInt(start_color.substr(2, 2), 16),
         start_blue = parseInt(start_color.substr(4, 2), 16);

     var end_red = parseInt(end_color.substr(0, 2), 16),
         end_green = parseInt(end_color.substr(2, 2), 16),
         end_blue = parseInt(end_color.substr(4, 2), 16);

     // calculate new color
     var diff_red = end_red - start_red;
     var diff_green = end_green - start_green;
     var diff_blue = end_blue - start_blue;

     diff_red = ( (diff_red * percent) + start_red ).toString(16).split('.')[0];
     diff_green = ( (diff_green * percent) + start_green ).toString(16).split('.')[0];
     diff_blue = ( (diff_blue * percent) + start_blue ).toString(16).split('.')[0];

     // ensure 2 digits by color
     if( diff_red.length == 1 )
       diff_red = '0' + diff_red

     if( diff_green.length == 1 )
       diff_green = '0' + diff_green

     if( diff_blue.length == 1 )
       diff_blue = '0' + diff_blue

     return '#' + diff_red + diff_green + diff_blue;
    },

    precision: function(a) {
        var s = a + "",
        d = s.indexOf('.') + 1;
        return !d ? 0 : s.length - d;
    },

    toast: function(text){
        if (ftui.config.TOAST)
            $.toast(text);
    },

    log: function(level,text){
        if (ftui.config.debuglevel >= level)
            console.log(text);
    },
}

// event "page is loaded" -> start FTUI
$(document).on('ready', function() {
    ftui.init();
});

$(window).on('beforeunload', function(){
    ftui.log(5,'beforeunload');
    ftui.setOffline();
});

$(window).on('online offline', function() {
    ftui.log(5,'online offline');
    if (navigator.onLine)
        ftui.setOnline();
    else
        ftui.setOffline();
});



// deprecated function
function setFhemStatus(cmdline) {
    console.log('setFhemStatus is a deprecated function: use ftui.setFhemStatus instead')
     ftui.setFhemStatus(cmdline);
}

function loadplugin(plugin, success, error, async) {
    console.log('loadplugin is a deprecated function: use ftui.loadplugin instead')
    return ftui.dynamicload('js/'+plugin+'.js', success, error, async);
}

function dynamicload(file, success, error, async) {
    console.log('dynamicload is a deprecated function: use ftui.dynamicload instead')
    return ftui.dynamicload(file, success, error, async);
}


this.getPart = function (s,p) {
    if ($.isNumeric(p)){
        var c = (s && isValid(s)) ? s.split(" ") : '';
        return (c.length >= p && p>0 ) ? c[p-1] : s;
    }
    else {
        if ((s && isValid(s)) )
            var matches = s.match( new RegExp('^' + p + '$') );
        var ret='';
        if (matches) {
            for (var i=1,len=matches.length;i<len;i++) {
                ret+=matches[i];
            }
        }
        return ret;
    }
};

// deprecated function; will be removed soon
this.getDeviceValueByName = function (devname, paraname) {
    console.log('Warning: usage of deprecated function > getDeviceValueByName');
    var param = getParameterByName(devname, paraname);
    return ( param ) ? param.val : null;
}
this.getDeviceValue = function (device, src) {
    console.log('Warning: usage of deprecated function > getDeviceValue');
    var param = getParameter(device, src);
    return ( param ) ? param.val : null;
}
// deprecated function; will be removed soon
this.getReadingDateByName = function (devname, paraname) {
    console.log('Warning: usage of deprecated function > getReadingDateByName');
    var param = getParameterByName(devname, paraname);
    return ( param ) ? param.date : null;
}
this.getReadingDate = function (device, src) {
    console.log('Warning: usage of deprecated function > getReadingDate');
    var param = getParameter(device, src);
    return ( param ) ? param.date : null;
}

this.getParameterByName = function (devname, paraname) {
    console.log('Warning: usage of deprecated function > getParameterByName');
    // devname = DEVICE:READING; paraname is ignored
    if(devname.match(/:/)) {
        var temp = devname.split(':');
        devname = temp[0];
        paraname = temp[1];
    }
    if (devname && devname.length>0){
        var params = ftui.deviceStates[devname];
        return ( params && params[paraname] ) ? params[paraname] : null;
    }
    return null;
}

this.getStyle = function (selector, prop) {
    var props = ftui.config.styleCollection[selector];
    return ( props && props[prop] ) ? props[prop] : null;
}

this.getClassColor = function (elem) {
    for (var i=0, len=ftui.config.stdColors.length; i<len; i++) {
        if ( elem.hasClass(ftui.config.stdColors[i]) ){
            return getStyle('.'+ftui.config.stdColors[i],'color');
        }
    }
    return null;
}

this.getIconId = function(iconName){
    if (!iconName || iconName=='')
        return "?";
    var rules = $('link[href$="font-awesome.min.css"]')[0].sheet.cssRules;
    for (var rule in rules){
        if ( rules[rule].selectorText && rules[rule].selectorText.match(new RegExp(iconName+':') )){
            var id = rules[rule].style.content;
            if (!id)
                return iconName;
            id = id.replace(/"/g,'').replace(/'/g,"");
            return (/[^\u0000-\u00ff]/.test(id))
                    ? id
                    : String.fromCharCode(parseInt(id.replace('\\',''),16));
        }
    }
}

// global helper functions
this.isValid = function(v){
    return (typeof v !== 'undefined' && v !== 'undefined'
         && typeof v !== typeof notusedvar
         && v !== '' && v !== ' ');
}

this.showModal = function (modal) {
    if(modal)
        $("#shade").fadeIn();
    else
       $("#shade").fadeOut();
}

// global date format functions
this.dateFromString = function (str) {
 var m = str.match(/(\d+)-(\d+)-(\d+)[_\s](\d+):(\d+):(\d+).*/);
 var m2 = str.match(/(\d\d).(\d\d).(\d\d\d\d)/);
 var offset = new Date().getTimezoneOffset();
 return (m) ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])
            : (m2) ? new Date(+m2[3], +m2[2] - 1, +m2[1], 0, -offset, 0, 0)
            : new Date();
}

this.diffMinutes = function(date1,date2){
       var diff  = new Date(date2 - date1);
       return (diff/1000/60).toFixed(0);
}

this.diffSeconds = function(date1,date2){
       var diff  = new Date(date2 - date1);
       return (diff/1000).toFixed(1);
}

this.mapColor = function(value) {
    return getStyle('.'+value,'color') || value;
};

String.prototype.toDate = function() {
    return dateFromString(this);
}

Date.prototype.addMinutes = function(minutes) {
    return new Date(this.getTime() + minutes*60000);
}

Date.prototype.ago = function() {
  var now = new Date();
  var ms = (now - this) ;
  var x = ms / 1000;
  var seconds = Math.round(x % 60);
      x /= 60;
  var minutes = Math.round(x % 60);
      x /= 60;
  var hours = Math.round(x % 24);
      x /= 24;
  var days = Math.round(x);
  var userLang = navigator.language || navigator.userLanguage;
    var strUnits = (userLang.split('-')[0] === 'de')?['Tag(e)','Stunde(n)','Minute(n)','Sekunde(n)']:['day(s)','hour(s)','minute(s)','second(s)'];
  var ret = (days>0)?days +" "+strUnits[0]+ " ":"";
      ret += (hours>0)?hours +" "+strUnits[1]+ " ":"";
      ret += (minutes>0)?minutes +" "+strUnits[2]+ " ":"";
  return ret + seconds +" "+ strUnits[3];
 };

Date.prototype.yyyymmdd = function() {
  var yyyy = this.getFullYear().toString();
  var mm = (this.getMonth()+1).toString(); // getMonth() is zero-based
  var dd  = this.getDate().toString();
  return yyyy+'-'+ (mm[1]?mm:"0"+mm[0])+'-'+(dd[1]?dd:"0"+dd[0]); // padding
 };

Date.prototype.hhmm = function() {
  var hh = this.getHours().toString();
  var mm = this.getMinutes().toString();
  return (hh[1]?hh:"0"+hh[0])+':'+ (mm[1]?mm:"0"+mm[0]); // padding
 };

Date.prototype.hhmmss = function() {
  var hh = this.getHours().toString();
  var mm = this.getMinutes().toString();
  var ss  = this.getSeconds().toString();
  return (hh[1]?hh:"0"+hh[0])+':'+ (mm[1]?mm:"0"+mm[0])+':'+(ss[1]?ss:"0"+ss[0]); // padding
 };
 
Date.prototype.ddmm = function() {
  var mm = (this.getMonth()+1).toString(); // getMonth() is zero-based
  var dd  = this.getDate().toString();
  return (dd[1]?dd:"0"+dd[0])+'.'+(mm[1]?mm:"0"+mm[0])+'.'; // padding
 };

Date.prototype.eeee = function() {
    var weekday_de = ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'];
    var weekday = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    var userLang = navigator.language || navigator.userLanguage;
    if(userLang.split('-')[0] === 'de')
        return weekday_de[this.getDay()];
    return weekday[this.getDay()];
 };

Date.prototype.eee = function() {
    var weekday_de = ['Son','Mon','Die','Mit','Don','Fre','Sam'];
    var weekday = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    var userLang = navigator.language || navigator.userLanguage;
    if(userLang.split('-')[0] === 'de')
        return weekday_de[this.getDay()];
    return weekday[this.getDay()];
 };

Date.prototype.ee = function() {
    var weekday_de = ['So','Mo','Di','Mi','Do','Fr','Sa'];
    var weekday = ['Su','Mo','Tu','We','Th','Fr','Sa'];
    var userLang = navigator.language || navigator.userLanguage;
    if(userLang.split('-')[0] === 'de')
        return weekday_de[this.getDay()];
    return weekday[this.getDay()];
 };

//sadly it not possible to use Array.prototype. here
this.indexOfGeneric = function(array,find){
  if (!array) return -1;
  for (var i=0,len=array.length;i<len;i++) {
    if (!$.isNumeric(array[i]))
        return indexOfRegex(array,find);
  }
  return indexOfNumeric(array,find);
};

this.indexOfNumeric = function(array,val){
   var ret=-1;
   for (var i=0,len=array.length;i<len;i++) {
       if (Number(val)>=Number(array[i]))
           ret=i;
   }
   return ret;
};

this.indexOfRegex = function(array,find){
  for (var i=0,len=array.length;i<len;i++) {
      try {
        var match = find.match(new RegExp('^'+array[i]+'$'));
      	if (match)
            return i
      } catch(e) {}
  }
  return array.indexOf(find);
};

$.fn.once = function(a, b) {
    return this.each(function() {
        $(this).off(a).on(a,b);
    });
};

//for widget

$.fn.filterData = function(key, value) {
    return this.filter(function() {
        return $(this).data(key) == value;
    });
};
$.fn.filterDeviceReading = function(key, device, param) {
    return this.filter(function() {
        var elem = $(this);
        var value = elem.data(key);
        return  (  value === param && elem.data('device') === device )
                || (value === device + ':' + param)
                || ($.inArray(param,value)>-1 && elem.data('device') === device)
                || ($.inArray(device + ':' + param,value)>-1 );
    });
};
$.fn.isValidData = function(key) {
    return typeof $(this).data(key) != 'undefined';
};
$.fn.initData = function(key,value) {
    var elem = $(this);
    elem.data(key, elem.isValidData(key) ? elem.data(key) : value);
    return elem;
};
$.fn.mappedColor = function(key) {
    return getStyle('.'+$(this).data(key),'color') || $(this).data(key);
};
$.fn.isDeviceReading = function(key) {
    return !$.isNumeric($(this).data(key)) && $(this).data(key).match(/:/);
};
$.fn.isExternData = function(key) {
    var data = $(this).data(key);
    if (!data) return '';
    return (data.match(/^[#\.\[].*/));
};
$.fn.getReading = function (key,idx) {
    var devname = $(this).data('device'),
        paraname = $(this).data(key);
    if ( $.isArray(paraname) )
        paraname = paraname[idx];
    if(paraname && paraname.match(/:/)) {
        var temp = paraname.split(':');
        devname = temp[0];
        paraname = temp[1];
    }
    if (devname && devname.length>0){
        var params = ftui.deviceStates[devname];
        return ( params && params[paraname] ) ? params[paraname] : {};
    }
    return {};
}
$.fn.valOfData = function(key) {
    var data = $(this).data(key);
    if (!isValid(data)) return '';
    return (data.toString().match(/^[#\.\[].*/))?$(data).data('value'):data;
};
$.fn.transmitCommand = function() {
    if ($(this).hasClass('notransmit')) return;
    var cmdl = [$(this).valOfData('cmd'),$(this).valOfData('device'),$(this).valOfData('set'),$(this).valOfData('value')].join(' ');
    setFhemStatus(cmdl);
    ftui.toast(cmdl);
};
