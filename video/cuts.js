// Cuts the finished trailer into short clips for social media and a small copy for the website.
//   set FFMPEG=C:\path\to\ffmpeg.exe   (any ffmpeg 5+; nothing here is bundled with Mochi)
//   node video\cuts.js                 -> video\out\cuts\*.mp4 and docs\media\*
// Every clip is made twice: 16:9 (YouTube, X, the website) and 9:16 (Reels, TikTok, Shorts). The 9:16 version keeps
// the whole picture, centred on a blurred, enlarged copy of itself, because Mochi's panels are wider than a phone crop.
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ffmpeg = process.env.FFMPEG || 'ffmpeg';
const src = path.join(__dirname, 'out', 'mochi-launch-trailer.mp4');
const outDir = path.join(__dirname, 'out', 'cuts');
const webDir = path.join(__dirname, '..', 'docs', 'media');
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(webDir, { recursive: true });

// name, [[start, end], ...] (seconds in the trailer). More than one range = a montage with short dissolves.
const CLIPS = {
  'teaser-20s': [[11.5, 17], [26.5, 31], [37, 41], [96, 102.6]],
  'approve': [[24.5, 33]],
  'done': [[35, 42]],
  'music': [[43.5, 51]],
  'focus': [[52, 60]],
  'notes': [[62.5, 70]],
  'chat': [[70.5, 80]],
  'nap': [[81.5, 90]],
};
const XF = 0.25; // dissolve length between ranges

function run(args) {
  const r = spawnSync(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', ...args], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr || 'ffmpeg failed');
}

// trim + dissolve the ranges into one 16:9 stream [v] [a]
function montage(ranges) {
  const parts = [];
  ranges.forEach(([a, b], i) => {
    parts.push(`[0:v]trim=${a}:${b},setpts=PTS-STARTPTS[v${i}]`);
    parts.push(`[0:a]atrim=${a}:${b},asetpts=PTS-STARTPTS[a${i}]`);
  });
  let v = 'v0';
  let a = 'a0';
  let t = ranges[0][1] - ranges[0][0];
  for (let i = 1; i < ranges.length; i++) {
    parts.push(`[${v}][v${i}]xfade=transition=fade:duration=${XF}:offset=${(t - XF).toFixed(3)}[x${i}]`);
    parts.push(`[${a}][a${i}]acrossfade=d=${XF}[ac${i}]`);
    v = `x${i}`;
    a = `ac${i}`;
    t += ranges[i][1] - ranges[i][0] - XF;
  }
  // soft fade in and out so a clip never starts or ends abruptly
  parts.push(`[${v}]fade=t=in:d=0.25,fade=t=out:st=${(t - 0.4).toFixed(3)}:d=0.4[v]`);
  parts.push(`[${a}]afade=t=in:d=0.25,afade=t=out:st=${(t - 0.4).toFixed(3)}:d=0.4[a]`);
  return { graph: parts.join(';'), dur: t };
}

const enc = ['-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', '60', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart'];

for (const [name, ranges] of Object.entries(CLIPS)) {
  const m = montage(ranges);
  const wide = path.join(outDir, `${name}-16x9.mp4`);
  run(['-i', src, '-filter_complex', m.graph, '-map', '[v]', '-map', '[a]', ...enc, wide]);
  // 9:16: blurred full-bleed background, the whole picture (a little cropped at the sides) in front of it
  const tall = path.join(outDir, `${name}-9x16.mp4`);
  const g = `[0:v]split[b][f];[b]scale=3414:1920,crop=1080:1920,boxblur=40:4,eq=brightness=-0.08[bg];[f]crop=1300:1080:310:0,scale=1080:-2[fg];[bg][fg]overlay=0:(H-h)/2[v]`;
  run(['-i', wide, '-filter_complex', g, '-map', '[v]', '-map', '0:a', ...enc, tall]);
  console.log(name, m.dur.toFixed(1) + 's');
}

// the website copy of the whole trailer: 720p, 30 fps, small enough for a landing page
run(['-i', src, '-vf', 'scale=1280:-2', '-r', '30', '-c:v', 'libx264', '-preset', 'slow', '-crf', '25', '-maxrate', '3M', '-bufsize', '6M', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', path.join(webDir, 'mochi-trailer.mp4')]);
run(['-ss', '14', '-i', src, '-frames:v', '1', '-vf', 'scale=1280:-2', '-q:v', '3', path.join(webDir, 'poster.jpg')]);
console.log('web copy written');
