//utilities
const createError = require('http-errors');
const express = require('express');
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
//const base_path = '/home/yuan/auth/';
const base_path_local = '/Users/yuan/Developer/GDSub/';
//GLocalization
const auth_json = 'GLocalizationProjects-4f795dcb895a.json';
//spreadsheet
const db_analyze = new spreadsheet('1CGhrERVtGU3DYoALHj75SI1A-mW75hoUP3f9pp_wbp8');
const db_subtitle = new spreadsheet('1N84ZWXOTmwSwcjaX-5-Ooiy0qQWWzVJFPBujiRdb-sA');


console.log('initialize db_analyze');
async.series([
    function setAuth(step) {
        // see notes below for authentication instructions!

        console.log('authenticating...');
        var creds = require(base_path_local + auth_json);
        db_analyze.useServiceAccountAuth(creds, step);
    },
    function getInfoAndWorksheets(step) {
        console.log('authenticated');
        db_analyze.getInfo(function(err, info) {
            if(err){
                console.log('encountered error when loading spreadsheet, error:' + err);
            }else{
                console.log('Loaded doc: '+info.title+' by '+info.author.email);

            }

            step();
        });
    }
]);


var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

//custom routes
app.get('/analyze/:videoid', function(req, res){
    console.log('video id:' + req.params.videoid);
    var videoid = req.params.videoid;
    var filename = __dirname + '/' + videoid + '.srt';
    gdsub_util.analyzeSubtitle(videoid, filename, (videoid, sentence_blocks)=>{
      console.log('subtitle analysis completed.video id:' + videoid);
      console.log('inserting analyzed data into spreadsheet');
      res.write('subtitle analysis completed.video id:' + videoid);
      res.end();
    });
    res.write('request received, video id:' + videoid);
    res.status(200);


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

module.exports = app;
