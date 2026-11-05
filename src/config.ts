import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const SERVER_NAME = "github-mcp-server";
export const SERVER_VERSION = "1.0.0";
export const REQUIRED_TOKEN_SCOPES = ["repo", "user", "admin:org"] as const;

// El host puede lanzar el proceso desde cualquier carpeta: la ruta no puede depender del cwd.
const ENV_FILE_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".env");

export function loadEnvironment(): void {
  if (existsSync(ENV_FILE_PATH)) {
    process.loadEnvFile(ENV_FILE_PATH);
  }
}
