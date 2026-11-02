const { desktopCapturer, screen } = require('electron');

const MAX_WIDTH = 1600; // wide enough to read text, small enough to send quickly

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// True when the picture is (almost) completely black, as happens for apps that block screenshots.
function looksBlack(image) {
  const { width, height } = image.getSize();
  const bmp = image.toBitmap(); // BGRA
  const step = Math.max(1, Math.floor((width * height) / 4000)) * 4;
  for (let i = 0; i < bmp.length; i += step) {
    if (bmp[i] > 12 || bmp[i + 1] > 12 || bmp[i + 2] > 12) return false;
  }
  return true;
}

// Takes a picture of the display the notch is on. Only called when you press the camera button.
// The notch window is excluded from the capture while it runs (Windows display affinity), so the picture
// shows what is behind it. Nothing is written to disk.
async function capture(win) {
  const display = screen.getDisplayMatching(win.getBounds());
  const w = Math.round(display.bounds.width * display.scaleFactor);
  const h = Math.round(display.bounds.height * display.scaleFactor);
  let image = null;
  win.setContentProtection(true);
  try {
    await sleep(150); // let Windows apply it before capturing
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: w, height: h } });
    const src = sources.find((s) => String(s.display_id) === String(display.id)) || sources[0];
    image = src && src.thumbnail;
  } catch (e) {
    return { error: `Could not capture the screen (${e.message}).` };
  } finally {
    win.setContentProtection(false);
  }
  if (!image || image.isEmpty()) return { error: 'Could not capture the screen.' };
  const scaled = image.getSize().width > MAX_WIDTH ? image.resize({ width: MAX_WIDTH, quality: 'good' }) : image;
  const jpeg = scaled.toJPEG(80);
  return { ok: true, base64: jpeg.toString('base64'), mediaType: 'image/jpeg', width: scaled.getSize().width, height: scaled.getSize().height, black: looksBlack(scaled) };
}

module.exports = { capture, looksBlack };
