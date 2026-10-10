import { NextRequest } from "next/server";
import { crmHttp, options } from "@/lib/crm/technician-http";
export const runtime = "nodejs";
export const OPTIONS = options;
export const GET = (request: NextRequest) => crmHttp(request, false);
export const POST = GET;
