import { AMBIGUOUS_ATTENDANCE_HR } from "@/packages/fom-domain/attendance-hr";
import { attendanceSpecialDay } from "@/packages/fom-domain/attendance-policy";
import { photoIdentity } from "./photo-identity";
import {
  FieldValue,
  Timestamp,
  type Firestore,
  type Transaction,
} from "firebase-admin/firestore";
import {
  assigned,
  validateProducts,
  validateReportSignatures,
  postponeReason,
  readInstallation,
  visibleWork,
  versionOf,
  assertCommand,
  interventionPatch,
  checklistFromSettings,
  validateRevision,
  emptyBundle,
  revisionEquipmentIds,
  equipmentFor,
  failureCauses,
  type Actor,
  type Command,
  type RecordData,
  type Bundle,
} from "@/packages/fom-domain";
import { verifyQr } from "@/lib/installations/validation";
import { installationService } from "@/lib/installations/service";
import { resolveDocumentClientSnapshot } from "@/lib/work-documents/document-client-snapshot";
import { resolveTicketLocation } from "@/firebase-functions/src/client-ticket-sync";
import { resolveTicketLiveDisplay } from "@/lib/work-documents/ticket-live-display";
import { validateHrRequestCreateInput } from "@/lib/hr/request-validation";
import { isValidOvertimeDuration } from "@/lib/hr/overtime-duration";
import { buildAttendanceTimesheetCell } from "@/lib/attendance/sync-timesheet-merge";
import { buildAttendanceEntriesFromSessions } from "@/lib/attendance/sync-timesheet-entries";
import { finalizeOpenExtraTimeLogs } from "@/lib/attendance/extra-time-state";
import {
  AUTO_CHECKOUT_ENABLED,
  timeOnSameDayMs,
  clampSessionEndMs,
} from "@/lib/attendance/auto-pontaj-schedule";
import {
  calculateDuration,
  formatDate,
  formatTime,
} from "@/lib/utils/time-format";

export class TechnicianError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
function check(
  condition: unknown,
  message: string,
  status = 400,
): asserts condition {
  if (!condition) throw new TechnicianError(message, status);
}
export function serial(value: any): any {
  if (value?.toDate) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serial);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, serial(v)]),
    );
  return value;
}
/** Firestore accepts dotted updates; clients receive the actual resulting document shape. */
function documentAfterPatch(work: RecordData, patch: RecordData): RecordData {
  let result = serial(work);
  const put = (value: RecordData, path: string[], next: unknown): RecordData => {
    const [key, ...rest] = path;
    return { ...value, [key]: rest.length ? put(value?.[key] || {}, rest, next) : next };
  };
  for (const [key, value] of Object.entries(serial(patch))) result = put(result, key.split("."), value);
  return result;
}
const rows = (snap: any): (RecordData & {id: string})[] =>
  snap.docs.map((d: any) => ({ ...d.data(), id: d.id }));
const millis = (v: any) =>
  v?.toMillis
    ? v.toMillis()
    : typeof v === "string"
      ? Date.parse(v)
      : Number(v);
const id = (v: any) => {
  check(
    typeof v === "string" && /^[\w-]{1,160}$/.test(v),
    "Identificator invalid.",
  );
  return v as string;
};
const localDay = (ms: number) =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Bucharest",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));
const localTime = (ms: number) =>
  new Intl.DateTimeFormat("ro-RO", {
    timeZone: "Europe/Bucharest",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(ms));

export function technicianService(db: Firestore) {
  const workRef = (workId: string) => db.collection("lucrari").doc(id(workId));
  async function actor(uid: string): Promise<Actor> {
    const user = (await db.collection("users").doc(id(uid)).get()).data();
    check(
      user && user.role === "tehnician" && user.disabled !== true,
      "Acces exclusiv pentru tehnicieni.",
      403,
    );
    if (user.displayName) {
      const matches = await db
        .collection("users")
        .where("displayName", "==", user.displayName)
        .get();
      check(
        matches.docs.filter((d) => d.data().role === "tehnician").length === 1,
        "Numele tehnicianului este ambiguu.",
        403,
      );
    }
    return {
      uid,
      role: user.role,
      displayName: String(user.displayName || ""),
    };
  }
  async function bundle(uid: string): Promise<Bundle> {
    const a = await actor(uid);
    const [
      legacy,
      byUid,
      att,
      requests,
      employees,
      procedures,
      settings,
      departments,
    ] = await Promise.all([
      a.displayName
        ? db
            .collection("lucrari")
            .where("tehnicieni", "array-contains", a.displayName)
            .get()
        : Promise.resolve({ docs: [] }),
      db
        .collection("lucrari")
        .where("technicianIds", "array-contains", uid)
        .get(),
      db.collection("attendance").where("userId", "==", uid).get(),
      db.collection("hrRequests").where("requesterUid", "==", uid).get(),
      db.collection("hrEmployees").where("userUid", "==", uid).get(),
      db.collection("note-interne").get(),
      db.collection("settings").get(),
      db.collection("hrDepartments").get(),
    ]);
    // HR ambiguity blocks HR writes, not access to assigned field work.
    const employeeAssociationError = employees.docs.length > 1
      ? AMBIGUOUS_ATTENDANCE_HR
      : undefined;
    const works = [
      ...new Map(
        [...rows(legacy), ...rows(byUid)].map((w) => [w.id, w]),
      ).values(),
    ].filter((w) => visibleWork(w, a));
    works.forEach((w) => {
      const snap = [...legacy.docs, ...byUid.docs].find((d) => d.id === w.id);
      w.mobileVersion =
        versionOf(w) || versionOf({ updatedAt: snap?.updateTime });
    });
    const clients: (RecordData & {id: string})[] = [];
    for (const w of works) {
      const clientId = w.clientId || w.clientInfo?.id;
      let client: RecordData | undefined;
      if (clientId) {
        const s = await db.collection("clienti").doc(id(clientId)).get();
        if (s.exists) client = { ...s.data(), id: s.id };
      } else if (w.client) {
        const s = await db
          .collection("clienti")
          .where("nume", "==", w.client)
          .limit(2)
          .get();
        if (s.size === 1) client = rows(s)[0];
      }
      if (client) {
        // Export only ticket-related locations/equipment; no customer-wide account metadata.
        const display = resolveTicketLiveDisplay(w, client);
        w.mobileContact = serial(display.contact);
        const location = resolveTicketLocation(client, w);
        w.mobileEquipment = equipmentFor(w, location);
        w.mobileContact = {
          ...w.mobileContact,
          address: location?.adresa || w.locatie,
          ...(location?.lat !== undefined
            ? { lat: location.lat, lng: location.lng }
            : {}),
        };
        const locations = (client.locatii || []).filter(
          (l: any) => l.id === w.locationId || l.nume === w.locatie,
        );
        clients.push({ id: client.id, nume: client.nume, locatii: locations });
      }
    }
    const b: Bundle = {
      ...emptyBundle(),
      works: works as any,
      clients,
      attendance: rows(att),
      requests: rows(requests),
      employee: employees.docs.length === 1 ? rows(employees)[0] : null,
      ...(employeeAssociationError ? { employeeAssociationError } : {}),
      procedures: rows(procedures),
      settings: rows(settings),
      departments: rows(departments),
      attendanceSettings: {
        defaults:
          (await db.collection("hrSettings").doc("defaults").get()).data() ||
          {},
        holidays: rows(await db.collection("hrHolidays").get()).flatMap(
          (h) => h.items || [],
        ),
      },
      downloadedAt: new Date().toISOString(),
    };
    for (const w of works) {
      if (w.tipLucrare === "Revizie")
        b.revisions[w.id] = rows(
          await workRef(w.id).collection("revisions").get(),
        );
      if (w.installation?.schemaVersion === 1)
        b.installations[w.id] = readInstallation(serial(await installationService(db).list(a, w.id)));
    }
    return serial(b);
  }
  async function history(uid: string, code: string) {
    await actor(uid);
    check(code.length > 0 && code.length < 200, "Cod invalid.");
    const snap = await db
      .collection("lucrari")
      .where("echipamentCod", "==", code)
      .get();
    return serial(
      rows(snap)
        .filter((w) => w.raportGenerat)
        .map((w) => ({
          id: w.id,
          client: w.client,
          locatie: w.locatie,
          dataInterventie: w.dataInterventie,
          tipLucrare: w.tipLucrare,
          constatareLaLocatie: w.constatareLaLocatie,
          descriereInterventie: w.descriereInterventie,
          numarRaport: w.numarRaport,
          statusEchipament: w.statusEchipament,
        })),
    );
  }
  async function command(uid: string, c: Command, channel: "web" | "mobile" = "mobile") {
    try {
      assertCommand(c);
    } catch (e) {
      throw new TechnicianError((e as Error).message);
    }
    const a = await actor(uid);
    const occurred = Date.parse(c.occurredAt);
    check(occurred <= Date.now() + 300000, "Momentul acțiunii este în viitor.");
    const receipt = db
      .collection("mobileCommands")
      .doc(`${uid}_${c.mutationId}`);
    const previous = await receipt.get();
    if (previous.exists) {
      check(
        previous.data()?.fingerprint === JSON.stringify(c),
        "Identificator reutilizat pentru altă comandă.",
        409,
      );
      return previous.data()!.result;
    }
    if (c.action === "installation") {
      const svc = installationService(db),
        p: RecordData = { ...c.payload, requestId: c.mutationId };
      if (channel === "mobile" && p.action !== "sign")
        await db.runTransaction((tx) => requireAttendance(tx, a, c, occurred));
      if (c.predecessorId) {
        const previous = (
          await db
            .collection("mobileCommands")
            .doc(`${uid}_${id(c.predecessorId)}`)
            .get()
        ).data();
        check(
          previous &&
            previous.fingerprint &&
            JSON.parse(previous.fingerprint).entityId === c.entityId,
          "Comanda anterioară nu este confirmată.",
          409,
        );
        if (previous.result?.sheet?.id === p.sheetId)
          p.revision = previous.result.sheet.revision;
      }
      const actions: Record<string, () => Promise<any>> = {
        start: () => svc.start(a, c.entityId, p),
        removePhoto: () =>
          svc.attachPhoto(a, c.entityId, p.sheetId, { id: p.photoId }, true),
        save: () => svc.save(a, c.entityId, p),
        close: () => svc.save(a, c.entityId, p, true),
        stop: () => svc.stop(a, c.entityId, p),
        sign: () => svc.sign(a, c.entityId, p),
        continue: () => svc.continueWork(a, c.entityId),
        complete: () => svc.complete(a, c.entityId, p),
      };
      check(actions[p.action], "Acțiune de instalare invalidă.");
      const result = serial(await actions[p.action]());
      await receipt.set({
        uid,
        fingerprint: JSON.stringify(c),
        result,
        createdAt: FieldValue.serverTimestamp(),
      });
      return result;
    }
    return db.runTransaction(async (tx) => {
      const receiptSnap = await tx.get(receipt);
      if (receiptSnap.exists) {
        check(
          receiptSnap.data()?.fingerprint === JSON.stringify(c),
          "Identificator reutilizat.",
          409,
        );
        return receiptSnap.data()!.result;
      }
      const user = await tx.get(db.collection("users").doc(uid));
      check(
        user.data()?.role === "tehnician" && user.data()?.disabled !== true,
        "Profil invalid.",
        403,
      );
      let result: RecordData = {};
      if (c.action.startsWith("attendance."))
        result = await attendance(tx, a, c, occurred);
      else if (c.action === "request.create") result = await request(tx, a, c);
      else {
        const ref = workRef(c.entityId),
          snap = await tx.get(ref),
          w = snap.data();
        check(w, "Tichet inexistent.", 404);
        check(assigned(w, a), "Tichetul nu îți mai este atribuit.", 403);
        if (c.action === "notification.read") {
          tx.update(ref, { notificationReadBy: FieldValue.arrayUnion(uid) });
          result = { id: snap.id };
        } else {
          check(
            !w.installation?.schemaVersion,
            "Folosește fluxul de instalare.",
          );
          check(
            !w.raportDataLocked &&
              !["Anulată", "Arhivată", "Amânată"].includes(w.statusLucrare),
            "Tichetul nu mai permite modificări.",
            409,
          );
          let expected = c.baseVersion;
          if (c.predecessorId) {
            const prior = await tx.get(
              db
                .collection("mobileCommands")
                .doc(`${uid}_${id(c.predecessorId)}`),
            );
            check(
              prior.exists && prior.data()?.result?.id === c.entityId,
              "Comanda anterioară nu este confirmată.",
              409,
            );
            expected = prior.data()!.result.version;
          }
          check(
            (versionOf(w) || versionOf({ updatedAt: snap.updateTime })) ===
              expected,
            "Tichetul a fost modificat. Ciorna este păstrată.",
            409,
          );
          if (channel === "mobile" && c.action !== "postpone")
            await requireAttendance(tx, a, c, occurred);
          const settings = rows(await tx.get(db.collection("settings")));
          const validatedPhotos = await validatePhotos(tx, a, c, w);
          const now = Timestamp.now(),
            patch: RecordData = {};
          if (c.action === "verify") {
            const equipment = await resolveEquipmentTx(
              tx,
              w,
              c.payload.equipmentId,
            );
            check(
              equipment.code && equipment.code === String(c.payload.code),
              "Codul QR nu corespunde echipamentului.",
            );
            verifyQr(
              c.payload.qrRaw || String(c.payload.code),
              equipment as any,
              String(w.client || ""),
              String(w.locatie || ""),
            );
            if (w.tipLucrare !== "Revizie") {
              const [byName, byUid] = await Promise.all([
                a.displayName ? tx.get(db.collection("lucrari").where("tehnicieni", "array-contains", a.displayName)) : Promise.resolve({ docs: [] }),
                tx.get(db.collection("lucrari").where("technicianIds", "array-contains", a.uid)),
              ]);
              check(
                ![...byName.docs, ...byUid.docs].some(d => d.id !== snap.id && d.data().statusLucrare === "În lucru" && !d.data().installation?.schemaVersion && !d.data().raportGenerat && !d.data().timpPlecare && !d.data().anulat),
                "Ai deja o intervenție în lucru.", 409,
              );
              Object.assign(patch, {
                equipmentVerified: true,
                equipmentVerifiedAt: w.equipmentVerifiedAt || c.occurredAt,
                equipmentVerifiedBy: uid,
                statusLucrare: ["Listată", "Atribuită"].includes(w.statusLucrare) ? "În lucru" : w.statusLucrare,
                timpSosire: w.timpSosire || c.occurredAt,
                dataSosire: w.dataSosire || formatDate(new Date(occurred)),
                oraSosire: w.oraSosire || formatTime(new Date(occurred)),
              });
            } else {
              const priorTime = w.revisionEquipmentTimes?.[equipment.id] || {};
              const revisionRef = ref.collection("revisions").doc(equipment.id);
              const revisionBeforeQr = await tx.get(revisionRef);
              tx.set(revisionRef, { ...(!revisionBeforeQr.exists ? { createdAt: now } : {}), equipmentId: equipment.id, equipmentName: equipment.name, qrVerified: true, qrVerifiedAt: priorTime.verifiedAt || c.occurredAt, qrVerifiedBy: uid, updatedAt: now }, { merge: true });
              Object.assign(patch, {
                [`revisionEquipmentTimes.${equipment.id}`]: {
                  ...priorTime,
                  startIso: priorTime.startIso || c.occurredAt,
                  verifiedAt: priorTime.verifiedAt || c.occurredAt,
                  verifiedBy: uid,
                },
                [`revision.equipmentStatus.${equipment.id}`]: "in_progress",
                ...(!w.timpSosire
                  ? {
                      timpSosire: c.occurredAt,
                      dataSosire: formatDate(new Date(occurred)),
                      oraSosire: formatTime(new Date(occurred)),
                    }
                  : {}),
              });
            }
          } else if (c.action === "postpone") {
            check(
              String(c.payload.motivAmanare || "").trim().length >= 10,
              "Motivul trebuie să aibă minimum 10 caractere.",
            );
            Object.assign(patch, {
              statusLucrare: "Amânată",
              motivAmanare: postponeReason(c.payload.motivAmanare),
              dataAmanare: new Date(occurred).toLocaleString("ro-RO", {
                timeZone: "Europe/Bucharest",
              }),
              amanataDe: a.displayName,
              tehnicieni: [],
              ...(w.technicianIds ? { technicianIds: [] } : {}),
              updatedBy: a.displayName,
            });
          } else if (c.action === "revision.save") {
            const eq = await resolveEquipmentTx(tx, w, c.payload.equipmentId);
            const time = w.revisionEquipmentTimes?.[eq.id];
            check(
              time?.verifiedAt || time?.startIso,
              "Verifică QR-ul acestui echipament.",
            );
            const existing = await tx.get(
              ref.collection("revisions").doc(eq.id),
            );
            const expectedSections =
              (Array.isArray(existing.data()?.sections) && existing.data()!.sections.length ? existing.data()!.sections : undefined) ||
              (eq.rootId ? checklistFromSettings(settings, eq.rootId) : []);
            const sections = validateRevision(
              c.payload.sections,
              expectedSections,
              { draft: c.payload.draft === true, customItems: true },
            );
            const minutes = Math.max(
              0,
              Math.floor(
                (occurred - Date.parse(time.startIso || time.verifiedAt)) /
                  60000,
              ),
            );
            const revision: RecordData = {
              equipmentId: eq.id,
              equipmentName: eq.name,
              sections,
              finalObservations: String(c.payload.finalObservations || ""),
              overallState: c.payload.draft ? FieldValue.delete() : sections.every((s) =>
                s.items.every((i) => i.state === "functional"),
              )
                ? "functional"
                : "nefunctional",
              qrVerified: true,
              qrVerifiedAt: time.verifiedAt || time.startIso,
              qrVerifiedBy: uid,
              ...(!c.payload.draft ? {
                completedAt: c.occurredAt, completedBy: uid, durationMinutes: minutes,
                durationText: `${Math.floor(minutes / 60)}h ${minutes % 60}m`,
              } : { completedAt: FieldValue.delete(), completedBy: FieldValue.delete() }),
              photos: validatedPhotos || existing.data()?.photos || [],
              checklistVersionId: w.revision?.checklistVersionId || "legacy",
              updatedAt: now,
              ...(!existing.exists ? { createdAt: now } : {}),
            };
            tx.set(ref.collection("revisions").doc(eq.id), revision, {
              merge: true,
            });
            Object.assign(patch, {
              [`revision.equipmentStatus.${eq.id}`]: c.payload.draft ? "in_progress" : "done",
              [`revisionEquipmentTimes.${eq.id}`]: {
                ...time,
                ...(!c.payload.draft ? { endIso: c.occurredAt, durationMinutes: minutes, durationText: revision.durationText } : {}),
              },
            });
          } else {
            check(
              w.equipmentVerified || w.tipLucrare === "Revizie",
              "Verifică echipamentul înainte de intervenție.",
            );
            Object.assign(patch, interventionPatch({ ...w, ...c.payload }, w));
            if (validatedPhotos) patch.imaginiDefecte = validatedPhotos;
            if (c.action === "report.later" || c.action === "report.finalize") {
              if (w.tipLucrare === "Intervenție contra cost") {
                check(String(patch.constatareLaLocatie || "").trim() && String(patch.descriereInterventie || "").trim(), "Completează constatarea și descrierea intervenției.");
              }
              const causes = failureCauses(settings);
              const cause = causes.find(
                (o) =>
                  o.id ===
                  (patch.cauzaPrincipalaDefectId || w.cauzaPrincipalaDefectId),
              );
              check(cause, "Selectează cauza principală a defectului.");
              patch.cauzaPrincipalaDefect = cause.label;
              if (w.tipLucrare === "Revizie") {
                const revisions = await tx.get(ref.collection("revisions"));
                check(
                  revisionEquipmentIds(w).length &&
                    revisionEquipmentIds(w).every(
                      (eid) =>
                        w.revision?.equipmentStatus?.[eid] === "done" &&
                        revisions.docs.some((d) => d.id === eid),
                    ),
                  "Completează toate fișele de revizie.",
                );
                patch.mobileRevisionSnapshot = serial(rows(revisions));
              }
              Object.assign(patch, {
                products: validateProducts(c.payload.products || []),
                timpPlecare: w.timpPlecare || c.occurredAt,
                dataPlecare: w.dataPlecare || formatDate(new Date(occurred)),
                oraPlecare: w.oraPlecare || formatTime(new Date(occurred)),
                durataInterventie:
                  w.durataInterventie ||
                  (w.timpSosire
                    ? calculateDuration(w.timpSosire, c.occurredAt)
                    : "-"),
                statusFinalizareInterventie: "NEFINALIZAT",
                statusLucrare: "Fără semnătură",
              });
              if (c.action === "report.finalize") {
                const client = await resolveClient(tx, w);
                const frozen = resolveDocumentClientSnapshot(w, client);
                const counter = db
                  .collection("numarRaport")
                  .doc("document-numar-raport");
                const n = await tx.get(counter);
                const number =
                  w.nrLucrare ||
                  w.numarRaport ||
                  `#${String(n.data()?.numarRaport || 1).padStart(6, "0")}`;
                if (!w.nrLucrare && !w.numarRaport)
                  tx.set(counter, {
                    numarRaport: (n.data()?.numarRaport || 1) + 1,
                  });
                validateReportSignatures(c.payload);
                const rating = c.payload.clientRating;
                check(
                  rating === undefined ||
                    (Number.isFinite(rating) && rating >= 1 && rating <= 5),
                  "Evaluarea trebuie să fie între 1 și 5.",
                );
                const review = String(c.payload.clientReview || "").trim();
                check(review.length <= 2000, "Recenzia este prea lungă.");
                if (rating !== undefined) patch.clientRating = rating;
                if (review) patch.clientReview = review;
                const emails = c.payload.reportManualRecipients || [];
                check(
                  Array.isArray(emails) &&
                    emails.length <= 20 &&
                    emails.every(
                      (v: unknown) =>
                        typeof v === "string" &&
                        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
                    ),
                  "Email invalid.",
                );
                Object.assign(patch, {
                  semnaturaTehnician: c.payload.semnaturaTehnician || "",
                  semnaturaBeneficiar: c.payload.semnaturaBeneficiar || "",
                  numeTehnician: a.displayName,
                  numeBeneficiar: String(
                    c.payload.numeBeneficiar || w.persoanaContact || "",
                  ),
                  reportManualRecipients: emails,
                  emailDestinatar: emails,
                  raportGenerat: true,
                  statusFinalizareInterventie: "FINALIZAT",
                  raportDataLocked: true,
                  statusLucrare: "Finalizat",
                  numarRaport: number,
                  nrLucrare: String(number),
                  preluatDispecer: false,
                });
                const snapshotKeys = [
                  "client",
                  "locatie",
                  "clientInfo",
                  "persoanaContact",
                  "telefon",
                  "tipLucrare",
                  "defectReclamat",
                  "echipament",
                  "echipamentCod",
                  "constatareLaLocatie",
                  "descriereInterventie",
                  "statusEchipament",
                  "cauzaPrincipalaDefectId",
                  "cauzaPrincipalaDefect",
                  "products",
                  "semnaturaTehnician",
                  "semnaturaBeneficiar",
                  "numeTehnician",
                  "numeBeneficiar",
                  "imaginiDefecte",
                  "timpSosire",
                  "timpPlecare",
                  "dataSosire",
                  "oraSosire",
                  "dataPlecare",
                  "oraPlecare",
                  "durataInterventie",
                  "numarRaport",
                  "mobileRevisionSnapshot",
                  "clientRating",
                  "clientReview",
                ];
                const combined = { ...w, ...patch };
                patch.raportSnapshot = serial({
                  ...Object.fromEntries(
                    snapshotKeys
                      .filter((k) => combined[k] !== undefined)
                      .map((k) => [k, combined[k]]),
                  ),
                  clientSnapshot: frozen,
                  dataGenerare: c.occurredAt,
                });
              }
            }
          }
          // Same incidental effects as updateLucrare; reading notifications is handled separately.
          Object.assign(patch, {
            updatedAt: now,
            notificationRead: false,
            notificationReadBy: [],
          });
          tx.update(ref, patch);
          result = {
            id: snap.id,
            version: versionOf({ updatedAt: now }),
            work: serial({
              ...documentAfterPatch(w, patch),
              mobileVersion: versionOf({ updatedAt: now }),
            }),
          };
          if (["postpone", "report.finalize"].includes(c.action))
            tx.set(
              db.collection("mobileEffects").doc(`${uid}_${c.mutationId}`),
              {
                uid,
                workId: snap.id,
                action: c.action,
                status: "pending",
                createdAt: now,
              },
            );
        }
      }
      tx.set(receipt, {
        uid,
        fingerprint: JSON.stringify(c),
        result: serial(result),
        createdAt: FieldValue.serverTimestamp(),
      });
      tx.set(db.collection("logs").doc(`mobile_${uid}_${c.mutationId}`), {
        timestamp: FieldValue.serverTimestamp(),
        utilizator: a.displayName,
        utilizatorId: uid,
        actiune: c.action,
        detalii: `Comandă tehnician ${c.mutationId} (${channel})`,
        tip: "Informație",
        categorie: "Tehnician",
      });
      return serial(result);
    });
  }
  function resolveEquipment(w: RecordData, equipmentId?: string) {
    const equipments = w.mobileEquipment || equipmentFor(w);
    const eq = equipmentId
      ? equipments.find((e: any) => e.id === equipmentId)
      : equipments[0];
    check(eq, "Echipament neasociat tichetului.");
    return eq;
  }
  async function resolveEquipmentTx(
    tx: Transaction,
    w: RecordData,
    equipmentId?: string,
  ) {
    const client = await resolveClient(tx, w),
      location = resolveTicketLocation(client, w);
    return resolveEquipment(
      { ...w, mobileEquipment: equipmentFor(w, location) },
      equipmentId,
    );
  }
  async function resolveClient(tx: Transaction, w: RecordData) {
    if (w.clientId || w.clientInfo?.id) {
      const snap = await tx.get(
        db.collection("clienti").doc(id(w.clientId || w.clientInfo.id)),
      );
      check(snap.exists, "Client indisponibil.", 409);
      return { ...snap.data(), id: snap.id };
    }
    const snap = await tx.get(
      db.collection("clienti").where("nume", "==", w.client).limit(2),
    );
    check(snap.size === 1, "Clientul nu poate fi identificat sigur.", 409);
    return rows(snap)[0];
  }
  async function validatePhotos(
    tx: Transaction,
    a: Actor,
    c: Command,
    w: RecordData,
  ) {
    const incoming =
      c.action === "revision.save"
        ? c.payload.photos
        : c.payload.imaginiDefecte;
    if (!incoming) return;
    check(Array.isArray(incoming), "Fotografii invalide.");
    let old = w.imaginiDefecte || [];
    if (c.action === "revision.save")
      old =
        (
          await tx.get(
            workRef(c.entityId)
              .collection("revisions")
              .doc(id(c.payload.equipmentId)),
          )
        ).data()?.photos || [];
    const validated: RecordData[] = [];
    for (const photo of incoming) {
      check(photo && typeof photo === "object" && !Array.isArray(photo), "Fotografii invalide.");
      const existing = old.find((p: any) => photoIdentity(p) === photoIdentity(photo));
      if (existing) {
        validated.push(existing);
        continue;
      }
      check(photo.id, "Fotografie fără identificator.");
      const stored = (
        await tx.get(
          db.collection("mobileFiles").doc(`${a.uid}_${id(photo.id)}`),
        )
      ).data();
      check(
        stored && stored.status === "ready" &&
          stored.workId === c.entityId &&
          stored.path === photo.path &&
          stored.url === photo.url &&
          stored.purpose === "photo",
        "Fotografie neautorizată.",
        403,
      );
      validated.push(photo);
    }
    return validated;
  }
  async function requireAttendance(
    tx: Transaction,
    a: Actor,
    c: Command,
    at: number,
  ) {
    check(c.attendanceId, "Pornește pontajul.");
    const s = (
      await tx.get(db.collection("attendance").doc(id(c.attendanceId)))
    ).data();
    check(
      s &&
        s.userId === a.uid &&
        millis(s.sessionStart) <= at &&
        (!s.sessionEnd || millis(s.sessionEnd) >= at),
      "Acțiunea nu se află într-un interval de pontaj valid.",
      409,
    );
  }
  async function attendance(tx: Transaction, a: Actor, c: Command, at: number) {
    const lockRef = db.collection("attendanceActiveSessions").doc(a.uid),
      lock = await tx.get(lockRef);
    const sessionRef = db.collection("attendance").doc(id(c.entityId)),
      existing = await tx.get(sessionRef);
    const employees = await tx.get(
      db.collection("hrEmployees").where("userUid", "==", a.uid),
    );
    check(employees.size <= 1, AMBIGUOUS_ATTENDANCE_HR, 409);
    const employee = rows(employees)[0];
    const defaults =
      (await tx.get(db.collection("hrSettings").doc("defaults"))).data() || {};
    const schedule = {
      ...defaults,
      ...Object.fromEntries(
        Object.entries(employee || {}).filter(
          ([, value]) => value !== undefined && value !== "",
        ),
      ),
    };
    const metadata: RecordData = {};
    const prefix = c.action === "attendance.start" ? "checkIn" : "checkOut";
    for (const key of ["mode", "location", "faceRecognitionId", "deviceInfo", `${prefix}SelfieUrl`, `${prefix}SelfiePath`, `${prefix}SelfieStatus`]) {
      if (c.payload[key] !== undefined) metadata[key] = c.payload[key];
    }
    const selfiePath = c.payload[`${prefix}SelfiePath`];
    if (selfiePath !== undefined) {
      check(typeof selfiePath === "string" && selfiePath.startsWith(`attendance/selfies/${a.uid}/`) && !selfiePath.includes(".."), "Selfie inaccesibil.", 403);
    }
    if (c.payload.checkOutAuto || c.payload.autoStopped || c.payload.skipMinimumDurationCheck) {
      check(AUTO_CHECKOUT_ENABLED, "Depontarea automată este dezactivată.", 403);
    }
    if (c.payload.checkInAuto) check(c.payload.checkInAutoReason === "first_qr", "Motiv de autopontaj invalid.");
    if (c.action === "attendance.extra") {
      const session = existing.data();
      check(session && session.userId === a.uid, "Sesiune inaccesibilă.", 403);
      check(session.mode === "field", "Traseele necesită pontaj din teren.");
      const logs = [...(session.extraTimeLogs || [])];
      const type = c.payload.type;
      const cap = (start: number) => type === "to_client"
        ? Math.min(timeOnSameDayMs(start, "08:00", { h: 8, m: 0 }), timeOnSameDayMs(start, session.programLucruStart || "08:00", { h: 8, m: 0 }))
        : timeOnSameDayMs(start, session.programLucruEnd || "16:30", { h: 16, m: 30 }) + 3600000;
      const active = logs.findIndex(log => log.type === type && !log.endTime);
      let minutesEligible = 0;
      if (c.payload.operation === "start") {
        check(!logs.some(log => log.type === type), "Există deja un traseu de acest tip.", 409);
        if (type === "to_client") check(session.status === "active" && at < cap(at), "Traseul către client este disponibil înainte de începutul programului, până la 08:00.");
        else {
          const end = millis(session.sessionEnd);
          check(session.status === "completed" && end >= timeOnSameDayMs(end, session.programLucruEnd || "16:30", { h: 16, m: 30 }) && at >= end && at <= end + 3600000 && at <= cap(end), "Fereastra traseului către casă nu este disponibilă.");
        }
        logs.push({ type, startTime: at, minutesEligible: 0 });
      } else {
        check(active !== -1, "Nu există un traseu activ.", 409);
        const log = logs[active];
        check(at >= log.startTime, "Interval de traseu invalid.");
        const end = Math.max(log.startTime, Math.min(at, cap(log.startTime), type === "to_home" ? log.startTime + 3600000 : Infinity));
        minutesEligible = Math.floor((end - log.startTime) / 60000);
        logs[active] = { ...log, endTime: end, minutesEligible };
      }
      const timesheet = session.status === "completed" && c.payload.operation === "end"
        ? await attendanceTimesheet(tx, a, session, employee, c.entityId, { extraTimeLogs: logs }) : null;
      tx.update(sessionRef, { extraTimeLogs: logs, updatedAt: FieldValue.serverTimestamp() });
      if (timesheet?.data) tx.set(timesheet.ref, timesheet.data, { merge: true });
      return { id: c.entityId, minutesEligible, session: serial({ ...session, extraTimeLogs: logs }), timesheetSync: timesheet?.sync || null };
    }
    if (c.action === "attendance.start") {
      check(!existing.exists, "Sesiune existentă.", 409);
      const sessions = rows(
        await tx.get(db.collection("attendance").where("userId", "==", a.uid)),
      );
      check(
        !sessions.some((s) => s.status === "active"),
        "Există deja un pontaj activ.",
        409,
      );
      if (c.payload.checkInAuto) {
        check(!sessions.some(s => localDay(millis(s.sessionStart)) === localDay(at)), "Pontajul automat a fost deja folosit sau există pontaj în această zi.", 409);
      }
      const day = localDay(at),
        weekday = new Date(day + "T12:00:00Z").getUTCDay(),
        holiday = (
          await tx.get(db.collection("hrHolidays").doc(day.slice(0, 4)))
        )
          .data()
          ?.items?.find((h: any) => h.date === day);
      const special = attendanceSpecialDay(at, holiday ? [holiday] : []);
      check(
        !special || c.payload.specialDayConfirmed === true,
        "Confirmă lucrul în ziua specială înainte de pontare.",
      );
      if (lock.data()?.activeSessionId) {
        const active = await tx.get(
          db.collection("attendance").doc(lock.data()!.activeSessionId),
        );
        check(
          active.data()?.status !== "active",
          "Există deja un pontaj activ.",
          409,
        );
      }
      if (employee) {
        const requests = await tx.get(
          db.collection("hrRequests").where("employeeId", "==", employee.id),
        );
        const day = localDay(at),
          timesheet = await tx.get(
            db
              .collection("hrTimesheets")
              .doc(`${employee.id}_${day.slice(0, 7)}`),
          ),
          cell = timesheet.data()?.days?.[String(Number(day.slice(8)))];
        check(
          !["CO", "CFP", "CM", "IN"].includes(cell?.code),
          "Ești în concediu sau învoire în această zi.",
          409,
        );
        const time = localTime(at);
        check(
          !(cell?.entries || []).some(
            (entry: any) => entry.start <= time && time < entry.end,
          ),
          "Există deja pontaj în condică pentru acest interval.",
          409,
        );
        check(
          !rows(requests).some(
            (r) =>
              r.status === "approved" &&
              ((["CO", "CFP", "CM"].includes(r.kind) &&
                r.payload.startDate <= day &&
                r.payload.endDate >= day) ||
                (r.kind === "IN" && r.payload.date === day)),
          ),
          "Ești în concediu în această zi.",
          409,
        );
      }
      const startHour = schedule.programLucruStart || "08:00",
        lateStartMinutes = Math.max(
          0,
          Math.floor(
            (at - timeOnSameDayMs(at, startHour, { h: 8, m: 0 })) / 60000,
          ),
        );
      const session = {
        ...(special
          ? {
              specialDayConfirmation: {
                ...special,
                required: true,
                confirmed: true,
                confirmedAt: at,
                confirmedByUid: a.uid,
              },
            }
          : {}),
        userId: a.uid,
        userName: a.displayName,
        userRole: a.role,
        scheduledStart: startHour,
        ...(lateStartMinutes ? { lateStartMinutes, lateStartAt: at } : {}),
        ...(employee ? { employeeId: employee.id } : {}),
        sessionStart: Timestamp.fromMillis(at),
        status: "active",
        mode: c.payload.mode || "field",
        ...metadata,
        ...(c.payload.checkInAuto ? { checkInAuto: true, checkInAutoReason: "first_qr" } : {}),
        programLucruStart: schedule.programLucruStart || "08:00",
        programLucruEnd: schedule.programLucruEnd || "16:30",
        ...(schedule.pauzaStart && schedule.pauzaEnd
          ? { pauzaStart: schedule.pauzaStart, pauzaEnd: schedule.pauzaEnd }
          : {}),
        deviceInfo: c.payload.deviceInfo || { type: "mobile", userAgent: "FOM Expo" },
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };
      tx.set(sessionRef, session);
      tx.set(lockRef, {
        userId: a.uid,
        activeSessionId: c.entityId,
        sessionStart: session.sessionStart,
        employeeId: employee?.id || null,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return {
        id: c.entityId,
        session: serial({
          ...session,
          createdAt: c.occurredAt,
          updatedAt: c.occurredAt,
        }),
      };
    }
    const s = existing.data();
    check(
      s && s.userId === a.uid && s.status === "active",
      "Sesiunea nu este activă.",
      409,
    );
    check(
      !lock.data()?.activeSessionId ||
        lock.data()?.activeSessionId === c.entityId,
      "Altă sesiune este activă.",
      409,
    );
    const start = millis(s.sessionStart);
    check(
      at - start >= 60000,
      `Așteaptă ${Math.ceil((60000 - (at - start)) / 1000)} secunde înainte de oprirea pontajului.`,
    );
    const end = clampSessionEndMs(start, at, s.programLucruEnd || "16:30");
    check(end >= start, "Interval invalid.");
    const extraTimeLogs = finalizeOpenExtraTimeLogs({ session: s, now: end, programLucruStart: s.programLucruStart, programLucruEnd: s.programLucruEnd });
    const changes = {
      status: "completed", sessionEnd: Timestamp.fromMillis(end),
      checkOutMode: c.payload.mode || "field",
      ...(metadata.location ? { checkOutLocation: metadata.location } : {}),
      ...(metadata.deviceInfo ? { checkOutDeviceInfo: metadata.deviceInfo } : {}),
      ...(metadata.faceRecognitionId ? { checkOutFaceRecognitionId: metadata.faceRecognitionId } : {}),
      ...Object.fromEntries(Object.entries(metadata).filter(([k]) => k.startsWith("checkOutSelfie"))),
      ...(extraTimeLogs ? { extraTimeLogs } : {}),
    };
    const timesheet = await attendanceTimesheet(tx, a, s, employee, c.entityId, changes);
    tx.update(sessionRef, {
      ...changes,
      updatedAt: FieldValue.serverTimestamp(),
    });
    if (lock.exists) tx.delete(lockRef);
    if (timesheet?.data) tx.set(timesheet.ref, timesheet.data, { merge: true });
    return {
      id: c.entityId,
      session: serial({ ...s, ...changes }),
      timesheetSync: timesheet?.sync || { synced: false, reason: "no_employee" },
    };
  }
  async function attendanceTimesheet(tx: Transaction, a: Actor, s: RecordData, employee: RecordData | undefined, sessionId: string, changes: RecordData) {
    let timesheet: any;
    const start = millis(s.sessionStart);
    if (employee) {
      const day = localDay(start),
        month = day.slice(0, 7),
        ref = db.collection("hrTimesheets").doc(`${employee.id}_${month}`),
        snap = await tx.get(ref);
      const sessions = await tx.get(
        db.collection("attendance").where("userId", "==", a.uid),
      );
      const same = rows(sessions).filter(
        (r) =>
          r.id !== sessionId &&
          r.status === "completed" &&
          localDay(millis(r.sessionStart)) === day,
      );
      const completed = [
        ...same,
        {
          ...s,
          id: sessionId,
          ...changes,
        },
      ].map((r) => ({
        ...r,
        sessionStart: millis(r.sessionStart),
        sessionEnd: millis(r.sessionEnd),
      }));
      const key = String(Number(day.slice(8))),
        existingDay = snap.data()?.days?.[key];
      const built = buildAttendanceTimesheetCell({
        existingDay,
        computedEntries: buildAttendanceEntriesFromSessions(completed as any),
        defaultBreak:
          s.pauzaStart && s.pauzaEnd
            ? { start: s.pauzaStart, end: s.pauzaEnd }
            : null,
      });
      if (!built.cell) return { sync: { synced: false, reason: "protected_day", employeeId: employee.id, monthKey: month, day: Number(key) } };
      timesheet = {
        ref,
        sync: { synced: true, reason: "synced", employeeId: employee.id, sessionCount: completed.length, totalHours: built.cell.hours, monthKey: month, day: Number(key) },
        data: {
          employeeId: employee.id,
          monthKey: month,
          days: { ...(snap.data()?.days || {}), [key]: built.cell },
          updatedAt: FieldValue.serverTimestamp(),
        },
      };
    }
    return timesheet;
  }
  async function request(tx: Transaction, a: Actor, c: Command) {
    const emp = await tx.get(
      db.collection("hrEmployees").where("userUid", "==", a.uid),
    );
    check(emp.size === 1, "Contul trebuie asociat unui salariat HR.", 409);
    const e = rows(emp)[0],
      sectorId = id(
        c.payload.sectorId || e.sectorId || e.departmentId || e.sectorIds?.[0],
      ),
      department = await tx.get(db.collection("hrDepartments").doc(sectorId));
    check(
      e.sectorIds?.includes(sectorId),
      "Departamentul nu este asociat salariatului.",
      403,
    );
    const managerUid =
      e.managerUidBySector?.[sectorId] ||
      department.data()?.managerUid ||
      e.superiorUid;
    const req = {
      employeeId: e.id,
      employeeName:
        `${e.nume || ""} ${e.prenume || ""}`.trim() || a.displayName,
      requesterUid: a.uid,
      sectorId,
      managerUid: managerUid || "",
      kind: c.payload.kind,
      payload: c.payload.payload,
      status: "pending",
    };
    check(
      [
        "CO",
        "CFP",
        "CM",
        "IN",
        "DEL",
        "CORRECT_HOURS",
        "ADD_OVERTIME",
      ].includes(req.kind) &&
        req.payload &&
        typeof req.payload === "object",
      "Tip de cerere invalid.",
    );
    if (req.kind === "CM") {
      const files = await tx.get(
        db
          .collection("mobileFiles")
          .where("uploadedBy", "==", a.uid)
          .where("purpose", "==", "medical")
          .where("url", "==", req.payload.medicalDocumentUrl),
      );
      check(
        files.size === 1 && files.docs[0].data().status === "ready",
        "Document medical neautorizat.",
        403,
      );
    }
    if (req.kind === "CORRECT_HOURS") {
      const valid = (v: any) => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v);
      check(
        Array.isArray(req.payload.entries) &&
          req.payload.entries.length &&
          req.payload.entries.every(
            (e: any) => valid(e.start) && valid(e.end) && e.start < e.end,
          ),
        "Intervalele de lucru sunt invalide.",
      );
      check(
        Array.isArray(req.payload.breaks) &&
          req.payload.breaks.every(
            (e: any) => valid(e.start) && valid(e.end) && e.start < e.end,
          ),
        "Pauzele sunt invalide.",
      );
    }
    const error = validateHrRequestCreateInput(req as any);
    check(!error, error || "Cerere invalidă.");
    if (req.kind === "ADD_OVERTIME")
      check(
        isValidOvertimeDuration(req.payload.overtimeHours),
        "Durata orelor suplimentare este invalidă.",
      );
    const existing = await tx.get(
      db.collection("hrRequests").where("employeeId", "==", e.id),
    );
    const first = req.payload.startDate || req.payload.date,
      last = req.payload.endDate || req.payload.date;
    if (["CO", "CFP", "CM", "DEL", "IN"].includes(req.kind))
      check(
        !rows(existing).some(
          (r) =>
            ["pending", "approved"].includes(r.status) &&
            ["CO", "CFP", "CM", "DEL", "IN"].includes(r.kind) &&
            (r.payload.startDate || r.payload.date) <= last &&
            (r.payload.endDate || r.payload.date) >= first,
        ),
        "Există deja o cerere în acest interval.",
        409,
      );
    const counterRef = db.collection("hrCounters").doc("leaveRequestSerial"),
      counter = await tx.get(counterRef),
      number = (counter.data()?.last || 0) + 1;
    const requestId = `mobile_${a.uid}_${c.mutationId}`;
    tx.set(counterRef, { last: number }, { merge: true });
    tx.set(db.collection("hrRequests").doc(requestId), {
      ...req,
      documentSerial: number,
      emailChannel: "nextjs",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(db.collection("mobileEffects").doc(`${a.uid}_${c.mutationId}`), {
      uid: a.uid,
      requestId,
      action: "request.create",
      status: "pending",
      createdAt: FieldValue.serverTimestamp(),
    });
    return {
      id: requestId,
      request: serial({
        ...req,
        id: requestId,
        documentSerial: number,
        createdAt: c.occurredAt,
        updatedAt: c.occurredAt,
      }),
    };
  }
  return { actor, bundle, command, history, resolveEquipment };
}
