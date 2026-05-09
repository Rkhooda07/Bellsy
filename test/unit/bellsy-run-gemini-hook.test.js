const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('bellsy-run installs Gemini AfterAgent hook for completion notifications', async () => {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'bellsy-gemini-home-'));
  const bellsyRun = path.resolve(__dirname, '../../out/cli/bellsy-run.js');

  const installResult = spawnSync(
    process.execPath,
    [
      bellsyRun,
      '--agent',
      'gemini',
      '--endpoint',
      'file:///tmp/bellsy-event',
      '--tty',
      'off',
      '--',
      process.execPath,
      '-e',
      '',
    ],
    {
      env: { ...process.env, HOME: tempHome },
      encoding: 'utf8',
    },
  );

  assert.equal(installResult.status, 0, installResult.stderr);

  const extensionDir = path.join(tempHome, '.gemini', 'extensions', 'bellsy-notifications');
  const hooksConfig = JSON.parse(fs.readFileSync(path.join(extensionDir, 'hooks', 'hooks.json'), 'utf8'));
  assert.equal(hooksConfig.hooks.AfterAgent[0].hooks[0].name, 'bellsy-after-agent');

  const hook = spawnSync(process.execPath, [path.join(extensionDir, 'after-agent.js')], {
    env: {
      ...process.env,
      BELLSY_URL: 'file:///tmp/bellsy-event',
      BELLSY_AGENT: 'gemini',
      BELLSY_RUN_ID: 'run-1',
    },
    input: JSON.stringify({
      session_id: 'session-1',
      timestamp: '2026-05-09T13:10:00.000Z',
      hook_event_name: 'AfterAgent',
      prompt: 'hi',
      prompt_response: 'Bellsy hook response complete.\nSecond line.',
    }),
    encoding: 'utf8',
  });

  assert.equal(hook.status, 0, hook.stderr);
  assert.match(hook.stdout, /"suppressOutput":true/);
  assert.match(fs.readFileSync(path.join(extensionDir, 'after-agent.js'), 'utf8'), /gemini-after-agent-hook/);
});
