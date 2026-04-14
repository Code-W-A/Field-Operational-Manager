import { NextResponse, type NextRequest } from "next/server"
import { adminAuth, adminDb } from "@/lib/firebase/admin"
import { migrateEquipment, MigrateEquipmentError } from "@/lib/equipment/migrate-equipment.server"
import { reportToSentry } from "@/lib/sentry/report-error"

async function requireAdmin(req: NextRequest): Promise<{ userId: string; email: string } | null> {
  try {
    const cookie = req.headers.get("cookie") || ""
    const match = cookie.split(";").map((p) => p.trim()).find((p) => p.startsWith("__session="))
    const token = match ? decodeURIComponent(match.split("=")[1]) : undefined
    if (!token) return null
    const decoded = await adminAuth.verifySessionCookie(token, true)
    const userId = decoded.uid
    const email = decoded.email || ""

    const userSnap = await adminDb.collection("users").doc(String(userId)).get()
    const role = userSnap.exists ? (userSnap.data() as any)?.role : undefined
    if (role !== "admin") return null

    return { userId, email }
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  let actor: { userId: string; email: string } | null = null
  let sentryCtx: { sourceClientId?: string; targetClientId?: string; dryRun?: boolean } = {}
  try {
    actor = await requireAdmin(req)
    if (!actor) {
      return NextResponse.json({ error: "Doar administratorii pot rula migrarea." }, { status: 403 })
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Body JSON invalid." }, { status: 400 })
    }

    const sourceClientId = String(body.sourceClientId || "").trim()
    const targetClientId = String(body.targetClientId || "").trim()
    const targetLocationId = body.targetLocationId != null ? String(body.targetLocationId).trim() : ""
    const targetLocationName = body.targetLocationName != null ? String(body.targetLocationName).trim() : ""
    const targetContractId =
      body.targetContractId != null && String(body.targetContractId).trim()
        ? String(body.targetContractId).trim()
        : undefined
    const dryRun = Boolean(body.dryRun)
    const idempotencyKey = body.idempotencyKey != null ? String(body.idempotencyKey).trim() : ""

    const rawIds = body.equipmentIds
    const equipmentIds = Array.isArray(rawIds)
      ? rawIds.map((x) => String(x ?? "").trim()).filter(Boolean)
      : []

    if (!sourceClientId || !targetClientId) {
      return NextResponse.json({ error: "sourceClientId și targetClientId sunt obligatorii." }, { status: 400 })
    }
    sentryCtx = { sourceClientId, targetClientId, dryRun }
    if (!targetLocationId && !targetLocationName) {
      return NextResponse.json(
        { error: "Furnizați targetLocationId sau targetLocationName (unic pe client)." },
        { status: 400 },
      )
    }

    const logExtraBase = {
      sourceClientId,
      targetClientId,
      targetLocationId: targetLocationId || null,
      targetLocationName: targetLocationName || null,
      targetContractId: targetContractId || null,
      equipmentIds,
      dryRun,
    }

    if (!dryRun) {
      const now = new Date()
      await adminDb.collection("logs").add({
        timestamp: now,
        utilizator: actor.email || "admin",
        utilizatorId: actor.userId,
        actiune: "Migrare echipamente — început",
        detalii: `Sursă ${sourceClientId} → destinație ${targetClientId}; ${equipmentIds.length} echipamente`,
        tip: "Informație",
        categorie: "Migrare echipamente",
        extra: logExtraBase,
      })
    }

    const result = await migrateEquipment(adminDb, {
      sourceClientId,
      targetClientId,
      targetLocationId: targetLocationId || undefined,
      targetLocationName: targetLocationName || undefined,
      equipmentIds,
      targetContractId,
      dryRun,
      idempotencyKey: idempotencyKey || undefined,
    })

    if (!dryRun && result.dryRun === false) {
      const now = new Date()
      await adminDb.collection("logs").add({
        timestamp: now,
        utilizator: actor.email || "admin",
        utilizatorId: actor.userId,
        actiune: result.idempotentReplay ? "Migrare echipamente — reluare idempotentă" : "Migrare echipamente — finalizat",
        detalii: `Lucrări actualizate: ${result.updatedLucrariCount}; echipamente: ${result.migratedEquipmentIds.length}`,
        tip: "Informație",
        categorie: "Migrare echipamente",
        extra: {
          ...logExtraBase,
          affectedLucrareIds: result.affectedLucrareIds,
          idempotentReplay: Boolean(result.idempotentReplay),
        },
      })
    }

    return NextResponse.json(result)
  } catch (e: unknown) {
    if (e instanceof MigrateEquipmentError) {
      if (actor) {
        try {
          await adminDb.collection("logs").add({
            timestamp: new Date(),
            utilizator: actor.email || "admin",
            utilizatorId: actor.userId,
            actiune: "Migrare echipamente — eșec validare",
            detalii: e.message,
            tip: "Eroare",
            categorie: "Migrare echipamente",
            extra: { statusCode: e.statusCode, details: e.details },
          })
        } catch (logErr) {
          console.error("migrate-equipment: log failure", logErr)
        }
      }
      return NextResponse.json({ error: e.message, details: e.details }, { status: e.statusCode })
    }

    console.error("/api/admin/migrate-equipment POST error", e)
    reportToSentry(e, {
      tags: {
        operation: "equipment_migrate",
        ...(sentryCtx.sourceClientId ? { sourceClientId: sentryCtx.sourceClientId } : {}),
        ...(sentryCtx.targetClientId ? { targetClientId: sentryCtx.targetClientId } : {}),
      },
      extra: {
        route: "/api/admin/migrate-equipment",
        dryRun: sentryCtx.dryRun,
      },
    })
    if (actor) {
      try {
        await adminDb.collection("logs").add({
          timestamp: new Date(),
          utilizator: actor.email || "admin",
          utilizatorId: actor.userId,
          actiune: "Migrare echipamente — eroare internă",
          detalii: e instanceof Error ? e.message : String(e),
          tip: "Eroare",
          categorie: "Migrare echipamente",
          extra: { stack: e instanceof Error ? e.stack : undefined },
        })
      } catch (logErr) {
        console.error("migrate-equipment: log failure", logErr)
      }
    }
    return NextResponse.json({ error: "Eroare internă la migrare." }, { status: 500 })
  }
}
