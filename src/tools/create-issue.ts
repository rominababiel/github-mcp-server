import { createIssue } from "../github/operations.js";
import { createIssueSchema } from "../schemas/index.js";
import { defineTool } from "./define-tool.js";

export const createIssueTool = defineTool({
  name: "create_issue",
  description:
    "Abre un issue nuevo en un repositorio para registrar un bug, una tarea o una mejora. Devuelve su número y enlace. No sirve para cambiar código ni para cerrar issues.",
  schema: createIssueSchema,
  readOnly: false,
  execute: createIssue,
});
