import { Octokit } from "@octokit/rest";
import { SERVER_NAME, SERVER_VERSION } from "../config.js";
import { AuthenticationError } from "../errors/index.js";
import { logger } from "../utils/logging.js";

let client: Octokit | undefined;

// Se crea en el primer uso para que el server arranque y pueda explicar la falta de token como un error del tool.
export function getGitHubClient(): Octokit {
  if (client) {
    return client;
  }

  const token = process.env.GITHUB_TOKEN?.trim();
  if (!token) {
    throw new AuthenticationError(
      "No se encontró GITHUB_TOKEN. Configúralo en el archivo .env o en el bloque env de mcp_config.json.",
    );
  }

  client = new Octokit({
    auth: token,
    userAgent: `${SERVER_NAME}/${SERVER_VERSION}`,
    log: {
      debug: (message) => logger.debug(message),
      info: (message) => logger.debug(message),
      warn: (message) => logger.warn(message),
      error: (message) => logger.error(message),
    },
  });
  return client;
}
