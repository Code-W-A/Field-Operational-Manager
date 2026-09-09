export type HrNotificationEvent = "created" | "status_changed" | "updated"

export class HrNotificationRequestError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export function parseHrNotificationPayload(body: unknown): {
  requestId: string
  event: HrNotificationEvent
} {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new HrNotificationRequestError("Payload invalid.", 400)
  }
  const row = body as Record<string, unknown>
  const keys = Object.keys(row)
  if (keys.some((key) => key !== "requestId" && key !== "event")) {
    throw new HrNotificationRequestError("Payload invalid.", 400)
  }
  if (typeof row.requestId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(row.requestId)) {
    throw new HrNotificationRequestError("Payload invalid.", 400)
  }
  if (row.event !== "created" && row.event !== "status_changed" && row.event !== "updated") {
    throw new HrNotificationRequestError("Payload invalid.", 400)
  }
  return { requestId: row.requestId, event: row.event }
}

export function authorizeHrNotification(params: {
  actorUid: string
  actorRole: string
  event: HrNotificationEvent
  request: Record<string, unknown>
}) {
  const requesterUid = String(params.request.requesterUid || "")
  const managerUid = String(params.request.managerUid || "")
  const status = String(params.request.status || "")

  if (params.actorRole === "dispecer") {
    throw new HrNotificationRequestError("Politica acestui rol nu este confirmată.", 403)
  }

  if (params.event === "created") {
    if (status !== "pending") {
      throw new HrNotificationRequestError("Eveniment incompatibil cu starea cererii.", 409)
    }
    if (params.actorUid !== requesterUid || (params.actorRole !== "tehnician" && params.actorRole !== "admin")) {
      throw new HrNotificationRequestError("Nu ai permisiune pentru această notificare.", 403)
    }
    return
  }

  if (params.event === "updated") {
    if (params.actorRole === "admin") return
    if (params.actorRole === "tehnician" && params.actorUid === managerUid) return
    throw new HrNotificationRequestError("Nu ai permisiune pentru această notificare.", 403)
  }

  if (status !== "approved" && status !== "rejected") {
    throw new HrNotificationRequestError("Eveniment incompatibil cu starea cererii.", 409)
  }
  if (params.actorRole === "admin") return
  if (params.actorRole === "tehnician" && params.actorUid === managerUid) return
  throw new HrNotificationRequestError("Nu ai permisiune pentru această notificare.", 403)
}
