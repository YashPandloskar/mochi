const fs = require('fs');
const path = require('path');

// API keys for the chat providers. They are encrypted with Windows' own per-user protection (Electron's safeStorage,
// DPAPI under the hood) before they touch the disk, and they are never sent to the page: the notch only ever learns
// whether a key exists. If encryption is unavailable nothing is stored (there is no plain-text fallback).
class Keys {
  constructor({ file, safeStorage }) {
    this.file = file;
    this.ss = safeStorage;
  }

  available() {
    try {
      return !!this.ss && this.ss.isEncryptionAvailable();
    } catch {
      return false;
    }
  }

  read() {
    try {
      const o = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      return o && typeof o === 'object' ? o : {};
    } catch {
      return {};
    }
  }

  write(o) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(o));
    fs.renameSync(tmp, this.file);
  }

  has(id) {
    return typeof this.read()[id] === 'string';
  }

  get(id) {
    const v = this.read()[id];
    if (typeof v !== 'string' || !this.available()) return null;
    try {
      return this.ss.decryptString(Buffer.from(v, 'base64'));
    } catch {
      return null; // unreadable (another Windows account, or a damaged file): treated as no key
    }
  }

  set(id, key) {
    key = String(key || '').trim();
    if (key.length < 8 || key.length > 400 || /\s/.test(key)) throw new Error('That does not look like an API key.');
    if (!this.available()) throw new Error('Windows could not encrypt the key, so it was not saved.');
    const o = this.read();
    o[id] = this.ss.encryptString(key).toString('base64');
    this.write(o);
  }

  remove(id) {
    const o = this.read();
    if (!(id in o)) return;
    delete o[id];
    this.write(o);
  }
}

module.exports = Keys;
