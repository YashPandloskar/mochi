# Mochi launch trailer

A 102-second, 1920x1080, 60 fps trailer made from the real Mochi interface. Nothing is screen-recorded: the actual
`src/renderer` runs on a fake desktop, driven by the same events Claude Code and the tray send, and every frame is
rendered at 2x resolution on a virtual clock and reduced to 1080p, so no frame is ever dropped or stretched.

```powershell
# render the trailer (about 6 minutes; plays out of sight beyond the screen edge, so you can keep working)
npx electron video\record.js --render        # -> video\out\mochi-launch-trailer.mp4

# watch it play live without recording (full screen on the primary display)
npx electron video\record.js --preview
# rehearse out of sight and save stills at given seconds
npx electron video\record.js --preview --offscreen --shots=12,30,60

# check a finished file: duration, real frame cadence, stills
npx electron video\inspect.js --stills=10,40 --outdir=video\out
```

- `director.js` is the script: scenes, camera, cursor, captions, and the events fed to Mochi. Times are seconds.
- `audio.js` is the sound: Mochi's own chimes (`sounds.notes` in `src/theme.js`) plus a small generated score.
  Nothing is sampled, so there is nothing to license.
- `vtime.js` is the virtual clock, `render.js` the frame-exact renderer (H.264 + AAC, written as MP4).
- The film never touches your real Mochi, notes or settings. Quit Mochi first only if you want the CPU to yourself.
- The people, music and code in the film are made up.
