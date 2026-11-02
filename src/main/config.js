const { app } = require('electron');
const fs = require('fs');
const path = require('path');

const defaults = {
  monitor: 'primary',
};

function configDir() {
  return path.join(app.getPath('appData'), 'mochi');
}

function configPath() {
  return path.join(configDir(), 'config.json');
}

function load() {
  try {
    return { ...defaults, ...JSON.parse(fs.readFileSync(configPath(), 'utf8')) };
  } catch {
    return { ...defaults };
  }
}

function save(cfg) {
  fs.mkdirSync(configDir(), { recursive: true });
  const tmp = configPath() + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2));
  fs.renameSync(tmp, configPath());
}

module.exports = { load, save, configDir, configPath };
