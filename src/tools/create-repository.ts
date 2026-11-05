import { createRepository } from "../github/operations.js";
import { createRepositorySchema } from "../schemas/index.js";
import { defineTool } from "./define-tool.js";

export const createRepositoryTool = defineTool({
  name: "create_repository",
  description:
    "Crea un repositorio nuevo en GitHub, en la cuenta personal o en una organización. Usar solo cuando se pide crear un repositorio que todavía no existe; para ver los existentes usar list_repositories.",
  schema: createRepositorySchema,
  readOnly: false,
  execute: createRepository,
});
