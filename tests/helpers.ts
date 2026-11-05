interface HttpErrorOptions {
  message?: string;
  headers?: Record<string, string>;
  data?: unknown;
}

export function httpError(status: number, options: HttpErrorOptions = {}): Error {
  return Object.assign(new Error(options.message ?? `HTTP ${status}`), {
    status,
    response: { headers: options.headers ?? {}, data: options.data ?? {} },
  });
}
