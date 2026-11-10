import { afterEach, describe, expect, it, vi } from "vitest";

// El cliente se guarda en el módulo: cada test lo carga de nuevo para partir sin cliente creado.
async function loadClient() {
  vi.resetModules();
  const { getGitHubClient } = await import("../src/github/client.js");
  const { AuthenticationError } = await import("../src/errors/index.js");
  return { getGitHubClient, AuthenticationError };
}

describe("getGitHubClient", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("explica cómo configurar el token si falta", async () => {
    vi.stubEnv("GITHUB_TOKEN", "");
    const { getGitHubClient, AuthenticationError } = await loadClient();

    expect(() => getGitHubClient()).toThrow(AuthenticationError);
    expect(() => getGitHubClient()).toThrow("No se encontró GITHUB_TOKEN. Configúralo en el archivo .env");
  });

  it("trata un token formado solo por espacios como ausente", async () => {
    vi.stubEnv("GITHUB_TOKEN", "   ");
    const { getGitHubClient } = await loadClient();

    expect(() => getGitHubClient()).toThrow("No se encontró GITHUB_TOKEN");
  });

  it("crea el cliente una sola vez y lo reutiliza", async () => {
    vi.stubEnv("GITHUB_TOKEN", "ghp_test");
    const { getGitHubClient } = await loadClient();

    expect(getGitHubClient()).toBe(getGitHubClient());
  });
});
