// Music tab: a bigger Apple Music player (art, title, artist, progress with times, previous / play-pause / next).
// MusicView.create({ onTint }) -> { el, update(music) }
// The panel gradient follows the album colour: onTint(cssColour | null) is called when it changes.
(() => {
  const clock = (sec) => {
    sec = Math.max(0, Math.floor(sec || 0));
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  };

  // Average colour of the artwork, darkened so white text stays readable on the gradient.
  function tintOf(dataUri, done) {
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = c.height = 12;
        const x = c.getContext('2d');
        x.drawImage(img, 0, 0, 12, 12);
        const d = x.getImageData(0, 0, 12, 12).data;
        let r = 0, g = 0, b = 0;
        for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
        const n = d.length / 4;
        const k = 0.5; // darken
        done(`rgb(${Math.round((r / n) * k)}, ${Math.round((g / n) * k)}, ${Math.round((b / n) * k)})`);
      } catch {
        done(null);
      }
    };
    img.onerror = () => done(null);
    img.src = dataUri;
  }

  function create({ onTint }) {
    const el = document.createElement('div');
    el.className = 'music-view';
    el.innerHTML = `
      <div class="mv-top">
        <button class="mv-art" data-r="art" type="button" title="Open Apple Music"></button>
        <div class="mv-meta">
          <div class="mv-title" data-r="title">Nothing playing</div>
          <div class="mv-artist" data-r="artist">Apple Music</div>
          <div class="mv-album" data-r="album"></div>
          <button class="pill" data-r="open" type="button">Open Apple Music</button>
        </div>
        <span class="eq mv-eq" data-r="eq"><i></i><i></i><i></i><i></i><i></i></span>
        <div class="mv-mochi" data-r="mochiBox"></div>
      </div>
      <div class="mv-progress" data-r="progress">
        <span data-r="elapsed">0:00</span>
        <div class="mv-bar"><i data-r="fill"></i></div>
        <span data-r="total">0:00</span>
      </div>
      <div class="mv-ctl" data-r="ctl">
        <button class="mv-btn" data-r="prev" type="button" title="Previous">${Icons.prev(18)}</button>
        <button class="mv-btn mv-main" data-r="playpause" type="button">${Icons.pause(20)}</button>
        <button class="mv-btn" data-r="next" type="button" title="Next">${Icons.next(18)}</button>
      </div>`;
    const r = {};
    el.querySelectorAll('[data-r]').forEach((n) => (r[n.dataset.r] = n));
    const dancer = Mochi.create({ mood: 'wink', size: 44 });
    r.mochiBox.appendChild(dancer.el);
    el.appendChild(Nav.create().el);

    const send = (cmd) => window.mochi.musicCommand(cmd);
    r.playpause.addEventListener('click', () => send('playpause'));
    r.prev.addEventListener('click', () => send('prev'));
    r.next.addEventListener('click', () => send('next'));
    r.open.addEventListener('click', () => send('open'));
    r.art.addEventListener('click', () => send('open'));

    let m = null;
    let tintFor = null;

    // elapsed time keeps moving between the helper's updates while playing
    function position() {
      if (!m || !m.duration) return 0;
      const drift = m.status === 'playing' ? (Date.now() - m.at) / 1000 : 0;
      return Math.min(m.duration, m.position + drift);
    }

    function tick() {
      if (!m) return;
      const pos = position();
      r.elapsed.textContent = clock(pos);
      r.total.textContent = clock(m.duration);
      r.fill.style.width = m.duration ? `${Math.min(100, (pos / m.duration) * 100)}%` : '0%';
    }
    setInterval(tick, 500);

    return {
      el,
      // he sways while the music plays, naps or looks sleepy otherwise
      setLook({ napping, dancing, look }) {
        dancer.setMood(dancing ? 'happy' : napping || look === 'night' ? 'sleepy' : 'wink');
        r.mochiBox.classList.toggle('dancing', !!dancing);
      },
      update(next) {
        m = next;
        const live = !!(m && m.enabled && m.status && m.status !== 'none');
        const playing = !!(m && m.status === 'playing');
        el.classList.toggle('mv-live', live);
        r.eq.classList.toggle('playing', playing);
        if (live) {
          r.title.textContent = m.title || 'Unknown track';
          r.artist.textContent = m.artist || '';
          r.album.textContent = m.album || '';
          r.playpause.innerHTML = playing ? Icons.pause(20) : Icons.play(20);
          r.playpause.title = playing ? 'Pause' : 'Play';
          r.art.style.backgroundImage = m.art ? `url("${m.art}")` : '';
        } else {
          r.title.textContent = m && m.enabled === false ? 'Music off' : 'Nothing playing';
          r.artist.textContent = m && m.enabled === false ? 'Turn it on from the tray' : 'Apple Music';
          r.album.textContent = '';
          r.art.style.backgroundImage = '';
        }
        r.open.hidden = live || (m && m.enabled === false);
        const art = live && m.art ? m.art : null;
        if (art !== tintFor) {
          tintFor = art;
          if (art) tintOf(art, onTint);
          else onTint(null);
        }
        tick();
      },
    };
  }

  window.MusicView = { create };
})();
