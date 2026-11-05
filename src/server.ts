#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SERVER_VERSION, loadEnvironment } from "./config.js";
import { createMcpServer } from "./mcp-server.js";
import { tools } from "./tools/index.js";
import { logger } from "./utils/logging.js";

async function main(): Promise<void> {
  loadEnvironment();
  const server = createMcpServer(tools);
  await server.connect(new StdioServerTransport());
  logger.info("Servidor MCP iniciado", { version: SERVER_VERSION, tools: tools.length });
}

main().catch((error: unknown) => {
  logger.error("No se pudo iniciar el servidor MCP", {
    detail: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
