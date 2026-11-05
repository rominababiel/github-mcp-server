import { listRepositories } from "../github/operations.js";
import { listRepositoriesSchema } from "../schemas/index.js";
import { defineTool } from "./define-tool.js";

export const listRepositoriesTool = defineTool({
  name: "list_repositories",
  description:
    "Lista los repositorios a los que accede el usuario autenticado, ordenados por actividad reciente. Usar para descubrir repositorios o para conocer el nombre completo y el dueño de uno antes de operar sobre él.",
  schema: listRepositoriesSchema,
  readOnly: true,
  execute: listRepositories,
});
