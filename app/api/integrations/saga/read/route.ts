import { sagaRuntime } from "@/lib/saga/runtime.server";
export const runtime = "nodejs";
export const maxDuration = 60;
export const POST = sagaRuntime.read;
