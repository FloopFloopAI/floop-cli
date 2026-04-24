/**
 * Thin typed wrapper around `fetch` for the FloopFloop API. Centralises:
 *   - Bearer header attachment
 *   - {data}/{error} envelope parsing
 *   - request_id capture (for support traceability)
 *   - FloopError translation so commands can `try { ... } catch (FloopError)`
 */

import { FloopError, FloopErrorCode } from "./errors.js";
import { CURRENT_VERSION } from "../version.js";

interface ApiSuccess<T> {
  data: T;
}
interface ApiError {
  error: { code: string; message: string };
}

const DEFAULT_TIMEOUT_MS = 30_000;

export interface ApiClientOptions {
  baseUrl: string;
  token?: string;
  /** Override fetch (for tests). Defaults to globalThis.fetch. */
  fetchImpl?: typeof fetch;
  /** Per-request timeout in ms. Defaults to 30s. Override per call via request opts. */
  timeoutMs?: number;
}

export interface RequestOptions {
  /** Override the client's default per-request timeout, in ms. */
  timeoutMs?: number;
}

export class ApiClient {
  readonly baseUrl: string;
  private readonly token?: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(opts: ApiClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.token = opts.token;
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  withToken(token: string): ApiClient {
    return new ApiClient({
      baseUrl: this.baseUrl,
      token,
      fetchImpl: this.fetchImpl,
      timeoutMs: this.timeoutMs,
    });
  }

  async request<T>(
    method: "GET" | "POST" | "DELETE",
    path: string,
    body?: unknown,
    opts: RequestOptions = {},
  ): Promise<T> {
    const headers: Record<string, string> = {
      "User-Agent": `floop-cli/${CURRENT_VERSION}`,
    };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (this.token) headers["Authorization"] = `Bearer ${this.token}`;

    const timeoutMs = opts.timeoutMs ?? this.timeoutMs;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let res: Response;
    try {
      try {
        res = await this.fetchImpl(`${this.baseUrl}${path}`, {
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: controller.signal,
        });
      } catch (err) {
        const aborted = (err as { name?: string }).name === "AbortError";
        throw new FloopError({
          code: aborted ? "TIMEOUT" : "NETWORK_ERROR",
          message: aborted
            ? `Request to ${path} timed out after ${timeoutMs}ms`
            : `Could not reach ${this.baseUrl} (${(err as Error).message})`,
          status: 0,
        });
      }
    } finally {
      clearTimeout(timer);
    }

    const requestId = res.headers.get("x-request-id") ?? undefined;
    const text = await res.text();
    let parsed: unknown = null;
    if (text.length > 0) {
      try {
        parsed = JSON.parse(text);
      } catch {
        // Non-JSON body — fall through with parsed = null.
      }
    }

    if (!res.ok) {
      const errBody = parsed as ApiError | null;
      const code =
        (errBody?.error?.code as FloopErrorCode) ??
        (res.status >= 500 ? "SERVER_ERROR" : "UNKNOWN");
      const message =
        errBody?.error?.message ?? `Request failed (${res.status})`;
      throw new FloopError({ code, message, status: res.status, requestId });
    }

    const body2 = parsed as ApiSuccess<T> | null;
    if (!body2 || typeof body2 !== "object" || !("data" in body2)) {
      throw new FloopError({
        code: "UNKNOWN",
        message: "Malformed response (missing `data` envelope)",
        status: res.status,
        requestId,
      });
    }
    return body2.data;
  }
}
