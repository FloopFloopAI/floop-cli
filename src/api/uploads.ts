/**
 * Wraps /api/v1/uploads (presigned S3 PUT) and handles the PUT itself.
 * Used by the chat REPL's `/attach <file>` slash command.
 *
 * Backend limits today: 5 MB per file, narrow allowlist of MIME types
 * (images, PDF, plain text, CSV, doc/docx).
 */

import { promises as fs } from "node:fs";
import path from "node:path";

import { ApiClient } from "./client.js";
import { FloopError } from "./errors.js";

const EXT_TO_MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".pdf": "application/pdf",
  ".txt": "text/plain",
  ".csv": "text/csv",
  ".doc": "application/msword",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

export function guessMimeType(filePath: string): string | null {
  const ext = path.extname(filePath).toLowerCase();
  return EXT_TO_MIME[ext] ?? null;
}

export interface UploadPresign {
  uploadUrl: string;
  key: string;
  fileId: string;
}

export interface UploadedAttachment {
  key: string;
  fileName: string;
  fileType: string;
  fileSize: number;
}

/**
 * End-to-end upload: presign → PUT → return the attachment descriptor
 * the /refine endpoint wants in its `attachments` array.
 */
export async function uploadAttachment(
  client: ApiClient,
  filePath: string,
): Promise<UploadedAttachment> {
  const stat = await fs.stat(filePath);
  if (!stat.isFile()) {
    throw new FloopError({
      code: "VALIDATION_ERROR",
      message: `Not a file: ${filePath}`,
      status: 0,
    });
  }
  const fileName = path.basename(filePath);
  const fileType = guessMimeType(filePath);
  if (!fileType) {
    throw new FloopError({
      code: "VALIDATION_ERROR",
      message: `Unsupported file type for ${fileName}. Allowed: png, jpg, gif, svg, webp, ico, pdf, txt, csv, doc, docx.`,
      status: 0,
    });
  }
  const fileSize = stat.size;
  if (fileSize > 5 * 1024 * 1024) {
    throw new FloopError({
      code: "VALIDATION_ERROR",
      message: `${fileName} is ${Math.round(fileSize / 1024 / 1024)} MB — the upload limit is 5 MB.`,
      status: 0,
    });
  }

  const presign = await client.request<UploadPresign>("POST", "/api/v1/uploads", {
    fileName,
    fileType,
    fileSize,
  });

  const body = await fs.readFile(filePath);
  const put = await fetch(presign.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": fileType },
    body,
  });
  if (!put.ok) {
    throw new FloopError({
      code: "UNKNOWN",
      message: `S3 upload failed (${put.status} ${put.statusText})`,
      status: put.status,
    });
  }

  return { key: presign.key, fileName, fileType, fileSize };
}
