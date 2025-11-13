/**
 * cBioPortal Navigator - MCP Server
 * Creates MCP server instance with registered tools
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
    resolveAndBuildUrlTool,
    handleResolveAndBuildUrl,
} from './tools/resolveAndBuildUrl.js';

/**
 * Create and configure MCP server with all tools registered
 */
export function createMcpServer(): McpServer {
    const server = new McpServer({
        name: 'cbioportal-navigator',
        version: '1.0.0',
    });

    // Register the main tool
    server.registerTool(
        resolveAndBuildUrlTool.name,
        {
            title: resolveAndBuildUrlTool.title,
            description: resolveAndBuildUrlTool.description,
            inputSchema: resolveAndBuildUrlTool.inputSchema,
        },
        handleResolveAndBuildUrl
    );

    return server;
}
