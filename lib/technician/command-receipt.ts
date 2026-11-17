import { createHash } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { DomainError, FOM_CONTRACT_VERSION } from "../../packages/fom-domain";

/** Identity is supplied by the authenticated route, never by a query parameter. */
export async function attendanceReceipt(db: Firestore, uid: string, mutationId: string) {
  if (!/^[a-zA-Z0-9_-]{1,160}$/.test(mutationId)) throw new DomainError("Identificator invalid.");
  const row = await db.collection("mobileCommands").doc(`${uid}_${mutationId}`).get();
  const base = { contractVersion: FOM_CONTRACT_VERSION, mutationId };
  if (!row.exists) return { ...base, state: "absent" as const };
  const data = row.data()!;
  let command;
  try { command = JSON.parse(data.fingerprint); } catch { throw new DomainError("Confirmare incompatibilă."); }
  if (data.uid !== uid || command.mutationId !== mutationId ||
      !["attendance.start", "attendance.stop", "attendance.extra"].includes(command.action))
    throw new DomainError("Confirmare incompatibilă.");
  return { ...base, state: "confirmed" as const,
    commandDigest: createHash("sha256").update(data.fingerprint).digest("hex") };
}
