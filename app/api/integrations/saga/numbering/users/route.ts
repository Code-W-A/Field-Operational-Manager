import { numberingRuntime as h } from "@/lib/invoicing/numbering-runtime.server";
export const runtime = "nodejs";
export const maxDuration = 60;
export const GET = (r: Request) => h.usersList(r);
