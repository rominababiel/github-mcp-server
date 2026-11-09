import { listIssues } from "../github/operations.js";
import { listIssuesSchema } from "../schemas/index.js";
import { defineTool } from "./define-tool.js";

export const listIssuesTool = defineTool({
  name: "list_issues",
  description:
    "Lista los issues de un repositorio específico, sin incluir pull requests. Por defecto trae los abiertos; usar state para ver los cerrados o todos. Usar para revisar el trabajo pendiente o para encontrar el número de un issue antes de cerrarlo.",
  schema: listIssuesSchema,
  readOnly: true,
  execute: listIssues,
});
