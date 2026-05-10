import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildSwipeArgs, registerTools } from '../src/tools.js';

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

  it('routes device_swipe through coordinate arguments expected by the CLI', async () => {
    const handlers: Record<string, (args: unknown) => Promise<unknown>> = {};
    const calls: string[][] = [];
    const server = {
      tool: (name: string, _description: string, _schema: unknown, handler: (args: unknown) => Promise<unknown>) => {
        handlers[name] = handler;
      },
    };
    const executor = {
      runParsed: async (args: string[]) => {
        calls.push(args);
        return { success: true };
      },
    };

    registerTools(server as never, executor as never);
    const result = await handlers.device_swipe({ direction: 'up' });

    assert.deepEqual(calls, [['swipe', '195', '675', '195', '169', '450']]);
    assert.deepEqual(JSON.parse((result as { content: [{ text: string }] }).content[0].text), { success: true });
  });
});
