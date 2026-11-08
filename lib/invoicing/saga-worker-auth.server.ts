import { timingSafeEqual } from "node:crypto";
export function workerAuthorized(
  request: Request,
  secret = process.env.SAGA_WORKER_SECRET || "",
) {
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(secret)) return false;
  const supplied =
    request.headers.get("Authorization")?.replace(/^Bearer /, "") || "";
  return (
    /^[A-Za-z0-9_-]{43,128}$/.test(supplied) &&
    supplied.length === secret.length &&
    timingSafeEqual(Buffer.from(supplied), Buffer.from(secret))
  );
}
