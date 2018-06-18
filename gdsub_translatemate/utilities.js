//this file includes all methods related for subtitle translating or processing
const rl = require('linebyline');
const fs = require('fs');

//patterns
//start time
const pattern_start_time = /^[0-9][0-9]\:[0-9][0-9]\:[0-9][0-9]\,[0-9][0-9][0-9]/;
//end time
const pattern_end_time = /[0-9][0-9]\:[0-9][0-9]\:[0-9][0-9]\,[0-9][0-9][0-9]$/;

var observer;

const EventEmitter = require('events');
class customEventEmitter extends EventEmitter{};
const stateEmitter = new customEventEmitter();
stateEmitter.on(1001, (videoid, subtitle_blocks, sentence_blocks)=>{

    console.log('finished traversing subtitle:' + videoid);

    // console.log('traversing subtitle blocks');
    // for(var i=0; i<subtitle_blocks.length; i++){
    //     var b = subtitle_blocks[i];
    //     showSubtitleBlock(b);
    // }
    console.log('traversing sentence blocks');
    for(var i=0; i<sentence_blocks.length; i++){
        var b = sentence_blocks[i];
        showSentenceBlock(b);

    }

});

//callback parameter:  videoid,  sentence_blocks
exports.analyzeSubtitle = function(videoid, file, callback){
    traverse(videoid, file, callback);
};

function traverse(videoid, file,  callback){


    var subtitle_blocks = [];
    var sentence_blocks = [];


    var linecount = 0;
    var blockcount = 0;

    var sentence_index = 0;
    var rl_en = rl(file);
    var sentence = '';
    var sub_index_arr = [];
    rl_en.on('line', function(line, lineCount, byteCount) {
        //debug
        //console.log('line:' + line);

        if(linecount == 0 && line != ''){
            //create new block
            /**
             * subtitle block object
             * line number
             * timestamp
             * start_time
             * end_time
             * subtitle
             * sentence index
             * issubtitle
             */

            var block = {};
            block.line_number = line;
            block.start_time = 0;
            block.end_time = 0;
            block.timestamp = '';
            block.subtitle = '';
            block.sentence = sentence_index;
            block.issubtitle = true;
            subtitle_blocks.push(block);

            linecount++;


        }else if(linecount == 1){
            var block = subtitle_blocks[blockcount];
            var start_time = line.match(pattern_start_time)[0];
            var end_time = line.match(pattern_end_time)[0];
            block.start_time = convertTS2TM(start_time);
            block.end_time = convertTS2TM(end_time);
            block.timestamp = line;
            linecount++;
        }else{
            if(line != ''){
                // console.log('subtitle line:'+ line);
                // console.log('checking last character:' + line.substring(line.length - 1));

                var block = subtitle_blocks[blockcount];

                if(line.substring(line.length - 1) != '♪' && line.substring(line.length - 1) != ')' && line.substring(line.length - 1) != ']'){
                    sentence += line + ' ';
                    if(linecount == 2){
                        //push line number to subtitle index array
                        //console.log('push line number to tmp array, line number=' + block.line_number);
                        sub_index_arr.push(block.line_number);
                    }


                }else{
                    //debug
                    //console.log('not english subtitle, line:' + line);
                    block.issubtitle = false;
                    block.sentence = -1;

                }

                if(line.substring(line.length - 1) == '.' || line.substring(line.length - 1) == '?'){
                    //debug
                    //console.log('push a new sentence into queue, s:' + sentence + ' index: ' + sentence_index);
                   //console.log('reached end of line, line=' + line);
                    //reached end of a sentence
                    //replace multiple spaces to single space
                    sentence = sentence.replace(/ +/g, ' ');
                    /**
                     * sentence block object
                     * sentence
                     * translation
                     * subtitle index array
                     * start time
                     * end time
                     */

                    var s_block = {};
                    s_block.sentence = sentence;
                    s_block.index = sentence_index;
                    s_block.translation = '';
                    s_block.sub_index_arr = sub_index_arr;
                    s_block.starttime = subtitle_blocks[s_block.sub_index_arr[0] - 1].start_time;
                    var last_index = s_block.sub_index_arr[s_block.sub_index_arr.length - 1] - 1;
                    s_block.endtime = subtitle_blocks[last_index].end_time;
                    sentence_blocks.push(s_block);
                    sentence_index++;
                    sentence = '';
                    sub_index_arr = [];

                }

                //remove last whitespace
                var c = line.charAt(line.length - 1);
                if(c == ' ')//remove last space
                    line = line.substring(0, line.length - 1);
                c = line.charAt(0);
                if(c== ' ')//remove first space
                    line = line.substring(1, line.length);
                if(linecount == 3)
                    block.subtitle += ' ' + line;
                else
                    block.subtitle = line;

                linecount++;
            }else{
                linecount = 0;
                blockcount++;
            }
        }


    })
    .on('error', function(e) {
        // something went wrong
        console.log(e);
    })
    .on('close', function(e){
        console.log('finished traversing english subtitle, pass block arrays to callback. videoid=' + videoid);
        if(typeof(callback) != 'undefined' && callback != null){
            callback(videoid, sentence_blocks);
        }

        stateEmitter.emit(1001, videoid, subtitle_blocks, sentence_blocks);
        blockcount = 0;
        linecount = 0;
    });
}


//for debug purpose
function showSubtitleBlock(block){
    console.log('line number:' + block.line_number
        + '| timestamp:' + block.timestamp
        + '| start_time=' + block.start_time
        + '| end_time=' + block.end_time
        + '| subtitle=' + block.subtitle
        + '| sentence_index=' + block.sentence);
}
//for debug purpose
function showSentenceBlock(block){
    console.log('sentence=' + block.sentence
        + '| sentence index=' + block.index
        + '| star time=' + block.starttime
        + '| end time=' + block.endtime
        + '\n|contained subtitle index:');

    for(var i=0; i<block.sub_index_arr.length; i++){
        console.log('index=' + block.sub_index_arr[i]);
    }
    console.log('\n');

}

exports.registerObserver = function(o){
    observer = o;
    console.log('observer registered');
}




//convert formatted timestamp to time value in miliseconds
function convertTS2TM(timestamp){
    var raw = timestamp.split(',');
    var time = raw[0].split(':');
    var hour = parseInt(time[0]);
    var minute = parseInt(time[1]);
    var second = parseInt(time[2]);

    var miliseconds = parseInt(raw[1]);

    var total = miliseconds + second * 1000 + minute * 60000 + hour * 3600000;
    // console.log('total:' + total + ' hour='+ hour + ' minute=' + minute + ' second=' + second + ' miliseconds=' + miliseconds);
    return total;
}

//convert plain time value to formatted timestamp
function convertTM2TS(tm){

    var ms = tm%1000;
    var s = parseInt(tm/1000)%60;
    var m = parseInt(tm/60000);
    var h = parseInt(tm/3600000);
    var ms_str,s_str, m_str, h_str;
    if(ms < 10){
        ms_str = '00' + ms;
    }else if(ms >= 10 && ms < 100 ){
        ms_str = '0' + ms;
    }else{
        ms_str = ms;
    }

    if(s < 10){
        s_str = '0' + s;
    }else{
        s_str = s;
    }

    if(m < 10){
        m_str = '0' + m;
    }else{
        m_str = m;
    }

    if(h < 10){
        h_str = '0' + h;
    }else{
        h_str = h;
    }

    var result = h_str + ':' + m_str + ':' + s_str + ',' + ms_str;
    return result;
}
