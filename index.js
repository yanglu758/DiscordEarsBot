const {
  TranscribeStreamingClient,
  StartStreamTranscriptionCommand,
  StartMedicalStreamTranscriptionCommand,
} = require("@aws-sdk/client-transcribe-streaming");
const { Readable } = require("stream")

// Set the AWS Region.
const REGION = "eu-central-1"; //e.g. "us-east-1"
// Create Transcribe service object.
const awsClient = new TranscribeStreamingClient({ region: REGION });


//////////////////////////////////////////
//////////////// LOGGING /////////////////
//////////////////////////////////////////
// Imports the Google Cloud client library
const textToSpeech = require('@google-cloud/text-to-speech');
const client = new textToSpeech.TextToSpeechClient({
  projectId: 'dogwood-seeker-317006',
  keyFilename: 'dogwood-seeker-317006-2448708d4924.json'
});

async function speak(text, languageCode) {
  // Construct the request
  const request = {
    input: {text},
    // Select the language and SSML voice gender (optional)
    voice: {languageCode, ssmlGender: 'NEUTRAL'},
    // select the type of audio encoding
    audioConfig: {audioEncoding: 'MP3'},
  };

  // Performs the text-to-speech request
  const [response] = await client.synthesizeSpeech(request);
  // Write the binary audio content to a local file
  const writeFile = util.promisify(fs.writeFile);
  await writeFile(languageCode+'.mp3', response.audioContent, 'binary');
  console.log('Audio content written to file: ' + languageCode+'.mp3');
}

function getCurrentDateString() {
    return (new Date()).toISOString() + ' ::';
};
__originalLog = console.log;
console.log = function () {
    var args = [].slice.call(arguments);
    __originalLog.apply(console.log, [getCurrentDateString()].concat(args));
};
//////////////////////////////////////////
//////////////////////////////////////////

const fs = require('fs');
const util = require('util');
const path = require('path');

//////////////////////////////////////////
///////////////// VARIA //////////////////
//////////////////////////////////////////

function necessary_dirs() {
    if (!fs.existsSync('./data/')){
        fs.mkdirSync('./data/');
    }
}
necessary_dirs()

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function convert_audio(input) {
    try {
        // stereo to mono channel
        const data = new Int16Array(input)
        const ndata = new Int16Array(data.length/2)
        for (let i = 0, j = 0; i < data.length; i+=4) {
            ndata[j++] = data[i]
            ndata[j++] = data[i+1]
        }
        return Buffer.from(ndata);
    } catch (e) {
        console.log(e)
        console.log('convert_audio: ' + e)
        throw e;
    }
}
//////////////////////////////////////////
//////////////////////////////////////////
//////////////////////////////////////////


//////////////////////////////////////////
//////////////// CONFIG //////////////////
//////////////////////////////////////////

const SETTINGS_FILE = 'settings.json';

let DISCORD_TOK = null;
let WITAPIKEY = null; 
let DISCORD_CHINESE;
let DISCORD_KOREAN;
let DISCORD_POLISH;

function loadConfig() {
    if (fs.existsSync(SETTINGS_FILE)) {
        const CFG_DATA = JSON.parse( fs.readFileSync(SETTINGS_FILE, 'utf8') );
        DISCORD_TOK = CFG_DATA.discord_token;
        WITAPIKEY = CFG_DATA.wit_ai_token;
        // DISCORD_CHINESE = CFG_DATA.discord_chinese
        // DISCORD_KOREAN = CFG_DATA.discord_korean
        // DISCORD_POLISH = CFG_DATA.discord_polish
    } else {
        DISCORD_TOK = process.env.DISCORD_TOK;
        WITAPIKEY = process.env.WITAPIKEY;
    }
    if (!DISCORD_TOK || !WITAPIKEY)
        throw 'failed loading config #113 missing keys!'
    
}
loadConfig()

const https = require('https')
function listWitAIApps(cb) {
    const options = {
      hostname: 'api.wit.ai',
      port: 443,
      path: '/apps?offset=0&limit=100',
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer '+WITAPIKEY,
      },
    }

    const req = https.request(options, (res) => {
      res.setEncoding('utf8');
      let body = ''
      res.on('data', (chunk) => {
        body += chunk
      });
      res.on('end',function() {
        cb(JSON.parse(body))
      })
    })

    req.on('error', (error) => {
      console.error(error)
      cb(null)
    })
    req.end()
}
function updateWitAIAppLang(appID, lang, cb) {
    const options = {
      hostname: 'api.wit.ai',
      port: 443,
      path: '/apps/' + appID,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer '+WITAPIKEY,
      },
    }
    const data = JSON.stringify({
      lang
    })

    const req = https.request(options, (res) => {
      res.setEncoding('utf8');
      let body = ''
      res.on('data', (chunk) => {
        body += chunk
      });
      res.on('end',function() {
        cb(JSON.parse(body))
      })
    })
    req.on('error', (error) => {
      console.error(error)
      cb(null)
    })
    req.write(data)
    req.end()
}

//////////////////////////////////////////
//////////////////////////////////////////
//////////////////////////////////////////


const Discord = require('discord.js')
const DISCORD_MSG_LIMIT = 2000;
const discordClient = new Discord.Client()
if (process.env.DEBUG)
    discordClient.on('debug', console.debug);
discordClient.on('ready', () => {
    console.log(`Logged in as ${discordClient.user.tag}!`)
})
discordClient.login(DISCORD_TOK)

// const discordChinese = new Discord.Client()
// discordChinese.login(DISCORD_CHINESE)
// const discordKorean = new Discord.Client()
// discordKorean.login(DISCORD_KOREAN)
// const discordPolish = new Discord.Client()
// discordPolish.login(DISCORD_POLISH)

const PREFIX = '*';
const _CMD_HELP        = PREFIX + 'help';
const _CMD_JOIN        = PREFIX + 'join';
const _CMD_LEAVE       = PREFIX + 'leave';
const _CMD_DEBUG       = PREFIX + 'debug';
const _CMD_TEST        = PREFIX + 'hello';
const _CMD_LANG        = PREFIX + 'lang';

const guildMap = new Map();


discordClient.on('message', async (msg) => {
    try {
        if (!('guild' in msg) || !msg.guild) return; // prevent private messages to bot
        const mapKey = msg.guild.id;
        if (msg.content.trim().toLowerCase() == _CMD_JOIN) {
            if (!msg.member.voice.channelID) {
                msg.reply('Error: please join a voice channel first.')
            } else {
                if (!guildMap.has(mapKey))
                    await connect(msg, mapKey)
                else
                    msg.reply('Already connected')
            }
        } else if (msg.content.trim().toLowerCase() == _CMD_LEAVE) {
            if (guildMap.has(mapKey)) {
                let val = guildMap.get(mapKey);
                if (val.voice_Channel) val.voice_Channel.leave()
                if (val.voice_Connection) val.voice_Connection.disconnect()
                guildMap.delete(mapKey)
                msg.reply("Disconnected.")
            } else {
                msg.reply("Cannot leave because not connected.")
            }
        } else if (msg.content.trim().toLowerCase() == _CMD_HELP) {
            msg.reply(getHelpString());
        }
        else if (msg.content.trim().toLowerCase() == _CMD_DEBUG) {
            console.log('toggling debug mode')
            let val = guildMap.get(mapKey);
            if (val.debug)
                val.debug = false;
            else
                val.debug = true;
        }
        else if (msg.content.trim().toLowerCase() == _CMD_TEST) {
            msg.reply('hello back =)')
        }
        else if (msg.content.split('\n')[0].split(' ')[0].trim().toLowerCase() == _CMD_LANG) {
            const lang = msg.content.replace(_CMD_LANG, '').trim().toLowerCase()
            listWitAIApps(data => {
              if (!data.length)
                return msg.reply('no apps found! :(')
              for (const x of data) {
                updateWitAIAppLang(x.id, lang, data => {
                  if ('success' in data)
                    msg.reply('succes!')
                  else if ('error' in data && data.error !== 'Access token does not match')
                    msg.reply('Error: ' + data.error)
                })
              }
            })
        }
    } catch (e) {
        console.log('discordClient message: ' + e)
        msg.reply('Error#180: Something went wrong, try again or contact the developers if this keeps happening.');
    }
})

function getHelpString() {
    let out = '**COMMANDS:**\n'
        out += '```'
        out += PREFIX + 'join\n';
        out += PREFIX + 'leave\n';
        out += '```'
    return out;
}

const SILENCE_FRAME = Buffer.from([0xF8, 0xFF, 0xFE]);

class Silence extends Readable {
  _read() {
    this.push(SILENCE_FRAME);
    this.destroy();
  }
}

async function connect(msg, mapKey) {
    try {
        let voice_Channel = await discordClient.channels.fetch(msg.member.voice.channelID);
        if (!voice_Channel) return msg.reply("Error: The voice channel does not exist!");
        let text_Channel = await discordClient.channels.fetch(msg.channel.id);
        if (!text_Channel) return msg.reply("Error: The text channel does not exist!");
        let voice_Connection = await voice_Channel.join();
        // const chinese_voice_channel = await discordChinese.channels.fetch("855306314246651934")
        // const chinese_voice = await chinese_voice_channel.join()
        // const chinese_text_channel = await discordChinese.channels.fetch("855305785893453876")
        // const korean_voice_channel = await discordKorean.channels.fetch("855306254172160040")
        // const korean_voice = await korean_voice_channel.join()
        // const korean_text_channel = await discordKorean.channels.fetch("855305681317396510")
        // const polish_voice_channel = await discordPolish.channels.fetch("855306359998251019")
        // const polish_voice = await polish_voice_channel.join()
        // const polish_text_channel = await discordPolish.channels.fetch("855305736712486982")
        voice_Connection.play(new Silence(), { type: 'opus' });
        guildMap.set(mapKey, {
            'text_Channel': text_Channel,
            'voice_Channel': voice_Channel,
            'voice_Connection': voice_Connection,
            // 'zh_text_channel': chinese_text_channel,
            // 'zh_voice_channel': chinese_voice,
            // 'kr_text_channel': korean_text_channel,
            // 'kr_voice_channel': korean_voice,
            // 'pl_text_channel': polish_text_channel,
            // 'pl_voice_channel': polish_voice,
            'debug': false,
        });
        speak_impl(voice_Connection, mapKey)
        voice_Connection.on('disconnect', async(e) => {
            if (e) console.log(e);
            guildMap.delete(mapKey);
        })
        msg.reply('connected!')
    } catch (e) {
        console.log('connect: ' + e)
        msg.reply('Error: unable to join your voice channel.');
        throw e;
    }
}


function speak_impl(voice_Connection, mapKey) {
    voice_Connection.on('speaking', async (user, speaking) => {
        if (speaking.bitfield == 0 || user.bot) {
            return
        }
        console.log(`I'm listening to ${user.username}`)
        // this creates a 16-bit signed PCM, stereo 48KHz stream
        const audioStream = voice_Connection.receiver.createStream(user, { mode: 'pcm' })
        audioStream.on('error',  (e) => { 
            console.log('audioStream: ' + e)
        });
        let buffer = [];
        audioStream.on('data', (data) => {
            buffer.push(data)
        })
        audioStream.on('end', async () => {
            buffer = Buffer.concat(buffer)
            const duration = buffer.length / 48000 / 4;
            console.log("duration: " + duration)

            if (duration < 1.0 || duration > 19) { // 20 seconds max dur
                console.log("TOO SHORT / TOO LONG; SKPPING")
                return;
            }
            try {
                let new_buffer = await convert_audio(buffer)
                if (!new_buffer) {
                    return
                }
                let out = await transcribe(new_buffer);
                if (out != null) {
                    await process_commands_query(out, mapKey, user);
                    if (out["en"]) {
                      guildMap.get(mapKey).text_Channel.send(out["en"])
                    }
                    // guildMap.get(mapKey).zh_text_channel.send(out["en"])
                    // guildMap.get(mapKey).zh_text_channel.send(out["zh"])
                    // guildMap.get(mapKey).kr_text_channel.send(out["en"])
                    // guildMap.get(mapKey).kr_text_channel.send(out["ko"])
                    // guildMap.get(mapKey).pl_text_channel.send(out["en"])
                    // guildMap.get(mapKey).pl_text_channel.send(out["pl"])
                    // guildMap.get(mapKey).zh_voice_channel.play("zh.mp3")
                    // guildMap.get(mapKey).kr_voice_channel.play("ko.mp3")
                    // guildMap.get(mapKey).pl_voice_channel.play("pl.mp3")
                    
                }
            } catch (e) {
                console.log('tmpraw rename: ' + e)
            }


        })
    })
}

async function process_commands_query(txt, mapKey, user) {
    const promises = []
    if (txt && Object.keys(txt).length) {
        let val = guildMap.get(mapKey);
        for (const language in txt) {
            const promise = new Promise(async (resolve, reject) => {
                await speak(txt[language], language)
                resolve(true)
            })
            promises.push(promise)
        }
    }
    await Promise.all(promises)
}


//////////////////////////////////////////
//////////////// SPEECH //////////////////
//////////////////////////////////////////
async function transcribe(buffer) {
  const english = await transcribe_gspeech(buffer)
  console.log("Google", english)
  const english1 = await transcribe_amazon(buffer)
  console.log("Amazon", english1)
  if (!english1 || english1.length < 1) {
    return
  }
  console.log(english1)
  // return transcribe_witai(buffer)
  
  const promises = []
  for (const language of ["zh", "pl", "ko"]) {
    const promise = new Promise(async (resolve, reject) => {
        const output = await translateText(english, language)
        resolve(output)
    })
    promises.push(promise)
  }
  const output = await Promise.all(promises)
  return {
    en: english,
    zh: output[0],
    pl: output[1],
    ko: output[2]
  }
}

// WitAI
let witAI_lastcallTS = null;
const witClient = require('node-witai-speech');
async function transcribe_witai(buffer) {
    try {
        // ensure we do not send more than one request per second
        if (witAI_lastcallTS != null) {
            let now = Math.floor(new Date());    
            while (now - witAI_lastcallTS < 1000) {
                console.log('sleep')
                await sleep(100);
                now = Math.floor(new Date());
            }
        }
    } catch (e) {
        console.log('transcribe_witai 837:' + e)
    }

    try {
        console.log('transcribe_witai')
        const extractSpeechIntent = util.promisify(witClient.extractSpeechIntent);
        var stream = Readable.from(buffer);
        const contenttype = "audio/raw;encoding=signed-integer;bits=16;rate=48k;endian=little"
        const output = await extractSpeechIntent(WITAPIKEY, stream, contenttype)
        witAI_lastcallTS = Math.floor(new Date());
        console.log(output)
        stream.destroy()
        if (output && '_text' in output && output._text.length)
            return output._text
        if (output && 'text' in output && output.text.length)
            return output.text
        return output;
    } catch (e) { console.log('transcribe_witai 851:' + e); console.log(e) }
}


// Google Speech API
// https://cloud.google.com/docs/authentication/production
const gspeech = require('@google-cloud/speech');
const gspeechclient = new gspeech.SpeechClient({
  projectId: 'dogwood-seeker-317006',
  keyFilename: 'dogwood-seeker-317006-2448708d4924.json'
});

function wait(time) {
    return new Promise(resolve => {
        setTimeout(resolve, time);
    })
}

async function* audioSource(fileBuf) {
    const chunkSize = 10 * 1000;
    let index = 0;
    let i = 0;
    while(index < fileBuf.length) {
    // while(index < chunkSize * 60) {
        const chunk = fileBuf.slice(index, Math.min(index + chunkSize, fileBuf.byteLength));
        await wait(300);
        yield chunk;
        index += chunkSize;
    }
}

async function transcribe_amazon(buffer) {
  async function* audioStream(fileBuf) {
    for await(const chunk of audioSource(fileBuf)) {
        yield {AudioEvent: {AudioChunk: chunk}}
    }
  }
  try {
    console.log('transcribing amazon...')
    const command = new StartStreamTranscriptionCommand({
      LanguageCode: "en-AU",
      MediaEncoding: "pcm",
      MediaSampleRateHertz: 16000,
      AudioStream: audioStream(buffer)
    });
    const response = await awsClient.send(command)
    let strs = []
    for await (const event of response.TranscriptResultStream) {
      if (event.TranscriptEvent) {
        if (event.TranscriptEvent.Transcript.Results &&
          event.TranscriptEvent.Transcript.Results.length > 0) {
          const result = event.TranscriptEvent.Transcript.Results[0]
          if (result.IsPartial === false) {
            strs.push(result.Alternatives[0].Transcript)
          }
        }
      }
    }
    if (strs.length > 0) {
      return strs.join(" ")
    }
    console.log("The End")
  } catch (e) {
    console.error(e)
  }
}
async function transcribe_gspeech(buffer) {
  try {
      console.log('transcribe_gspeech')
      const bytes = buffer.toString('base64');
      const audio = {
        content: bytes,
      };
      const config = {
        encoding: 'LINEAR16',
        sampleRateHertz: 48000,
        model: "default",
        languageCode: 'en-AU',  // https://cloud.google.com/speech-to-text/docs/languages
        speechContexts: [{
            phrases: [
                "Cryptex",
                "Squawk",
                "Last 60 minutes",
                "Theta",
                "DEX",
                "Dex",
                "Polychain",
                "Blockchain",
                "Hashrate",
                "Speculative",
                "Currently pulling to the upside",
                "Currently pulling to the downside",
                "Over the last 60 minutes",
                "In the last 10 seconds",
                "In the last 30 seconds",
                "Bearish",
                "Bullish",
                "Michael Saylor",
                "Microstrategy",
                "SEC",
                "ETF",
                "Approaching the previous swing high",
                "Approaching the previous swing low",
                "Top positive returns",
                "Top negative returns",
                "For the same period",
                "Will be back in 5 minutes",
                "Binance will remove and cease trading",
                "USDC",
                "Eth",
                "Objective",
                "Hourly",
                "Via an article",
                "Coin telegraph",
                "Sam Bankman-Fried",
                "Currently leading the lows",
                "Currently leading the highs",
                "Syncing issue",
                "Endpoints",
                "Investigating",
                "Hourly close",
                "Current outlier",
                "Currently an outlier to the",
                "Lows",
                "That concludes the",
                "Asian session",
                "US session",
                "European session",
                "I will now hand you over to",
                "Lawrence",
                "Peter",
                "Nathan",
                "Cryptex",
                "Nikkei",
                "Range low",
                "Maker",
                "The current price is",
                "Price alert on",
                "Open interest for the last",
                "At the top of the hour",
                "Outlier to the downside",
                "Outlier to the upside",
                "Elon Musk",
                "Binance",
                "Bitmex",
                "Okex",
                "Deribit",
                "Bloomberg",
                "24 hour exchange wallet flows",
                "Seoul",
                "Shanghai",
                "Bitcoin",
                "Ethereum",
                'SHIB', 
                '1INCH',
                'AAVE', 
                'ADA', 
                'AKRO', 
                'ALGO', 
                'ALICE', 
                'ALPHA', 
                'ANKR', 
                'ATOM', 
                'AVAX',
                'AXS', 
                'BAKE', 
                'BAL', 
                'BAND', 
                'BAT', 
                'BCH', 
                'BEL', 
                'BLZ', 
                'BNB', 
                'BTC', 
                'BTS', 
                'BTT', 
                'BZRX', 
                'CELR',
                'CHR', 
                'CHZ', 
                'COMP', 
                'COTI', 
                'CRV', 
                'CTK', 
                'CVC', 
                'DASH', 
                'DEFI', 
                'DENT', 
                'DGB', 
                'DODO', 
                'DOGE', 
                'DOT', 
                'EGLD', 
                'ENJ', 
                'EOS', 
                'ETC', 
                'ETH', 
                'FIL', 
                'FLM', 
                'FTM', 
                'GRT', 
                'GTC', 
                'HBAR', 
                'HNT', 
                'HOT', 
                'ICP', 
                'ICX', 
                'IOST', 
                'IOTA', 
                'KAVA', 
                'KNC', 
                'KSM', 
                'LINA', 
                'LINK', 
                'LIT', 
                'LRC', 
                'LTC', 
                'LUNA', 
                'MANA', 
                'MATIC', 
                'MKR', 
                'MTL', 
                'NEAR', 
                'NEO', 
                'NKN', 
                'OCEAN', 
                'OGN', 
                'OMG', 
                'ONE', 
                'ONT', 
                'QTUM', 
                'REEF', 
                'REN', 
                'RLC', 
                'RSR', 
                'RUNE', 
                'RVN', 
                'SAND', 
                'SC', 
                'SFP', 
                'SKL', 
                'SNX', 
                'SOL', 
                'SRM', 
                'STMX', 
                'STORJ', 
                'SUSHI', 
                'SXP', 
                'THETA', 
                'TOMO', 
                'TRB', 
                'TRX', 
                'UNFI', 
                'UNI', 
                'VET', 
                'WAVES', 
                'XEM', 
                'XLM', 
                'XMR', 
                'XRP', 
                'XTZ', 
                'YFII', 
                'YFI', 
                'ZEC', 
                'ZEN', 
                'ZIL', 
                'ZRX'
            ]
        }]
      };
      const request = {
        audio: audio,
        config: config,
      };

      const [response] = await gspeechclient.recognize(request);
      const transcription = response.results
        .map(result => result.alternatives[0].transcript)
        .join('\n');
      console.log(`gspeech: ${transcription}`);
      return transcription;

  } catch (e) { console.log('transcribe_gspeech 368:' + e) }
}

const {TranslationServiceClient} = require('@google-cloud/translate');
const translationClient = new TranslationServiceClient({
  projectId: 'dogwood-seeker-317006',
  keyFilename: 'dogwood-seeker-317006-2448708d4924.json'
});
const projectId = 'dogwood-seeker-317006';
const location = 'global';
async function translateText(text, language) {
  // Construct request
  const request = {
    parent: `projects/${projectId}/locations/${location}`,
    contents: [text],
    mimeType: 'text/plain', // mime types: text/plain, text/html
    sourceLanguageCode: 'en',
    targetLanguageCode: language,
  };

  // Run request
  const [response] = await translationClient.translateText(request);

  for (const translation of response.translations) {
    console.log(`Translation: ${translation.translatedText}`);
  }
  return response.translations
    .map(v => v.translatedText)
    .join("\n")
}



//////////////////////////////////////////
//////////////////////////////////////////
//////////////////////////////////////////

