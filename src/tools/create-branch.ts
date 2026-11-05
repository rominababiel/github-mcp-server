import { createBranch } from "../github/operations.js";
import { createBranchSchema } from "../schemas/index.js";
import { defineTool } from "./define-tool.js";

export const createBranchTool = defineTool({
  name: "create_branch",
  description:
    "Crea una rama nueva a partir de otra existente, o de la rama por defecto si no se indica. Usar antes de create_commit cuando el cambio debe ir por un pull request.",
  schema: createBranchSchema,
  readOnly: false,
  execute: createBranch,
});
