/**
 * Browser API client. Every request goes to the same-origin `/api/v1` path, which Next.js
 * rewrites to the FastAPI backend, and carries the HTTP-only `bl_session` cookie.
 *
 * Backend error envelope: {"error": {"code", "message", "details"}}.
 */

export const API_BASE = "/api/v1";

export type QueryValue = string | number | boolean | null | undefined;
export type QueryParams = Record<string, QueryValue | QueryValue[]>;

export interface FieldIssue {
  loc: (string | number)[];
  msg: string;
  type?: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /**
   * True when the backend has no route for this request yet (FastAPI's default 404/405 bodies),
   * as opposed to a record that does not exist ("<Entity> not found").
   */
  get isUnavailable(): boolean {
    if (this.status === 405) return true;
    return this.status === 404 && this.code === "NOT_FOUND" && this.message === "Not Found";
  }

  get isNetwork(): boolean {
    return this.status === 0;
  }

  /** Field-level messages from a 422 VALIDATION_ERROR, keyed by dotted body path. */
  get fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {};
    if (!Array.isArray(this.details)) return out;
    for (const issue of this.details as FieldIssue[]) {
      if (!issue || !Array.isArray(issue.loc)) continue;
      const path = issue.loc[0] === "body" || issue.loc[0] === "query" ? issue.loc.slice(1) : issue.loc;
      const key = path.join(".");
      if (key && !out[key]) out[key] = cleanPydanticMessage(issue.msg);
    }
    return out;
  }
}

function cleanPydanticMessage(msg: string): string {
  return msg.replace(/^Value error, /, "");
}

export function buildQuery(params?: QueryParams): string {
  if (!params) return "";
  const search = new URLSearchParams();
  for (const [key, raw] of Object.entries(params)) {
    const values = Array.isArray(raw) ? raw : [raw];
    for (const value of values) {
      if (value === undefined || value === null || value === "") continue;
      search.append(key, String(value));
    }
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

interface RequestOptions {
  query?: QueryParams;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

async function request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
  const { query, body, headers, signal } = options;
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}${buildQuery(query)}`, {
      method,
      credentials: "include",
      cache: "no-store",
      signal,
      headers: {
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError(0, "NETWORK_ERROR", "Cannot reach the server. Check your connection and try again.");
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  let data: unknown = undefined;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = undefined;
    }
  }

  if (!response.ok) {
    const envelope = (data as { error?: { code?: string; message?: string; details?: unknown } } | undefined)?.error;
    throw new ApiError(
      response.status,
      envelope?.code ?? (response.status >= 500 ? "SERVER_ERROR" : "HTTP_ERROR"),
      envelope?.message ?? defaultMessage(response.status),
      envelope?.details,
    );
  }
  return data as T;
}

function defaultMessage(status: number): string {
  if (status === 401) return "Your session has expired. Please sign in again.";
  if (status === 403) return "You do not have access to this resource.";
  if (status === 404) return "Not Found";
  if (status === 429) return "Too many requests. Please wait a moment and try again.";
  if (status >= 500) return "The server ran into a problem. Please try again.";
  return "Request failed.";
}

export const api = {
  get: <T>(path: string, query?: QueryParams, signal?: AbortSignal) =>
    request<T>("GET", path, { query, signal }),
  post: <T>(path: string, body?: unknown, headers?: Record<string, string>) =>
    request<T>("POST", path, { body: body ?? {}, headers }),
  patch: <T>(path: string, body: unknown) => request<T>("PATCH", path, { body }),
  put: <T>(path: string, body: unknown) => request<T>("PUT", path, { body }),
  delete: <T>(path: string) => request<T>("DELETE", path),
};

/** Human-readable message for any thrown value. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.isUnavailable) return "This feature is not available on the connected server yet.";
    if (error.code === "VALIDATION_ERROR") {
      const fields = Object.values(error.fieldErrors);
      if (fields.length) return fields[0];
    }
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}
