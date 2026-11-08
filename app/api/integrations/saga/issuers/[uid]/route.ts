import { sagaReferencesRuntime as h } from "@/lib/saga/references-runtime.server";
export const runtime = "nodejs";
export const maxDuration = 60;
type C = { params: Promise<{ uid: string }> };
export async function GET(r: Request, c: C) {
  return h.profile(r, (await c.params).uid);
}
export async function PUT(r: Request, c: C) {
  return h.saveProfile(r, (await c.params).uid);
}
