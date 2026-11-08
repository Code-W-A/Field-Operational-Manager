import { numberingRuntime } from "@/lib/invoicing/numbering-runtime.server";
export const runtime = "nodejs";
export const maxDuration = 60;
export const GET = numberingRuntime.get;
export const PUT = numberingRuntime.put;
