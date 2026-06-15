const test = require('node:test');
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const os = require('node:os');

const { SystemNotifService } = require('../../out/services/SystemNotifService');

test('macOS Cursor notifications use terminal-notifier sender fallback', () => {
  const originalTerm = process.env.TERM_PROGRAM;
  process.env.TERM_PROGRAM = 'vscode';
  try {
    const service = new SystemNotifService('/tmp/bellsy-extension', 'Cursor');

    assert.equal(service.detectMacSenderBundleId(), undefined);
    assert.equal(service.detectMacAppName(), 'Cursor');
  } finally {
    process.env.TERM_PROGRAM = originalTerm;
  }
});

test('macOS VS Code notifications keep the VS Code sender bundle id', () => {
  const originalTerm = process.env.TERM_PROGRAM;
  process.env.TERM_PROGRAM = 'vscode';
  try {
    const service = new SystemNotifService('/tmp/bellsy-extension', 'Visual Studio Code');

    assert.equal(service.detectMacSenderBundleId(), 'com.microsoft.VSCode');
    assert.equal(service.detectMacAppName(), 'Visual Studio Code');
  } finally {
    process.env.TERM_PROGRAM = originalTerm;
  }
});

test('macOS notifier warms the terminal-notifier delivery path once during startup', () => {
  const originalPlatform = os.platform;
  const originalExecFile = childProcess.execFile;
  const modulePath = require.resolve('../../out/services/SystemNotifService');
  const calls = [];

  os.platform = () => 'darwin';
  childProcess.execFile = (file, args, callback) => {
    calls.push({ file, args });
    callback?.(null);
    return {};
  };

  try {
    delete require.cache[modulePath];
    const { SystemNotifService: WarmedSystemNotifService } = require(modulePath);
    const service = new WarmedSystemNotifService('/tmp/bellsy-extension', 'Bellsy');

    service.warmMacNotifier();
    service.warmMacNotifier();

    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].args, ['-remove', 'bellsy-warmup']);
  } finally {
    childProcess.execFile = originalExecFile;
    os.platform = originalPlatform;
    delete require.cache[modulePath];
  }
});
