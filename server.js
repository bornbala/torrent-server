const express = require('express');
const torrentStream = require('torrent-stream');
const pump = require('pump');
const rangeParser = require('range-parser');
const mime = require('mime');
const ffmpeg = require('fluent-ffmpeg');
const { PassThrough } = require('stream');

const app = express();
const PORT = process.env.PORT || 4000;

// cache engines per magnet
const engines = new Map();

function getEngine(magnet) {
  if (engines.has(magnet)) return engines.get(magnet);

  const engine = torrentStream(magnet, {
    tmp: './tmp',
    path: './downloads',
  });

  engine.on('ready', () => {
    console.log('Torrent ready. Files:');
    engine.files.forEach(f =>
      console.log(`- ${f.path} (${(f.length / 1024 / 1024).toFixed(2)} MB)`)
    );
  });

  engines.set(magnet, engine);
  return engine;
}

// Streaming with transcoding
app.get('/stream', (req, res) => {
  const magnet = req.query.magnet;
  if (!magnet) return res.status(400).send('Missing magnet param');

  const engine = getEngine(magnet);

  engine.on('ready', () => {
    // Pick largest file
    const file = engine.files.reduce((a, b) => (a.length > b.length ? a : b));

    console.log(`🎬 Streaming file: ${file.name}`);

    // create torrent read stream
    const torrentStreamFile = file.createReadStream();

    // prepare ffmpeg passthrough
    const passthrough = new PassThrough();

    ffmpeg(torrentStreamFile)
      .videoCodec('libx264') // universal H.264
      .audioCodec('aac')     // AAC audio
      .format('mp4')         // output format
      .outputOptions([
        '-preset veryfast',  // speed vs quality tradeoff
        '-movflags frag_keyframe+empty_moov', // enables fragmented MP4 for streaming
        '-pix_fmt yuv420p',
        '-crf 23'
      ])
      .on('start', cmd => console.log('FFmpeg started:', cmd))
      .on('error', err => {
        console.error('FFmpeg error:', err);
        res.status(500).end('FFmpeg failed');
      })
      .pipe(passthrough);

    res.writeHead(200, {
      'Content-Type': 'video/mp4',
      'Transfer-Encoding': 'chunked',
    });

    pump(passthrough, res);
  });

  engine.on('error', (err) => {
    console.error('Torrent engine error:', err);
    res.status(500).send('Torrent engine error');
  });
});

app.listen(PORT, () => {
  console.log(`✅ Transcoding server running at http://localhost:${PORT}`);
});
