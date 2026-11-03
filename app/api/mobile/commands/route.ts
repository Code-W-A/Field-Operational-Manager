import { commandHandler } from "@/lib/technician/commands-http";
import { mobileIdentity, options } from "@/lib/technician/http";
export const runtime = "nodejs";
// Keep the mobile attendance path near the existing eur3 Firestore database.
export const preferredRegion = "fra1";
export const OPTIONS = options;
export const POST = commandHandler("mobile", mobileIdentity);
