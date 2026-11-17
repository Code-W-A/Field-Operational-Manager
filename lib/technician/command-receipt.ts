import { createHash } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import {
  DomainError,
  FOM_CONTRACT_VERSION,
  type AttendanceReceipt,
} from "../../packages/fom-domain";

const validId = (value: string) => /^[a-zA-Z0-9_-]{1,160}$/.test(value);
const time = (value: any): number =>
  value?.toMillis
    ? value.toMillis()
    : typeof value === "number"
      ? value
      : typeof value === "string"
        ? Date.parse(value)
        : NaN;

/** Identity is supplied by the authenticated route, never by a query parameter.
 * Additional session evidence never asserts that an absent command succeeded. */
export async function attendanceReceipt(
  db: Firestore,
  uid: string,
  mutationId: string,
  context?: { action: string; attendanceId: string },
): Promise<AttendanceReceipt> {
  if (
    !validId(mutationId) ||
    (context &&
      (context.action !== "attendance.stop" || !validId(context.attendanceId)))
  )
    throw new DomainError("Identificator sau acțiune invalidă.");
  const base = { contractVersion: FOM_CONTRACT_VERSION, mutationId };
  return db.runTransaction(
    async (tx) => {
      const row = await tx.get(
        db.collection("mobileCommands").doc(`${uid}_${mutationId}`),
      );
      if (row.exists) {
        const data = row.data()!;
        let command;
        try {
          command = JSON.parse(data.fingerprint);
        } catch {
          throw new DomainError("Confirmare incompatibilă.");
        }
        if (
          data.uid !== uid ||
          command.mutationId !== mutationId ||
          !["attendance.start", "attendance.stop", "attendance.extra"].includes(
            command.action,
          ) ||
          (context &&
            (command.action !== context.action ||
              command.entityId !== context.attendanceId))
        )
          throw new DomainError("Confirmare incompatibilă.");
        return {
          ...base,
          state: "confirmed" as const,
          commandDigest: createHash("sha256")
            .update(data.fingerprint)
            .digest("hex"),
        };
      }
      if (!context) return { ...base, state: "absent" as const };
      const [session, lock] = await Promise.all([
        tx.get(db.collection("attendance").doc(context.attendanceId)),
        tx.get(db.collection("attendanceActiveSessions").doc(uid)),
      ]);
      const s = session.data(),
        l = lock.data();
      if ((s && s.userId !== uid) || (l && l.userId !== uid))
        throw Object.assign(new DomainError("Sesiune inaccesibilă."), {
          status: 403,
        });
      const checkedAt = new Date().toISOString();
      const start = time(s?.sessionStart),
        end = time(s?.sessionEnd);
      const activeId = l?.activeSessionId;
      const lockValid =
        !l ||
        activeId === null ||
        (typeof activeId === "string" && validId(activeId));
      const closed =
        !!s &&
        s.status === "completed" &&
        Number.isFinite(start) &&
        Number.isFinite(end) &&
        end >= start &&
        end <= Date.parse(checkedAt) &&
        lockValid &&
        activeId !== context.attendanceId;
      return {
        ...base,
        state: "absent" as const,
        session: {
          attendanceId: context.attendanceId,
          state: !s
            ? "missing"
            : closed
              ? "closed"
              : s.status === "active" && !s.sessionEnd
                ? "active"
                : "inconsistent",
          sessionEnd: Number.isFinite(end) ? new Date(end).toISOString() : null,
          activeSessionId: typeof activeId === "string" ? activeId : null,
          checkedAt,
        },
      };
    },
    { readOnly: true },
  );
}
