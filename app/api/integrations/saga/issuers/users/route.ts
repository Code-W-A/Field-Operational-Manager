import { sagaReferencesRuntime as h } from "@/lib/saga/references-runtime.server";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(r: Request) {
  return h.users(r);
}
