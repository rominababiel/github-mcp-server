import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { SERVER_NAME, SERVER_VERSION } from "./config.js";
import type { Tool } from "./tools/define-tool.js";

// Se usa Server y no McpServer porque este último valida antes del handler y su error evita a ValidationError.
export function createMcpServer(tools: Tool[]): Server {
  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: tools.map(({ name, description, inputSchema, annotations }) => ({
      name,
      description,
      inputSchema,
      annotations,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, (request) => {
    const tool = tools.find(({ name }) => name === request.params.name);
    if (!tool) {
      throw new McpError(ErrorCode.InvalidParams, `El tool ${request.params.name} no existe.`);
    }
    return tool.run(request.params.arguments);
  });

  return server;
}
