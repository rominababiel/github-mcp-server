import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GitHubAPIError, NetworkError, ValidationError } from "../src/errors/index.js";
import { withRetry } from "../src/utils/retry.js";

function rateLimitError(retryAfterMs?: number): GitHubAPIError {
  return new GitHubAPIError("Límite alcanzado.", { status: 429, rateLimited: true, retryAfterMs });
}

describe("withRetry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("espera lo indicado por GitHub antes de reintentar un rate limit", async () => {
    const operation = vi.fn().mockRejectedValueOnce(rateLimitError(5_000)).mockResolvedValueOnce("ok");

    const result = withRetry(operation);

    await vi.advanceTimersByTimeAsync(4_999);
    expect(operation).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toBe("ok");
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("duplica la espera en cada intento con backoff exponencial", async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce(rateLimitError())
      .mockRejectedValueOnce(rateLimitError())
      .mockResolvedValueOnce("ok");

    const result = withRetry(operation, { baseDelayMs: 1_000 });

    await vi.advanceTimersByTimeAsync(1_000);
    expect(operation).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(1_999);
    expect(operation).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toBe("ok");
  });

  it("no espera si GitHub pide más tiempo que el máximo permitido", async () => {
    const error = rateLimitError(60_000);
    const operation = vi.fn().mockRejectedValue(error);

    await expect(withRetry(operation, { maxDelayMs: 30_000 })).rejects.toBe(error);
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("deja de reintentar al llegar al máximo de intentos", async () => {
    const operation = vi.fn().mockRejectedValue(rateLimitError());

    const result = withRetry(operation, { maxAttempts: 3 });
    const assertion = expect(result).rejects.toBeInstanceOf(GitHubAPIError);

    await vi.runAllTimersAsync();
    await assertion;
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it("no reintenta fallos de red en escrituras para no duplicarlas", async () => {
    const operation = vi.fn().mockRejectedValue(new NetworkError("Sin conexión."));

    await expect(withRetry(operation)).rejects.toBeInstanceOf(NetworkError);
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("reintenta fallos de red en operaciones idempotentes", async () => {
    const operation = vi.fn().mockRejectedValueOnce(new NetworkError("Sin conexión.")).mockResolvedValueOnce("ok");

    const result = withRetry(operation, { retryTransientErrors: true });
    await vi.runAllTimersAsync();

    await expect(result).resolves.toBe("ok");
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("no reintenta errores que no son transitorios", async () => {
    const operation = vi.fn().mockRejectedValue(new ValidationError("Dato incorrecto."));

    await expect(withRetry(operation, { retryTransientErrors: true })).rejects.toBeInstanceOf(ValidationError);
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
