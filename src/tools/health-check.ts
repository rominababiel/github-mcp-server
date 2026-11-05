import { checkHealth } from "../github/operations.js";
import { healthCheckSchema } from "../schemas/index.js";
import { defineTool } from "./define-tool.js";

export const healthCheckTool = defineTool({
  name: "health_check",
  description:
    "Verifica la conexión con GitHub e informa el usuario autenticado, los scopes del token, los que faltan y el rate limit disponible. Usar para diagnosticar errores de permisos o conexión, o para conocer el usuario actual.",
  schema: healthCheckSchema,
  readOnly: true,
  execute: checkHealth,
});
