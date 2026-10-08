import {
  FieldValue,
  type Firestore,
  type Transaction,
} from "firebase-admin/firestore";
import { resolveTicketLocation } from "@/firebase-functions/src/client-ticket-sync";
import { resolveDocumentClientSnapshot } from "@/lib/work-documents/document-client-snapshot";
import {
  isInstallationV1,
  type InstallationEquipment,
  type InstallationSheet,
  type InstallationDocument,
} from "@/types/installation";
import {
  pendingSignatureMessage,
  sheetParticipants,
  visibleSheet,
} from "./team";
import {
  check,
  fields,
  identifier,
  signatures,
  text,
  verifyQr,
  workDate,
} from "./validation";

export type InstallationActor = { uid: string; role: string };
type RecordData = Record<string, any>;
const managers = ["admin", "dispecer"];
const closedStatuses = ["Finalizat", "Arhivată", "Anulat"];
const editableKeys = [
  "client",
  "clientId",
  "locationId",
  "locationName",
  "contactId",
  "clientInfo",
  "locatie",
  "persoanaContact",
  "persoanaContactEmail",
  "telefon",
  "dataEmiterii",
  "dataInterventie",
  "tehnicieni",
  "descriere",
  "defectReclamat",
  "contract",
  "contractNumber",
  "contractType",
  "statusFacturare",
  "customFields",
];
const copyKeys = (input: RecordData, keys: string[]) =>
  Object.fromEntries(
    keys.filter((k) => input[k] !== undefined).map((k) => [k, input[k]]),
  );

/** All business transitions use a single Firestore transaction; injected DB permits isolated emulator tests. */
export function installationService(db: Firestore) {
  const workRef = (id: string) => db.collection("lucrari").doc(identifier(id));
  const sheetsRef = (id: string) =>
    workRef(id).collection("installationSheets");
  const sessionRef = (uid: string) =>
    db.collection("installationTechnicianSessions").doc(identifier(uid));
  const completionRef = (root: string) =>
    workRef(root).collection("installationCompletion").doc("final");

  async function actorData(tx: Transaction, actor: InstallationActor) {
    const doc = await tx.get(db.collection("users").doc(identifier(actor.uid)));
    const user = doc.data();
    check(
      user &&
        user.role === actor.role &&
        [...managers, "tehnician"].includes(actor.role),
      "Acces neautorizat.",
      403,
    );
    return { ...user, uid: actor.uid } as RecordData;
  }
  function assigned(work: RecordData, user: RecordData) {
    // Existing tickets store technician display names. Reject ambiguous names at authorization boundary.
    return Boolean(
      user.displayName &&
      Array.isArray(work.tehnicieni) &&
      work.tehnicieni.includes(user.displayName),
    );
  }
  async function assertAssigned(
    tx: Transaction,
    work: RecordData,
    user: RecordData,
  ) {
    check(
      user.role === "tehnician" && assigned(work, user),
      "Doar un tehnician atribuit tichetului poate efectua această acțiune.",
      403,
    );
    const matches = await tx.get(
      db.collection("users").where("displayName", "==", user.displayName),
    );
    check(
      matches.docs.filter((d) => d.data().role === "tehnician").length === 1,
      "Numele tehnicianului este ambiguu. Corectați utilizatorii înainte de pornire.",
      409,
    );
  }
  function assertWork(
    work: RecordData | undefined,
    active = false,
  ): asserts work is RecordData {
    check(
      work && isInstallationV1(work),
      "Tichetul nu folosește noul flux de instalare.",
      404,
    );
    if (active)
      check(
        !work.installation.closedReason &&
          !closedStatuses.includes(work.statusLucrare) &&
          !work.anulat &&
          !work.archivedAt,
        "Tichetul este închis sau anulat.",
        409,
      );
  }
  function assertPrincipal(
    sheet: InstallationSheet | undefined,
    uid: string,
  ): asserts sheet is InstallationSheet {
    check(
      sheet && sheet.principalUid === uid,
      "Doar principalul poate modifica fișa.",
      403,
    );
    check(
      sheet.state === "draft",
      "Fișa semnată nu mai poate fi modificată.",
      409,
    );
  }
  async function resolveEquipment(
    tx: Transaction,
    work: RecordData,
    ids: unknown,
  ) {
    check(
      Array.isArray(ids) &&
        ids.length > 0 &&
        ids.every((id) => typeof id === "string"),
      "Selectați cel puțin un echipament.",
    );
    const equipmentIds = Array.from(new Set(ids.map(identifier)));
    const clientId = identifier(work.clientId || work.clientInfo?.id);
    const clientDoc = await tx.get(db.collection("clienti").doc(clientId));
    check(clientDoc.exists, "Clientul nu mai există.");
    const client: RecordData = { ...clientDoc.data(), id: clientDoc.id };
    const location = resolveTicketLocation(client, work);
    check(location.id, "Locația trebuie să aibă un ID stabil.");
    const equipment: InstallationEquipment[] = equipmentIds.map((id) => {
      const found = (location.echipamente || []).filter(
        (e: any) => e.id === id,
      );
      check(
        found.length === 1,
        "Un echipament nu aparține locației selectate.",
      );
      const e = found[0];
      return {
        id,
        name: String(e.nume || id),
        code: String(e.cod || ""),
        model: String(e.model || ""),
      };
    });
    return { equipmentIds, equipment, client, location };
  }
  function audit(
    tx: Transaction,
    workId: string,
    actor: InstallationActor,
    action: string,
    details: RecordData = {},
  ) {
    tx.set(workRef(workId).collection("installationAudit").doc(), {
      uid: actor.uid,
      action,
      ...details,
      at: FieldValue.serverTimestamp(),
    });
  }

  async function create(
    actor: InstallationActor,
    input: RecordData,
    requestId: string,
  ) {
    check(
      managers.includes(actor.role),
      "Doar dispecerul/adminul poate crea instalarea.",
      403,
    );
    const ref = workRef(identifier(requestId));
    return db.runTransaction(async (tx) => {
      const user = await actorData(tx, actor);
      const existing = await tx.get(ref);
      if (existing.exists) {
        check(
          existing.data()?.createdBy === actor.uid &&
            isInstallationV1(existing.data()),
          "Identificator deja utilizat.",
          409,
        );
        return { id: ref.id, ...existing.data() };
      }
      const safe = copyKeys(input, [...editableKeys, "nrLucrare"]);
      const resolved = await resolveEquipment(tx, safe, input.equipmentIds);
      if (safe.contract) {
        const contract = await tx.get(
          db.collection("contracts").doc(identifier(safe.contract)),
        );
        check(
          !contract.exists ||
            !["suspendat", "suspended"].includes(
              String(contract.data()?.status || "").toLowerCase(),
            ),
          "Contractul este suspendat.",
        );
      }
      const data = {
        ...safe,
        clientId: resolved.client.id,
        locationId: resolved.location.id,
        client: String(resolved.client.nume),
        locatie: String(resolved.location.nume),
        locationName: String(resolved.location.nume),
        tipLucrare: "Instalare",
        echipament: "",
        echipamentId: "",
        echipamentCod: "",
        equipmentIds: resolved.equipmentIds,
        tehnicieni: Array.isArray(input.tehnicieni) ? input.tehnicieni : [],
        statusLucrare: input.tehnicieni?.length ? "Atribuită" : "Listată",
        statusFacturare: input.statusFacturare || "Nefacturat",
        installation: {
          schemaVersion: 1,
          rootWorkId: ref.id,
          equipment: resolved.equipment,
          equipmentStatus: Object.fromEntries(
            resolved.equipmentIds.map((id) => [id, "pending"]),
          ),
          activeSheetByEquipment: {},
          startedEquipmentIds: [],
        },
        createdBy: actor.uid,
        createdByName: user.displayName || "Dispecer",
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };
      tx.create(ref, data);
      audit(tx, ref.id, actor, "create");
      return { id: ref.id, ...data };
    });
  }

  async function edit(
    actor: InstallationActor,
    workId: string,
    input: RecordData,
  ) {
    check(
      managers.includes(actor.role),
      "Doar dispecerul/adminul poate edita tichetul.",
      403,
    );
    return db.runTransaction(async (tx) => {
      await actorData(tx, actor);
      const ref = workRef(workId);
      const snap = await tx.get(ref);
      const work = snap.data();
      assertWork(work, true);
      check(
        input.tipLucrare === undefined || input.tipLucrare === "Instalare",
        "Tipul instalării nu poate fi schimbat.",
      );
      const patch = copyKeys(input, editableKeys);
      const started: string[] = work.installation.startedEquipmentIds || [];
      // Association locks apply to the whole installation, including continuation tickets.
      const history = await tx.get(
        db
          .collection("lucrari")
          .where("installation.rootWorkId", "==", work.installation.rootWorkId),
      );
      const historicallyStarted = new Set(
        history.docs.flatMap(
          (d) => d.data().installation.startedEquipmentIds || [],
        ),
      );
      if (historicallyStarted.size) {
        for (const key of ["clientId", "locationId", "client", "locatie"])
          check(
            patch[key] === undefined || patch[key] === work[key],
            "Clientul și locația sunt blocate după prima fișă.",
          );
        if (patch.clientInfo)
          check(
            (patch.clientInfo.id || work.clientId) === work.clientId &&
              (patch.clientInfo.locationId ||
                patch.clientInfo.locatieId ||
                work.locationId) === work.locationId,
            "Asocierea locației este blocată.",
          );
      }
      const resolved = await resolveEquipment(
        tx,
        { ...work, ...patch },
        input.equipmentIds ?? work.equipmentIds,
      );
      // A continuation inherits equipment with earlier daily sheets too.
      check(
        work.equipmentIds
          .filter((id: string) => historicallyStarted.has(id))
          .every((id: string) => resolved.equipmentIds.includes(id)),
        "Echipamentele cu fișe începute nu pot fi eliminate.",
      );
      if (
        Object.keys(work.installation.activeSheetByEquipment).length &&
        patch.tehnicieni
      ) {
        check(
          (work.tehnicieni || []).every((name: string) =>
            patch.tehnicieni.includes(name),
          ),
          "Nu eliminați tehnicienii cât timp există fișe active.",
        );
      }
      const meta = {
        ...work.installation,
        equipment: resolved.equipment,
        equipmentStatus: Object.fromEntries(
          resolved.equipmentIds.map((id) => [
            id,
            work.installation.equipmentStatus[id] || "pending",
          ]),
        ),
      };
      const statusLucrare =
        Object.keys(meta.activeSheetByEquipment).length || started.length
          ? work.statusLucrare
          : (patch.tehnicieni ?? work.tehnicieni).length
            ? "Atribuită"
            : "Listată";
      const update = {
        ...patch,
        clientId: resolved.client.id,
        locationId: resolved.location.id,
        client: String(resolved.client.nume),
        locatie: String(resolved.location.nume),
        locationName: String(resolved.location.nume),
        equipmentIds: resolved.equipmentIds,
        installation: meta,
        statusLucrare,
        updatedAt: FieldValue.serverTimestamp(),
        notificationRead: false,
        notificationReadBy: [],
      };
      tx.update(ref, update);
      audit(tx, workId, actor, "edit");
      return { id: workId, ...work, ...update };
    });
  }

  async function start(
    actor: InstallationActor,
    workId: string,
    input: RecordData,
  ) {
    const equipmentId = identifier(input.equipmentId);
    const requestId = identifier(input.requestId);
    return db.runTransaction(async (tx) => {
      const user = await actorData(tx, actor);
      const ref = workRef(workId);
      const work = (await tx.get(ref)).data();
      assertWork(work);
      await assertAssigned(tx, work, user);
      const resolved = await resolveEquipment(tx, work, [equipmentId]);
      check(
        work.equipmentIds.includes(equipmentId),
        "Echipamentul nu este selectat pe tichet.",
      );
      verifyQr(input.qrRaw, resolved.equipment[0], work.client, work.locatie);
      const receiptRef = ref
        .collection("installationAudit")
        .doc(`scan_${requestId}`);
      const receipt = await tx.get(receiptRef);
      if (receipt.exists) {
        const previous = receipt.data()!;
        check(
          previous.uid === actor.uid && previous.equipmentId === equipmentId,
          "Cerere deja utilizată.",
          409,
        );
        const saved = await tx.get(sheetsRef(workId).doc(previous.sheetId));
        check(saved.exists, "Fișa scanării nu mai există.", 409);
        return {
          sheet: visibleSheet(
            { ...saved.data(), id: saved.id } as InstallationSheet,
            actor.uid,
          ),
        };
      }
      const legacyRequest = await tx.get(sheetsRef(workId).doc(requestId));
      if (legacyRequest.exists) {
        check(
          legacyRequest.data()?.principalUid === actor.uid &&
            legacyRequest.data()?.equipmentId === equipmentId,
          "Cerere deja utilizată.",
          409,
        );
        return {
          sheet: visibleSheet(
            {
              ...legacyRequest.data(),
              id: legacyRequest.id,
            } as InstallationSheet,
            actor.uid,
          ),
        };
      }
      assertWork(work, true);
      check(
        !work.installation.awaitingSheetByEquipment?.[equipmentId],
        pendingSignatureMessage,
        409,
      );
      check(
        work.installation.equipmentStatus[equipmentId] !== "done",
        "Echipamentul este deja finalizat.",
        409,
      );
      const currentSession = (await tx.get(sessionRef(actor.uid))).data();
      let source: InstallationSheet | undefined;
      if (currentSession) {
        const original = await tx.get(
          sheetsRef(currentSession.workId).doc(currentSession.sheetId),
        );
        source = { ...original.data(), id: original.id } as InstallationSheet;
        check(
          original.exists &&
            source.state === "draft" &&
            sheetParticipants(source).some(
              (p) => p.uid === actor.uid && p.active,
            ),
          "Sesiunea activă este inconsistentă.",
          409,
        );
        if (
          currentSession.workId === workId &&
          currentSession.equipmentId === equipmentId
        ) {
          return { sheet: visibleSheet(source, actor.uid) };
        }
        check(
          source.principalUid !== actor.uid,
          "Aveți deja o fișă activă ca principal. Opriți lucrul înainte de a începe alta.",
          409,
        );
      }
      const targetId =
        work.installation.activeSheetByEquipment[equipmentId] || requestId;
      const targetRef = sheetsRef(workId).doc(targetId);
      const targetDoc = await tx.get(targetRef);
      check(
        !work.installation.activeSheetByEquipment[equipmentId] ||
          (targetDoc.exists && targetDoc.data()?.state === "draft"),
        "Fișa activă a echipamentului este inconsistentă.",
        409,
      );
      const now = new Date().toISOString();
      const target: InstallationSheet = targetDoc.exists
        ? ({ ...targetDoc.data(), id: targetId } as InstallationSheet)
        : {
            id: targetId,
            equipmentId,
            principalUid: actor.uid,
            principalName: user.displayName,
            workDate: workDate(new Date(now)),
            state: "draft",
            finding: "",
            operations: "",
            installationStatus: "in_progress",
            blockReason: "",
            internalNote: "",
            photos: [],
            revision: 0,
            createdAt: now,
            updatedAt: now,
          };
      const participants = sheetParticipants(target).map((p) => ({ ...p }));
      const role =
        target.principalUid === actor.uid
          ? ("principal" as const)
          : ("secondary" as const);
      const existingActor = participants.find((p) => p.uid === actor.uid);
      if (existingActor) {
        existingActor.active = true;
        existingActor.moved = false;
      } else
        participants.push({
          uid: actor.uid,
          name: user.displayName,
          role,
          active: true,
        });
      const warnings: string[] = [];
      const additions: { uid: string; role: "principal" | "secondary" }[] = [
        { uid: actor.uid, role },
      ];
      // Every read (including candidate sessions) precedes the first transactional write.
      if (!currentSession) {
        for (const name of [...new Set<string>(work.tehnicieni || [])]) {
          if (name === user.displayName) continue;
          const matches = await tx.get(
            db.collection("users").where("displayName", "==", name),
          );
          const technicians = matches.docs.filter(
            (d) => d.data().role === "tehnician",
          );
          if (technicians.length !== 1) {
            warnings.push(
              `${name}: nu a putut fi alocat automat; asocierea utilizatorului este ${technicians.length ? "ambiguă" : "lipsă"}.`,
            );
            continue;
          }
          const candidate = technicians[0];
          const session = await tx.get(sessionRef(candidate.id));
          if (session.exists) {
            if (
              session.data()?.workId !== workId ||
              session.data()?.sheetId !== targetId
            )
              warnings.push(
                `${name} lucrează deja pe altă fișă și nu a fost mutat.`,
              );
            continue;
          }
          const member = participants.find((p) => p.uid === candidate.id);
          if (member) {
            member.active = true;
            member.moved = false;
          } else
            participants.push({
              uid: candidate.id,
              name,
              role: "secondary",
              active: true,
            });
          additions.push({ uid: candidate.id, role: "secondary" });
        }
      }
      if (source && currentSession) {
        const sourceParticipants = sheetParticipants(source).map((p) =>
          p.uid === actor.uid ? { ...p, active: false, moved: true } : p,
        );
        // Team changes do not change the revision of editable content.
        tx.update(
          sheetsRef(currentSession.workId).doc(currentSession.sheetId),
          {
            participants: sourceParticipants,
            participantUids: sourceParticipants.map((p) => p.uid),
            updatedAt: now,
          },
        );
        audit(tx, currentSession.workId, actor, "leave", {
          sheetId: source.id,
          destinationWorkId: workId,
          destinationSheetId: targetId,
        });
      }
      const updated = {
        ...target,
        participants,
        participantUids: participants.map((p) => p.uid),
        allocationWarnings: warnings,
        updatedAt: now,
      };
      if (targetDoc.exists)
        tx.update(targetRef, {
          participants,
          participantUids: updated.participantUids,
          allocationWarnings: warnings,
          updatedAt: now,
        });
      else {
        tx.create(targetRef, {
          ...updated,
          qrVerifiedAt: now,
          qrVerifiedBy: actor.uid,
        });
        tx.update(ref, {
          [`installation.activeSheetByEquipment.${equipmentId}`]: targetId,
          [`installation.equipmentStatus.${equipmentId}`]: "in_progress",
          "installation.startedEquipmentIds":
            FieldValue.arrayUnion(equipmentId),
          statusLucrare: "În lucru",
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      for (const member of additions)
        tx.set(sessionRef(member.uid), {
          workId,
          sheetId: targetId,
          equipmentId,
          role: member.role,
        });
      tx.create(receiptRef, {
        uid: actor.uid,
        action: source ? "transfer" : targetDoc.exists ? "join" : "start",
        sheetId: targetId,
        equipmentId,
        allocatedUids: additions.map((p) => p.uid),
        at: FieldValue.serverTimestamp(),
      });
      return { sheet: visibleSheet(updated, actor.uid) };
    });
  }

  async function finish(
    actor: InstallationActor,
    workId: string,
    input: RecordData,
    mode: "save" | "close" | "stop",
  ) {
    const sheetId = identifier(input.sheetId);
    const content = fields(input.fields, mode !== "save");
    return db.runTransaction(async (tx) => {
      const user = await actorData(tx, actor);
      const receipt = input.requestId ? db.collection("installationCommands").doc(`${actor.uid}_${identifier(input.requestId)}`) : null;
      const previous = receipt ? await tx.get(receipt) : null;
      if (previous?.exists) {
        check(previous.data()?.fingerprint === JSON.stringify({workId,input,mode}), "Identificator reutilizat.", 409);
        return previous.data()!.result;
      }
      const ref = workRef(workId);
      const work = (await tx.get(ref)).data();
      assertWork(work);
      const sr = sheetsRef(workId).doc(sheetId);
      const sheet = (await tx.get(sr)).data() as InstallationSheet | undefined;
      if (
        mode !== "save" &&
        sheet?.principalUid === actor.uid &&
        (sheet.state === "closed" ||
          (mode === "stop" && sheet.state === "awaiting_signature"))
      )
        return { sheet: visibleSheet({ ...sheet, id: sheetId }, actor.uid) };
      assertWork(work, true);
      assertPrincipal(sheet, actor.uid);
      await assertAssigned(tx, work, user);
      check(
        input.revision === sheet.revision,
        "Fișa s-a modificat în altă fereastră. Reîncărcați datele înainte de salvare.",
        409,
      );
      const principalSession = await tx.get(sessionRef(actor.uid));
      check(
        principalSession.data()?.workId === workId &&
          principalSession.data()?.sheetId === sheetId &&
          work.installation.activeSheetByEquipment[sheet.equipmentId] ===
            sheetId,
        "Fișa nu mai este activă.",
        409,
      );
      const participants = sheetParticipants(sheet);
      const release: string[] = [];
      let frozenDocument: InstallationSheet["frozenDocument"];
      let documentSnapshot: InstallationDocument | undefined;
      if (mode !== "save") {
        const resolved = await resolveEquipment(tx, work, [sheet.equipmentId]);
        for (const member of participants.filter((p) => p.active)) {
          const session = await tx.get(sessionRef(member.uid));
          if (
            session.data()?.workId === workId &&
            session.data()?.sheetId === sheetId
          )
            release.push(member.uid);
        }
        frozenDocument = {
          client: resolveDocumentClientSnapshot(work, resolved.client),
          workNumber: String(work.nrLucrare || workId),
          workDate: sheet.workDate,
          equipment: resolved.equipment,
          finding: content.finding,
          operations: content.operations,
          installationStatus: content.installationStatus,
          blockReason: content.blockReason,
          photos: sheet.photos,
          principalName: sheet.principalName,
          participants: participants.map((p) => ({ ...p, active: false })),
        };
        if (mode === "close")
          documentSnapshot = {
            ...frozenDocument,
            ...signatures(input.signatures, user.displayName),
            signedByUid: actor.uid,
          };
      }
      const now = new Date().toISOString();
      const update = {
        ...content,
        updatedAt: now,
        revision: sheet.revision + 1,
        ...(mode !== "save"
          ? {
              state:
                mode === "close"
                  ? ("closed" as const)
                  : ("awaiting_signature" as const),
              stoppedAt: now,
              participants: participants.map((p) => ({ ...p, active: false })),
              participantUids: participants.map((p) => p.uid),
              frozenDocument,
              ...(documentSnapshot
                ? { closedAt: now, documentSnapshot, signedByUid: actor.uid }
                : {}),
            }
          : {}),
      };
      tx.update(sr, update);
      if (mode !== "save") {
        for (const uid of release) tx.delete(sessionRef(uid));
        tx.update(ref, {
          [`installation.activeSheetByEquipment.${sheet.equipmentId}`]:
            FieldValue.delete(),
          ...(mode === "stop"
            ? {
                [`installation.awaitingSheetByEquipment.${sheet.equipmentId}`]:
                  sheetId,
              }
            : {}),
          [`installation.equipmentStatus.${sheet.equipmentId}`]:
            mode === "close" && content.installationStatus === "completed"
              ? "done"
              : content.installationStatus === "completed"
                ? "in_progress"
                : content.installationStatus,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      audit(tx, workId, actor, mode, { sheetId, releasedUids: release });
      const result = {sheet: visibleSheet({ ...sheet, ...update, id: sheetId }, actor.uid)};
      if (receipt) tx.set(receipt, {fingerprint: JSON.stringify({workId,input,mode}), result, createdAt: FieldValue.serverTimestamp()});
      return result;
    });
  }
  const save = (
    actor: InstallationActor,
    workId: string,
    input: RecordData,
    close = false,
  ) => finish(actor, workId, input, close ? "close" : "save");
  const stop = (actor: InstallationActor, workId: string, input: RecordData) =>
    finish(actor, workId, input, "stop");

  async function sign(
    actor: InstallationActor,
    workId: string,
    input: RecordData,
  ) {
    const sheetId = identifier(input.sheetId);
    const requestId = identifier(input.requestId);
    return db.runTransaction(async (tx) => {
      const user = await actorData(tx, actor);
      check(
        actor.role === "tehnician",
        "Doar un tehnician participant poate semna fișa.",
        403,
      );
      const ref = workRef(workId);
      const work = (await tx.get(ref)).data();
      assertWork(work);
      const sr = sheetsRef(workId).doc(sheetId);
      const sheet = (await tx.get(sr)).data() as InstallationSheet | undefined;
      check(
        sheet && sheetParticipants(sheet).some((p) => p.uid === actor.uid),
        "Doar un tehnician participant poate semna fișa.",
        403,
      );
      if (
        sheet.state === "closed" &&
        sheet.signedByUid === actor.uid &&
        sheet.signRequestId === requestId
      )
        return { sheet: visibleSheet({ ...sheet, id: sheetId }, actor.uid) };
      assertWork(work, true);
      check(
        sheet.state === "awaiting_signature" &&
          sheet.frozenDocument &&
          work.installation.awaitingSheetByEquipment?.[sheet.equipmentId] ===
            sheetId,
        "Fișa nu mai așteaptă semnăturile.",
        409,
      );
      check(
        input.revision === sheet.revision,
        "Fișa s-a modificat în altă fereastră. Reîncărcați datele înainte de semnare.",
        409,
      );
      const documentSnapshot: InstallationDocument = {
        ...sheet.frozenDocument,
        ...signatures(input.signatures, user.displayName),
        signedByUid: actor.uid,
      };
      const now = new Date().toISOString();
      const update = {
        state: "closed" as const,
        closedAt: now,
        updatedAt: now,
        revision: sheet.revision + 1,
        documentSnapshot,
        signedByUid: actor.uid,
        signRequestId: requestId,
      };
      tx.update(sr, update);
      tx.update(ref, {
        [`installation.awaitingSheetByEquipment.${sheet.equipmentId}`]:
          FieldValue.delete(),
        [`installation.equipmentStatus.${sheet.equipmentId}`]:
          sheet.installationStatus === "completed"
            ? "done"
            : sheet.installationStatus,
        updatedAt: FieldValue.serverTimestamp(),
      });
      audit(tx, workId, actor, "sign", { sheetId, requestId });
      return {
        sheet: visibleSheet({ ...sheet, ...update, id: sheetId }, actor.uid),
      };
    });
  }

  async function continueWork(actor: InstallationActor, workId: string) {
    check(
      managers.includes(actor.role),
      "Doar dispecerul/adminul poate replanifica.",
      403,
    );
    const newRef = db.collection("lucrari").doc();
    return db.runTransaction(async (tx) => {
      await actorData(tx, actor);
      const ref = workRef(workId);
      const work = (await tx.get(ref)).data();
      assertWork(work);
      if (work.installation.continuationWorkId)
        return { workId: work.installation.continuationWorkId };
      assertWork(work, true);
      check(
        !Object.keys(work.installation.activeSheetByEquipment).length,
        "Închideți toate fișele active înainte de replanificare.",
        409,
      );
      check(
        !Object.keys(work.installation.awaitingSheetByEquipment || {}).length,
        pendingSignatureMessage,
        409,
      );
      check(
        work.installation.startedEquipmentIds.length,
        "Replanificarea necesită cel puțin o fișă închisă.",
      );
      const remaining: string[] = work.equipmentIds.filter(
        (id: string) => work.installation.equipmentStatus[id] !== "done",
      );
      check(remaining.length, "Nu există echipamente rămase.");
      const counterRef = db
        .collection("numarRaport")
        .doc("document-numar-raport");
      const counter = await tx.get(counterRef);
      const number = Number(counter.data()?.numarRaport || 1);
      const safe = copyKeys(work, editableKeys);
      const next = {
        ...safe,
        tipLucrare: "Instalare",
        equipmentIds: remaining,
        tehnicieni: [],
        statusLucrare: "Listată",
        statusFacturare: "Nefacturat",
        nrLucrare: `#${String(number).padStart(6, "0")}`,
        lucrareOriginala: workId,
        createdBy: actor.uid,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        installation: {
          schemaVersion: 1,
          rootWorkId: work.installation.rootWorkId,
          equipment: work.installation.equipment.filter(
            (e: InstallationEquipment) => remaining.includes(e.id),
          ),
          equipmentStatus: Object.fromEntries(
            remaining.map((id) => [id, "pending"]),
          ),
          activeSheetByEquipment: {},
          startedEquipmentIds: [],
          inheritedStartedEquipmentIds: [
            ...new Set<string>([
              ...(work.installation.inheritedStartedEquipmentIds || []),
              ...work.installation.startedEquipmentIds,
            ]),
          ].filter((id) => remaining.includes(id)),
        },
      };
      tx.set(counterRef, { numarRaport: number + 1 }, { merge: true });
      tx.create(newRef, next);
      tx.update(ref, {
        "installation.continuationWorkId": newRef.id,
        "installation.closedReason": "continuation",
        statusLucrare: "Finalizat",
        updatedAt: FieldValue.serverTimestamp(),
      });
      audit(tx, workId, actor, "continue", { continuationWorkId: newRef.id });
      return { workId: newRef.id };
    });
  }

  async function complete(
    actor: InstallationActor,
    workId: string,
    input: RecordData,
  ) {
    return db.runTransaction(async (tx) => {
      const user = await actorData(tx, actor);
      const terminal = (await tx.get(workRef(workId))).data();
      assertWork(terminal);
      await assertAssigned(tx, terminal, user);
      const root = terminal.installation.rootWorkId;
      const cr = completionRef(root);
      const issued = await tx.get(cr);
      if (issued.exists) return { document: issued.data() };
      assertWork(terminal, true);
      check(
        !terminal.installation.continuationWorkId,
        "Procesul-verbal se emite din ultimul tichet.",
      );
      const chain = await tx.get(
        db.collection("lucrari").where("installation.rootWorkId", "==", root),
      );
      const byId = new Map(chain.docs.map((d) => [d.id, d.data()]));
      const equipment = new Map<string, InstallationEquipment>();
      const status = new Map<string, string>();
      const sheetReferences: NonNullable<
        InstallationDocument["sheetReferences"]
      > = [];
      let cursor: string | undefined = root;
      const visited = new Set<string>();
      while (cursor) {
        check(!visited.has(cursor), "Lanț de continuare invalid.", 409);
        visited.add(cursor);
        const w = byId.get(cursor);
        check(w, "Istoricul lucrării este incomplet.", 409);
        check(
          !Object.keys(w.installation.activeSheetByEquipment).length,
          "Există fișe active.",
          409,
        );
        check(
          !Object.keys(w.installation.awaitingSheetByEquipment || {}).length,
          pendingSignatureMessage,
          409,
        );
        for (const e of w.installation.equipment) {
          // Earlier tickets contribute finished equipment; the terminal ticket defines the remaining scope.
          if (
            !w.installation.continuationWorkId ||
            w.installation.equipmentStatus[e.id] === "done"
          ) {
            equipment.set(e.id, e);
            status.set(e.id, w.installation.equipmentStatus[e.id]);
          }
        }
        const sheets = await tx.get(sheetsRef(cursor));
        for (const d of sheets.docs) {
          const s = d.data();
          check(
            s.state === "closed" &&
              s.documentSnapshot?.technicianSignature &&
              s.documentSnapshot?.beneficiarySignature,
            "Există fișe nesemnate.",
            409,
          );
          sheetReferences.push({
            workId: cursor,
            sheetId: d.id,
            workDate: s.workDate,
            equipmentName: s.documentSnapshot.equipment[0].name,
          });
        }
        if (!w.installation.continuationWorkId)
          check(cursor === workId, "Acesta nu este tichetul terminal.", 409);
        cursor = w.installation.continuationWorkId;
      }
      check(
        equipment.size && [...status.values()].every((s) => s === "done"),
        "Toate echipamentele trebuie finalizate înainte de procesul-verbal.",
        409,
      );
      const resolved = await resolveEquipment(
        tx,
        terminal,
        terminal.equipmentIds,
      );
      const document: InstallationDocument = {
        ...signatures(input.signatures, user.displayName),
        client: resolveDocumentClientSnapshot(terminal, resolved.client),
        workNumber: String(terminal.nrLucrare || workId),
        workDate: workDate(new Date()),
        equipment: [...equipment.values()],
        photos: [],
        observations: text(input.observations),
        sheetReferences,
      };
      check(
        Buffer.byteLength(JSON.stringify(document)) < 800000,
        "Documentul final depășește limita de stocare; contactați administratorul.",
      );
      tx.create(cr, {
        id: "final",
        terminalWorkId: workId,
        signedBy: actor.uid,
        createdAt: new Date().toISOString(),
        documentSnapshot: document,
      });
      tx.update(workRef(workId), {
        "installation.closedReason": "completed",
        "installation.completionDocumentId": "final",
        statusLucrare: "Finalizat",
        updatedAt: FieldValue.serverTimestamp(),
      });
      audit(tx, workId, actor, "complete");
      return { document: { id: "final", documentSnapshot: document } };
    });
  }

  async function list(
    actor: InstallationActor,
    workId: string,
    cursor?: string,
    sheetId?: string,
  ) {
    const userDoc = await db.collection("users").doc(actor.uid).get();
    const user = userDoc.data();
    check(
      [...managers, "tehnician"].includes(actor.role) &&
        user?.role === actor.role,
      "Acces neautorizat.",
      403,
    );
    const work = (await workRef(workId).get()).data();
    assertWork(work);
    const manager = managers.includes(actor.role);
    // Technicians can read public signed history across a continuation chain; internal notes remain private.
    let allowed = manager || assigned(work, user!);
    if (!allowed && actor.role === "tehnician") {
      const chain = await db
        .collection("lucrari")
        .where("installation.rootWorkId", "==", work.installation.rootWorkId)
        .get();
      allowed = chain.docs.some((d) => assigned(d.data(), user!));
      if (!allowed) {
        for (const item of chain.docs) {
          const participation = await sheetsRef(item.id)
            .where("participantUids", "array-contains", actor.uid)
            .limit(1)
            .get();
          const legacy = participation.empty
            ? await sheetsRef(item.id)
                .where("principalUid", "==", actor.uid)
                .limit(1)
                .get()
            : null;
          if (!participation.empty || (legacy && !legacy.empty)) {
            allowed = true;
            break;
          }
        }
      }
    }
    check(allowed, "Nu aveți acces la această instalare.", 403);
    const currentSessionDoc =
      actor.role === "tehnician" ? await sessionRef(actor.uid).get() : null;
    const currentSession = currentSessionDoc?.exists
      ? {
          ...currentSessionDoc.data(),
          role: currentSessionDoc.data()?.role || "principal",
        }
      : null;
    const completion = await completionRef(work.installation.rootWorkId).get();
    let query = sheetsRef(workId)
      .orderBy("createdAt", "desc")
      .orderBy("__name__", "desc")
      .limit(26);
    if (cursor) {
      const previous = await sheetsRef(workId).doc(identifier(cursor)).get();
      check(previous.exists, "Cursor de istoric invalid.");
      query = query.startAfter(previous);
    }
    const snapshots = sheetId
      ? [await sheetsRef(workId).doc(identifier(sheetId)).get()]
      : (await query.get()).docs;
    const sanitize = (doc: any) => {
      if (!doc.exists) return null;
      return visibleSheet(
        { ...doc.data(), id: doc.id } as InstallationSheet,
        actor.uid,
        manager,
      );
    };
    const sheets = snapshots
      .slice(0, 25)
      .map(sanitize)
      .filter((sheet): sheet is InstallationSheet => sheet !== null);
    return {
      work: {
        id: workId,
        client: work.client,
        locatie: work.locatie,
        nrLucrare: work.nrLucrare,
        statusLucrare: work.statusLucrare,
        installation: work.installation,
        equipmentIds: work.equipmentIds,
        tehnicieni: work.tehnicieni || [],
        dataEmiterii: work.dataEmiterii || "",
        dataInterventie: work.dataInterventie || "",
      },
      currentSession,
      canStart: actor.role === "tehnician" && assigned(work, user!),
      sheets,
      nextCursor: snapshots.length > 25 ? snapshots[24].id : null,
      completion: completion.exists ? completion.data() : null,
    };
  }

  /** Upload is server-only. A file uploaded before a concurrent close is never added to the signed snapshot. */
  async function attachPhoto(
    actor: InstallationActor,
    workId: string,
    sheetId: string,
    photo: any,
    remove = false,
  ) {
    return db.runTransaction(async (tx) => {
      const user = await actorData(tx, actor);
      const work = (await tx.get(workRef(workId))).data();
      assertWork(work, true);
      await assertAssigned(tx, work, user);
      const ref = sheetsRef(workId).doc(identifier(sheetId));
      const sheet = (await tx.get(ref)).data() as InstallationSheet | undefined;
      assertPrincipal(sheet, actor.uid);
      if(remove && !sheet.photos.some(p=>p.id===photo.id)) return {sheet};
      if (!remove && sheet.photos.some(p => p.id === photo.id)) {
        check(sheet.photos.some(p => p.id === photo.id && p.path === photo.path), "Identificator de fotografie reutilizat.", 409);
        return {sheet};
      }
      const photos = remove
        ? sheet.photos.filter((p) => p.id !== photo.id)
        : [...sheet.photos, photo];
      check(photos.length <= 4, "Fișa permite maximum 4 fotografii.");
      tx.update(ref, {
        photos,
        revision: sheet.revision + 1,
        updatedAt: new Date().toISOString(),
      });
      return { sheet: { ...sheet, photos, revision: sheet.revision + 1 } };
    });
  }
  return {
    create,
    edit,
    start,
    save,
    stop,
    sign,
    continueWork,
    complete,
    list,
    attachPhoto,
  };
}
