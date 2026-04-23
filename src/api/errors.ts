/**
 * Errors thrown by the CLI's API client. Maps to documented exit codes:
 *   1 — generic / user error
 *   2 — auth (UNAUTHORIZED, FORBIDDEN)
 *   3 — rate limit (RATE_LIMITED)
 *   4 — server (5xx)
 *   5 — network (fetch failed)
 */

export type FloopErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "VALIDATION_ERROR"
  | "RATE_LIMITED"
  | "NOT_FOUND"
  | "INVALID_GRANT"
  | "AUTHORIZATION_PENDING"
  | "ACCESS_DENIED"
  | "EXPIRED_TOKEN"
  | "SERVICE_UNAVAILABLE"
  | "SERVER_ERROR"
  | "NETWORK_ERROR"
  | "UNKNOWN";

export class FloopError extends Error {
  readonly code: FloopErrorCode;
  readonly status: number;
  readonly requestId?: string;

  constructor(opts: {
    code: FloopErrorCode;
    message: string;
    status: number;
    requestId?: string;
  }) {
    super(opts.message);
    this.name = "FloopError";
    this.code = opts.code;
    this.status = opts.status;
    this.requestId = opts.requestId;
  }

  exitCode(): number {
    switch (this.code) {
      case "UNAUTHORIZED":
      case "FORBIDDEN":
      case "ACCESS_DENIED":
        return 2;
      case "RATE_LIMITED":
        return 3;
      case "SERVER_ERROR":
      case "SERVICE_UNAVAILABLE":
        return 4;
      case "NETWORK_ERROR":
        return 5;
      default:
        return 1;
    }
  }
}
