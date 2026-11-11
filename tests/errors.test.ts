import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  AuthenticationError,
  GitHubAPIError,
  NetworkError,
  UnexpectedError,
  ValidationError,
  fromZodError,
  toAppError,
} from "../src/errors/index.js";
import { httpError } from "./helpers.js";

describe("toAppError", () => {
  it("traduce un 404 al mensaje del repositorio afectado", () => {
    const error = toAppError(httpError(404), { repository: "octocat/hello" });

    expect(error).toBeInstanceOf(GitHubAPIError);
    expect(error.message).toBe("El repositorio octocat/hello no fue encontrado. Verifica el nombre e intenta de nuevo.");
  });

  it("clasifica un 401 como error de autenticación", () => {
    const error = toAppError(httpError(401));

    expect(error).toBeInstanceOf(AuthenticationError);
    expect(error.message).toContain("GITHUB_TOKEN");
  });

  it("clasifica un 403 sin rate limit como falta de permisos e indica los scopes", () => {
    const error = toAppError(httpError(403, { message: "Resource not accessible by personal access token" }));

    expect(error).toBeInstanceOf(AuthenticationError);
    expect(error.message).toContain("scopes");
  });

  it("explica que el repositorio está archivado en lugar de culpar a los scopes", () => {
    const error = toAppError(httpError(403, { data: { message: "Repository was archived so is read-only." } }), {
      repository: "octocat/hello",
    });

    expect(error).toBeInstanceOf(GitHubAPIError);
    expect(error.message).toBe(
      "El repositorio octocat/hello está archivado y es de solo lectura. Desarchívalo en GitHub para modificarlo.",
    );
  });

  it("detecta el rate limit primario aunque responda 403 y calcula la espera", () => {
    const resetInSeconds = Math.floor(Date.now() / 1000) + 120;
    const error = toAppError(
      httpError(403, { headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(resetInSeconds) } }),
    );

    expect(error).toBeInstanceOf(GitHubAPIError);
    expect((error as GitHubAPIError).rateLimited).toBe(true);
    expect((error as GitHubAPIError).retryAfterMs).toBeGreaterThan(100_000);
    expect(error.message).toContain("minuto");
  });

  it("respeta el header retry-after del rate limit secundario", () => {
    const error = toAppError(httpError(429, { headers: { "retry-after": "5" } })) as GitHubAPIError;

    expect(error.rateLimited).toBe(true);
    expect(error.retryAfterMs).toBe(5_000);
  });

  it("distingue un fallo de red de un error 500 real de GitHub", () => {
    const networkFailure = Object.assign(new Error("fetch failed"), { status: 500 });

    expect(toAppError(networkFailure)).toBeInstanceOf(NetworkError);
    expect(toAppError(httpError(500))).toBeInstanceOf(GitHubAPIError);
  });

  it("incluye el motivo que informa GitHub en un 422", () => {
    const error = toAppError(
      httpError(422, { data: { message: "Validation Failed", errors: [{ message: "No commits between main and feat" }] } }),
    );

    expect(error.message).toContain("No commits between main and feat");
  });

  it("no duplica el punto final del motivo que informa GitHub", () => {
    const error = toAppError(httpError(422, { data: { errors: [{ message: "A pull request already exists." }] } }));

    expect(error.message).toBe(
      "GitHub rechazó la operación: A pull request already exists. Corrige los datos e intenta de nuevo.",
    );
  });

  it("prioriza el mensaje específico de la operación", () => {
    const error = toAppError(httpError(422), { messages: { 422: "Ya existe un repositorio con ese nombre." } });

    expect(error.message).toBe("Ya existe un repositorio con ese nombre.");
  });

  it("no expone detalles internos ante un error desconocido", () => {
    const error = toAppError(new TypeError("Cannot read properties of undefined (reading 'data')"));

    expect(error).toBeInstanceOf(UnexpectedError);
    expect(error.message).not.toContain("undefined");
  });

  it("no vuelve a traducir un error ya clasificado", () => {
    const original = new ValidationError("Dato incorrecto.");

    expect(toAppError(original)).toBe(original);
  });
});

describe("fromZodError", () => {
  it("indica el campo y el motivo de cada problema", () => {
    const schema = z.object({ name: z.string().min(3, "Muy corto.") });
    const result = schema.safeParse({ name: "a" });

    const error = fromZodError(result.error!);

    expect(error).toBeInstanceOf(ValidationError);
    expect(error.message).toBe("Parámetros inválidos. name: Muy corto.");
  });
});
