import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthenticationError, GitHubAPIError, ValidationError } from "../src/errors/index.js";
import {
  checkHealth,
  closeIssue,
  createBranch,
  createCommit,
  createIssue,
  createPullRequest,
  createRepository,
  listCommits,
  listIssues,
  listRepositories,
} from "../src/github/operations.js";
import { httpError } from "./helpers.js";

const octokit = vi.hoisted(() => ({
  rest: {
    repos: {
      createForAuthenticatedUser: vi.fn(),
      createInOrg: vi.fn(),
      listForAuthenticatedUser: vi.fn(),
      get: vi.fn(),
      getContent: vi.fn(),
      createOrUpdateFileContents: vi.fn(),
      listCommits: vi.fn(),
    },
    issues: { create: vi.fn(), listForRepo: vi.fn(), get: vi.fn(), update: vi.fn() },
    git: { getRef: vi.fn(), createRef: vi.fn() },
    pulls: { create: vi.fn() },
    users: { getAuthenticated: vi.fn() },
  },
}));

vi.mock("../src/github/client.js", () => ({ getGitHubClient: () => octokit }));

const reference = { owner: "octocat", repo: "hello" };

const repositoryData = {
  name: "hello",
  full_name: "octocat/hello",
  description: "Demo",
  private: false,
  default_branch: "main",
  html_url: "https://github.com/octocat/hello",
};

const issueData = {
  number: 7,
  title: "Bug",
  state: "open",
  user: { login: "octocat" },
  labels: [{ name: "bug" }, "urgente"],
  html_url: "https://github.com/octocat/hello/issues/7",
  created_at: "2026-01-01T00:00:00Z",
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe("createRepository", () => {
  const input = { name: "hello", private: false, autoInit: true };

  it("crea el repositorio en la cuenta personal y devuelve un resumen", async () => {
    octokit.rest.repos.createForAuthenticatedUser.mockResolvedValue({ data: repositoryData });

    const result = await createRepository({ ...input, description: "Demo" });

    expect(octokit.rest.repos.createForAuthenticatedUser).toHaveBeenCalledWith({
      name: "hello",
      description: "Demo",
      private: false,
      auto_init: true,
    });
    expect(result).toEqual({
      name: "hello",
      fullName: "octocat/hello",
      description: "Demo",
      private: false,
      defaultBranch: "main",
      url: "https://github.com/octocat/hello",
    });
  });

  it("crea el repositorio en la organización indicada", async () => {
    octokit.rest.repos.createInOrg.mockResolvedValue({ data: repositoryData });

    await createRepository({ ...input, organization: "acme" });

    expect(octokit.rest.repos.createInOrg).toHaveBeenCalledWith(expect.objectContaining({ org: "acme", name: "hello" }));
    expect(octokit.rest.repos.createForAuthenticatedUser).not.toHaveBeenCalled();
  });

  it("informa que el nombre ya existe", async () => {
    octokit.rest.repos.createForAuthenticatedUser.mockRejectedValue(
      httpError(422, { data: { errors: [{ field: "name", message: "name already exists on this account" }] } }),
    );

    await expect(createRepository(input)).rejects.toThrow("Ya existe un repositorio llamado hello en tu cuenta");
  });

  it("no atribuye al nombre duplicado otro rechazo de GitHub", async () => {
    octokit.rest.repos.createForAuthenticatedUser.mockRejectedValue(
      httpError(422, { data: { errors: [{ message: "Visibility can't be private on this plan" }] } }),
    );

    const error = await createRepository(input).catch((caught: unknown) => caught);

    expect((error as Error).message).toContain("Visibility can't be private on this plan");
    expect((error as Error).message).not.toContain("Ya existe");
  });

  it("sugiere la cuenta personal si no hay permisos en la organización", async () => {
    octokit.rest.repos.createInOrg.mockRejectedValue(httpError(403));

    const error = await createRepository({ ...input, organization: "acme" }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AuthenticationError);
    expect((error as Error).message).toContain("cuenta personal");
  });

  it("no reintenta una creación fallida por un error del servidor", async () => {
    octokit.rest.repos.createForAuthenticatedUser.mockRejectedValue(httpError(502));

    await expect(createRepository(input)).rejects.toBeInstanceOf(GitHubAPIError);
    expect(octokit.rest.repos.createForAuthenticatedUser).toHaveBeenCalledTimes(1);
  });
});

describe("listRepositories", () => {
  it("pide los repositorios recientes con el límite indicado", async () => {
    octokit.rest.repos.listForAuthenticatedUser.mockResolvedValue({ data: [repositoryData] });

    const result = await listRepositories({ visibility: "all", limit: 5 });

    expect(octokit.rest.repos.listForAuthenticatedUser).toHaveBeenCalledWith({
      visibility: "all",
      sort: "updated",
      per_page: 5,
    });
    expect(result[0]?.fullName).toBe("octocat/hello");
  });

  it("informa credenciales inválidas", async () => {
    octokit.rest.repos.listForAuthenticatedUser.mockRejectedValue(httpError(401));

    await expect(listRepositories({ visibility: "all", limit: 5 })).rejects.toBeInstanceOf(AuthenticationError);
  });
});

describe("createIssue", () => {
  it("abre el issue y normaliza sus labels", async () => {
    octokit.rest.issues.create.mockResolvedValue({ data: issueData });

    const result = await createIssue({ ...reference, title: "Bug", body: "Detalle" });

    expect(octokit.rest.issues.create).toHaveBeenCalledWith({ ...reference, title: "Bug", body: "Detalle" });
    expect(result).toMatchObject({ number: 7, author: "octocat", labels: ["bug", "urgente"] });
  });

  it("devuelve el mensaje en lenguaje natural si el repositorio no existe", async () => {
    octokit.rest.issues.create.mockRejectedValue(httpError(404));

    await expect(createIssue({ ...reference, title: "Bug" })).rejects.toThrow(
      "El repositorio octocat/hello no fue encontrado. Verifica el nombre e intenta de nuevo.",
    );
  });
});

describe("listIssues", () => {
  it("excluye los pull requests y respeta el límite", async () => {
    octokit.rest.issues.listForRepo.mockResolvedValue({
      data: [
        { ...issueData, number: 1, pull_request: { url: "x" } },
        { ...issueData, number: 2 },
        { ...issueData, number: 3 },
      ],
    });

    const result = await listIssues({ ...reference, state: "open", limit: 1 });

    expect(octokit.rest.issues.listForRepo).toHaveBeenCalledWith(expect.objectContaining({ state: "open" }));
    expect(result.map((issue) => issue.number)).toEqual([2]);
  });

  it("consulta el estado pedido", async () => {
    octokit.rest.issues.listForRepo.mockResolvedValue({ data: [{ ...issueData, state: "closed" }] });

    const result = await listIssues({ ...reference, state: "closed", limit: 30 });

    expect(octokit.rest.issues.listForRepo).toHaveBeenCalledWith(expect.objectContaining({ state: "closed" }));
    expect(result[0]?.state).toBe("closed");
  });
});

describe("createCommit", () => {
  const input = { ...reference, path: "docs/guia.md", content: "Hola ñ", message: "docs: add guide" };
  const commitResponse = {
    data: {
      commit: { sha: "abc123", html_url: "https://github.com/commit/abc123" },
      content: { html_url: "https://github.com/file" },
    },
  };

  it("crea el archivo en base64 sin sha cuando no existe", async () => {
    octokit.rest.repos.getContent.mockRejectedValue(httpError(404));
    octokit.rest.repos.createOrUpdateFileContents.mockResolvedValue(commitResponse);

    const result = await createCommit(input);

    const payload = octokit.rest.repos.createOrUpdateFileContents.mock.calls[0]?.[0];
    expect(payload.sha).toBeUndefined();
    expect(Buffer.from(payload.content, "base64").toString("utf8")).toBe("Hola ñ");
    expect(result).toMatchObject({ action: "created", commitSha: "abc123" });
  });

  it("envía el sha actual cuando modifica un archivo existente", async () => {
    octokit.rest.repos.getContent.mockResolvedValue({ data: { type: "file", sha: "old-sha" } });
    octokit.rest.repos.createOrUpdateFileContents.mockResolvedValue(commitResponse);

    const result = await createCommit(input);

    expect(octokit.rest.repos.createOrUpdateFileContents).toHaveBeenCalledWith(
      expect.objectContaining({ sha: "old-sha" }),
    );
    expect(result.action).toBe("updated");
  });

  it("rechaza una ruta que corresponde a una carpeta sin intentar escribir", async () => {
    octokit.rest.repos.getContent.mockResolvedValue({ data: [] });

    await expect(createCommit(input)).rejects.toBeInstanceOf(ValidationError);
    expect(octokit.rest.repos.createOrUpdateFileContents).not.toHaveBeenCalled();
  });

  it("menciona la rama si el repositorio o la rama no existen", async () => {
    octokit.rest.repos.getContent.mockRejectedValue(httpError(404));
    octokit.rest.repos.createOrUpdateFileContents.mockRejectedValue(httpError(404));

    await expect(createCommit({ ...input, branch: "dev" })).rejects.toThrow("o la rama dev");
  });
});

describe("createBranch", () => {
  it("parte de la rama por defecto si no se indica una", async () => {
    octokit.rest.repos.get.mockResolvedValue({ data: repositoryData });
    octokit.rest.git.getRef.mockResolvedValue({ data: { object: { sha: "base-sha" } } });
    octokit.rest.git.createRef.mockResolvedValue({ data: {} });

    const result = await createBranch({ ...reference, branch: "feat/login" });

    expect(octokit.rest.git.getRef).toHaveBeenCalledWith({ ...reference, ref: "heads/main" });
    expect(octokit.rest.git.createRef).toHaveBeenCalledWith({
      ...reference,
      ref: "refs/heads/feat/login",
      sha: "base-sha",
    });
    expect(result).toEqual({ branch: "feat/login", fromBranch: "main", sha: "base-sha" });
  });

  it("informa que la rama ya existe", async () => {
    octokit.rest.git.getRef.mockResolvedValue({ data: { object: { sha: "base-sha" } } });
    octokit.rest.git.createRef.mockRejectedValue(httpError(422));

    await expect(createBranch({ ...reference, branch: "dev", fromBranch: "main" })).rejects.toThrow("ya existe");
  });

  it("menciona el repositorio y la rama de origen si no los encuentra", async () => {
    octokit.rest.git.getRef.mockRejectedValue(httpError(404));

    await expect(createBranch({ ...reference, branch: "dev", fromBranch: "release" })).rejects.toThrow(
      "No se encontró el repositorio octocat/hello o la rama de origen release.",
    );
  });
});

describe("createPullRequest", () => {
  it("usa la rama por defecto como destino si no se indica", async () => {
    octokit.rest.repos.get.mockResolvedValue({ data: repositoryData });
    octokit.rest.pulls.create.mockResolvedValue({
      data: { number: 9, title: "Login", html_url: "https://github.com/pr/9" },
    });

    const result = await createPullRequest({ ...reference, title: "Login", head: "feat/login" });

    expect(octokit.rest.pulls.create).toHaveBeenCalledWith(expect.objectContaining({ head: "feat/login", base: "main" }));
    expect(result).toEqual({
      number: 9,
      title: "Login",
      head: "feat/login",
      base: "main",
      url: "https://github.com/pr/9",
    });
  });

  it("transmite el motivo de GitHub si no hay commits para comparar", async () => {
    octokit.rest.pulls.create.mockRejectedValue(
      httpError(422, { data: { errors: [{ message: "No commits between main and feat" }] } }),
    );

    await expect(createPullRequest({ ...reference, title: "X", head: "feat", base: "main" })).rejects.toThrow(
      "No commits between main and feat",
    );
  });
});

describe("listCommits", () => {
  it("resume cada commit y filtra por rama", async () => {
    octokit.rest.repos.listCommits.mockResolvedValue({
      data: [
        {
          sha: "abc",
          html_url: "https://github.com/commit/abc",
          author: null,
          commit: { message: "feat: x", author: { name: "Octo", date: "2026-01-01" } },
        },
      ],
    });

    const result = await listCommits({ ...reference, branch: "dev", limit: 3 });

    expect(octokit.rest.repos.listCommits).toHaveBeenCalledWith({ ...reference, sha: "dev", per_page: 3 });
    expect(result[0]).toMatchObject({ sha: "abc", author: "Octo", message: "feat: x" });
  });

  it("explica que un repositorio vacío no tiene commits", async () => {
    octokit.rest.repos.listCommits.mockRejectedValue(httpError(409));

    await expect(listCommits({ ...reference, limit: 3 })).rejects.toThrow("está vacío");
  });
});

describe("closeIssue", () => {
  const input = { ...reference, issueNumber: 7, reason: "completed" as const };

  it("cierra el issue con el motivo indicado", async () => {
    octokit.rest.issues.get.mockResolvedValue({ data: issueData });
    octokit.rest.issues.update.mockResolvedValue({ data: { ...issueData, state: "closed" } });

    const result = await closeIssue(input);

    expect(octokit.rest.issues.update).toHaveBeenCalledWith({
      ...reference,
      issue_number: 7,
      state: "closed",
      state_reason: "completed",
    });
    expect(result.state).toBe("closed");
  });

  it("no cierra un pull request por error", async () => {
    octokit.rest.issues.get.mockResolvedValue({ data: { ...issueData, pull_request: { url: "x" } } });

    await expect(closeIssue(input)).rejects.toBeInstanceOf(ValidationError);
    expect(octokit.rest.issues.update).not.toHaveBeenCalled();
  });

  it("informa si el issue no existe", async () => {
    octokit.rest.issues.get.mockRejectedValue(httpError(404));

    await expect(closeIssue(input)).rejects.toThrow("No se encontró el issue #7");
  });
});

describe("checkHealth", () => {
  it("informa el usuario, los scopes faltantes y el rate limit", async () => {
    octokit.rest.users.getAuthenticated.mockResolvedValue({
      data: { login: "octocat" },
      headers: { "x-oauth-scopes": "repo, user", "x-ratelimit-remaining": "4999", "x-ratelimit-limit": "5000" },
    });

    await expect(checkHealth()).resolves.toEqual({
      status: "ok",
      login: "octocat",
      grantedScopes: ["repo", "user"],
      missingScopes: ["admin:org"],
      rateLimit: { remaining: 4999, limit: 5000 },
    });
  });

  it("no informa scopes faltantes en tokens fine-grained", async () => {
    octokit.rest.users.getAuthenticated.mockResolvedValue({ data: { login: "octocat" }, headers: {} });

    await expect(checkHealth()).resolves.toMatchObject({ grantedScopes: null, missingScopes: [] });
  });
});

describe("rate limiting en operaciones", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reintenta una escritura rechazada por rate limit y no la duplica", async () => {
    octokit.rest.issues.create
      .mockRejectedValueOnce(httpError(429, { headers: { "retry-after": "2" } }))
      .mockResolvedValueOnce({ data: issueData });

    const result = createIssue({ ...reference, title: "Bug" });
    await vi.advanceTimersByTimeAsync(2_000);

    await expect(result).resolves.toMatchObject({ number: 7 });
    expect(octokit.rest.issues.create).toHaveBeenCalledTimes(2);
  });
});
