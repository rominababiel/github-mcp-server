import type { z } from "zod";

export abstract class AppError extends Error {
  abstract readonly code: string;

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  readonly code = "VALIDATION_ERROR";
}

export class AuthenticationError extends AppError {
  readonly code = "AUTHENTICATION_ERROR";
}

export class NetworkError extends AppError {
  readonly code = "NETWORK_ERROR";
}

export class UnexpectedError extends AppError {
  readonly code = "UNEXPECTED_ERROR";
}

interface GitHubAPIErrorDetails {
  status: number;
  rateLimited?: boolean;
  retryAfterMs?: number;
}

export class GitHubAPIError extends AppError {
  readonly code = "GITHUB_API_ERROR";
  readonly status: number;
  readonly rateLimited: boolean;
  readonly retryAfterMs: number | undefined;

  constructor(message: string, details: GitHubAPIErrorDetails, options?: ErrorOptions) {
    super(message, options);
    this.status = details.status;
    this.rateLimited = details.rateLimited ?? false;
    this.retryAfterMs = details.retryAfterMs;
  }
}

export interface ErrorContext {
  repository?: string;
  messages?: Partial<Record<number, string>>;
}

interface HttpErrorLike {
  status: number;
  message: string;
  response?: {
    headers?: Record<string, string | number | undefined>;
    data?: unknown;
  };
}

function isHttpError(error: unknown): error is HttpErrorLike {
  return (
    error instanceof Error && "status" in error && typeof (error as { status: unknown }).status === "number"
  );
}

function detectRateLimit(error: HttpErrorLike): { retryAfterMs?: number } | undefined {
  if (error.status !== 403 && error.status !== 429) {
    return undefined;
  }
  const headers = error.response?.headers ?? {};
  const retryAfter = Number(headers["retry-after"]);
  if (retryAfter > 0) {
    return { retryAfterMs: retryAfter * 1000 };
  }
  if (String(headers["x-ratelimit-remaining"]) === "0") {
    const resetAtMs = Number(headers["x-ratelimit-reset"]) * 1000;
    return Number.isFinite(resetAtMs) ? { retryAfterMs: Math.max(resetAtMs - Date.now(), 0) } : {};
  }
  return error.status === 429 || /rate limit/i.test(error.message) ? {} : undefined;
}

function rateLimitMessage(retryAfterMs?: number): string {
  if (retryAfterMs === undefined) {
    return "GitHub limitó temporalmente las solicitudes por exceso de uso. Espera unos minutos e intenta de nuevo.";
  }
  const minutes = Math.ceil(retryAfterMs / 60_000);
  return `GitHub limitó temporalmente las solicitudes por exceso de uso. Podrás reintentar en aproximadamente ${minutes} minuto(s).`;
}

function apiValidationDetail(data: unknown): string {
  const { message, errors } = (data ?? {}) as { message?: string; errors?: unknown[] };
  const details = (errors ?? []).map((entry) => {
    if (typeof entry === "string") {
      return entry;
    }
    const { message: text, field, code } = entry as { message?: string; field?: string; code?: string };
    return text ?? [field, code].filter(Boolean).join(": ");
  });
  return details.filter(Boolean).join("; ") || message || "datos no válidos";
}

function defaultMessage(error: HttpErrorLike, repository?: string): string {
  switch (error.status) {
    case 404:
      return repository
        ? `El repositorio ${repository} no fue encontrado. Verifica el nombre e intenta de nuevo.`
        : "El recurso solicitado no fue encontrado. Verifica los datos e intenta de nuevo.";
    case 409:
      return "GitHub informó un conflicto con el estado actual del recurso. Actualiza los datos e intenta de nuevo.";
    case 410:
      return "El recurso ya no está disponible o la función está deshabilitada en este repositorio.";
    case 422:
      return `GitHub rechazó la operación: ${apiValidationDetail(error.response?.data).replace(/\.+$/, "")}. Corrige los datos e intenta de nuevo.`;
    default:
      return error.status >= 500
        ? "GitHub no está disponible en este momento. Intenta de nuevo en unos minutos."
        : `GitHub rechazó la solicitud (código ${error.status}). Revisa los datos e intenta de nuevo.`;
  }
}

function translateHttpError(error: HttpErrorLike, context: ErrorContext): AppError {
  const custom = context.messages?.[error.status];

  // Octokit informa los fallos de red como status 500 sin respuesta del servidor.
  if (error.status === 500 && !error.response) {
    return new NetworkError(
      "No se pudo conectar con GitHub. Verifica tu conexión a internet e intenta de nuevo.",
      { cause: error },
    );
  }

  const rateLimit = detectRateLimit(error);
  if (rateLimit) {
    return new GitHubAPIError(
      rateLimitMessage(rateLimit.retryAfterMs),
      { status: error.status, rateLimited: true, retryAfterMs: rateLimit.retryAfterMs },
      { cause: error },
    );
  }

  if (error.status === 401) {
    return new AuthenticationError(
      "GitHub rechazó las credenciales. Verifica que GITHUB_TOKEN sea válido y no haya vencido.",
      { cause: error },
    );
  }

  if (error.status === 403) {
    return new AuthenticationError(
      custom ?? "El token no tiene permisos para esta operación. Verifica que tenga los scopes repo, user y admin:org.",
      { cause: error },
    );
  }

  return new GitHubAPIError(
    custom ?? defaultMessage(error, context.repository),
    { status: error.status },
    { cause: error },
  );
}

export function fromZodError(error: z.ZodError): ValidationError {
  const problems = error.issues.map((issue) => {
    const field = issue.path.join(".");
    return field ? `${field}: ${issue.message}` : issue.message;
  });
  return new ValidationError(`Parámetros inválidos. ${problems.join(" | ")}`, { cause: error });
}

export function toAppError(error: unknown, context: ErrorContext = {}): AppError {
  if (error instanceof AppError) {
    return error;
  }
  if (isHttpError(error)) {
    return translateHttpError(error, context);
  }
  return new UnexpectedError(
    "Ocurrió un error inesperado al procesar la solicitud. Intenta de nuevo y, si persiste, revisa los logs del servidor.",
    { cause: error },
  );
}
