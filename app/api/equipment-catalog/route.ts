import { NextRequest, NextResponse } from "next/server";
import { requireVerifiedRole, RequireRoleError } from "@/lib/auth/require-role";
import { adminDb, adminAuth } from "@/lib/firebase/admin";
import {
  equipmentCatalogService,
  CatalogError,
} from "@/lib/equipment-catalog/service";
export const runtime = "nodejs";
async function actor(request: NextRequest, roles: string[]) {
  const user = await requireVerifiedRole(roles, request);
  const profile = (await adminDb.doc(`users/${user.uid}`).get()).data();
  if (profile?.disabled || (await adminAuth.getUser(user.uid)).disabled)
    throw new CatalogError("Cont dezactivat.", 403);
  return user;
}
function error(e: unknown) {
  return NextResponse.json(
    {
      error:
        e instanceof CatalogError || e instanceof RequireRoleError
          ? e.message
          : "Listele nu au putut fi actualizate.",
    },
    {
      status:
        e instanceof CatalogError || e instanceof RequireRoleError
          ? e.status
          : 500,
    },
  );
}
export async function GET(request: NextRequest) {
  try {
    const manage = request.nextUrl.searchParams.get("manage") === "1";
    await actor(
      request,
      manage ? ["admin"] : ["admin", "dispecer", "tehnician"],
    );
    return NextResponse.json(
      await equipmentCatalogService(adminDb).list(manage),
      {
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  } catch (e) {
    return error(e);
  }
}
export async function POST(request: NextRequest) {
  try {
    const user = await actor(request, ["admin", "dispecer"]);
    let data;
    try {
      data = await request.json();
    } catch {
      throw new CatalogError("Cerere invalidă.");
    }
    if (!data || !["manufacturers", "models"].includes(data.kind))
      throw new CatalogError("Listă invalidă.");
    const service = equipmentCatalogService(adminDb);
    const option = await service.add(
      user,
      data.kind,
      data.name,
      data.manufacturerId,
    );
    return NextResponse.json({ option, catalog: await service.list() });
  } catch (e) {
    return error(e);
  }
}
export async function PATCH(request: NextRequest) {
  try {
    const user = await actor(request, ["admin"]);
    const data = await request.json().catch(() => {
      throw new CatalogError("Cerere invalidă.");
    });
    if (!data || !["manufacturers", "models"].includes(data.kind))
      throw new CatalogError("Listă invalidă.");
    const service = equipmentCatalogService(adminDb);
    const option = await service.update(user, data.kind, data.id, {
      name: data.name,
      hidden: data.hidden,
    });
    return NextResponse.json({ option, catalog: await service.list(true) });
  } catch (e) {
    return error(e);
  }
}
