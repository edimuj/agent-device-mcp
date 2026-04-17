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
    private isLocal;
    constructor(config?: Partial<ExecutorConfig>);
    private enforceSpacing;
    private exec;
    private buildCommand;
    run(args: string[]): Promise<string>;
    runParsed<T = unknown>(args: string[]): Promise<T>;
}
