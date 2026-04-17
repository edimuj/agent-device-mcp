export interface ExecutorConfig {
    host: string;
    agentDeviceBin: string;
    pathPrefix: string;
    minSpacingMs: number;
    retryMax: number;
    retryInitialDelayMs: number;
}
export declare class AgentDeviceExecutor {
    private config;
    private lastCallTime;
    constructor(config?: Partial<ExecutorConfig>);
    private enforceSpacing;
    private buildRemoteCommand;
    private ssh;
    run(args: string[]): Promise<string>;
    runParsed<T = unknown>(args: string[]): Promise<T>;
    runLocal(command: string, args: string[]): Promise<string>;
}
