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

export interface ApiClientOptions {
  baseUrl: string;
  token?: string;
  /** Override fetch (for tests). Defaults to globalThis.fetch. */
  fetchImpl?: typeof fetch;
}

export class ApiClient {
  readonly baseUrl: string;
  private readonly token?: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: ApiClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.token = opts.token;
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  }

  withToken(token: string): ApiClient {
    return new ApiClient({
      baseUrl: this.baseUrl,
      token,
      fetchImpl: this.fetchImpl,
    });
  }

  async request<T>(
    method: "GET" | "POST" | "DELETE",
    path: string,
    body?: unknown,
  ): Promise<T> {
    const headers: Record<string, string> = {
      "User-Agent": `floop-cli/${CURRENT_VERSION}`,
    };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (this.token) headers["Authorization"] = `Bearer ${this.token}`;

    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (err) {
      throw new FloopError({
        code: "NETWORK_ERROR",
        message: `Could not reach ${this.baseUrl} (${(err as Error).message})`,
        status: 0,
      });
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
