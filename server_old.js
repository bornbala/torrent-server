const express = require('express');
const torrentStream = require('torrent-stream');
const pump = require('pump');
const rangeParser = require('range-parser');

const app = express();
const PORT = 4000;

// Helper: start torrent engine
function getEngine(magnet) {
  const engine = torrentStream(magnet, {
    tmp: './tmp',  // folder to store partial pieces
  });

  engine.on('ready', () => {
    console.log('Torrent ready. Files:');
    engine.files.forEach(f => console.log(`- ${f.name} (${f.length} bytes)`));
  });

  return engine;
}

// Streaming endpoint
app.get('/stream', (req, res) => {
  const magnet = req.query.magnet;
  if (!magnet) return res.status(400).send('Missing magnet param');

  const engine = getEngine(magnet);

  engine.on('ready', () => {
    // Choose largest file (usually the movie/video)
    const file = engine.files.reduce((a, b) => (a.length > b.length ? a : b));
    const total = file.length;
    const range = req.headers.range;

    if (range) {
      const ranges = rangeParser(total, range)[0];
      const { start, end } = ranges;
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${total}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': (end - start) + 1,
        'Content-Type': 'video/mp4',
      });
      pump(file.createReadStream({ start, end }), res);
    } else {
      res.writeHead(200, {
        'Content-Length': total,
        'Content-Type': 'video/mp4',
      });
      pump(file.createReadStream(), res);
    }
  });
});

app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
