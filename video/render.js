// Frame-exact renderer (record.js --render): steps the film one 1/60 s frame at a time on the virtual clock,
// grabs each frame, encodes it with WebCodecs (H.264), renders the audio offline, encodes it (AAC) and
// writes an MP4 with exactly 60 frames per second.
(() => {
  const opts = window.__rec.options;
  if (!opts.render) return;
  const V = window.__vtime;
  const W = 1920;
  const H = 1080;
  const FPS = 60;
  const LOG = (m) => window.__rec.log(m);
  const realRaf = V.real.raf;
  const settle = () => new Promise((r) => realRaf(() => realRaf(r))); // two real frames: the compositor has the new state

  // ------------------------------------------------------------ a small MP4 writer
  const te = new TextEncoder();
  const cat = (...a) => {
    const o = new Uint8Array(a.reduce((s, x) => s + x.length, 0));
    let p = 0;
    for (const x of a) {
      o.set(x, p);
      p += x.length;
    }
    return o;
  };
  const b32 = (n) => new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
  const b16 = (n) => new Uint8Array([(n >> 8) & 255, n & 255]);
  const zeros = (n) => new Uint8Array(n);
  const box = (type, ...c) => {
    const body = cat(...c);
    return cat(b32(8 + body.length), te.encode(type), body);
  };
  const full = (type, ver, flags, ...c) => box(type, new Uint8Array([ver, (flags >> 16) & 255, (flags >> 8) & 255, flags & 255]), ...c);
  const MATRIX = cat(b32(0x10000), b32(0), b32(0), b32(0), b32(0x10000), b32(0), b32(0), b32(0), b32(0x40000000));
  const dsc = (tag, ...c) => {
    const body = cat(...c);
    return cat(new Uint8Array([tag, body.length]), body);
  };

  function track({ id, kind, timescale, deltas, sizes, keys, entry, w, h, durationMs, offset }) {
    const n = sizes.length;
    const mediaDur = deltas.reduce((s, [c, d]) => s + c * d, 0);
    const tkhd = full('tkhd', 0, 3, b32(0), b32(0), b32(id), b32(0), b32(durationMs), zeros(8), b16(0), b16(0), b16(kind === 'soun' ? 0x100 : 0), b16(0), MATRIX, b32(w << 16), b32(h << 16));
    const mdhd = full('mdhd', 0, 0, b32(0), b32(0), b32(timescale), b32(mediaDur), b16(0x55c4), b16(0));
    const hdlr = full('hdlr', 0, 0, b32(0), te.encode(kind), zeros(12), te.encode(kind === 'vide' ? 'VideoHandler\0' : 'SoundHandler\0'));
    const mhd = kind === 'vide' ? full('vmhd', 0, 1, b16(0), zeros(6)) : full('smhd', 0, 0, b16(0), b16(0));
    const dinf = box('dinf', full('dref', 0, 0, b32(1), full('url ', 0, 1)));
    const stts = full('stts', 0, 0, b32(deltas.length), ...deltas.map(([c, d]) => cat(b32(c), b32(d))));
    const stss = keys ? full('stss', 0, 0, b32(keys.length), ...keys.map(b32)) : new Uint8Array(0);
    const stsc = full('stsc', 0, 0, b32(1), b32(1), b32(n), b32(1));
    const stsz = full('stsz', 0, 0, b32(0), b32(n), ...sizes.map(b32));
    const stco = full('stco', 0, 0, b32(1), b32(offset));
    const stbl = box('stbl', full('stsd', 0, 0, b32(1), entry), stts, stss, stsc, stsz, stco);
    return box('trak', tkhd, box('mdia', mdhd, hdlr, box('minf', mhd, dinf, stbl)));
  }

  function mux({ vchunks, vdesc, achunks, adesc, sampleRate, channels }) {
    const nv = vchunks.length;
    const na = achunks.length;
    const durMs = Math.round((nv / FPS) * 1000);
    const avc1 = box('avc1', zeros(6), b16(1), zeros(16), b16(W), b16(H), b32(0x480000), b32(0x480000), b32(0), b16(1), zeros(32), b16(0x18), b16(0xffff), box('avcC', vdesc));
    const esds = full('esds', 0, 0, dsc(3, b16(0), new Uint8Array([0]), dsc(4, new Uint8Array([0x40, 0x15]), zeros(3), b32(192000), b32(192000), dsc(5, adesc)), dsc(6, new Uint8Array([2]))));
    const mp4a = box('mp4a', zeros(6), b16(1), zeros(8), b16(channels), b16(16), b16(0), b16(0), b32(sampleRate << 16), esds);
    const vsizes = vchunks.map((c) => c.d.length);
    const asizes = achunks.map((c) => c.d.length);
    const vkeys = vchunks.map((c, i) => (c.key ? i + 1 : 0)).filter(Boolean);
    const build = (voff, aoff) =>
      box(
        'moov',
        full('mvhd', 0, 0, b32(0), b32(0), b32(1000), b32(durMs), b32(0x10000), b16(0x100), b16(0), zeros(8), MATRIX, zeros(24), b32(3)),
        track({ id: 1, kind: 'vide', timescale: 60000, deltas: [[nv, 1000]], sizes: vsizes, keys: vkeys, entry: avc1, w: W, h: H, durationMs: durMs, offset: voff }),
        track({ id: 2, kind: 'soun', timescale: sampleRate, deltas: [[na, 1024]], sizes: asizes, keys: null, entry: mp4a, w: 0, h: 0, durationMs: Math.round(((na * 1024) / sampleRate) * 1000), offset: aoff })
      );
    const ftyp = box('ftyp', te.encode('isom'), b32(512), te.encode('isom'), te.encode('iso2'), te.encode('avc1'), te.encode('mp41'));
    const moov0 = build(0, 0);
    const vbytes = vsizes.reduce((s, x) => s + x, 0);
    const abytes = asizes.reduce((s, x) => s + x, 0);
    const base = ftyp.length + moov0.length + 8;
    const moov = build(base, base + vbytes);
    return { head: cat(ftyp, moov, b32(8 + vbytes + abytes), te.encode('mdat')), parts: [...vchunks.map((c) => c.d), ...achunks.map((c) => c.d)] };
  }

  async function writeOut({ head, parts }) {
    const SLICE = 4 * 1024 * 1024;
    const send = async (u8) => {
      for (let o = 0; o < u8.length; o += SLICE) {
        window.__rec.chunk(u8.subarray(o, o + SLICE));
        await new Promise((r) => realRaf(r)); // let the IPC drain
      }
    };
    await send(head);
    for (const p of parts) window.__rec.chunk(p);
  }

  // ------------------------------------------------------------ video
  const vchunks = [];
  let vdesc = null;
  const venc = new VideoEncoder({
    output: (chunk, meta) => {
      if (meta && meta.decoderConfig && meta.decoderConfig.description) vdesc = new Uint8Array(meta.decoderConfig.description.slice ? meta.decoderConfig.description.slice(0) : meta.decoderConfig.description);
      const d = new Uint8Array(chunk.byteLength);
      chunk.copyTo(d);
      vchunks.push({ d, key: chunk.type === 'key' });
    },
    error: (e) => LOG('VIDEO ENCODER ERROR ' + e.message),
  });
  venc.configure({ codec: 'avc1.640032', width: W, height: H, bitrate: 26_000_000, framerate: FPS, latencyMode: 'quality', avc: { format: 'avc' }, hardwareAcceleration: 'prefer-hardware' });

  async function main() {
    const started = performance.now();
    const wall = Date.now();
    window.__film.run();
    let step = 0;
    let k = 0;
    const t0 = () => window.__film.t0();
    for (;;) {
      step++;
      V.advance(step);
      await settle();
      const f = window.__film;
      if (f.t0() > 0 && V.now() >= f.t0() - 1e-6) {
        const buf = await window.__rec.grab();
        if (buf.length !== W * H * 4) throw new Error('unexpected frame size ' + buf.length);
        const ts = Math.round((k * 1e6) / FPS);
        const frame = new VideoFrame(buf, { format: 'BGRA', codedWidth: W, codedHeight: H, timestamp: ts, duration: Math.round(1e6 / FPS) });
        venc.encode(frame, { keyFrame: k % 120 === 0 });
        frame.close();
        k++;
        if (venc.encodeQueueSize > 4) await new Promise((r) => venc.addEventListener('dequeue', r, { once: true }));
        if (k % 120 === 0) LOG(`frame ${k} (film ${(k / FPS).toFixed(1)} s), ${(((Date.now() - wall) / 1000) | 0)} s elapsed`);
      }
      if (f.finished) break;
    }
    await venc.flush();
    LOG(`video done: ${k} frames, ${vchunks.length} chunks`);

    // ------------------------------------------------------------ audio
    const abuf = await window.Score.render();
    LOG(`audio rendered: ${abuf.duration.toFixed(2)} s`);
    const achunks = [];
    let adesc = null;
    const aenc = new AudioEncoder({
      output: (chunk, meta) => {
        if (meta && meta.decoderConfig && meta.decoderConfig.description) adesc = new Uint8Array(meta.decoderConfig.description.slice ? meta.decoderConfig.description.slice(0) : meta.decoderConfig.description);
        const d = new Uint8Array(chunk.byteLength);
        chunk.copyTo(d);
        achunks.push({ d });
      },
      error: (e) => LOG('AUDIO ENCODER ERROR ' + e.message),
    });
    const SR = abuf.sampleRate;
    aenc.configure({ codec: 'mp4a.40.2', sampleRate: SR, numberOfChannels: 2, bitrate: 192000, aac: { format: 'aac' } });
    const seconds = k / FPS;
    const total = Math.min(abuf.length, Math.round(seconds * SR));
    const L = abuf.getChannelData(0);
    const R = abuf.getChannelData(1);
    const BLOCK = 4096;
    // a half-second of fade at the very end so the music never clicks off
    for (let o = 0; o < total; o += BLOCK) {
      const n = Math.min(BLOCK, total - o);
      const data = new Float32Array(n * 2);
      for (let i = 0; i < n; i++) {
        const g = Math.min(1, (total - (o + i)) / (SR * 0.5));
        data[i] = L[o + i] * g;
        data[n + i] = R[o + i] * g;
      }
      const ad = new AudioData({ format: 'f32-planar', sampleRate: SR, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round((o / SR) * 1e6), data });
      aenc.encode(ad);
      ad.close();
    }
    await aenc.flush();
    LOG(`audio done: ${achunks.length} packets`);

    const out = mux({ vchunks, vdesc, achunks, adesc, sampleRate: SR, channels: 2 });
    await writeOut(out);
    LOG(`written; total ${(((Date.now() - wall) / 1000) | 0)} s, ${((performance.now() - started) | 0)} virtual ms`);
    window.__rec.finish();
  }
  main().catch((e) => {
    LOG('RENDER ERROR ' + (e && e.stack ? e.stack : e));
    window.__rec.finish();
  });
})();
