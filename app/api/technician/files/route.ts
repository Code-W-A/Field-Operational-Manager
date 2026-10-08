import { fileHandlers } from "@/lib/technician/files-http";
import { technicianActor, options } from "@/lib/technician/http";
export const runtime = "nodejs";
export const OPTIONS = options;
export const { POST, GET } = fileHandlers(technicianActor);
