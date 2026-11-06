import type { Firestore, Transaction } from "firebase-admin/firestore";
import {
  assertOfflineStopEvent,
  assertOfflineStopTime,
  sameStopIntervals,
  soleTechnician,
  stopIntervals,
  versionOf,
  type Command,
} from "@/packages/fom-domain";
import { TechnicianError } from "@/lib/technician/errors";
const ms = (v: any) =>
  typeof v?.toMillis === "function"
    ? v.toMillis()
    : typeof v === "number"
      ? v
      : Date.parse(v);
function check(ok: unknown, message: string): asserts ok {
  if (!ok) throw new TechnicianError(message, 409);
}

/** Validates only a historical stop; official starts remain the source of truth. No writes. */
export async function validateOfflineStop(
  db: Firestore,
  tx: Transaction,
  uid: string,
  name: string,
  work: any,
  c: Command,
  sheet?: any,
) {
  const event = c.offlineStop!;
  assertOfflineStopEvent(event);
  check(
    !c.offlineWork &&
      (c.action === "work.stop" ||
        (c.action === "installation" && c.payload.action === "stop")),
    "Acțiune nepermisă.",
  );
  const grant = (
    await tx.get(db.doc(`mobileOfflineGrants/${uid}/grants/${event.grantId}`))
  ).data();
  check(
    grant?.stopForSigning === true &&
      (c.payload.deferFields !== true || grant.installationStopWithoutDraft === true) &&
      grant.sessionId === c.attendanceId &&
      grant.workIds?.includes(c.entityId),
    "Confirmarea offline nu permite oprirea acestei lucrări.",
  );
  check(
    soleTechnician(work, uid, name),
    "Oprirea locală necesită atribuirea exclusivă; echipa s-a schimbat.",
  );
  check(
    !work.anulat &&
      !work.raportGenerat &&
      !work.raportDataLocked &&
      !["Finalizat", "Anulată", "Anulat", "Arhivată", "Amânată"].includes(
        work.statusLucrare,
      ),
    "Tichetul nu mai permite oprirea.",
  );
  check(
    versionOf(work) === c.baseVersion,
    "Tichetul s-a modificat. Oprirea și ciorna sunt păstrate pentru verificare.",
  );
  if (sheet)
    check(
      sheet.principalUid === uid &&
        (sheet.participants || [])
          .filter((p: any) => p.active)
          .every((p: any) => p.uid === uid) &&
        event.intervals.every((i) => i.uid === uid),
      "Fișa are alți participanți activi.",
    );
  check(
    sameStopIntervals(stopIntervals(work, sheet), event.intervals),
    "Intervalul oficial a fost oprit sau modificat pe alt dispozitiv.",
  );
  const at = Date.parse(c.occurredAt);
  try {
    assertOfflineStopTime(event, at, grant as any, Date.now());
  } catch (e) {
    throw new TechnicianError((e as Error).message, 409);
  }
  const attendance = (
    await tx.get(db.doc(`attendance/${c.attendanceId}`))
  ).data();
  check(
    attendance?.userId === uid &&
      ms(attendance.sessionStart) <= at &&
      (!attendance.sessionEnd || ms(attendance.sessionEnd) >= at),
    "Oprirea nu se află în pontajul confirmat.",
  );
}
