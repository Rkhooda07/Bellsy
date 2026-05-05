const test = require('node:test');
const assert = require('node:assert/strict');

const { SystemNotifService } = require('../../out/services/SystemNotifService');

test('macOS Cursor notifications use terminal-notifier sender fallback', () => {
  const service = new SystemNotifService('/tmp/bellsy-extension', 'Cursor');

  assert.equal(service.detectMacSenderBundleId(), undefined);
  assert.equal(service.detectMacAppName(), 'Cursor');
});

test('macOS VS Code notifications keep the VS Code sender bundle id', () => {
  const service = new SystemNotifService('/tmp/bellsy-extension', 'Visual Studio Code');

  assert.equal(service.detectMacSenderBundleId(), 'com.microsoft.VSCode');
  assert.equal(service.detectMacAppName(), 'Visual Studio Code');
});
