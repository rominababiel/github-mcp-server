export interface RepositorySummary {
  name: string;
  fullName: string;
  description: string | null;
  private: boolean;
  defaultBranch: string;
  url: string;
}

export interface IssueSummary {
  number: number;
  title: string;
  state: string;
  author: string | null;
  labels: string[];
  url: string;
  createdAt: string;
}

export interface CloseIssueResult extends IssueSummary {
  alreadyClosed: boolean;
}

export interface CommitResult {
  action: "created" | "updated";
  path: string;
  commitSha: string;
  commitUrl: string;
  fileUrl: string | null;
}

export interface BranchResult {
  branch: string;
  fromBranch: string;
  sha: string;
}

export interface PullRequestResult {
  number: number;
  title: string;
  head: string;
  base: string;
  url: string;
}

export interface CommitSummary {
  sha: string;
  message: string;
  author: string | null;
  date: string | null;
  url: string;
}

export interface HealthReport {
  status: "ok";
  login: string;
  grantedScopes: string[] | null;
  missingScopes: string[];
  rateLimit: {
    remaining: number | null;
    limit: number | null;
  };
}
