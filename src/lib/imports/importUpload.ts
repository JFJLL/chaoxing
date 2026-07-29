const UPLOAD_ERROR_MESSAGE = "上传失败，请重试";

export const MAX_IMPORT_MULTIPART_BYTES = 52 * 1024 * 1024;

export class ImportRequestBodyError extends Error {
  constructor(public readonly reason: "too_large" | "invalid") {
    super(reason === "too_large" ? "Import request body is too large" : "Import request body is invalid multipart data");
    this.name = "ImportRequestBodyError";
  }
}

/**
 * The application buffers multipart data only after enforcing this hard cap.
 * Production reverse proxies must enforce the same 52 MB request limit so
 * oversized uploads are rejected before they consume application bandwidth.
 */
export async function readBoundedMultipartFormData(
  request: Request,
  maxBytes = MAX_IMPORT_MULTIPART_BYTES
) {
  if (!Number.isInteger(maxBytes) || maxBytes < 1) throw new Error("maxBytes must be a positive integer");
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new ImportRequestBodyError("too_large");
  }
  if (!request.body) throw new ImportRequestBodyError("invalid");

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new ImportRequestBodyError("too_large");
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof ImportRequestBodyError) throw error;
    throw new ImportRequestBodyError("invalid");
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    const boundedRequest = new Request(request.url, {
      method: request.method,
      headers: request.headers,
      body: bytes
    });
    return await boundedRequest.formData();
  } catch {
    throw new ImportRequestBodyError("invalid");
  }
}

export function createSubmissionLock() {
  let locked = false;

  return {
    acquire() {
      if (locked) return false;
      locked = true;
      return true;
    },
    release() {
      locked = false;
    }
  };
}

type UploadCourseDocumentOptions = {
  courseId: string;
  file: File;
  request?: typeof fetch;
};

type UploadCourseDocumentsOptions = {
  courseId: string;
  files: File[];
  request?: typeof fetch;
};

export async function uploadCourseDocuments({
  courseId,
  files,
  request = fetch
}: UploadCourseDocumentsOptions) {
  if (!files.length) throw new Error(UPLOAD_ERROR_MESSAGE);
  const formData = new FormData();
  for (const file of files) formData.append("files", file);

  let response: Response;
  try {
    response = await request(`/api/courses/${courseId}/ai-import`, { method: "POST", body: formData });
  } catch {
    throw new Error(UPLOAD_ERROR_MESSAGE);
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const backendError = typeof body === "object" && body !== null && "error" in body
      && typeof body.error === "string" && body.error ? body.error : UPLOAD_ERROR_MESSAGE;
    throw new Error(backendError);
  }
  if (!body || typeof body !== "object") throw new Error(UPLOAD_ERROR_MESSAGE);
  const jobIds = "jobIds" in body && Array.isArray(body.jobIds)
    ? body.jobIds.filter((id): id is string => typeof id === "string" && Boolean(id))
    : "jobId" in body && typeof body.jobId === "string" && body.jobId ? [body.jobId] : [];
  const batchId = "batchId" in body && typeof body.batchId === "string" ? body.batchId : null;
  if (!jobIds.length) throw new Error(UPLOAD_ERROR_MESSAGE);
  return { batchId, jobIds };
}

export async function uploadCourseDocument({
  courseId,
  file,
  request = fetch
}: UploadCourseDocumentOptions) {
  const result = await uploadCourseDocuments({ courseId, files: [file], request });
  return result.jobIds[0]!;
}
