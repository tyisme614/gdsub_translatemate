//utilities
const createError = require('http-errors');
const express = require('express');
var bodyParser = require('body-parser');
//google spreadsheet
const spreadsheet = require('google-spreadsheet');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const async = require('async');
const gdsub_util = require('./utilities');
//routes
const indexRouter = require('./routes/index');
const usersRouter = require('./routes/users');

//authentication for Google Cloud Platform
const base_path = '/home/yuan/auth/';
//const base_path_local = '/Users/yuan/Developer/GDSub/';
//GLocalization
const auth_json = 'GLocalizationProjects-4f795dcb895a.json';
//spreadsheet
const db_analyze = new spreadsheet('1CGhrERVtGU3DYoALHj75SI1A-mW75hoUP3f9pp_wbp8');
const db_subtitle = new spreadsheet('1N84ZWXOTmwSwcjaX-5-Ooiy0qQWWzVJFPBujiRdb-sA');

var worksheets = [];
var block_cache = [];

console.log('initialize db_analyze');
async.series([
    function setAuth(step) {
        // see notes below for authentication instructions!

        console.log('authenticating...');
        var creds = require(base_path + auth_json);
        db_analyze.useServiceAccountAuth(creds, step);
    },
    function getInfoAndWorksheets(step) {
        console.log('authenticated');
        db_analyze.getInfo(function(err, info) {
            if(err){
                console.log('encountered error when loading spreadsheet, error:' + err);
            }else{
                console.log('Loaded doc: '+info.title+' by '+info.author.email);
                var sheets = info.worksheets;
                for(var i=0; i<sheets.length; i++){
                    var s = sheets[i];
                    console.log('adding ' + s.title + ' to local cache');
                    worksheets[s.title] = s;
                }
            }

            step();
        });
    }
]);


/**
 * event handler
 *
 */
const EventEmitter = require('events');
class customEventEmitter extends EventEmitter{};
const stateEmitter = new customEventEmitter();
stateEmitter.on(1001, (sheet, videoid, index)=>{
        console.log('event handler, index=' + index);
        var blocks = block_cache[videoid];
        if(index < blocks.length){
            var block = blocks[index];
            var item = {};
            item.starttime = block.starttime;
            item.endtime = block.endtime;
            item.english = block.sentence;
            item.chinese = '';
            item.translator = '';
            item.edittime = new Date().toString();
            item.relatedsubs = block.sub_index_arr;
            console.log('add item no.' + index + ' into spreadsheet ' + sheet.title);
            addRowST(sheet, item, function(){
                index++;
                stateEmitter.emit(1001, sheet, videoid, index);
            });
        }else{
            console.log('all data has been added to spreadsheet ');
        }
});

var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

//request subtitle analyze
app.get('/analyze/:videoid', function(req, res){
    console.log('video id:' + req.params.videoid);
    var videoid = req.params.videoid;
    var filename = __dirname + '/' + videoid + '.srt';
    gdsub_util.analyzeSubtitle(videoid, filename, (videoid, sentence_blocks)=>{
        block_cache[videoid] = sentence_blocks;
      console.log('subtitle analysis completed.video id:' + videoid);
      console.log('inserting analyzed data into spreadsheet');
      var sheet = worksheets[videoid];
      if(typeof(sheet) == 'undefined' || sheet == null){
            console.log('worksheet not exists, add new one');
          db_analyze.addWorksheet({
              title:videoid,
              headers:['starttime', 'endtime', 'english', 'chinese', 'translator', 'edittime', 'relatedsubs']
          }, function(err, sheet){
              if(err){
                  console.log('encountered error while creating worksheet, err:' + err);
              }else{
                  console.log('worksheet created, title:' + sheet.title);
                  worksheets[videoid] = sheet;
                  stateEmitter.emit(1001, sheet, videoid, 0);

              }
          });
      }else{
          console.log('worksheet already exists, clear legacy data');
          sheet.clear(function(){
             sheet.setHeaderRow(['starttime', 'endtime', 'english', 'chinese', 'translator', 'edittime', 'relatedsubs'],
                 function(){
                     stateEmitter.emit(1001, sheet, videoid, 0);
                });
          });
      }

    });
    res.write('request received, video id:' + videoid);
    res.status(200).end();


});

//request subtitle sentence
app.get('/translate/:videoid/:index', function(req, res){
    console.log('videoid:' + req.params.videoid + ' index:' + req.params.index);
    var sheet = worksheets[req.params.videoid];
    if(typeof(sheet) != 'undefined' && sheet != null){
        sheet.getRows({
            offset: req.params.index,
            limit: 1
        }, function( err, rows ){
            console.log('rows:' + rows.length);
            console.log('result:' + JSON.stringify(rows[0]));
            var data = {};
            data.sentence = rows[0].english;
            data.start = gdsub_util.convertTimeToTimestamp(rows[0].starttime);
            data.end = gdsub_util.convertTimeToTimestamp(rows[0].endtime);
            data.chinese = rows[0].chinese;
            data.translator = rows[0].translator;
            res.render('index',
                {
                    english: data.sentence,
                    chinese: data.chinese,
                    translator: data.translator
                });

        });
    }else{
        res.status(404);
        res.send('subtitle not found');
        res.end();
    }

});

//submit translation
app.post('/translate/:videoid/:index', function(req, res){

    console.log('content:' + req.body.content);
    var translation = JSON.parse(req.body.content);
    console.log('videoid:' + req.params.videoid + ' index:' + req.params.index);
    var sheet = worksheets[req.params.videoid];
    if(typeof(sheet) != 'undefined' && sheet != null){
        sheet.getRows({
            offset: req.params.index,
            limit: 1
        }, function( err, rows ){
            console.log('rows:' + rows.length);
            var row = rows[0];
            row.chinese = translation.chinese;
            row.translator = translation.translator;
            row.edittime = new Date().toString();
            row.save();
            res.status(200);
            res.send('translation saved');
            res.end();
        });
    }else{
        res.status(404);
        res.send('subtitle not found');
        res.end();
    }
});

app.use('/', indexRouter);
app.use('/users', usersRouter);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});


function postAnalysisData(worksheet, blocks){
    console.log('add analyzed subtitle data into spreadsheet');
    for(var i=0; i< blocks.length; i++){
        var block = blocks[i];
        var item = {};
        item.starttime = block.starttime;
        item.endtime = block.endtime;
        item.english = block.sentence;
        item.chinese = '';
        item.translator = '';
        item.edittime = new Date().toString();
        item.relatedsubs = block.sub_index_arr;
        console.log('add item no.' + i + ' into spreadsheet ' + worksheet.title);
        addRowST(worksheet, item);

    }
}

//update spreadsheet
function addRowST(sheet, row, callback){
    sheet.addRow(row, function(err){
        if(err){
            console.log(err);
            console.log(row);
            console.log('add the row data after 6 seconds');
            setTimeout(function(){
                addRowST(sheet, row);
            }, 6000)
        }else{
            if(typeof(callback) != 'undefined' && callback != null){
                callback();
            }
        }

    });
}

module.exports = app;
