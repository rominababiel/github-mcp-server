import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logger, redact } from "../src/utils/logging.js";

const FAKE_TOKEN = `ghp_${"a".repeat(36)}`;

describe("redact", () => {
  it("oculta claves sensibles sin importar su valor", () => {
    expect(redact({ authorization: "bearer abc", token: "abc", tool: "list_issues" })).toEqual({
      authorization: "[REDACTED]",
      token: "[REDACTED]",
      tool: "list_issues",
    });
  });

  it("oculta tokens de GitHub dentro de textos y objetos anidados", () => {
    const result = redact({ detail: { text: `falló con ${FAKE_TOKEN}` } });

    expect(JSON.stringify(result)).not.toContain(FAKE_TOKEN);
  });
});

describe("logger", () => {
  const stderr = vi.fn();
  const stdout = vi.fn();

  beforeEach(() => {
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stderr(chunk);
      return true;
    });
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      stdout(chunk);
      return true;
    });
    stderr.mockClear();
    stdout.mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("escribe en stderr y nunca en stdout, reservado al protocolo", () => {
    vi.stubEnv("LOG_LEVEL", "info");

    logger.info("Servidor iniciado", { tool: "health_check" });

    expect(stdout).not.toHaveBeenCalled();
    const entry = JSON.parse(String(stderr.mock.calls[0]?.[0]));
    expect(entry).toMatchObject({ level: "info", message: "Servidor iniciado", tool: "health_check" });
  });

  it("descarta los mensajes por debajo del nivel configurado", () => {
    vi.stubEnv("LOG_LEVEL", "warn");

    logger.info("No debe aparecer");
    logger.warn("Debe aparecer");

    expect(stderr).toHaveBeenCalledTimes(1);
  });

  it("no expone el token al registrar un mensaje", () => {
    vi.stubEnv("LOG_LEVEL", "info");

    logger.error(`Fallo con ${FAKE_TOKEN}`, { token: FAKE_TOKEN });

    expect(String(stderr.mock.calls[0]?.[0])).not.toContain(FAKE_TOKEN);
  });
});
