import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMcpServer } from "../src/mcp-server.js";
import { tools } from "../src/tools/index.js";
import { httpError } from "./helpers.js";

const octokit = vi.hoisted(() => ({
  rest: {
    issues: { listForRepo: vi.fn() },
    repos: { createForAuthenticatedUser: vi.fn() },
  },
}));

vi.mock("../src/github/client.js", () => ({ getGitHubClient: () => octokit }));

async function connectClient(): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await createMcpServer(tools).connect(serverTransport);
  const client = new Client({ name: "test-client", version: "1.0.0" });
  await client.connect(clientTransport);
  return client;
}

function textOf(result: Awaited<ReturnType<Client["callTool"]>>): string {
  return (result.content as { text: string }[])[0]?.text ?? "";
}

describe("servidor MCP", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("expone todos los tools con descripción y schema de objeto", async () => {
    const client = await connectClient();

    const { tools: listed } = await client.listTools();

    expect(listed.map((tool) => tool.name).sort()).toEqual([
      "close_issue",
      "create_branch",
      "create_commit",
      "create_issue",
      "create_pull_request",
      "create_repository",
      "health_check",
      "list_commits",
      "list_issues",
      "list_repositories",
    ]);
    for (const tool of listed) {
      expect(tool.description?.length).toBeGreaterThan(40);
      expect(tool.inputSchema.type).toBe("object");
      expect(tool.inputSchema).not.toHaveProperty("$schema");
    }
  });

  it("comunica al LLM qué parámetros son obligatorios y cuáles tienen default", async () => {
    const client = await connectClient();

    const { tools: listed } = await client.listTools();
    const createRepository = listed.find((tool) => tool.name === "create_repository");

    expect(createRepository?.inputSchema.required).toEqual(["name"]);
    expect(createRepository?.inputSchema.properties?.name).toMatchObject({
      description: expect.stringContaining("entre 3 y 100"),
    });
  });

  it("marca como solo lectura únicamente los tools que no modifican GitHub", async () => {
    const client = await connectClient();

    const { tools: listed } = await client.listTools();
    const readOnly = listed.filter((tool) => tool.annotations?.readOnlyHint).map((tool) => tool.name);

    expect(readOnly.sort()).toEqual(["health_check", "list_commits", "list_issues", "list_repositories"]);
  });

  it("rechaza inputs inválidos con ValidationError sin llamar a GitHub", async () => {
    const client = await connectClient();

    const result = await client.callTool({ name: "create_repository", arguments: { name: "a b" } });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe("Parámetros inválidos. name: El nombre del repositorio solo admite letras, números y guiones.");
    expect(octokit.rest.repos.createForAuthenticatedUser).not.toHaveBeenCalled();
  });

  it("devuelve los errores de GitHub como resultado legible, no como fallo de protocolo", async () => {
    octokit.rest.issues.listForRepo.mockRejectedValue(httpError(404));
    const client = await connectClient();

    const result = await client.callTool({ name: "list_issues", arguments: { owner: "octocat", repo: "nada" } });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe("El repositorio octocat/nada no fue encontrado. Verifica el nombre e intenta de nuevo.");
    expect(textOf(result)).not.toContain("at ");
  });

  it("devuelve el resultado serializado cuando la operación funciona", async () => {
    octokit.rest.issues.listForRepo.mockResolvedValue({ data: [] });
    const client = await connectClient();

    const result = await client.callTool({ name: "list_issues", arguments: { owner: "octocat", repo: "demo" } });

    expect(result.isError).toBeUndefined();
    expect(JSON.parse(textOf(result))).toEqual([]);
  });

  it("responde con error de protocolo si el tool no existe", async () => {
    const client = await connectClient();

    await expect(client.callTool({ name: "delete_everything", arguments: {} })).rejects.toThrow("no existe");
  });
});
