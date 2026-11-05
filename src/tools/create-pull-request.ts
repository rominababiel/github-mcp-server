import { createPullRequest } from "../github/operations.js";
import { createPullRequestSchema } from "../schemas/index.js";
import { defineTool } from "./define-tool.js";

export const createPullRequestTool = defineTool({
  name: "create_pull_request",
  description:
    "Abre un pull request de una rama hacia otra del mismo repositorio. La rama de origen ya debe existir y tener commits que la rama destino no tenga.",
  schema: createPullRequestSchema,
  readOnly: false,
  execute: createPullRequest,
});
