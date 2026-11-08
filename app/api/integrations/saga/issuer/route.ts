import { invoiceXmlRuntime } from "@/lib/invoicing/xml-runtime.server";
export const runtime = "nodejs";
export const maxDuration = 60;
export const GET = invoiceXmlRuntime.profile;
export const PUT = invoiceXmlRuntime.saveProfile;
