import { sagaReferencesRuntime as h } from "@/lib/saga/references-runtime.server";
export const runtime = "nodejs";
export const maxDuration = 60;
type C = { params: Promise<{ kind: string }> };
export async function POST(r: Request, c: C) {
  return h.preview(r, (await c.params).kind);
}
