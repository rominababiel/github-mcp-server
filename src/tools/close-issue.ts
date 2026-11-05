import { closeIssue } from "../github/operations.js";
import { closeIssueSchema } from "../schemas/index.js";
import { defineTool } from "./define-tool.js";

export const closeIssueTool = defineTool({
  name: "close_issue",
  description:
    "Cierra un issue abierto a partir de su número. No cierra pull requests. Si no se conoce el número, buscarlo antes con list_issues.",
  schema: closeIssueSchema,
  readOnly: false,
  execute: closeIssue,
});
