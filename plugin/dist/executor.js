import { execFile } from 'node:child_process';
import { homedir } from 'node:os';
export const SUPPORTED_AGENT_DEVICE_VERSION = '0.20.0';
const RETRYABLE_PATTERN = /timed out|timeout|xctest|daemon.*(busy|unavailable|failed)|COMMAND_FAILED/i;
function shellQuote(value) {
    return `'${value.replace(/'/g, "'\\''")}'`;
}
function splitPathEntries(value) {
    return value.split(':').map(entry => entry.trim()).filter(Boolean);
}
function localAndroidSdkRoot(configuredRoot) {
    if (configuredRoot)
        return configuredRoot;
    const environmentRoot = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
    if (environmentRoot)
        return environmentRoot;
    return process.platform === 'darwin'
        ? `${homedir()}/Library/Android/sdk`
        : `${homedir()}/Android/Sdk`;
}
function localPath(basePath, config) {
    const sdkRoot = localAndroidSdkRoot(config.androidSdkRoot);
    return [
        basePath,
        ...splitPathEntries(config.pathPrefix),
        `${sdkRoot}/platform-tools`,
        `${sdkRoot}/emulator`,
    ].filter(Boolean).join(':');
}
function remotePathExport(config) {
    const configuredEntries = splitPathEntries(config.pathPrefix).map(shellQuote);
    const sdkEntries = config.androidSdkRoot
        ? [
            shellQuote(`${config.androidSdkRoot}/platform-tools`),
            shellQuote(`${config.androidSdkRoot}/emulator`),
        ]
        : [
            '"${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}/platform-tools"',
            '"${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}/emulator"',
            '"$HOME/Android/Sdk/platform-tools"',
            '"$HOME/Android/Sdk/emulator"',
        ];
    return `export PATH="$PATH":${[...configuredEntries, ...sdkEntries].join(':')}; `;
}
export class AgentDeviceExecutor {
    config;
    executeFile;
    isLocal;
    lastCallTime = 0;
    preflightPromise;
    constructor(config = {}, dependencies = {}) {
        const host = config.host ?? process.env.AGENT_DEVICE_HOST ?? '';
        this.isLocal = !host || host === 'localhost' || host === '127.0.0.1';
        this.config = {
            host,
            agentDeviceBin: config.agentDeviceBin ?? process.env.AGENT_DEVICE_BIN ?? 'agent-device',
            pathPrefix: config.pathPrefix ?? process.env.AGENT_DEVICE_PATH_PREFIX ?? '',
            androidSdkRoot: config.androidSdkRoot
                ?? process.env.AGENT_DEVICE_ANDROID_SDK_ROOT
                ?? '',
            stateDir: config.stateDir ?? process.env.AGENT_DEVICE_STATE_DIR ?? '',
            minSpacingMs: config.minSpacingMs ?? Number(process.env.AGENT_DEVICE_MIN_SPACING_MS ?? 1000),
            retryMax: config.retryMax ?? Number(process.env.AGENT_DEVICE_RETRY_MAX ?? 3),
            retryInitialDelayMs: config.retryInitialDelayMs ?? Number(process.env.AGENT_DEVICE_RETRY_INITIAL_DELAY_MS ?? 1000),
        };
        this.executeFile = dependencies.execFile ?? execFile;
    }
    async enforceSpacing() {
        const elapsed = Date.now() - this.lastCallTime;
        if (elapsed < this.config.minSpacingMs) {
            await new Promise(resolve => setTimeout(resolve, this.config.minSpacingMs - elapsed));
        }
    }
    exec(command, args) {
        return new Promise((resolve, reject) => {
            this.executeFile(command, args, {
                timeout: 30_000,
                maxBuffer: 10 * 1024 * 1024,
                env: this.isLocal
                    ? { ...process.env, PATH: localPath(process.env.PATH ?? '', this.config) }
                    : process.env,
            }, (error, stdout, stderr) => {
                if (error) {
                    reject(Object.assign(error, { stdout, stderr }));
                }
                else {
                    resolve({ stdout, stderr });
                }
            });
        });
    }
    buildCommand(args, options) {
        const fullArgs = [
            ...args,
            ...(options.stateDir && this.config.stateDir
                ? ['--state-dir', this.config.stateDir]
                : []),
            ...(options.json ? ['--json'] : []),
        ];
        if (this.isLocal) {
            return { command: this.config.agentDeviceBin, args: fullArgs };
        }
        const escaped = [this.config.agentDeviceBin, ...fullArgs].map(shellQuote).join(' ');
        return {
            command: 'ssh',
            args: [
                '-o',
                'StrictHostKeyChecking=no',
                this.config.host,
                `${remotePathExport(this.config)}${escaped} 2>&1`,
            ],
        };
    }
    async preflight() {
        if (!this.preflightPromise) {
            this.preflightPromise = this.checkVersion();
        }
        return this.preflightPromise;
    }
    async checkVersion() {
        const invocation = this.buildCommand(['--version'], { json: false, stateDir: false });
        let stdout;
        try {
            ({ stdout } = await this.exec(invocation.command, invocation.args));
        }
        catch (error) {
            const processError = error;
            const output = `${processError.stdout ?? ''}${processError.stderr ?? ''}${processError.message ?? ''}`;
            throw new Error(`agent-device preflight failed: ${output.slice(0, 500)}`);
        }
        const version = stdout.trim().match(/\d+\.\d+\.\d+/)?.[0] ?? '';
        if (version !== SUPPORTED_AGENT_DEVICE_VERSION) {
            throw new Error(`agent-device-mcp requires agent-device ${SUPPORTED_AGENT_DEVICE_VERSION}; found ${version || 'an unknown version'}`);
        }
        return version;
    }
    async run(args) {
        await this.preflight();
        let attempt = 1;
        let delay = this.config.retryInitialDelayMs;
        while (true) {
            await this.enforceSpacing();
            const invocation = this.buildCommand(args, { json: true, stateDir: true });
            try {
                const { stdout } = await this.exec(invocation.command, invocation.args);
                this.lastCallTime = Date.now();
                return stdout;
            }
            catch (error) {
                this.lastCallTime = Date.now();
                const processError = error;
                const output = `${processError.stdout ?? ''}${processError.stderr ?? ''}${processError.message ?? ''}`;
                if (attempt >= this.config.retryMax || !RETRYABLE_PATTERN.test(output)) {
                    throw new Error(`agent-device failed (attempt ${attempt}/${this.config.retryMax}): ${output.slice(0, 500)}`);
                }
                await new Promise(resolve => setTimeout(resolve, delay));
                delay *= 2;
                attempt++;
            }
        }
    }
    async runParsed(args) {
        const raw = await this.run(args);
        try {
            return JSON.parse(raw);
        }
        catch {
            return raw;
        }
    }
}
