export const CRM_SERVER_MISSING =
  "CRM nu este disponibil în versiunea publicată a serverului. Este necesară actualizarea backendului.";

/** status is authoritative only for a structured API rejection. A proxy/HTML
 * response cannot prove that a mutation failed or access was revoked. */
export class ApiResponseError extends Error {
  constructor(
    message: string,
    public kind: string,
    public status: number,
    public httpStatus = status,
  ) {
    super(message);
  }
}
type ApiResponse = {
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
};
function invalidResponse(response: ApiResponse, crm: boolean) {
  return new ApiResponseError(
    crm && response.status === 404
      ? CRM_SERVER_MISSING
      : "Serverul nu a trimis un răspuns valid. Reîncearcă în câteva momente.",
    crm && response.status === 404 ? "blocked" : "retryable",
    0,
    response.status,
  );
}
export async function readApiJson(
  response: ApiResponse,
  crm = false,
): Promise<Record<string, any>> {
  const contentType = response.headers.get("content-type") || "";
  if (!/^application\/(?:[\w.-]+\+)?json(?:\s*;|$)/i.test(contentType))
    throw invalidResponse(response, crm);
  let data: any;
  try {
    data = JSON.parse(await response.text());
  } catch {
    throw invalidResponse(response, crm);
  }
  if (!data || typeof data !== "object" || Array.isArray(data))
    throw invalidResponse(response, crm);
  if (!response.ok) {
    if (typeof data.error !== "string" || !data.error.trim())
      throw invalidResponse(response, crm);
    throw new ApiResponseError(
      data.error,
      typeof data.kind === "string"
        ? data.kind
        : response.status === 409
          ? "conflict"
          : response.status >= 500
            ? "retryable"
            : "blocked",
      response.status,
    );
  }
  return data;
}

/** Reject error documents before any file is persisted or shared. */
export async function assertApiDownload(response: ApiResponse, crm = false) {
  const contentType = response.headers.get("content-type") || "";
  const attachment = /^attachment\s*;/i.test(
    response.headers.get("content-disposition") || "",
  );
  if (
    !response.ok ||
    !contentType ||
    /html/i.test(contentType) ||
    (/json/i.test(contentType) && !attachment)
  ) {
    await readApiJson(response, crm);
    throw invalidResponse(response, crm);
  }
}
