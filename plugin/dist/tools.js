import { z } from 'zod';
const TARGET_SCHEMA = {
    platform: z.enum(['ios', 'android']).optional().describe('Target platform'),
    device: z.string().optional().describe('Device name or identifier'),
    udid: z.string().optional().describe('iOS simulator/device UDID'),
    serial: z.string().optional().describe('Android device/emulator serial'),
    session: z.string().optional().describe('Named agent-device session'),
};
const DEFAULT_SWIPE_VIEWPORT = {
    width: 390,
    height: 844,
};
const DEFAULT_SWIPE_DURATION_MS = 450;
const BUTTON_TYPES = new Set(['Button', 'Pressable', 'android.widget.Button']);
const INPUT_TYPES = new Set(['TextField', 'android.widget.EditText']);
function roundedPoint(value) {
    return String(Math.round(value));
}
export function buildSwipeArgs(direction, options = {}) {
    const width = options.width ?? DEFAULT_SWIPE_VIEWPORT.width;
    const height = options.height ?? DEFAULT_SWIPE_VIEWPORT.height;
    const centerX = width * 0.5;
    const centerY = height * 0.5;
    const leftX = width * 0.2;
    const rightX = width * 0.8;
    const topY = height * 0.2;
    const bottomY = height * 0.8;
    const durationMs = options.durationMs ?? DEFAULT_SWIPE_DURATION_MS;
    const coords = (() => {
        switch (direction) {
            case 'up':
                return [centerX, bottomY, centerX, topY];
            case 'down':
                return [centerX, topY, centerX, bottomY];
            case 'left':
                return [rightX, centerY, leftX, centerY];
            case 'right':
                return [leftX, centerY, rightX, centerY];
        }
    })();
    return ['swipe', ...coords.map(roundedPoint), String(durationMs)];
}
export function appendTargetArgs(args, target) {
    const result = [...args];
    if (target.platform)
        result.push('--platform', target.platform);
    if (target.device)
        result.push('--device', target.device);
    if (target.udid)
        result.push('--udid', target.udid);
    if (target.serial)
        result.push('--serial', target.serial);
    if (target.session)
        result.push('--session', target.session);
    return result;
}
const IGNORED_BUTTONS = new Set([
    'Go back', 'Settings', 'Tap to collapse choices',
    'Close browser', 'Refresh page',
]);
const IGNORED_BUTTON_PATTERN = /^go back|unread messages|other conversations|conversation options|^settings$/i;
const TIMESTAMP_PATTERN = /just now|ago/i;
const PROFILE_PATTERN = /profile/i;
function extractMessages(snapshot) {
    const nodes = snapshot.data?.nodes ?? [];
    const seen = new Set();
    const result = [];
    for (const node of nodes) {
        const label = node.label;
        if (!label || !label.includes(' said: ') || seen.has(label))
            continue;
        seen.add(label);
        result.push(label);
    }
    return result;
}
function extractChoices(snapshot) {
    const nodes = snapshot.data?.nodes ?? [];
    const seen = new Set();
    const result = [];
    for (const node of nodes) {
        if (!node.type || !BUTTON_TYPES.has(node.type) || !node.label || node.label.length <= 2)
            continue;
        if (IGNORED_BUTTONS.has(node.label))
            continue;
        if (IGNORED_BUTTON_PATTERN.test(node.label))
            continue;
        if (TIMESTAMP_PATTERN.test(node.label))
            continue;
        if (PROFILE_PATTERN.test(node.label))
            continue;
        const key = `${node.ref}\t${node.label}`;
        if (seen.has(key))
            continue;
        seen.add(key);
        result.push({ ref: node.ref ?? '', label: node.label });
    }
    return result;
}
function extractInputs(snapshot) {
    const nodes = snapshot.data?.nodes ?? [];
    return nodes.flatMap(node => {
        if (!node.type || !INPUT_TYPES.has(node.type) || !node.label)
            return [];
        return [{
                ref: node.ref ?? '',
                label: node.label,
                ...(node.value !== undefined ? { value: node.value } : {}),
            }];
    });
}
function ok(data) {
    return { content: [{ type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }] };
}
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
function err(error) {
    return { content: [{ type: 'text', text: `Error: ${errorMessage(error)}` }], isError: true };
}
export function registerTools(server, executor) {
    server.tool('device_list', 'List available simulators and emulators', TARGET_SCHEMA, async (target) => {
        try {
            return ok(await executor.runParsed(appendTargetArgs(['devices'], target)));
        }
        catch (error) {
            return err(error);
        }
    });
    server.tool('device_boot', 'Boot an iOS simulator or Android emulator by name', {
        ...TARGET_SCHEMA,
        platform: z.enum(['ios', 'android']).describe('Platform to boot'),
        device: z.string().describe('Device name (for example "iPhone 16 Pro" or an Android AVD name)'),
    }, async (target) => {
        try {
            const result = await executor.run(appendTargetArgs(['boot'], target));
            return ok(result || `Booted ${target.platform} device: ${target.device}`);
        }
        catch (error) {
            return err(error);
        }
    });
    server.tool('device_install', 'Install an app binary on the target device', {
        appId: z.string().describe('Bundle ID or Android package name'),
        path: z.string().describe('Path to the .app, .ipa, .apk, or .apks artifact on the device host'),
        ...TARGET_SCHEMA,
    }, async ({ appId, path, ...target }) => {
        try {
            return ok(await executor.runParsed(appendTargetArgs(['install', appId, path], target)));
        }
        catch (error) {
            return err(error);
        }
    });
    server.tool('device_open', 'Open an app session on the device', {
        bundleId: z.string().describe('iOS bundle ID or Android package name'),
        relaunch: z.boolean().optional().describe('Force relaunch if already open'),
        ...TARGET_SCHEMA,
    }, async ({ bundleId, relaunch, ...target }) => {
        try {
            const args = ['open', bundleId];
            if (relaunch)
                args.push('--relaunch');
            return ok(await executor.runParsed(appendTargetArgs(args, target)));
        }
        catch (error) {
            return err(error);
        }
    });
    server.tool('device_close', 'Close the current app session', TARGET_SCHEMA, async (target) => {
        try {
            return ok(await executor.runParsed(appendTargetArgs(['close'], target)));
        }
        catch (error) {
            return err(error);
        }
    });
    server.tool('device_snapshot', 'Get the full accessibility tree of the current screen as structured JSON', {
        raw: z.boolean().optional().describe('Return raw unprocessed tree'),
        ...TARGET_SCHEMA,
    }, async ({ raw, ...target }) => {
        try {
            const args = ['snapshot'];
            if (raw)
                args.push('--raw');
            return ok(await executor.runParsed(appendTargetArgs(args, target)));
        }
        catch (error) {
            return err(error);
        }
    });
    server.tool('device_click', 'Tap an element by accessibility ref or coordinates', {
        target: z.string().describe('Accessibility ref (for example @e20) or "x y" coordinates'),
        ...TARGET_SCHEMA,
    }, async ({ target: clickTarget, ...target }) => {
        try {
            const args = ['click', ...clickTarget.split(/\s+/)];
            return ok(await executor.runParsed(appendTargetArgs(args, target)));
        }
        catch (error) {
            return err(error);
        }
    });
    server.tool('device_press', 'Press an element by accessibility ref or coordinates', {
        target: z.string().describe('Accessibility ref (for example @e20) or "x y" coordinates'),
        ...TARGET_SCHEMA,
    }, async ({ target: pressTarget, ...target }) => {
        try {
            const args = ['press', ...pressTarget.split(/\s+/)];
            return ok(await executor.runParsed(appendTargetArgs(args, target)));
        }
        catch (error) {
            return err(error);
        }
    });
    server.tool('device_fill', 'Fill a text field identified by accessibility ref', {
        ref: z.string().describe('Accessibility ref of the text field'),
        text: z.string().describe('Text to enter'),
        ...TARGET_SCHEMA,
    }, async ({ ref, text, ...target }) => {
        try {
            return ok(await executor.runParsed(appendTargetArgs(['fill', ref, text], target)));
        }
        catch (error) {
            return err(error);
        }
    });
    server.tool('device_type', 'Type text into the focused field', {
        text: z.string().describe('Text to type'),
        ...TARGET_SCHEMA,
    }, async ({ text, ...target }) => {
        try {
            return ok(await executor.runParsed(appendTargetArgs(['type', text], target)));
        }
        catch (error) {
            return err(error);
        }
    });
    server.tool('device_screenshot', 'Capture a screenshot of the current screen', TARGET_SCHEMA, async (target) => {
        try {
            return ok(await executor.runParsed(appendTargetArgs(['screenshot'], target)));
        }
        catch (error) {
            return err(error);
        }
    });
    server.tool('device_home', 'Return to the device home screen', TARGET_SCHEMA, async (target) => {
        try {
            return ok(await executor.runParsed(appendTargetArgs(['home'], target)));
        }
        catch (error) {
            return err(error);
        }
    });
    server.tool('device_back', 'Navigate back on the target device', TARGET_SCHEMA, async (target) => {
        try {
            return ok(await executor.runParsed(appendTargetArgs(['back'], target)));
        }
        catch (error) {
            return err(error);
        }
    });
    server.tool('device_wait', 'Wait for a specified number of seconds', {
        seconds: z.number().describe('Seconds to wait'),
        ...TARGET_SCHEMA,
    }, async ({ seconds, ...target }) => {
        try {
            const result = await executor.run(appendTargetArgs(['wait', String(seconds)], target));
            return ok(result || `Waited ${seconds}s`);
        }
        catch (error) {
            return err(error);
        }
    });
    server.tool('device_appstate', 'Get current app/session state', TARGET_SCHEMA, async (target) => {
        try {
            return ok(await executor.runParsed(appendTargetArgs(['appstate'], target)));
        }
        catch (error) {
            return err(error);
        }
    });
    server.tool('device_messages', 'Get chat messages visible on screen', TARGET_SCHEMA, async (target) => {
        try {
            const snapshot = await executor.runParsed(appendTargetArgs(['snapshot', '--raw'], target));
            const messages = extractMessages(snapshot);
            return ok({ count: messages.length, messages });
        }
        catch (error) {
            return err(error);
        }
    });
    server.tool('device_choices', 'Get tappable choice buttons visible on screen with their refs', TARGET_SCHEMA, async (target) => {
        try {
            const snapshot = await executor.runParsed(appendTargetArgs(['snapshot', '--raw'], target));
            const choices = extractChoices(snapshot);
            return ok({ count: choices.length, choices });
        }
        catch (error) {
            return err(error);
        }
    });
    server.tool('device_interact', 'Get messages, choices, and text inputs in one call', TARGET_SCHEMA, async (target) => {
        try {
            const snapshot = await executor.runParsed(appendTargetArgs(['snapshot', '--raw'], target));
            const messages = extractMessages(snapshot);
            const choices = extractChoices(snapshot);
            const inputs = extractInputs(snapshot);
            return ok({
                messages: { count: messages.length, items: messages },
                choices: { count: choices.length, items: choices },
                inputs: { count: inputs.length, items: inputs },
            });
        }
        catch (error) {
            return err(error);
        }
    });
    server.tool('device_swipe', 'Swipe or scroll on screen in a direction', {
        direction: z.enum(['up', 'down', 'left', 'right']).describe('Swipe direction'),
        ref: z.string().optional().describe('Deprecated; swipes use the screen viewport'),
        ...TARGET_SCHEMA,
    }, async ({ direction, ref: _ref, ...target }) => {
        try {
            const args = target.platform === 'android'
                ? ['scroll', direction]
                : buildSwipeArgs(direction);
            return ok(await executor.runParsed(appendTargetArgs(args, target)));
        }
        catch (error) {
            return err(error);
        }
    });
    server.tool('device_shutdown', 'Close the session and shut down its simulator or emulator', TARGET_SCHEMA, async (target) => {
        try {
            return ok(await executor.runParsed(appendTargetArgs(['close', '--shutdown'], target)));
        }
        catch (error) {
            return err(error);
        }
    });
    server.tool('device_ping', 'Health check — verify agent-device is reachable', TARGET_SCHEMA, async (target) => {
        try {
            const result = await executor.runParsed(appendTargetArgs(['devices'], target));
            return ok({ status: 'ok', devices: result });
        }
        catch (error) {
            return err(error);
        }
    });
}
