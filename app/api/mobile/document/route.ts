import { documentHandlers } from "@/lib/technician/document-http";
import { mobileActor, options } from "@/lib/technician/http";
export const runtime = "nodejs";
export const OPTIONS = options;
export const { GET } = documentHandlers(mobileActor);
