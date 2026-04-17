import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { AgentDeviceExecutor } from './executor.js';

interface SnapshotNode {
  ref?: string;
  type?: string;
  label?: string;
  value?: string;
}

interface SnapshotResult {
  data?: { nodes?: SnapshotNode[] };
}

const IGNORED_BUTTONS = new Set([
  'Go back', 'Settings', 'Tap to collapse choices',
  'Close browser', 'Refresh page',
]);
const IGNORED_BUTTON_PATTERN = /^go back|unread messages|other conversations|conversation options|^settings$/i;
const TIMESTAMP_PATTERN = /just now|ago/i;
const PROFILE_PATTERN = /profile/i;

function extractMessages(snapshot: SnapshotResult): string[] {
  const nodes = snapshot.data?.nodes ?? [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const n of nodes) {
    const label = n.label;
    if (!label || !label.includes(' said: ') || seen.has(label)) continue;
    seen.add(label);
    result.push(label);
  }
  return result;
}

function extractChoices(snapshot: SnapshotResult): Array<{ ref: string; label: string }> {
  const nodes = snapshot.data?.nodes ?? [];
  const seen = new Set<string>();
  const result: Array<{ ref: string; label: string }> = [];
  for (const n of nodes) {
    if (n.type !== 'Button' || !n.label || n.label.length <= 2) continue;
    if (IGNORED_BUTTONS.has(n.label)) continue;
    if (IGNORED_BUTTON_PATTERN.test(n.label)) continue;
    if (TIMESTAMP_PATTERN.test(n.label)) continue;
    if (PROFILE_PATTERN.test(n.label)) continue;
    const key = `${n.ref}\t${n.label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ ref: n.ref ?? '', label: n.label });
  }
  return result;
}

function ok(data: unknown) {
  return { content: [{ type: 'text' as const, text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }] };
}

function err(msg: string) {
  return { content: [{ type: 'text' as const, text: `Error: ${msg}` }], isError: true as const };
}

export function registerTools(server: McpServer, executor: AgentDeviceExecutor) {

  server.tool(
    'device_list',
    'List available simulators and emulators',
    {},
    async () => {
      try {
        const result = await executor.runParsed(['devices']);
        return ok(result);
      } catch (e: any) {
        return err(e.message);
      }
    }
  );

  server.tool(
    'device_boot',
    'Boot an iOS simulator or Android emulator by name/UDID',
    {
      platform: z.enum(['ios', 'android']).describe('Platform to boot'),
      device: z.string().describe('Device name (e.g. "iPhone 16 Pro") or UDID/AVD name'),
    },
    async ({ platform, device }) => {
      try {
        if (platform === 'ios') {
          const result = await executor.run(['boot', '--simulator', device]);
          return ok(result || `Booted iOS simulator: ${device}`);
        } else {
          const result = await executor.run(['boot', '--emulator', device]);
          return ok(result || `Booted Android emulator: ${device}`);
        }
      } catch (e: any) {
        return err(e.message);
      }
    }
  );

  server.tool(
    'device_open',
    'Open an app session on the device',
    {
      bundleId: z.string().describe('App bundle ID (e.g. com.example.myapp)'),
      relaunch: z.boolean().optional().describe('Force relaunch if already open'),
    },
    async ({ bundleId, relaunch }) => {
      try {
        const args = ['open', bundleId];
        if (relaunch) args.push('--relaunch');
        const result = await executor.runParsed(args);
        return ok(result);
      } catch (e: any) {
        return err(e.message);
      }
    }
  );

  server.tool(
    'device_close',
    'Close the current app session',
    {},
    async () => {
      try {
        const result = await executor.runParsed(['close']);
        return ok(result);
      } catch (e: any) {
        return err(e.message);
      }
    }
  );

  server.tool(
    'device_snapshot',
    'Get the full accessibility tree of the current screen as structured JSON',
    {
      raw: z.boolean().optional().describe('Return raw unprocessed tree'),
    },
    async ({ raw }) => {
      try {
        const args = ['snapshot'];
        if (raw) args.push('--raw');
        const result = await executor.runParsed(args);
        return ok(result);
      } catch (e: any) {
        return err(e.message);
      }
    }
  );

  server.tool(
    'device_click',
    'Tap an element by accessibility ref (e.g. @e20) or coordinates',
    {
      target: z.string().describe('Accessibility ref (@e20) or "x y" coordinates'),
    },
    async ({ target }) => {
      try {
        const args = ['click', ...target.split(/\s+/)];
        const result = await executor.runParsed(args);
        return ok(result);
      } catch (e: any) {
        return err(e.message);
      }
    }
  );

  server.tool(
    'device_fill',
    'Fill a text field identified by accessibility ref',
    {
      ref: z.string().describe('Accessibility ref of the text field'),
      text: z.string().describe('Text to enter'),
    },
    async ({ ref, text }) => {
      try {
        const result = await executor.runParsed(['fill', ref, text]);
        return ok(result);
      } catch (e: any) {
        return err(e.message);
      }
    }
  );

  server.tool(
    'device_screenshot',
    'Capture a screenshot of the current screen',
    {},
    async () => {
      try {
        const result = await executor.runParsed(['screenshot']);
        return ok(result);
      } catch (e: any) {
        return err(e.message);
      }
    }
  );

  server.tool(
    'device_wait',
    'Wait for a specified number of seconds',
    {
      seconds: z.number().describe('Seconds to wait'),
    },
    async ({ seconds }) => {
      try {
        const result = await executor.run(['wait', String(seconds)]);
        return ok(result || `Waited ${seconds}s`);
      } catch (e: any) {
        return err(e.message);
      }
    }
  );

  server.tool(
    'device_appstate',
    'Get current app/session state',
    {},
    async () => {
      try {
        const result = await executor.runParsed(['appstate']);
        return ok(result);
      } catch (e: any) {
        return err(e.message);
      }
    }
  );

  server.tool(
    'device_messages',
    'Get chat messages visible on screen (parsed from accessibility labels)',
    {},
    async () => {
      try {
        const snapshot = await executor.runParsed<SnapshotResult>(['snapshot', '--raw']);
        const messages = extractMessages(snapshot);
        return ok({ count: messages.length, messages });
      } catch (e: any) {
        return err(e.message);
      }
    }
  );

  server.tool(
    'device_choices',
    'Get tappable choice buttons visible on screen with their refs',
    {},
    async () => {
      try {
        const snapshot = await executor.runParsed<SnapshotResult>(['snapshot', '--raw']);
        const choices = extractChoices(snapshot);
        return ok({ count: choices.length, choices });
      } catch (e: any) {
        return err(e.message);
      }
    }
  );

  server.tool(
    'device_interact',
    'Get both messages and choices in one call — primary tool for game interaction',
    {},
    async () => {
      try {
        const snapshot = await executor.runParsed<SnapshotResult>(['snapshot', '--raw']);
        const messages = extractMessages(snapshot);
        const choices = extractChoices(snapshot);
        return ok({ messages: { count: messages.length, items: messages }, choices: { count: choices.length, items: choices } });
      } catch (e: any) {
        return err(e.message);
      }
    }
  );

  server.tool(
    'device_swipe',
    'Swipe on screen in a direction',
    {
      direction: z.enum(['up', 'down', 'left', 'right']).describe('Swipe direction'),
      ref: z.string().optional().describe('Element ref to swipe on (optional, defaults to screen center)'),
    },
    async ({ direction, ref }) => {
      try {
        const args = ['swipe', direction];
        if (ref) args.push('--element', ref);
        const result = await executor.runParsed(args);
        return ok(result);
      } catch (e: any) {
        return err(e.message);
      }
    }
  );

  server.tool(
    'device_ping',
    'Health check — verify agent-device is reachable',
    {},
    async () => {
      try {
        const result = await executor.runParsed(['devices']);
        return ok({ status: 'ok', devices: result });
      } catch (e: any) {
        return err(e.message);
      }
    }
  );
}
