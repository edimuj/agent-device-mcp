#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { AgentDeviceExecutor } from './executor.js';
import { registerTools } from './tools.js';

const server = new McpServer({
  name: 'agent-device-mcp',
  version: '0.1.0',
});

const executor = new AgentDeviceExecutor();
registerTools(server, executor);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('agent-device-mcp failed:', err);
  process.exit(1);
});
