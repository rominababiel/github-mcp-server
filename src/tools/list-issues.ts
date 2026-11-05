import { listIssues } from "../github/operations.js";
import { listIssuesSchema } from "../schemas/index.js";
import { defineTool } from "./define-tool.js";

export const listIssuesTool = defineTool({
  name: "list_issues",
  description:
    "Lista los issues abiertos de un repositorio específico, sin incluir pull requests. Usar para revisar el trabajo pendiente o para encontrar el número de un issue antes de cerrarlo.",
  schema: listIssuesSchema,
  readOnly: true,
  execute: listIssues,
});
