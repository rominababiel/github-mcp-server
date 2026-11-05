const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 50 } as const;

type LogLevel = keyof typeof LEVELS;
type LogMeta = Record<string, unknown>;

const REDACTED = "[REDACTED]";
const SENSITIVE_KEY = /token|authorization|password|secret/i;
const GITHUB_TOKEN_VALUE = /\b(?:gh[pousr]_[A-Za-z0-9]{10,}|github_pat_[A-Za-z0-9_]{10,})\b/g;

function isLogLevel(value: string): value is LogLevel {
  return value in LEVELS;
}

function activeLevel(): LogLevel {
  if (process.argv.includes("--verbose")) {
    return "debug";
  }
  const configured = process.env.LOG_LEVEL?.toLowerCase() ?? "info";
  return isLogLevel(configured) ? configured : "info";
}

export function redact(value: unknown): unknown {
  if (typeof value === "string") {
    return value.replace(GITHUB_TOKEN_VALUE, REDACTED);
  }
  if (Array.isArray(value)) {
    return value.map(redact);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        SENSITIVE_KEY.test(key) ? REDACTED : redact(entry),
      ]),
    );
  }
  return value;
}

// stdout pertenece al protocolo JSON-RPC: cualquier log ahí corrompería la comunicación con el host.
function write(level: Exclude<LogLevel, "silent">, message: string, meta: LogMeta = {}): void {
  if (LEVELS[level] < LEVELS[activeLevel()]) {
    return;
  }
  const entry = { timestamp: new Date().toISOString(), level, message: redact(message), ...(redact(meta) as LogMeta) };
  process.stderr.write(`${JSON.stringify(entry)}\n`);
}

export const logger = {
  debug: (message: string, meta?: LogMeta) => write("debug", message, meta),
  info: (message: string, meta?: LogMeta) => write("info", message, meta),
  warn: (message: string, meta?: LogMeta) => write("warn", message, meta),
  error: (message: string, meta?: LogMeta) => write("error", message, meta),
};
