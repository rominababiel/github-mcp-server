import { createCommit } from "../github/operations.js";
import { createCommitSchema } from "../schemas/index.js";
import { defineTool } from "./define-tool.js";

export const createCommitTool = defineTool({
  name: "create_commit",
  description:
    "Hace un commit que agrega o reemplaza un único archivo de texto en un repositorio. Si el archivo existe se sobrescribe por completo, así que content debe traer el contenido final entero. Para commitear en una rama nueva, crearla antes con create_branch.",
  schema: createCommitSchema,
  readOnly: false,
  execute: createCommit,
});
