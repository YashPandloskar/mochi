const { app } = require('electron');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const defaults = {
  monitor: 'primary',
  port: 47900,
  token: null,
  showUsage: true, // "Show usage on Claude tile"
  music: true, // Music module (Apple Music)
  // the user's own statusLine, saved by the hook installer so it can be chained and restored
  statusLineOriginal: null,
  jobs: { date: '', count: 0 },
};

function configDir() {
  return path.join(app.getPath('appData'), 'mochi');
}

function configPath() {
  return path.join(configDir(), 'config.json');
}

function write(cfg) {
  fs.mkdirSync(configDir(), { recursive: true });
  const tmp = configPath() + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2));
  fs.renameSync(tmp, configPath());
}

// Loads the config; generates the shared token on first run.
function load() {
  let cfg;
  try {
    cfg = { ...defaults, ...JSON.parse(fs.readFileSync(configPath(), 'utf8')) };
  } catch {
    cfg = { ...defaults };
  }
  if (!cfg.token) {
    cfg.token = crypto.randomBytes(32).toString('hex');
    write(cfg);
  }
  return cfg;
}

// Re-reads from disk before saving so edits made by the hook installer are not lost.
function update(patch) {
  let cur = {};
  try {
    cur = JSON.parse(fs.readFileSync(configPath(), 'utf8'));
  } catch {}
  const next = { ...defaults, ...cur, ...patch };
  write(next);
  return next;
}

module.exports = { load, update, configDir, configPath };
