const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { SoundService } = require('../../out/services/SoundService');

test('macOS permission sound uses Ping.aiff', () => {
  const originalPlatform = os.platform;
  os.platform = () => 'darwin';

  try {
    const service = new SoundService('/tmp/sounds', true, 45);
    const command = service.buildCommand('/tmp/sounds/permission_alert.wav', '/System/Library/Sounds/Ping.aiff');

    assert.equal(command, 'afplay -v 45 "/System/Library/Sounds/Ping.aiff"');
  } finally {
    os.platform = originalPlatform;
  }
});

test('macOS completion sound uses Glass.aiff', () => {
  const originalPlatform = os.platform;
  os.platform = () => 'darwin';

  try {
    const service = new SoundService('/tmp/sounds', true, 45);
    const command = service.buildCommand('/tmp/sounds/task_complete.wav', '/System/Library/Sounds/Glass.aiff');

    assert.equal(command, 'afplay -v 45 "/System/Library/Sounds/Glass.aiff"');
  } finally {
    os.platform = originalPlatform;
  }
});

test('Windows playback targets the bundled permission wav', () => {
  const originalPlatform = os.platform;
  os.platform = () => 'win32';

  try {
    const soundPath = path.resolve(__dirname, '../../sounds/permission.wav');
    assert.equal(fs.existsSync(soundPath), true);

    const service = new SoundService('/tmp/sounds', true, 45);
    const command = service.buildCommand(soundPath, '/System/Library/Sounds/Ping.aiff');

    assert.match(command, /permission\.wav/);
    assert.match(command, /Media\.SoundPlayer/);
  } finally {
    os.platform = originalPlatform;
  }
});

test('Linux playback targets the bundled completion wav', () => {
  const originalPlatform = os.platform;
  os.platform = () => 'linux';

  try {
    const soundPath = path.resolve(__dirname, '../../sounds/completion.wav');
    assert.equal(fs.existsSync(soundPath), true);

    const service = new SoundService('/tmp/sounds', true, 45);
    const command = service.buildCommand(soundPath, '/System/Library/Sounds/Glass.aiff');

    assert.equal(command, `paplay "${soundPath}" || aplay "${soundPath}"`);
  } finally {
    os.platform = originalPlatform;
  }
});
