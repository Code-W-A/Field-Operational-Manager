import { fileHandlers } from "@/lib/technician/files-http";
import { mobileIdentity, options } from "@/lib/technician/http";
export const runtime = "nodejs";
export const OPTIONS = options;
export const { POST, GET } = fileHandlers(mobileIdentity, true);
