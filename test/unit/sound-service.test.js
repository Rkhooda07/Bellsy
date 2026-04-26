const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');

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
