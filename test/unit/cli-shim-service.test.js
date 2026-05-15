const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  CliShimService,
  buildPosixBellsyRunShim,
  buildWindowsBellsyRunShim,
  buildPosixShellPathBootstrap,
  upsertShellBootstrap,
} = require('../../out/services/CliShimService');

test('posix shim forwards arguments to bellsy-run.js', () => {
  const shim = buildPosixBellsyRunShim('/tmp/bellsy/out/cli/bellsy-run.js', '/tmp/bellsy/endpoint');

  assert.match(shim, /^#!\/usr\/bin\/env sh\n/);
  assert.match(shim, /BELLSY_URL="\$\(cat '\/tmp\/bellsy\/endpoint'\)"/);
  assert.match(shim, /node '\/tmp\/bellsy\/out\/cli\/bellsy-run\.js' "\$@"/);
});

test('windows shim forwards arguments to bellsy-run.js', () => {
  const shim = buildWindowsBellsyRunShim('/tmp/bellsy/out/cli/bellsy-run.js', '/tmp/bellsy/endpoint');

  assert.equal(
    shim,
    '@echo off\r\nif exist "\\tmp\\bellsy\\endpoint" set /p BELLSY_URL=<"\\tmp\\bellsy\\endpoint"\r\nnode "\\tmp\\bellsy\\out\\cli\\bellsy-run.js" %*\r\n',
  );
});

test('shell bootstrap exports the Bellsy shim path', () => {
  const block = buildPosixShellPathBootstrap('/tmp/bellsy/bin');

  assert.match(block, /# >>> Bellsy >>>/);
  assert.match(block, /export PATH='\/tmp\/bellsy\/bin':"\$PATH"/);
  assert.match(block, /# <<< Bellsy <<</);
});

test('shell bootstrap is inserted and updated idempotently', () => {
  const first = upsertShellBootstrap('export PATH="/usr/local/bin:$PATH"\n', buildPosixShellPathBootstrap('/tmp/bellsy/bin'));
  const second = upsertShellBootstrap(first, buildPosixShellPathBootstrap('/tmp/bellsy/bin-2'));

  assert.match(first, /# >>> Bellsy >>>/);
  assert.match(second, /\/tmp\/bellsy\/bin-2/);
  assert.equal((second.match(/# >>> Bellsy >>>/g) ?? []).length, 1);
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
      tempDir,
    );

    const binDir = await service.install();
    const shimPath = path.join(tempDir, 'bin', 'bellsy-run');
    const zprofilePath = path.join(tempDir, '.zprofile');

    assert.equal(binDir, path.join(tempDir, 'bin'));
    assert.equal(fs.existsSync(shimPath), true);
    assert.match(fs.readFileSync(shimPath, 'utf8'), /node '\/tmp\/bellsy-extension\/out\/cli\/bellsy-run\.js'/);
    assert.deepEqual(prepends, [['PATH', `${path.join(tempDir, 'bin')}${path.delimiter}`]]);
    assert.match(fs.readFileSync(zprofilePath, 'utf8'), /# >>> Bellsy >>>/);
    assert.equal(logs[0][0], 'info');

    await service.updateEndpoint('http://127.0.0.1:4321/event');
    assert.equal(fs.readFileSync(path.join(tempDir, 'endpoint'), 'utf8'), 'http://127.0.0.1:4321/event\n');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
