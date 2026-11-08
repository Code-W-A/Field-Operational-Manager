import { numberingRuntime as h } from "@/lib/invoicing/numbering-runtime.server";
export const runtime = "nodejs";
export const maxDuration = 60;
export const POST = (r: Request) => h.usersPreview(r);
