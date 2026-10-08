import { commandHandler } from "@/lib/technician/commands-http";
import { mobileActor, options } from "@/lib/technician/http";
export const runtime = "nodejs";
export const OPTIONS = options;
export const POST = commandHandler("mobile", mobileActor);
