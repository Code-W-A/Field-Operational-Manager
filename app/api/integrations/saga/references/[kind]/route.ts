import { sagaReferencesRuntime as h } from "@/lib/saga/references-runtime.server";
export const runtime = "nodejs";
export const maxDuration = 60;
type C = { params: Promise<{ kind: string }> };
export async function GET(r: Request, c: C) {
  return h.list(r, (await c.params).kind);
}
