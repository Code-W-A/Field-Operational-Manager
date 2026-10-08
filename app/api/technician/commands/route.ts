import { commandHandler } from "@/lib/technician/commands-http";
import { technicianActor, options } from "@/lib/technician/http";
export const runtime = "nodejs";
export const OPTIONS = options;
export const POST = commandHandler("web", technicianActor);
