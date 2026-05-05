const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { SoundService } = require('../../out/services/SoundService');
const { DEFAULT_SOUND_MODE } = require('../../out/core/constants');
const packageManifest = require('../../package.json');

test('sound mode defaults to focus in code and extension configuration', () => {
  assert.equal(DEFAULT_SOUND_MODE, 'focus');
  assert.equal(packageManifest.contributes.configuration.properties['bellsy.soundMode'].default, 'focus');
});

test('macOS focus mode keeps using the current permission sound file', () => {
  const originalPlatform = os.platform;
  os.platform = () => 'darwin';

  try {
    const soundPath = path.resolve(__dirname, '../../sounds/permission.wav');
    assert.equal(fs.existsSync(soundPath), true);

    const service = new SoundService('/tmp/sounds', true, 45, () => 'focus');
    const command = service.buildCommand(soundPath);

    assert.equal(command, `afplay -v 45 "${soundPath}"`);
  } finally {
    os.platform = originalPlatform;
  }
});

test('macOS completion sound prefers the bundled wav file', () => {
  const originalPlatform = os.platform;
  os.platform = () => 'darwin';

  try {
    const soundPath = path.resolve(__dirname, '../../sounds/completion.wav');
    assert.equal(fs.existsSync(soundPath), true);

    const service = new SoundService('/tmp/sounds', true, 45);
    const command = service.buildCommand(soundPath);

    assert.equal(command, `afplay -v 45 "${soundPath}"`);
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
    const command = service.buildCommand(soundPath);

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
    const command = service.buildCommand(soundPath);

    assert.equal(command, `paplay "${soundPath}" || aplay "${soundPath}"`);
  } finally {
    os.platform = originalPlatform;
  }
});

test('vibe mode maps completion to the reserved task_complete sound', () => {
  const service = new SoundService('/tmp/sounds', true, 45, () => 'vibe');
  const resolvedPath = service.resolveSoundPath(['task_complete.wav']);

  assert.equal(resolvedPath, path.join('/tmp/sounds', 'task_complete.wav'));
});

test('completion preview can target a selected mode without changing the configured mode reader', () => {
  const service = new SoundService('/tmp/sounds', true, 45, () => 'focus');

  assert.equal(service.resolveTaskCompleteSoundPath('focus'), path.join('/tmp/sounds', 'completion.wav'));
  assert.equal(service.resolveTaskCompleteSoundPath('vibe'), path.join('/tmp/sounds', 'task_complete.wav'));
});

test('macOS completion preview runs immediately without notification sync delay', () => {
  const originalPlatform = os.platform;
  os.platform = () => 'darwin';
  const calls = [];

  try {
    const service = new SoundService(
      path.resolve(__dirname, '../../sounds'),
      true,
      45,
      () => 'focus',
      (command, onError) => {
        calls.push(command);
        onError(null);
      },
    );

    service.playTaskCompletePreview('vibe');

    assert.equal(calls.length, 1);
    assert.match(calls[0], /task_complete\.wav/);
  } finally {
    os.platform = originalPlatform;
  }
});

test('vibe mode maps permissions to the reserved permission_alert sound', () => {
  const service = new SoundService('/tmp/sounds', true, 45, () => 'vibe');
  const resolvedPath = service.resolveSoundPath(['permission_alert.wav']);

  assert.equal(resolvedPath, path.join('/tmp/sounds', 'permission_alert.wav'));
});
