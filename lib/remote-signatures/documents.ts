import {
  FieldValue,
  type Firestore,
  type Transaction,
} from "firebase-admin/firestore";
import {
  assigned,
  failureCauses,
  revisionEquipmentIds,
  validateProducts,
} from "@/packages/fom-domain";
import { fields, signatures, workDate } from "@/lib/installations/validation";
import { sheetParticipants } from "@/lib/installations/team";
import { revisionStoppedTime } from "@/lib/technician/revision-stopped-time";
import { revisionReportSnapshot } from "@/lib/technician/revision-report-snapshot";
import { resolveDocumentClientSnapshot } from "@/lib/work-documents/document-client-snapshot";
import { linkedClientId } from "@/lib/client-work-links";
import {
  check,
  clean,
  digest,
  identifier,
  pick,
  type Data,
  type Target,
} from "./core";

export const REPORT_KEYS = [
  "client",
  "clientId",
  "locationId",
  "locatie",
  "clientInfo",
  "persoanaContact",
  "telefon",
  "tipLucrare",
  "defectReclamat",
  "echipament",
  "echipamentCod",
  "echipamentId",
  "equipmentIds",
  "constatareLaLocatie",
  "descriereInterventie",
  "statusEchipament",
  "cauzaPrincipalaDefectId",
  "cauzaPrincipalaDefect",
  "products",
  "imaginiDefecte",
  "timpSosire",
  "timpPlecare",
  "dataSosire",
  "oraSosire",
  "dataPlecare",
  "oraPlecare",
  "durataInterventie",
  "nrLucrare",
  "numarRaport",
  "revisionEquipmentTimes",
  "dataInterventie",
  "tehnicieni",
];

async function clientSnapshot(db: Firestore, tx: Transaction, w: Data) {
  const id = linkedClientId(w);
  const clients = id
    ? [await tx.get(db.collection("clienti").doc(identifier(id)))]
    : (
        await tx.get(
          db.collection("clienti").where("nume", "==", w.client).limit(2),
        )
      ).docs;
  check(
    clients.length === 1 && clients[0].exists,
    "Clientul documentului nu poate fi identificat sigur.",
    409,
  );
  return resolveDocumentClientSnapshot(w, {
    ...clients[0].data(),
    id: clients[0].id,
  });
}

/** All reads occur before the caller writes. No attendance is required for a beneficiary confirmation. */
export async function sourceDocument(
  db: Firestore,
  tx: Transaction,
  t: Target,
  uid: string,
) {
  const user = (
    await tx.get(db.collection("users").doc(identifier(uid)))
  ).data();
  check(
    user &&
      !user.disabled &&
      ["tehnician", "admin", "dispecer"].includes(user.role),
    "Autorul solicitării nu mai are acces.",
    403,
  );
  const ref = db.collection("lucrari").doc(t.workId),
    snap = await tx.get(ref),
    w = snap.data();
  check(w, "Tichet indisponibil.", 404);
  check(
    !w.anulat &&
      !w.archivedAt &&
      !["Anulat", "Anulată", "Arhivată", "Amânată", "Finalizat"].includes(
        w.statusLucrare,
      ),
    "Tichetul nu mai permite semnarea.",
    409,
  );
  const actor = { ...user, uid } as any;
  const assignment = {
    contentEpoch: w.remoteSignatureEpoch || 0,
    technicianIds: [...(w.technicianIds || [])].sort(),
    tehnicieni: [...(w.tehnicieni || [])].sort(),
    assignmentVersion: w.installation?.assignmentVersion || 0,
  };
  // The same permissions apply to requesting and to a later confirmation.
  const manager = ["admin", "dispecer"].includes(user.role);
  check(
    manager || assigned(w, actor),
    "Tichetul nu mai este atribuit autorului solicitării.",
    403,
  );
  if (!manager && user.displayName) {
    const matches = await tx.get(
      db.collection("users").where("displayName", "==", user.displayName),
    );
    check(
      matches.docs.filter((d) => d.data().role === "tehnician").length === 1,
      "Nume de tehnician ambiguu.",
      409,
    );
  }
  if (t.kind === "report") {
    check(
      !w.installation?.schemaVersion &&
        !w.raportDataLocked &&
        w.statusLucrare === "Fără semnătură",
      "Salvează mai întâi prin «Semnează mai târziu».",
      409,
    );
    check(
      w.equipmentVerified || w.tipLucrare === "Revizie",
      "Echipamentul nu a fost verificat.",
      409,
    );
    check(
      w.timpPlecare && Number.isFinite(Date.parse(w.timpPlecare)),
      "Oprește lucrul înainte de solicitarea semnăturii.",
      409,
    );
    if (w.tipLucrare === "Intervenție contra cost")
      check(
        String(w.constatareLaLocatie || "").trim() &&
          String(w.descriereInterventie || "").trim(),
        "Completează constatarea și operațiunile.",
      );
    const settings = (await tx.get(db.collection("settings"))).docs.map(
      (d) => ({ ...d.data(), id: d.id }),
    );
    const cause = failureCauses(settings).find(
      (c) => c.id === w.cauzaPrincipalaDefectId,
    );
    check(cause, "Selectează cauza principală a defectului.");
    const client = await clientSnapshot(db, tx, w);
    let revisions: Data[] = [];
    if (w.tipLucrare === "Revizie") {
      revisions = revisionReportSnapshot(
        (await tx.get(ref.collection("revisions"))).docs.map((d) => {
          const { updatedAt, createdAt, completedAt, ...content } = d.data();
          return { ...content, id: d.id };
        }),
      );
      check(
        revisionStoppedTime(w) &&
          revisionEquipmentIds(w).every(
            (id) =>
              w.revision?.equipmentStatus?.[id] === "done" &&
              revisions.some((r) => r.id === id),
          ),
        "Completează și oprește toate fișele de revizie.",
        409,
      );
    }
    const document = clean({
      ...pick(w, REPORT_KEYS),
      products: validateProducts(w.products || []),
      cauzaPrincipalaDefect: cause.label,
      clientSnapshot: client,
      numarRaport: w.nrLucrare || w.numarRaport || t.workId,
      mobileRevisionSnapshot: revisions,
      id: t.workId,
    });
    return {
      document,
      source: clean({
        document,
        assignment,
        technicianName: user.displayName || "",
      }),
      technicianName: user.displayName || "",
      work: w,
    };
  }
  check(
    w.installation?.schemaVersion === 1 && !w.installation.closedReason,
    "Instalarea nu mai permite semnarea.",
    409,
  );
  if (t.kind === "sheet") {
    const sheet = (
      await tx.get(ref.collection("installationSheets").doc(t.sheetId!))
    ).data();
    check(
      sheet &&
        sheet.state === "awaiting_signature" &&
        sheet.frozenDocument &&
        w.installation.awaitingSheetByEquipment?.[sheet.equipmentId] ===
          t.sheetId,
      "Fișa nu mai așteaptă semnături.",
      409,
    );
    check(
      sheetParticipants(sheet as any).some((p) => p.uid === uid),
      "Numai un participant poate solicita semnarea fișei.",
      403,
    );
    check(
      !sheet.timeIntervals?.some((i: Data) => !i.endedAt),
      "Oprește lucrul înainte de semnare.",
      409,
    );
    const content = fields(sheet, true);
    const document = clean({
      ...sheet.frozenDocument,
      ...pick(content, [
        "finding",
        "operations",
        "installationStatus",
        "blockReason",
      ]),
    });
    return {
      document,
      source: clean({
        document,
        assignment,
        technicianName: user.displayName || "",
        equipmentId: sheet.equipmentId,
        contentEpoch: sheet.remoteSignatureEpoch || 0,
      }),
      technicianName: user.displayName || "",
      work: w,
      sheet,
    };
  }
  check(
    !w.installation.continuationWorkId,
    "Procesul-verbal se emite din ultimul tichet.",
    409,
  );
  const root = identifier(w.installation.rootWorkId);
  check(
    !(
      await tx.get(
        db
          .collection("lucrari")
          .doc(root)
          .collection("installationCompletion")
          .doc("final"),
      )
    ).exists,
    "Procesul-verbal este deja semnat.",
    409,
  );
  const chain = await tx.get(
    db.collection("lucrari").where("installation.rootWorkId", "==", root),
  );
  const byId = new Map(chain.docs.map((d) => [d.id, d.data()]));
  const equipment = new Map<string, Data>(),
    statuses = new Map<string, string>(),
    sheetReferences: Data[] = [],
    chainEvidence: Data[] = [];
  let cursor: string | undefined = root;
  const visited = new Set<string>();
  while (cursor) {
    check(!visited.has(cursor), "Lanț de continuare invalid.", 409);
    visited.add(cursor);
    const work = byId.get(cursor);
    check(
      work && !work.anulat && !work.archivedAt,
      "Istoricul instalării este incomplet.",
      409,
    );
    check(
      !Object.keys(work.installation.activeSheetByEquipment || {}).length &&
        !Object.keys(work.installation.awaitingSheetByEquipment || {}).length,
      "Există fișe active sau nesemnate.",
      409,
    );
    for (const e of work.installation.equipment)
      if (
        !work.installation.continuationWorkId ||
        work.installation.equipmentStatus[e.id] === "done"
      ) {
        equipment.set(e.id, e);
        statuses.set(e.id, work.installation.equipmentStatus[e.id]);
      }
    const sheets = await tx.get(
      db.collection("lucrari").doc(cursor).collection("installationSheets"),
    );
    for (const s of sheets.docs) {
      const sheet = s.data();
      check(
        sheet.state === "closed" &&
          sheet.documentSnapshot?.technicianSignature &&
          sheet.documentSnapshot?.beneficiarySignature,
        "Există fișe nesemnate.",
        409,
      );
      sheetReferences.push({
        workId: cursor,
        sheetId: s.id,
        workDate: sheet.workDate,
        equipmentName: sheet.documentSnapshot.equipment[0].name,
      });
      chainEvidence.push({
        workId: cursor,
        sheetId: s.id,
        hash: digest(sheet.documentSnapshot),
      });
    }
    if (!work.installation.continuationWorkId)
      check(
        cursor === t.workId,
        "Tichetul nu mai este ultimul din instalare.",
        409,
      );
    cursor = work.installation.continuationWorkId;
  }
  check(
    equipment.size && [...statuses.values()].every((s) => s === "done"),
    "Toate echipamentele trebuie finalizate.",
    409,
  );
  const document = clean({
    client: await clientSnapshot(db, tx, w),
    workNumber: String(w.nrLucrare || t.workId),
    equipment: [...equipment.values()],
    photos: [],
    sheetReferences,
  });
  return {
    document,
    source: clean({
      document,
      assignment,
      chainEvidence,
      technicianName: user.displayName || "",
    }),
    technicianName: user.displayName || "",
    work: w,
    root,
  };
}

/** Called inside the same transaction that consumes the confirmation challenge. */
export function commitDocument(
  db: Firestore,
  tx: Transaction,
  request: Data,
  current: Awaited<ReturnType<typeof sourceDocument>>,
  now: string,
) {
  const t = request.target as Target,
    ref = db.collection("lucrari").doc(t.workId);
  const sig = signatures(
    {
      technicianSignature: request.technicianSignature,
      beneficiarySignature: request.signature,
      beneficiaryName: request.beneficiaryName,
    },
    request.technicianName,
  );
  const evidence = {
    requestId: request.id,
    email: request.email,
    signedAt: now,
    documentHash: request.documentHash,
    signatureHash: digest(request.signature),
    declarationVersion: request.declarationVersion,
  };
  if (t.kind === "report") {
    const document = clean({
      ...request.document,
      semnaturaTehnician: sig.technicianSignature,
      semnaturaBeneficiar: sig.beneficiarySignature,
      numeTehnician: sig.technicianName,
      numeBeneficiar: sig.beneficiaryName,
      numarRaport:
        current.work.nrLucrare || current.work.numarRaport || t.workId,
      dataGenerare: now,
    });
    tx.update(ref, {
      semnaturaTehnician: sig.technicianSignature,
      semnaturaBeneficiar: sig.beneficiarySignature,
      numeTehnician: sig.technicianName,
      numeBeneficiar: sig.beneficiaryName,
      raportSnapshot: document,
      numarRaport: document.numarRaport,
      raportGenerat: true,
      raportDataLocked: true,
      statusFinalizareInterventie: "FINALIZAT",
      statusLucrare: "Finalizat",
      preluatDispecer: false,
      remoteSignatureEvidence: evidence,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return document;
  }
  const document = clean({
    ...request.document,
    ...sig,
    signedByUid: request.requesterUid,
  });
  if (t.kind === "sheet") {
    const s = current.sheet!;
    tx.update(ref.collection("installationSheets").doc(t.sheetId!), {
      state: "closed",
      closedAt: now,
      updatedAt: now,
      revision: s.revision + 1,
      documentSnapshot: document,
      signedByUid: request.requesterUid,
      signRequestId: request.id,
      signedAssignmentVersion: current.work.installation.assignmentVersion || 0,
      remoteSignatureEvidence: evidence,
    });
    tx.update(ref, {
      [`installation.awaitingSheetByEquipment.${s.equipmentId}`]:
        FieldValue.delete(),
      [`installation.equipmentStatus.${s.equipmentId}`]:
        s.installationStatus === "completed" ? "done" : s.installationStatus,
      updatedAt: FieldValue.serverTimestamp(),
    });
  } else {
    tx.create(
      db
        .collection("lucrari")
        .doc(current.root!)
        .collection("installationCompletion")
        .doc("final"),
      {
        id: "final",
        terminalWorkId: t.workId,
        signedBy: request.requesterUid,
        createdAt: now,
        documentSnapshot: document,
        remoteSignatureEvidence: evidence,
      },
    );
    tx.update(ref, {
      "installation.closedReason": "completed",
      "installation.completionDocumentId": "final",
      statusLucrare: "Finalizat",
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  tx.create(ref.collection("installationAudit").doc(`remote_${request.id}`), {
    action: "remote.sign",
    uid: request.requesterUid,
    beneficiaryEmail: request.email,
    at: now,
    requestId: request.id,
    ...(t.sheetId ? { sheetId: t.sheetId } : {}),
  });
  return document;
}
