const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  CliShimService,
  buildPosixBellsyRunShim,
  buildWindowsBellsyRunShim,
} = require('../../out/services/CliShimService');

test('posix shim forwards arguments to bellsy-run.js', () => {
  const shim = buildPosixBellsyRunShim('/tmp/bellsy/out/cli/bellsy-run.js');

  assert.match(shim, /^#!\/usr\/bin\/env sh\n/);
  assert.match(shim, /node '\/tmp\/bellsy\/out\/cli\/bellsy-run\.js' "\$@"/);
});

test('windows shim forwards arguments to bellsy-run.js', () => {
  const shim = buildWindowsBellsyRunShim('/tmp/bellsy/out/cli/bellsy-run.js');

  assert.equal(shim, '@echo off\r\nnode "\\tmp\\bellsy\\out\\cli\\bellsy-run.js" %*\r\n');
});

test('cli shim service writes bellsy-run and prepends terminal PATH', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bellsy-cli-shim-'));
  const prepends = [];
  const logs = [];

  try {
    const service = new CliShimService(
      tempDir,
      '/tmp/bellsy-extension',
      {
        prepend(variable, value) {
          prepends.push([variable, value]);
        },
      },
      {
        info(message) {
          logs.push(['info', message]);
        },
        warn(message) {
          logs.push(['warn', message]);
        },
      },
      'darwin',
    );

    const binDir = await service.install();
    const shimPath = path.join(tempDir, 'bin', 'bellsy-run');

    assert.equal(binDir, path.join(tempDir, 'bin'));
    assert.equal(fs.existsSync(shimPath), true);
    assert.match(fs.readFileSync(shimPath, 'utf8'), /node '\/tmp\/bellsy-extension\/out\/cli\/bellsy-run\.js'/);
    assert.deepEqual(prepends, [['PATH', `${path.join(tempDir, 'bin')}${path.delimiter}`]]);
    assert.equal(logs[0][0], 'info');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
