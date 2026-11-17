import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase/admin";
import { requireVerifiedRole } from "@/lib/auth/require-role";
import { headers } from "@/lib/technician/http";
import { check } from "./core";
export function responseHeaders(request: NextRequest) {
  return {
    ...headers(request),
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, nofollow",
  };
}
export async function identity(request: NextRequest) {
  const a = await requireVerifiedRole(
    ["tehnician", "admin", "dispecer"],
    request,
  );
  const bearer = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "");
  if (bearer) await adminAuth.verifyIdToken(bearer, true);
  check(!(await adminAuth.getUser(a.uid)).disabled, "Cont dezactivat.", 403);
  return a;
}
export async function body(request: NextRequest) {
  check(
    request.headers.get("content-type")?.startsWith("application/json"),
    "Format invalid.",
    415,
  );
  const reader = request.body?.getReader();
  check(reader, "Date lipsă.");
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 280000) {
      await reader.cancel();
      check(false, "Cererea depășește limita permisă.", 413);
    }
    chunks.push(value);
  }
  const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  check(
    parsed && typeof parsed === "object" && !Array.isArray(parsed),
    "Date invalide.",
  );
  return parsed;
}
export function fail(request: NextRequest, error: any) {
  const status =
    Number(error?.status) || (error instanceof SyntaxError ? 400 : 500);
  return NextResponse.json(
    {
      error:
        status >= 500
          ? "Semnarea prin email nu este disponibilă momentan. Reîncearcă sau contactează administratorul."
          : error.message,
      code: error?.code || "SIGNING_ERROR",
    },
    { status, headers: responseHeaders(request) },
  );
}
