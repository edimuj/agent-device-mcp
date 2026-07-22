import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { buildSwipeArgs, registerTools } from '../src/tools.js';

type Handler = (args: Record<string, unknown>) => Promise<unknown>;

interface ToolCall {
  method: 'run' | 'runParsed';
  args: string[];
}

interface TextResult {
  content: [{ text: string }];
}

const androidSnapshot = JSON.parse(
  readFileSync(new URL('./fixtures/android-snapshot.json', import.meta.url), 'utf8'),
) as unknown;

function setupTools() {
  const handlers: Record<string, Handler> = {};
  const calls: ToolCall[] = [];
  const server = {
    tool: (name: string, _description: string, _schema: unknown, handler: Handler) => {
      handlers[name] = handler;
    },
  };
  const executor = {
    run: async (args: string[]) => {
      calls.push({ method: 'run' as const, args });
      return '';
    },
    runParsed: async (args: string[]) => {
      calls.push({ method: 'runParsed' as const, args });
      return args[0] === 'snapshot' ? androidSnapshot : { success: true };
    },
  };

  registerTools(server as never, executor as never);
  return { calls, handlers };
}

function text(result: unknown): string {
  return (result as TextResult).content[0].text;
}

describe('buildSwipeArgs', () => {
  it('translates vertical directions to center-screen coordinates', () => {
    assert.deepEqual(buildSwipeArgs('up'), ['swipe', '195', '675', '195', '169', '450']);
    assert.deepEqual(buildSwipeArgs('down'), ['swipe', '195', '169', '195', '675', '450']);
  });

  it('translates horizontal directions to center-screen coordinates', () => {
    assert.deepEqual(buildSwipeArgs('left'), ['swipe', '312', '422', '78', '422', '450']);
    assert.deepEqual(buildSwipeArgs('right'), ['swipe', '78', '422', '312', '422', '450']);
  });

  it('supports explicit viewport and duration for regression coverage', () => {
    assert.deepEqual(buildSwipeArgs('up', { width: 400, height: 800, durationMs: 300 }), [
      'swipe',
      '200',
      '640',
      '200',
      '160',
      '300',
    ]);
  });
});

describe('tool command routing', () => {
  const commonCases = [
    { name: 'device_list', input: {}, command: ['devices'], method: 'runParsed' },
    { name: 'device_boot', input: {}, command: ['boot'], method: 'run' },
    {
      name: 'device_install',
      input: { appId: 'com.example.app', path: '/tmp/App Build.apk' },
      command: ['install', 'com.example.app', '/tmp/App Build.apk'],
      method: 'runParsed',
    },
    {
      name: 'device_open',
      input: { bundleId: 'com.example.app', relaunch: true },
      command: ['open', 'com.example.app', '--relaunch'],
      method: 'runParsed',
    },
    { name: 'device_close', input: {}, command: ['close'], method: 'runParsed' },
    { name: 'device_snapshot', input: { raw: true }, command: ['snapshot', '--raw'], method: 'runParsed' },
    { name: 'device_click', input: { target: '@e20' }, command: ['click', '@e20'], method: 'runParsed' },
    { name: 'device_press', input: { target: '@e20' }, command: ['press', '@e20'], method: 'runParsed' },
    {
      name: 'device_fill',
      input: { ref: '@e21', text: "Android's text" },
      command: ['fill', '@e21', "Android's text"],
      method: 'runParsed',
    },
    { name: 'device_type', input: { text: 'hello world' }, command: ['type', 'hello world'], method: 'runParsed' },
    { name: 'device_screenshot', input: {}, command: ['screenshot'], method: 'runParsed' },
    { name: 'device_home', input: {}, command: ['home'], method: 'runParsed' },
    { name: 'device_back', input: {}, command: ['back'], method: 'runParsed' },
    { name: 'device_wait', input: { seconds: 2 }, command: ['wait', '2'], method: 'run' },
    { name: 'device_appstate', input: {}, command: ['appstate'], method: 'runParsed' },
    { name: 'device_messages', input: {}, command: ['snapshot', '--raw'], method: 'runParsed' },
    { name: 'device_choices', input: {}, command: ['snapshot', '--raw'], method: 'runParsed' },
    { name: 'device_interact', input: {}, command: ['snapshot', '--raw'], method: 'runParsed' },
    { name: 'device_shutdown', input: {}, command: ['close', '--shutdown'], method: 'runParsed' },
    { name: 'device_ping', input: {}, command: ['devices'], method: 'runParsed' },
  ] as const;

  const targets = {
    ios: {
      platform: 'ios',
      device: 'iPhone 16 Pro',
      udid: 'ios-udid',
      session: 'ios-session',
    },
    android: {
      platform: 'android',
      device: 'Pixel 9',
      serial: 'emulator-5554',
      session: 'android-session',
    },
  } as const;

  function targetArgs(platform: keyof typeof targets): string[] {
    const target = targets[platform];
    return [
      '--platform', platform,
      '--device', target.device,
      ...(platform === 'ios' ? ['--udid', targets.ios.udid] : ['--serial', targets.android.serial]),
      '--session', target.session,
    ];
  }

  for (const platform of ['ios', 'android'] as const) {
    for (const testCase of commonCases) {
      it(`routes ${testCase.name} to ${platform} with the shared target`, async () => {
        const { calls, handlers } = setupTools();
        assert.ok(handlers[testCase.name], `missing ${testCase.name}`);

        await handlers[testCase.name]({ ...testCase.input, ...targets[platform] });

        assert.deepEqual(calls, [{
          method: testCase.method,
          args: [...testCase.command, ...targetArgs(platform)],
        }]);
      });
    }

    it(`routes device_swipe to the ${platform} gesture command`, async () => {
      const { calls, handlers } = setupTools();
      await handlers.device_swipe({ direction: 'up', ...targets[platform] });

      assert.deepEqual(calls, [{
        method: 'runParsed',
        args: [
          ...(platform === 'ios'
            ? ['swipe', '195', '675', '195', '169', '450']
            : ['scroll', 'up']),
          ...targetArgs(platform),
        ],
      }]);
    });
  }

  it('keeps the complete tool surface intentionally curated', () => {
    const { handlers } = setupTools();
    assert.deepEqual(Object.keys(handlers).sort(), [
      ...commonCases.map(({ name }) => name),
      'device_swipe',
    ].sort());
  });
});

describe('Android convenience parsing', () => {
  it('extracts real Android Button and EditText snapshot nodes', async () => {
    const { handlers } = setupTools();

    const choices = JSON.parse(text(await handlers.device_choices({ platform: 'android' }))) as {
      count: number;
      choices: Array<{ ref: string; label: string }>;
    };
    assert.deepEqual(choices, {
      count: 1,
      choices: [{ ref: 'e125', label: "Yeah one match. We'll see how it goes" }],
    });

    const interaction = JSON.parse(text(await handlers.device_interact({ platform: 'android' }))) as {
      inputs: { count: number; items: Array<{ ref: string; label: string; value?: string }> };
    };
    assert.deepEqual(interaction.inputs, {
      count: 1,
      items: [{ ref: 'e51', label: 'Enter your name', value: 'Enter your name' }],
    });
  });
});
