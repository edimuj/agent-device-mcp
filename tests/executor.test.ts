import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  AgentDeviceExecutor,
  SUPPORTED_AGENT_DEVICE_VERSION,
  type ExecFileFn,
} from '../src/executor.js';

interface Invocation {
  command: string;
  args: string[];
  options: { env?: NodeJS.ProcessEnv };
}

function mockExec(
  responder: (invocation: Invocation) => { stdout?: string; stderr?: string; error?: Error },
): { calls: Invocation[]; execFile: ExecFileFn } {
  const calls: Invocation[] = [];
  const execFile: ExecFileFn = (command, args, options, callback) => {
    const invocation = { command, args, options };
    calls.push(invocation);
    const response = responder(invocation);
    callback(response.error ?? null, response.stdout ?? '', response.stderr ?? '');
  };
  return { calls, execFile };
}

describe('AgentDeviceExecutor preflight', () => {
  it('checks the pinned agent-device version once before commands', async () => {
    const mock = mockExec(({ args }) => args.includes('--version')
      ? { stdout: `${SUPPORTED_AGENT_DEVICE_VERSION}\n` }
      : { stdout: '{"success":true}' });
    const executor = new AgentDeviceExecutor(
      { minSpacingMs: 0 },
      { execFile: mock.execFile },
    );

    await executor.run(['devices']);
    await executor.run(['appstate']);

    assert.deepEqual(mock.calls.map(({ args }) => args), [
      ['--version'],
      ['devices', '--json'],
      ['appstate', '--json'],
    ]);
  });

  it('rejects an unsupported agent-device version before running a command', async () => {
    const mock = mockExec(() => ({ stdout: '0.19.9\n' }));
    const executor = new AgentDeviceExecutor(
      { minSpacingMs: 0 },
      { execFile: mock.execFile },
    );

    await assert.rejects(
      executor.run(['devices']),
      new RegExp(`requires agent-device ${SUPPORTED_AGENT_DEVICE_VERSION.replaceAll('.', '\\.')}`),
    );
    assert.equal(mock.calls.length, 1);
  });
});

describe('AgentDeviceExecutor local execution', () => {
  it('preserves PATH and appends configured and Android SDK paths', async () => {
    const mock = mockExec(({ args }) => args.includes('--version')
      ? { stdout: `${SUPPORTED_AGENT_DEVICE_VERSION}\n` }
      : { stdout: '{}' });
    const executor = new AgentDeviceExecutor(
      {
        pathPrefix: '/opt/homebrew/bin:/custom/bin',
        androidSdkRoot: '/Users/test/Library/Android/sdk',
        minSpacingMs: 0,
      },
      { execFile: mock.execFile },
    );

    await executor.run(['devices']);

    const path = mock.calls[1].options.env?.PATH;
    assert.equal(
      path,
      `${process.env.PATH}:/opt/homebrew/bin:/custom/bin:/Users/test/Library/Android/sdk/platform-tools:/Users/test/Library/Android/sdk/emulator`,
    );
    assert.equal(mock.calls[1].command, 'agent-device');
  });

  it('passes an isolated daemon state directory to agent-device', async () => {
    const mock = mockExec(({ args }) => args.includes('--version')
      ? { stdout: `${SUPPORTED_AGENT_DEVICE_VERSION}\n` }
      : { stdout: '{}' });
    const executor = new AgentDeviceExecutor(
      { stateDir: '/tmp/agent device state', minSpacingMs: 0 },
      { execFile: mock.execFile },
    );

    await executor.run(['devices']);

    assert.deepEqual(mock.calls[1].args, [
      'devices',
      '--state-dir', '/tmp/agent device state',
      '--json',
    ]);
  });
});

describe('AgentDeviceExecutor SSH execution', () => {
  it('preserves the remote PATH, appends Android tools, and shell-escapes arguments', async () => {
    const mock = mockExec(({ args }) => args.at(-1)?.includes('--version')
      ? { stdout: `${SUPPORTED_AGENT_DEVICE_VERSION}\n` }
      : { stdout: '{}' });
    const executor = new AgentDeviceExecutor(
      {
        host: 'admin@macmini',
        agentDeviceBin: '/opt/homebrew/bin/agent-device',
        pathPrefix: '/opt/homebrew/bin',
        androidSdkRoot: '/Users/admin/Library/Android/sdk',
        stateDir: "/Users/admin/device state's",
        minSpacingMs: 0,
      },
      { execFile: mock.execFile },
    );

    await executor.run(['fill', '@e21', "Android's text"]);

    assert.equal(mock.calls[1].command, 'ssh');
    assert.deepEqual(mock.calls[1].args.slice(0, 3), [
      '-o', 'StrictHostKeyChecking=no', 'admin@macmini',
    ]);
    assert.equal(
      mock.calls[1].args[3],
      `export PATH="$PATH":'/opt/homebrew/bin':'/Users/admin/Library/Android/sdk/platform-tools':'/Users/admin/Library/Android/sdk/emulator'; '/opt/homebrew/bin/agent-device' 'fill' '@e21' 'Android'\\''s text' '--state-dir' '/Users/admin/device state'\\''s' '--json' 2>&1`,
    );
  });

  it('shell-escapes shared target arguments without changing their values', async () => {
    const mock = mockExec(({ args }) => args.at(-1)?.includes('--version')
      ? { stdout: `${SUPPORTED_AGENT_DEVICE_VERSION}\n` }
      : { stdout: '{}' });
    const executor = new AgentDeviceExecutor(
      { host: 'admin@macmini', minSpacingMs: 0 },
      { execFile: mock.execFile },
    );

    await executor.run([
      'boot',
      '--platform', 'android',
      '--device', "Pixel's API 36",
      '--serial', 'emulator-5554',
      '--session', 'android smoke',
    ]);

    const remoteCommand = mock.calls[1].args[3];
    assert.match(remoteCommand, /'--platform' 'android'/);
    assert.match(remoteCommand, /'--device' 'Pixel'\\''s API 36'/);
    assert.match(remoteCommand, /'--serial' 'emulator-5554'/);
    assert.match(remoteCommand, /'--session' 'android smoke'/);
  });

  it('treats localhost as local instead of invoking SSH', async () => {
    const mock = mockExec(({ args }) => args.includes('--version')
      ? { stdout: `${SUPPORTED_AGENT_DEVICE_VERSION}\n` }
      : { stdout: '{}' });
    const executor = new AgentDeviceExecutor(
      { host: 'localhost', minSpacingMs: 0 },
      { execFile: mock.execFile },
    );

    await executor.run(['devices']);

    assert.deepEqual(mock.calls.map(({ command }) => command), ['agent-device', 'agent-device']);
  });
});
