// HTTP repositories (ADR-0103): a repository whose methods carry @get, @post, @put, @patch or @delete and no body
// calls an `Http({ baseUrl })` connection, with the mobile platform's words. `:name` in a path takes the parameter of
// that name; the other parameters go to the query (GET, DELETE) or to the JSON body (POST, PUT, PATCH: a single object
// parameter is the body itself). An error status is the `Err` of a `Result` (404 NotFound, 400/422 Invalid, 401
// Unauthorized, 403 Forbidden, 409 Conflict).
import { connection } from './app.js';
import { Connection } from './config.js';
import { AppError, Conflict, Forbidden, Invalid, NotFound, Unauthorized } from './errors.js';
import { Result } from './result.js';

export interface HttpOptions {
  /** The API's root: `https://rickandmortyapi.com/api`. */
  baseUrl: string;
  name?: string;
  /** Headers every request sends (an API key...). */
  headers?: Record<string, string>;
  /** The longest a request may take, in seconds (10 by default; the same word as every backend dialect). */
  timeout?: number;
}

/** An HTTP API the app calls. */
export class Http extends Connection {
  constructor(readonly options: HttpOptions) {
    super();
    this.name = options.name ?? 'default';
  }
}

const ERRORS: Record<number, new (message?: string) => AppError> = { 400: Invalid, 401: Unauthorized, 403: Forbidden, 404: NotFound, 409: Conflict, 422: Invalid };

/** `character` and `:id` → `character/:id` (no doubled slashes). */
export function joinPath(base: string, path: string): string {
  return [base, path].map((p) => p.replace(/^\/+|\/+$/g, '')).filter(Boolean).join('/');
}

/** The URL path with its `:name` parameters put in, the query and the JSON body. */
export function splitParams(path: string, method: string, params: Record<string, unknown>): { url: string; query: Record<string, string>; body: unknown } {
  const used = new Set<string>();
  const url = path.replace(/:(\w+)/g, (_, name: string) => {
    used.add(name);
    return encodeURIComponent(String(params[name]));
  });
  const rest = Object.entries(params).filter(([k, v]) => !used.has(k) && v !== undefined && v !== null);
  if (method === 'GET' || method === 'DELETE') return { url, query: Object.fromEntries(rest.map(([k, v]) => [k, String(v)])), body: undefined };
  const body = rest.length === 1 && typeof rest[0][1] === 'object' && !Array.isArray(rest[0][1]) ? rest[0][1] : rest.length ? Object.fromEntries(rest) : undefined;
  return { url, query: {}, body };
}

/** The base of an HTTP repository: `path` is `@repository(path = "...")`, `connectionName` its connection. */
export abstract class HttpRepository {
  path = '';
  connectionName = 'default';

  protected async send<T>(method: string, path: string, params: Record<string, unknown>): Promise<Result<AppError, T>> {
    const http = connection(Http, this.connectionName).options;
    const { url, query, body } = splitParams(joinPath(this.path, path), method, params);
    const qs = new URLSearchParams(query).toString();
    const target = `${http.baseUrl.replace(/\/+$/, '')}/${url}${qs ? `?${qs}` : ''}`;
    let r: Response;
    try {
      r = await fetch(target, {
        method,
        headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(http.headers ?? {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout((http.timeout ?? 10) * 1000),
      });
    } catch (e) {
      return Result.err(new AppError(`${method} ${target}: ${e instanceof Error ? e.message : String(e)}`, 503));
    }
    const text = await r.text();
    if (!r.ok) {
      let message = text || r.statusText;
      try {
        const json = JSON.parse(text) as { error?: string; message?: string };
        message = json.error ?? json.message ?? message;
      } catch {
        // not JSON: the text is the message
      }
      const E = ERRORS[r.status];
      return Result.err(E ? new E(message) : new AppError(message, r.status));
    }
    return Result.ok((text ? JSON.parse(text) : undefined) as T);
  }
}
