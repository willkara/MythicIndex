/**
 * MCP Server Context
 * Singleton to store the MCP server instance for access from tool implementations
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

let mcpServerInstance: McpServer | null = null;

/**
 * Store the MCP server instance for later access
 */
export function setMcpServer(server: McpServer): void {
  mcpServerInstance = server;
}

/**
 * Get the MCP server instance (may be null if not initialized)
 */
export function getMcpServer(): McpServer | null {
  return mcpServerInstance;
}

/**
 * Get the MCP server instance, throwing if not initialized
 */
export function requireMcpServer(): McpServer {
  if (!mcpServerInstance) {
    throw new Error('MCP server not initialized. Call setMcpServer() first.');
  }
  return mcpServerInstance;
}

/**
 * Check if the MCP server is available
 */
export function isMcpServerAvailable(): boolean {
  return mcpServerInstance !== null;
}
