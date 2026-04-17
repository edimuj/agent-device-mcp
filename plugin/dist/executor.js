import { execFile } from 'node:child_process';
const RETRYABLE_PATTERN = /timed out|timeout|xctest|daemon.*(busy|unavailable|failed)|COMMAND_FAILED/i;
export class AgentDeviceExecutor {
    config;
    lastCallTime = 0;
    constructor(config = {}) {
        this.config = {
            host: config.host ?? process.env.AGENT_DEVICE_HOST ?? 'admin@macmini',
            agentDeviceBin: config.agentDeviceBin ?? process.env.AGENT_DEVICE_BIN ?? 'agent-device',
            pathPrefix: config.pathPrefix ?? process.env.AGENT_DEVICE_PATH_PREFIX ?? '/opt/homebrew/bin:$PATH',
            minSpacingMs: config.minSpacingMs ?? Number(process.env.AGENT_DEVICE_MIN_SPACING_MS ?? 1000),
            retryMax: config.retryMax ?? Number(process.env.AGENT_DEVICE_RETRY_MAX ?? 3),
            retryInitialDelayMs: config.retryInitialDelayMs ?? Number(process.env.AGENT_DEVICE_RETRY_INITIAL_DELAY_MS ?? 1000),
        };
    }
    async enforceSpacing() {
        const now = Date.now();
        const elapsed = now - this.lastCallTime;
        if (elapsed < this.config.minSpacingMs) {
            await new Promise(r => setTimeout(r, this.config.minSpacingMs - elapsed));
        }
    }
    buildRemoteCommand(args) {
        const cmd = [this.config.agentDeviceBin, ...args, '--json'];
        const escaped = cmd.map(a => `'${a.replace(/'/g, "'\\''")}'`).join(' ');
        return `export PATH='${this.config.pathPrefix}'; ${escaped} 2>&1`;
    }
    ssh(remoteCmd) {
        return new Promise((resolve, reject) => {
            execFile('ssh', ['-o', 'StrictHostKeyChecking=no', this.config.host, remoteCmd], {
                timeout: 30_000,
                maxBuffer: 10 * 1024 * 1024,
            }, (err, stdout, stderr) => {
                if (err) {
                    reject(Object.assign(err, { stdout, stderr }));
                }
                else {
                    resolve({ stdout, stderr });
                }
            });
        });
    }
    async run(args) {
        let attempt = 1;
        let delay = this.config.retryInitialDelayMs;
        while (true) {
            await this.enforceSpacing();
            const remoteCmd = this.buildRemoteCommand(args);
            try {
                const { stdout } = await this.ssh(remoteCmd);
                this.lastCallTime = Date.now();
                return stdout;
            }
            catch (err) {
                this.lastCallTime = Date.now();
                const output = (err.stdout ?? '') + (err.stderr ?? '') + (err.message ?? '');
                if (attempt >= this.config.retryMax || !RETRYABLE_PATTERN.test(output)) {
                    throw new Error(`agent-device failed (attempt ${attempt}/${this.config.retryMax}): ${output.slice(0, 500)}`);
                }
                await new Promise(r => setTimeout(r, delay));
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
    async runLocal(command, args) {
        return new Promise((resolve, reject) => {
            execFile(command, args, { timeout: 30_000 }, (err, stdout, stderr) => {
                if (err)
                    reject(Object.assign(err, { stdout, stderr }));
                else
                    resolve(stdout);
            });
        });
    }
}
