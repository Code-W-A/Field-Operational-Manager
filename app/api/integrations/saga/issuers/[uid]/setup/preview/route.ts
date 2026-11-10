import { issuerSetupRuntime as h } from "@/lib/invoicing/issuer-setup-runtime.server";
export const runtime = "nodejs";
export async function POST(
  r: Request,
  c: { params: Promise<{ uid: string }> },
) {
  return h.preview(r, (await c.params).uid);
}
