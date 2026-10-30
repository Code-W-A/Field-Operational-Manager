import {
  FieldValue,
  type Firestore,
  type Transaction,
} from "firebase-admin/firestore";
import {
  assertOfflineTime,
  assertOfflineWorkEvent,
  soleTechnician,
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
/** All reads happen before the caller writes. The returned closure shares its transaction. */
export async function prepareOfflineWork(
  db: Firestore,
  tx: Transaction,
  uid: string,
  name: string,
  work: any,
  command: Command,
) {
  const event = command.offlineWork!;
  assertOfflineWorkEvent(event);
  const at = Date.parse(command.occurredAt);
  const grant = (
    await tx.get(db.doc(`mobileOfflineGrants/${uid}/grants/${event.grantId}`))
  ).data();
  check(
    grant?.phase2 === true &&
      grant.sessionId === command.attendanceId &&
      grant.workIds.includes(command.entityId),
    "Confirmarea offline nu permite această lucrare.",
  );
  check(
    soleTechnician(work, uid, name),
    "Pornirea offline necesită atribuirea exclusivă; echipa s-a schimbat.",
  );
  check(
    !work.anulat &&
      !work.raportGenerat &&
      !work.raportDataLocked &&
      !["Finalizat", "Anulat", "Anulată", "Arhivată", "Amânată"].includes(
        work.statusLucrare,
      ),
    "Tichetul nu mai permite reconcilierea offline.",
  );
  const attendance = (
    await tx.get(db.doc(`attendance/${command.attendanceId}`))
  ).data();
  check(
    attendance?.userId === uid &&
      ms(attendance.sessionStart) <= at &&
      (!attendance.sessionEnd || ms(attendance.sessionEnd) >= at),
    "Intervalul nu se află în pontajul confirmat.",
  );
  const root = db.doc(`mobileOfflineWork/${uid}`),
    ref = root.collection("sessions").doc(event.sessionId);
  const lock = (await tx.get(root)).data();
  const old = (await tx.get(ref)).data();
  const others = await tx.get(
    root
      .collection("sessions")
      .where("startedAt", ">=", grant.confirmedAt - 86400000),
  );
  const start = event.event === "start" ? at : old?.startedAt;
  try {
    assertOfflineTime(
      start,
      event.event === "stop" ? at : null,
      grant as any,
      Date.now(),
      event.clockDriftMs,
    );
  } catch (error) {
    throw new TechnicianError((error as Error).message, 409);
  }
  if (event.event === "start") {
    check(
      !work.equipmentVerified &&
        !(
          work.tipLucrare === "Revizie" &&
          work.revisionEquipmentTimes?.[command.payload.equipmentId]?.startIso
        ),
      "Echipamentul este deja pornit; continuă fișa existentă.",
    );
    check(
      !old,
      "Sesiunea de lucru există deja; verifică confirmarea inițială.",
    );
    check(
      !lock?.activeSessionId,
      "Există un alt interval activ pe acest cont.",
    );
    let expected = command.baseVersion;
    if (command.predecessorId) {
      const prior = (
        await tx.get(db.doc(`mobileCommands/${uid}_${command.predecessorId}`))
      ).data();
      const priorCommand = prior?.fingerprint
        ? JSON.parse(prior.fingerprint)
        : null;
      check(
        priorCommand?.entityId === command.entityId &&
          priorCommand?.offlineWork?.event === "stop" &&
          priorCommand?.offlineWork?.deviceId === event.deviceId &&
          prior?.result?.version,
        "Oprirea precedentă nu este confirmată.",
      );
      expected = prior.result.version;
    }
    check(
      versionOf(work) === expected,
      "Tichetul s-a modificat de la descărcare.",
    );
    const installation = (
      await tx.get(db.doc(`installationTechnicianSessions/${uid}`))
    ).data();
    check(!installation, "Ai deja o fișă de instalare activă.");
  } else {
    check(
      old &&
        old.workId === command.entityId &&
        old.deviceId === event.deviceId &&
        old.grantId === event.grantId &&
        old.attendanceId === command.attendanceId,
      "Pornirea corespunzătoare nu este confirmată.",
    );
    check(
      lock?.activeSessionId === event.sessionId && old.endedAt == null,
      "Intervalul nu mai este activ.",
    );
    check(
      old.equipmentId === command.payload.equipmentId ||
        command.payload.sheetId === old.sheetId,
      "Oprirea aparține altui echipament.",
    );
  }
  const assigned = await tx.get(
    db.collection("lucrari").where("technicianIds", "array-contains", uid),
  );
  const legacy = name
    ? await tx.get(
        db.collection("lucrari").where("tehnicieni", "array-contains", name),
      )
    : null;
  const related = [
    ...new Map(
      [...assigned.docs, ...(legacy?.docs || [])].map((d) => [d.id, d]),
    ).values(),
  ];
  const until = event.event === "stop" ? at : start;
  for (const doc of related) {
    const other = doc.data();
    if (doc.id === command.entityId) continue;
    if (other.installation) {
      const sheets = await tx.get(
        doc.ref
          .collection("installationSheets")
          .where("participantUids", "array-contains", uid),
      );
      for (const sheet of sheets.docs)
        check(
          !(sheet.data().timeIntervals || []).some(
            (i: any) =>
              i.uid === uid &&
              ms(i.startedAt) <= until &&
              (!i.endedAt || ms(i.endedAt) > start),
          ),
          "Intervalul se suprapune cu o instalare.",
        );
    } else {
      const times =
        other.tipLucrare === "Revizie"
          ? Object.values(other.revisionEquipmentTimes || {}).map((t: any) => [
              t.startIso,
              t.endIso,
            ])
          : [[other.timpSosire, other.timpPlecare]];
      check(
        !times.some(([a, b]) => a && ms(a) <= until && (!b || ms(b) > start)),
        "Intervalul se suprapune cu altă lucrare confirmată.",
      );
    }
  }
  check(
    !others.docs.some(
      (d) =>
        d.id !== event.sessionId &&
        d.data().startedAt <= (event.event === "stop" ? at : start) &&
        (d.data().endedAt == null || d.data().endedAt > start),
    ),
    "Intervalul se suprapune cu altă lucrare.",
  );
  return (sheetId?: string) => {
    if (event.event === "start") {
      tx.create(ref, {
        workId: command.entityId,
        equipmentId: command.payload.equipmentId,
        sheetId: sheetId || "",
        deviceId: event.deviceId,
        grantId: event.grantId,
        attendanceId: command.attendanceId,
        startedAt: at,
        endedAt: null,
        receivedAt: FieldValue.serverTimestamp(),
      });
      tx.set(root, {
        activeSessionId: event.sessionId,
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else {
      tx.update(ref, {
        endedAt: at,
        durationSeconds: (at - start) / 1000,
        stoppedReceivedAt: FieldValue.serverTimestamp(),
      });
      tx.set(root, {
        activeSessionId: null,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  };
}
