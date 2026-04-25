import { NextResponse, type NextRequest } from "next/server"
import { getStorage } from "firebase-admin/storage"
import { adminApp, adminDb } from "@/lib/firebase/admin"
import { RequireRoleError, requireRole } from "@/lib/auth/require-role"
import { logFirestoreIndexHintIfPresent } from "@/lib/firebase/firestore-index-hint.server"
import { CRM_COLLECTIONS } from "@/lib/crm/constants"
import { canViewByVisibility, hasOpportunityViewAccess } from "@/lib/crm/access"
import type { CrmFileAttachment, CrmVisibleTo } from "@/lib/crm/types"

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function mapFileFromFirestore(docId: string, data: Record<string, unknown>): CrmFileAttachment {
  return {
    id: docId,
    opportunityId: String(data.opportunityId || ""),
    internalCode: typeof data.internalCode === "string" ? data.internalCode : undefined,
    url: String(data.url || ""),
    storagePath: typeof data.storagePath === "string" ? data.storagePath : undefined,
    filename: String(data.filename || ""),
    mime: String(data.mime || "application/octet-stream"),
    size: Number(data.size || 0),
    uploadedById: String(data.uploadedById || ""),
    visibility: (data.visibility as CrmFileAttachment["visibility"]) || "GENERAL",
    visibleToUserIds: Array.isArray(data.visibleToUserIds) ? (data.visibleToUserIds as string[]) : [],
    createdAt: data.createdAt as CrmFileAttachment["createdAt"],
  }
}

function decodeUntilStable(input: string, maxRounds = 3) {
  let cur = String(input || "")
  for (let i = 0; i < maxRounds; i++) {
    try {
      const next = decodeURIComponent(cur)
      if (next === cur) break
      cur = next
    } catch {
      break
    }
  }
  return cur
}

function parseFirebaseStorageObject(downloadUrl: string): { bucket: string; objectPath: string } | null {
  try {
    const u = new URL(downloadUrl)
    if (!u.hostname.includes("firebasestorage.googleapis.com")) return null
    const m = u.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/)
    if (!m) return null
    const bucket = String(m[1] || "").trim()
    const rawObject = String(m[2] || "").trim()
    const objectPath = decodeUntilStable(rawObject, 3)
    if (!bucket || !objectPath) return null
    return { bucket, objectPath }
  } catch {
    return null
  }
}

function asciiDownloadFilename(name: string) {
  const s = String(name || "download")
    .replace(/[\r\n"]/g, "_")
    .trim()
  return (s || "download").slice(0, 200)
}

async function getOpportunityWithViewAccess(opportunityId: string, userId: string) {
  const [opportunitySnap, accessRows] = await Promise.all([
    adminDb.collection(CRM_COLLECTIONS.opportunities).doc(opportunityId).get(),
    adminDb
      .collection(CRM_COLLECTIONS.opportunityAccess)
      .where("opportunityId", "==", opportunityId)
      .where("userId", "==", userId)
      .limit(5)
      .get(),
  ])
  if (!opportunitySnap.exists) return null
  const opportunityData = opportunitySnap.data() as Record<string, unknown>
  const opportunity = {
    ownerId: String(opportunityData.ownerId || ""),
    readUserIds: Array.isArray(opportunityData.readUserIds) ? (opportunityData.readUserIds as string[]) : [],
    editUserIds: Array.isArray(opportunityData.editUserIds) ? (opportunityData.editUserIds as string[]) : [],
  }
  const explicitPermissions = accessRows.docs.map((row) => String(row.data().permission || "VIEW"))
  if (!hasOpportunityViewAccess(opportunity, userId, explicitPermissions as ("VIEW" | "EDIT")[])) return null
  return { ownerId: opportunity.ownerId }
}

export async function GET(_request: NextRequest, context: { params: Promise<{ fileId: string }> }) {
  try {
    const session = await requireRole(["admin", "dispecer", "tehnician"], _request)
    if (!session.uid) {
      return NextResponse.json({ error: "Sesiune invalidă sau expirată." }, { status: 401 })
    }
    const userId = session.uid
    const { fileId: rawId } = await context.params
    const fileId = decodeURIComponent(String(rawId || "").trim())
    if (!fileId) {
      return NextResponse.json({ error: "fileId lipsă" }, { status: 400 })
    }

    const fileSnap = await adminDb.collection(CRM_COLLECTIONS.files).doc(fileId).get()
    if (!fileSnap.exists) {
      return NextResponse.json({ error: "Fișier inexistent" }, { status: 404 })
    }
    const fileRow = mapFileFromFirestore(fileSnap.id, fileSnap.data() as Record<string, unknown>)
    const opportunityId = fileRow.opportunityId

    const opportunityAccess = await getOpportunityWithViewAccess(opportunityId, userId)
    if (!opportunityAccess) {
      return NextResponse.json({ error: "Oportunitatea nu există sau nu ai acces la ea." }, { status: 404 })
    }

    const visibleToSnap = await adminDb
      .collection(CRM_COLLECTIONS.visibleTo)
      .where("entityType", "==", "FILE")
      .where("opportunityId", "==", opportunityId)
      .get()

    const customVisibleRows: CrmVisibleTo[] = visibleToSnap.docs
      .map((d) => {
        const x = d.data() as Record<string, unknown>
        if (String(x.entityId || "") !== fileRow.id) return null
        return { id: d.id, ...x } as CrmVisibleTo
      })
      .filter((x): x is CrmVisibleTo => Boolean(x))

    const canView = canViewByVisibility({
      visibility: fileRow.visibility,
      creatorId: fileRow.uploadedById,
      userId,
      opportunityOwnerId: opportunityAccess.ownerId,
      visibleToUserIds: fileRow.visibleToUserIds,
      customVisibleRows,
    })
    if (!canView) {
      return NextResponse.json({ error: "Nu ai acces la acest fișier." }, { status: 403 })
    }

    const storagePath =
      fileRow.storagePath ||
      (fileRow.url
        ? (() => {
            const parsed = parseFirebaseStorageObject(fileRow.url)
            return parsed ? parsed.objectPath : ""
          })()
        : "")

    if (!storagePath) {
      return NextResponse.json({ error: "Cale Storage lipsă pentru fișier" }, { status: 500 })
    }

    const envBucket = String(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "").trim()
    const storage = getStorage(adminApp)
    const bucket = envBucket ? storage.bucket(envBucket) : storage.bucket()
    const fileRef = bucket.file(storagePath)
    const [exists] = await fileRef.exists()
    if (!exists) {
      return NextResponse.json({ error: "Fișierul nu există în Storage" }, { status: 404 })
    }

    const safeName = asciiDownloadFilename(fileRow.filename)
    const disposition = `attachment; filename="${safeName}"`

    const [signedUrl] = await fileRef.getSignedUrl({
      action: "read",
      version: "v4",
      expires: Date.now() + 10 * 60 * 1000,
      responseDisposition: disposition,
    })

    return NextResponse.redirect(signedUrl, 302)
  } catch (error: unknown) {
    if (error instanceof RequireRoleError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    logFirestoreIndexHintIfPresent(error, "GET /api/crm/files/[fileId]/download")
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Eroare la descărcare" },
      { status: 500 }
    )
  }
}
