import type { Firestore } from "firebase-admin/firestore";
import {
  OFFLINE_ACCESS_MS,
  type OfflineTicketGrant,
} from "@/packages/fom-domain";
import { MobileAccessError } from "./access";
/** Issued only alongside a server-authorized ticket download. No extra mobile request. */
export async function issueDraftGrant(
  db: Firestore,
  uid: string,
  sessionId: string,
  workIds: string[],
): Promise<OfflineTicketGrant> {
  return db.runTransaction(async (tx) => {
    const session = await tx.get(db.doc(`attendance/${sessionId}`));
    if (
      session.data()?.userId !== uid ||
      session.data()?.status !== "active" ||
      session.data()?.sessionEnd
    )
      throw new MobileAccessError(
        "Pontează-te pentru a continua.",
        "MOBILE_ATTENDANCE_REQUIRED",
      );
    const confirmedAt = Date.now(),
      grant = {
        sessionId,
        confirmedAt,
        expiresAt: confirmedAt + OFFLINE_ACCESS_MS,
      };
    tx.set(db.doc(`mobileDraftAccess/${uid}`), { ...grant, workIds });
    return grant;
  });
}
