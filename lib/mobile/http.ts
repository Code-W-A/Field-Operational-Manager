import { NextRequest, NextResponse } from "next/server";
import { requireVerifiedRole, RequireRoleError } from "@/lib/auth/require-role";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { DomainError } from "@/packages/fom-domain";
import { InstallationError } from "@/lib/installations/validation";
import { MobileError, mobileService } from "./service";
export const service=mobileService(adminDb);
export function headers(request: NextRequest) {
  const origin=request.headers.get("origin");
  const allowed=(process.env.FOM_MOBILE_WEB_ORIGINS || "http://localhost:8087,http://127.0.0.1:8087").split(",");
  return {"Cache-Control":"private, no-store",...(origin && (allowed.includes(origin) || origin===request.nextUrl.origin)?{"Access-Control-Allow-Origin":origin,"Vary":"Origin","Access-Control-Allow-Headers":"Authorization, Content-Type","Access-Control-Allow-Methods":"GET, POST, OPTIONS"}:{})};
}
export async function mobileActor(request: NextRequest) {
  if(process.env.FOM_MOBILE_ENABLED!=="true" && process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS!=="true") throw new MobileError("Accesul mobil conectat nu este activat în acest mediu.",503);
  const identity=await requireVerifiedRole(["tehnician"],request);
  const bearer=request.headers.get("authorization")?.replace(/^Bearer\s+/i,"");
  if(bearer) await adminAuth.verifyIdToken(bearer,true);
  const authUser=await adminAuth.getUser(identity.uid);
  if(authUser.disabled) throw new MobileError("Cont dezactivat.",403);
  return service.actor(identity.uid);
}
export function failure(request: NextRequest,e: unknown) {
  if(process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true") console.error("[mobile]", (e as any)?.name, (e as any)?.code, (e as Error)?.message);
  const status=e instanceof MobileError || e instanceof RequireRoleError || e instanceof InstallationError ? e.status : e instanceof DomainError || e instanceof SyntaxError ? 400 : 500;
  return NextResponse.json({error:status===500?"Operația nu a putut fi procesată. Reîncearcă.":(e as Error).message,kind:status===409?"conflict":status===401 || status===403?"blocked":status>=500?"retryable":"validation"},{status,headers:headers(request)});
}
export const options=(request: NextRequest)=>new NextResponse(null,{status:204,headers:headers(request)});
