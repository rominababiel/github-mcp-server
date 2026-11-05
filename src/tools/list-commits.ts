import { listCommits } from "../github/operations.js";
import { listCommitsSchema } from "../schemas/index.js";
import { defineTool } from "./define-tool.js";

export const listCommitsTool = defineTool({
  name: "list_commits",
  description:
    "Lista los commits más recientes de un repositorio o de una de sus ramas, con autor, fecha y mensaje. Usar para responder qué cambió últimamente o para verificar un commit.",
  schema: listCommitsSchema,
  readOnly: true,
  execute: listCommits,
});
