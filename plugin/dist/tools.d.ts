import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { AgentDeviceExecutor } from './executor.js';
type SwipeDirection = 'up' | 'down' | 'left' | 'right';
interface SwipeOptions {
    width?: number;
    height?: number;
    durationMs?: number;
}
interface TargetOptions {
    platform?: 'ios' | 'android';
    device?: string;
    udid?: string;
    serial?: string;
    session?: string;
}
export declare function buildSwipeArgs(direction: SwipeDirection, options?: SwipeOptions): string[];
export declare function appendTargetArgs(args: string[], target: TargetOptions): string[];
export declare function registerTools(server: McpServer, executor: AgentDeviceExecutor): void;
export {};
