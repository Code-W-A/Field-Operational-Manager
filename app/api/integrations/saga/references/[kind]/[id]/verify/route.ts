import { sagaReferencesRuntime as h } from "@/lib/saga/references-runtime.server";
export const runtime = "nodejs";
export const maxDuration = 60;
type C = { params: Promise<{ kind: string; id: string }> };
export async function POST(r: Request, c: C) {
  const p = await c.params;
  return h.verify(r, p.kind, p.id);
}
