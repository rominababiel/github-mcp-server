import { closeIssueTool } from "./close-issue.js";
import { createBranchTool } from "./create-branch.js";
import { createCommitTool } from "./create-commit.js";
import { createIssueTool } from "./create-issue.js";
import { createPullRequestTool } from "./create-pull-request.js";
import { createRepositoryTool } from "./create-repository.js";
import type { Tool } from "./define-tool.js";
import { healthCheckTool } from "./health-check.js";
import { listCommitsTool } from "./list-commits.js";
import { listIssuesTool } from "./list-issues.js";
import { listRepositoriesTool } from "./list-repositories.js";

export const tools: Tool[] = [
  createRepositoryTool,
  listRepositoriesTool,
  createIssueTool,
  listIssuesTool,
  closeIssueTool,
  createBranchTool,
  createCommitTool,
  listCommitsTool,
  createPullRequestTool,
  healthCheckTool,
];
