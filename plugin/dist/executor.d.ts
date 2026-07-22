export declare const SUPPORTED_AGENT_DEVICE_VERSION = "0.20.0";
export interface ExecutorConfig {
    host: string;
    agentDeviceBin: string;
    pathPrefix: string;
    androidSdkRoot: string;
    stateDir: string;
    minSpacingMs: number;
    retryMax: number;
    retryInitialDelayMs: number;
}
interface ExecOptions {
    timeout: number;
    maxBuffer: number;
    env: NodeJS.ProcessEnv;
}
type ExecCallback = (error: Error | null, stdout: string, stderr: string) => void;
export type ExecFileFn = (command: string, args: string[], options: ExecOptions, callback: ExecCallback) => unknown;
interface ExecutorDependencies {
    execFile?: ExecFileFn;
}
export declare class AgentDeviceExecutor {
    private readonly config;
    private readonly executeFile;
    private readonly isLocal;
    private lastCallTime;
    private preflightPromise?;
    constructor(config?: Partial<ExecutorConfig>, dependencies?: ExecutorDependencies);
    private enforceSpacing;
    private exec;
    private buildCommand;
    preflight(): Promise<string>;
    private checkVersion;
    run(args: string[]): Promise<string>;
    runParsed<T = unknown>(args: string[]): Promise<T>;
}
export {};
