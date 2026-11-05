import type { Octokit } from "@octokit/rest";
import { REQUIRED_TOKEN_SCOPES } from "../config.js";
import { GitHubAPIError, ValidationError, toAppError, type ErrorContext } from "../errors/index.js";
import type {
  CloseIssueInput,
  CreateBranchInput,
  CreateCommitInput,
  CreateIssueInput,
  CreatePullRequestInput,
  CreateRepositoryInput,
  ListCommitsInput,
  ListIssuesInput,
  ListRepositoriesInput,
} from "../schemas/index.js";
import type {
  BranchResult,
  CommitResult,
  CommitSummary,
  HealthReport,
  IssueSummary,
  PullRequestResult,
  RepositorySummary,
} from "../types.js";
import { withRetry } from "../utils/retry.js";
import { getGitHubClient } from "./client.js";

const GITHUB_MAX_PAGE_SIZE = 100;

interface CallOptions extends ErrorContext {
  idempotent?: boolean;
}

function callGitHub<T>(request: (client: Octokit) => Promise<T>, options: CallOptions = {}): Promise<T> {
  const { idempotent = false, ...context } = options;
  return withRetry(
    async () => {
      try {
        return await request(getGitHubClient());
      } catch (error) {
        throw toAppError(error, context);
      }
    },
    { retryTransientErrors: idempotent },
  );
}

function toRepositorySummary(repository: {
  name: string;
  full_name: string;
  description: string | null;
  private: boolean;
  default_branch?: string;
  html_url: string;
}): RepositorySummary {
  return {
    name: repository.name,
    fullName: repository.full_name,
    description: repository.description,
    private: repository.private,
    defaultBranch: repository.default_branch ?? "main",
    url: repository.html_url,
  };
}

function toIssueSummary(issue: {
  number: number;
  title: string;
  state: string;
  user: { login: string } | null;
  labels: (string | { name?: string })[];
  html_url: string;
  created_at: string;
}): IssueSummary {
  return {
    number: issue.number,
    title: issue.title,
    state: issue.state,
    author: issue.user?.login ?? null,
    labels: issue.labels.flatMap((label) => {
      const name = typeof label === "string" ? label : label.name;
      return name ? [name] : [];
    }),
    url: issue.html_url,
    createdAt: issue.created_at,
  };
}

async function getDefaultBranch(owner: string, repo: string): Promise<string> {
  const { data } = await callGitHub((client) => client.rest.repos.get({ owner, repo }), {
    idempotent: true,
    repository: `${owner}/${repo}`,
  });
  return data.default_branch;
}

async function getExistingFileSha(input: CreateCommitInput): Promise<string | undefined> {
  const { owner, repo, path, branch } = input;
  try {
    const { data } = await callGitHub(
      (client) => client.rest.repos.getContent({ owner, repo, path, ref: branch }),
      { idempotent: true, repository: `${owner}/${repo}` },
    );
    if (Array.isArray(data) || data.type !== "file") {
      throw new ValidationError(`La ruta ${path} no es un archivo. Indica la ruta de un archivo, no la de una carpeta.`);
    }
    return data.sha;
  } catch (error) {
    if (error instanceof GitHubAPIError && error.status === 404) {
      return undefined;
    }
    throw error;
  }
}

export async function createRepository(input: CreateRepositoryInput): Promise<RepositorySummary> {
  const { name, description, private: isPrivate, autoInit, organization } = input;
  const settings = { name, description, private: isPrivate, auto_init: autoInit };
  const location = organization ? `la organización ${organization}` : "tu cuenta";

  const { data } = await callGitHub(
    (client) =>
      organization
        ? client.rest.repos.createInOrg({ org: organization, ...settings })
        : client.rest.repos.createForAuthenticatedUser(settings),
    {
      messages: {
        ...(organization && {
          403: `No tienes permisos para crear repositorios en la organización ${organization}. Puedes crearlo en tu cuenta personal omitiendo la organización.`,
          404: `La organización ${organization} no fue encontrada. Verifica el nombre o crea el repositorio en tu cuenta personal.`,
        }),
        422: `Ya existe un repositorio llamado ${name} en ${location}. Elige otro nombre.`,
      },
    },
  );
  return toRepositorySummary(data);
}

export async function listRepositories(input: ListRepositoriesInput): Promise<RepositorySummary[]> {
  const { data } = await callGitHub(
    (client) =>
      client.rest.repos.listForAuthenticatedUser({
        visibility: input.visibility,
        sort: "updated",
        per_page: input.limit,
      }),
    { idempotent: true },
  );
  return data.map(toRepositorySummary);
}

export async function createIssue(input: CreateIssueInput): Promise<IssueSummary> {
  const { owner, repo, title, body } = input;
  const { data } = await callGitHub((client) => client.rest.issues.create({ owner, repo, title, body }), {
    repository: `${owner}/${repo}`,
    messages: { 410: `Los issues están deshabilitados en el repositorio ${owner}/${repo}. Actívalos en su configuración.` },
  });
  return toIssueSummary(data);
}

export async function listIssues(input: ListIssuesInput): Promise<IssueSummary[]> {
  const { owner, repo, limit } = input;
  const { data } = await callGitHub(
    (client) => client.rest.issues.listForRepo({ owner, repo, state: "open", per_page: GITHUB_MAX_PAGE_SIZE }),
    { idempotent: true, repository: `${owner}/${repo}` },
  );
  // La API de GitHub devuelve los pull requests mezclados con los issues.
  return data
    .filter((issue) => !issue.pull_request)
    .slice(0, limit)
    .map(toIssueSummary);
}

export async function createCommit(input: CreateCommitInput): Promise<CommitResult> {
  const { owner, repo, path, content, message, branch } = input;
  const sha = await getExistingFileSha(input);

  const { data } = await callGitHub(
    (client) =>
      client.rest.repos.createOrUpdateFileContents({
        owner,
        repo,
        path,
        message,
        branch,
        sha,
        content: Buffer.from(content, "utf8").toString("base64"),
      }),
    {
      repository: `${owner}/${repo}`,
      messages: {
        ...(branch && {
          404: `No se encontró el repositorio ${owner}/${repo} o la rama ${branch}. Verifica los nombres e intenta de nuevo.`,
        }),
        409: `El archivo ${path} cambió mientras se preparaba el commit. Intenta de nuevo.`,
      },
    },
  );

  return {
    action: sha ? "updated" : "created",
    path,
    commitSha: data.commit.sha ?? "",
    commitUrl: data.commit.html_url ?? "",
    fileUrl: data.content?.html_url ?? null,
  };
}

export async function createBranch(input: CreateBranchInput): Promise<BranchResult> {
  const { owner, repo, branch } = input;
  const fromBranch = input.fromBranch ?? (await getDefaultBranch(owner, repo));

  const { data: source } = await callGitHub(
    (client) => client.rest.git.getRef({ owner, repo, ref: `heads/${fromBranch}` }),
    {
      idempotent: true,
      messages: {
        404: `No se encontró la rama de origen ${fromBranch} en ${owner}/${repo}. Verifica los nombres e intenta de nuevo.`,
        409: `El repositorio ${owner}/${repo} está vacío. Crea un primer commit antes de crear ramas.`,
      },
    },
  );

  await callGitHub(
    (client) => client.rest.git.createRef({ owner, repo, ref: `refs/heads/${branch}`, sha: source.object.sha }),
    {
      repository: `${owner}/${repo}`,
      messages: { 422: `No se pudo crear la rama ${branch}: ya existe o su nombre no es válido. Elige otro nombre.` },
    },
  );

  return { branch, fromBranch, sha: source.object.sha };
}

export async function createPullRequest(input: CreatePullRequestInput): Promise<PullRequestResult> {
  const { owner, repo, title, head, body } = input;
  const base = input.base ?? (await getDefaultBranch(owner, repo));

  const { data } = await callGitHub(
    (client) => client.rest.pulls.create({ owner, repo, title, head, base, body }),
    { repository: `${owner}/${repo}` },
  );

  return { number: data.number, title: data.title, head, base, url: data.html_url };
}

export async function listCommits(input: ListCommitsInput): Promise<CommitSummary[]> {
  const { owner, repo, branch, limit } = input;
  const { data } = await callGitHub(
    (client) => client.rest.repos.listCommits({ owner, repo, sha: branch, per_page: limit }),
    {
      idempotent: true,
      repository: `${owner}/${repo}`,
      messages: {
        409: `El repositorio ${owner}/${repo} está vacío: todavía no tiene commits.`,
        ...(branch && {
          404: `No se encontró el repositorio ${owner}/${repo} o la rama ${branch}. Verifica los nombres e intenta de nuevo.`,
        }),
      },
    },
  );

  return data.map((commit) => ({
    sha: commit.sha,
    message: commit.commit.message,
    author: commit.author?.login ?? commit.commit.author?.name ?? null,
    date: commit.commit.author?.date ?? null,
    url: commit.html_url,
  }));
}

export async function closeIssue(input: CloseIssueInput): Promise<IssueSummary> {
  const { owner, repo, issueNumber, reason } = input;
  const notFound = {
    404: `No se encontró el issue #${issueNumber} en ${owner}/${repo}. Verifica el repositorio y el número e intenta de nuevo.`,
  };

  // issues.update también cierra pull requests: hay que descartarlos antes de escribir.
  const { data: current } = await callGitHub(
    (client) => client.rest.issues.get({ owner, repo, issue_number: issueNumber }),
    { idempotent: true, messages: notFound },
  );
  if (current.pull_request) {
    throw new ValidationError(`#${issueNumber} es un pull request, no un issue. Este tool solo cierra issues.`);
  }

  const { data } = await callGitHub(
    (client) =>
      client.rest.issues.update({ owner, repo, issue_number: issueNumber, state: "closed", state_reason: reason }),
    { messages: notFound },
  );
  return toIssueSummary(data);
}

export async function checkHealth(): Promise<HealthReport> {
  const { data, headers } = await callGitHub((client) => client.rest.users.getAuthenticated(), { idempotent: true });

  // Los tokens fine-grained no informan scopes: solo se pueden comparar los de tipo classic.
  const grantedScopes = headers["x-oauth-scopes"]?.split(",").map((scope) => scope.trim()).filter(Boolean) ?? null;
  const missingScopes = grantedScopes ? REQUIRED_TOKEN_SCOPES.filter((scope) => !grantedScopes.includes(scope)) : [];

  return {
    status: "ok",
    login: data.login,
    grantedScopes,
    missingScopes,
    rateLimit: {
      remaining: headers["x-ratelimit-remaining"] ? Number(headers["x-ratelimit-remaining"]) : null,
      limit: headers["x-ratelimit-limit"] ? Number(headers["x-ratelimit-limit"]) : null,
    },
  };
}
