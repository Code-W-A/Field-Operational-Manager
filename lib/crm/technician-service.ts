import { createHash } from "node:crypto";
import {
  FieldValue,
  Timestamp,
  type Firestore,
  type Transaction,
  type DocumentReference,
  type Query,
} from "firebase-admin/firestore";
import {
  CRM_COLLECTIONS as K,
  CRM_OPPORTUNITY_SELECTABLE_TYPES,
  CRM_PRIORITIES,
  CRM_WORK_STATUSES,
  CRM_TASK_STATUSES,
  CRM_TASK_TYPES,
  CRM_STAGE_AUTOMATION,
  CRM_PIPELINE_STAGE_LABELS,
  formatOpportunityCode,
  normalizePipelineStageForOpportunityType,
  isPipelineStageAllowedForOpportunityType,
  isLostPipelineStage,
  isWonPipelineStageForOpportunityType,
} from "./constants";
import { canViewByVisibility, hasOpportunityViewAccess } from "./access";
import { resolveLegacyCrmContacts } from "./resolved-contacts";
import {
  ensureClientContactIds,
  deriveLegacyPrimaryClientContact,
} from "../client-contacts";
import {
  assertCrmCommand,
  technicianCrmCapabilities,
  canConfirmCrmMessage,
  crmRecordActions,
  type CrmCommand,
  type CrmRow,
  type CrmDetail,
  type CrmResult,
  type CrmOptions,
} from "@/packages/fom-domain/crm";

export class CrmError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function crmJson(value: any): any {
  if (value == null) return value ?? null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(crmJson);
  if (typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, crmJson(v)]),
    );
  return value;
}
const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const ids = (v: unknown): string[] =>
  Array.isArray(v) ? [...new Set(v.map(text).filter(Boolean))] : [];
const safeId = (v: unknown) => {
  const s = text(v);
  if (!s || s.length > 180 || s.includes("/"))
    throw new CrmError("Identificator invalid.");
  return s;
};
const receiptId = (uid: string, id: string) =>
  createHash("sha256")
    .update(`${uid}:${safeId(id)}`)
    .digest("hex");
const required = (v: unknown, label: string) => {
  const s = text(v);
  if (!s) throw new CrmError(`${label} este obligatoriu.`);
  return s;
};
function choice(v: any, values: readonly string[], label: string) {
  if (!values.includes(v)) throw new CrmError(`${label} invalid.`);
  return v;
}
function only(p: Record<string, any>, keys: string[]) {
  if (Object.keys(p).some((k) => !keys.includes(k)))
    throw new CrmError("Câmpuri nepermise pentru tehnician.", 403);
}
function date(v: any) {
  if (v instanceof Timestamp) return v;
  if (v === null) return null;
  const d = new Date(v);
  if (!v || !Number.isFinite(d.getTime()))
    throw new CrmError("Data este invalidă.");
  return Timestamp.fromDate(d);
}
function row(s: FirebaseFirestore.DocumentSnapshot): CrmRow {
  return { ...crmJson(s.data()), id: s.id };
}
function newest(a: CrmRow, b: CrmRow) {
  return (
    new Date(b.updatedAt || b.createdAt || 0).getTime() -
    new Date(a.updatedAt || a.createdAt || 0).getTime()
  );
}
const sectionMap = {
  activity: [K.activityLogs, "ACTIVITY"],
  tasks: [K.tasks, "TASK"],
  notes: [K.notes, "NOTE"],
  files: [K.files, "FILE"],
  events: [K.calendarEvents, "CALENDAR_EVENT"],
  emails: [K.emails, "EMAIL"],
} as const;

export function technicianCrmService(db: Firestore, clock = () => new Date()) {
  const ref = (collection: string, id: string) =>
    db.collection(collection).doc(safeId(id));
  async function actor(uid: string, tx?: Transaction) {
    const r = ref("users", uid),
      snap = tx ? await tx.get(r) : await r.get();
    if (snap.data()?.role !== "tehnician" || snap.data()?.disabled === true)
      throw new CrmError("Nu ai acces la CRM-ul tehnicianului.", 403);
    return { uid, ...snap.data() } as CrmRow & { uid: string };
  }
  async function opportunity(uid: string, id: string, tx?: Transaction) {
    const r = ref(K.opportunities, id),
      snap = tx ? await tx.get(r) : await r.get();
    const q = db
      .collection(K.opportunityAccess)
      .where("opportunityId", "==", id)
      .where("userId", "==", uid)
      .limit(200);
    const access = tx ? await tx.get(q) : await q.get();
    if (
      !snap.exists ||
      !hasOpportunityViewAccess(
        snap.data() as any,
        uid,
        access.docs.map((s) => s.data().permission),
      )
    )
      throw new CrmError("Oportunitatea nu există sau nu ai acces la ea.", 403);
    return row(snap);
  }
  async function rows(
    collection: string,
    field?: string,
    value?: string,
    n = 300,
  ) {
    let q: Query = db.collection(collection);
    if (field) q = q.where(field, "==", value);
    const order: Record<string, [string, "asc" | "desc"]> = {
      [K.tasks]: ["createdAt", "desc"],
      [K.notes]: ["createdAt", "desc"],
      [K.files]: ["createdAt", "desc"],
      [K.activityLogs]: ["createdAt", "desc"],
      [K.emails]: ["createdAt", "desc"],
      [K.calendarEvents]: ["startAt", "asc"],
      users: ["displayName", "asc"],
      clienti: ["nume", "asc"],
      [K.clients]: ["name", "asc"],
    };
    if (order[collection]) q = q.orderBy(...order[collection]);
    return (await (n ? q.limit(n) : q).get()).docs.map(row);
  }
  async function contacts(clientId: string): Promise<CrmRow[]> {
    const legacy = await ref("clienti", clientId).get();
    if (legacy.exists) {
      const resolved = resolveLegacyCrmContacts(clientId, legacy.data()!);
      if (resolved.length) return crmJson(resolved) as CrmRow[];
    }
    const result = await rows(K.clientContacts, "clientId", clientId);
    result.sort(
      (a, b) =>
        String(a.locationName || "").localeCompare(
          String(b.locationName || ""),
          "ro",
        ) || String(a.name || "").localeCompare(String(b.name || ""), "ro"),
    );
    const primary = result.find((c) => !c.locationName);
    return result.map((c) => ({ ...c, isPrimary: c.id === primary?.id }));
  }
  async function client(id: string) {
    const [crm, legacy] = await Promise.all([
      ref(K.clients, id).get(),
      ref("clienti", id).get(),
    ]);
    const data = crm.exists ? crm.data() : legacy.data();
    if (!data) return null;
    return {
      id,
      name: data.name || data.nume || "",
      address: data.address || data.adresa || "",
      cui: data.cui || data.cif || "",
      type: data.type || "Persoană juridică",
    };
  }
  async function visible(
    uid: string,
    o: CrmRow,
    collection: string,
    entityType: string,
  ) {
    const [items, permissions] = await Promise.all([
      rows(collection, "opportunityId", o.id),
      rows(K.visibleTo, "opportunityId", o.id, 1000),
    ]);
    return items
      .filter((r) =>
        canViewByVisibility({
          visibility: r.visibility || "GENERAL",
          creatorId: r.createdById || r.uploadedById || r.actorId,
          userId: uid,
          opportunityOwnerId: o.ownerId,
          visibleToUserIds: r.visibleToUserIds || [],
          customVisibleRows: permissions.filter(
            (p) => p.entityType === entityType && p.entityId === r.id,
          ) as any,
        }),
      )
      .sort(newest);
  }
  async function list(uid: string) {
    await actor(uid);
    const queries = [
      db.collection(K.opportunities).where("ownerId", "==", uid),
      db
        .collection(K.opportunities)
        .where("readUserIds", "array-contains", uid),
      db
        .collection(K.opportunities)
        .where("editUserIds", "array-contains", uid),
    ];
    const [sets, access] = await Promise.all([
      Promise.all(queries.map((q) => q.get())),
      rows(K.opportunityAccess, "userId", uid, 200),
    ]);
    const map = new Map<string, CrmRow>();
    sets.forEach((s) => s.docs.forEach((d) => map.set(d.id, row(d))));
    await Promise.all(
      access
        .filter((a) => ["VIEW", "EDIT"].includes(a.permission))
        .map(async (a) => {
          const d = await ref(K.opportunities, a.opportunityId).get();
          if (d.exists) map.set(d.id, row(d));
        }),
    );
    const opportunities = [...map.values()].sort(newest),
      opportunityIds = opportunities.map((o) => o.id);
    const clients = new Map<string, any>(),
      clientContacts = new Map<string, CrmRow[]>();
    await Promise.all(
      [...new Set(opportunities.map((o) => o.clientId).filter(Boolean))].map(
        async (id) => {
          const [c, cts] = await Promise.all([client(id), contacts(id)]);
          clients.set(id, c);
          clientContacts.set(id, cts);
        },
      ),
    );
    async function bulk(collection: string) {
      const chunks: string[][] = [];
      for (let i = 0; i < opportunityIds.length; i += 30)
        chunks.push(opportunityIds.slice(i, i + 30));
      return (
        await Promise.all(
          chunks.map(async (chunk) =>
            (
              await db
                .collection(collection)
                .where("opportunityId", "in", chunk)
                .get()
            ).docs.map(row),
          ),
        )
      ).flat();
    }
    const [related, permissions, offerRows, ...entities] = await Promise.all([
      bulk(K.opportunityContacts),
      bulk(K.visibleTo),
      bulk(K.offers),
      ...Object.values(sectionMap)
        .filter(([c]) => c !== K.activityLogs)
        .map(([c]) => bulk(c)),
    ]);
    const entitySpecs = Object.values(sectionMap).filter(
      ([c]) => c !== K.activityLogs,
    );
    return opportunities.map((o) => {
      const c = clientContacts.get(o.clientId) || [],
        selected = new Set(
          [
            ...related
              .filter((r) => r.opportunityId === o.id)
              .map((r) => r.contactId),
            o.primaryContactId,
          ].filter(Boolean),
        );
      const contactSearch = c
        .filter((c) => selected.has(c.id))
        .map((c) => [c.name, c.phone, c.email, c.locationName].join(" "))
        .join(" ");
      let ownTaskCount = 0;
      const searchParts = [
        o.code,
        o.title,
        o.displayTitle,
        clients.get(o.clientId)?.name,
        contactSearch,
        ...offerRows
          .filter((r) => r.opportunityId === o.id)
          .flatMap((r) => [r.subject, r.message, r.recipientEmail]),
      ];
      entities.forEach((items, i) =>
        items
          .filter((r) => r.opportunityId === o.id)
          .forEach((r) => {
            const [, entityType] = entitySpecs[i];
            if (entityType === "TASK" && r.assigneeId !== uid) return;
            if (
              !canViewByVisibility({
                visibility: r.visibility || "GENERAL",
                creatorId: r.createdById || r.uploadedById,
                userId: uid,
                opportunityOwnerId: o.ownerId,
                visibleToUserIds: r.visibleToUserIds || [],
                customVisibleRows: permissions.filter(
                  (p) => p.entityType === entityType && p.entityId === r.id,
                ) as any,
              })
            )
              return;
            if (
              entityType === "TASK" &&
              ["TODO", "IN_PROGRESS"].includes(r.status)
            )
              ownTaskCount++;
            searchParts.push(
              r.title,
              r.content,
              r.subject,
              r.bodySnippet,
              r.from,
              r.filename,
              r.location,
            );
          }),
      );
      return {
        ...o,
        allowedActions: crmRecordActions("opportunity", o, uid),
        clientName: clients.get(o.clientId)?.name || "",
        contactSearch,
        searchIndex: searchParts.filter(Boolean).join(" ").toLowerCase(),
        ownTaskCount,
      };
    });
  }

  async function detail(uid: string, id: string): Promise<CrmDetail> {
    await actor(uid);
    const o = await opportunity(uid, id);
    const entries = await Promise.all(
      Object.entries(sectionMap).map(
        async ([name, [collection, type]]) =>
          [name, await visible(uid, o, collection, type)] as const,
      ),
    );
    const sections = Object.fromEntries(entries) as any;
    sections.tasks = sections.tasks
      .filter((t: CrmRow) => t.assigneeId === uid)
      .map((t: CrmRow) => ({
        ...t,
        status:
          t.status === "DONE"
            ? "CU_SUCCES"
            : t.status === "CANCELED"
              ? "FARA_SUCCES"
              : t.status,
      }));
    sections.events.sort(
      (a: CrmRow, b: CrmRow) =>
        new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
    );
    const offers = (await rows(K.offers, "opportunityId", id))
      .map(
        ({
          id,
          version,
          status,
          snapshot,
          recipientEmail,
          recipientName,
          subject,
          message,
          response,
          responseCertifiedPdf,
          sentAt,
          createdAt,
          updatedAt,
          pdfFilename,
          pdfStoragePath,
          pdfMime,
          opportunityId,
          createdById,
          actionExpiresAt,
          actionUsedAt,
        }) => ({
          id,
          version,
          status,
          snapshot,
          recipientEmail,
          recipientName,
          subject,
          message,
          response,
          responseCertifiedPdf: responseCertifiedPdf
            ? {
                generatedAt: responseCertifiedPdf.generatedAt,
                filename: responseCertifiedPdf.filename,
                storagePath: responseCertifiedPdf.storagePath,
              }
            : null,
          sentAt,
          createdAt,
          updatedAt,
          pdfFilename,
          hasPdf: !!pdfStoragePath,
          pdfMime,
          opportunityId,
          createdById,
          actionExpiresAt,
          actionUsedAt,
        }),
      )
      .sort((a, b) => b.version - a.version);
    const withActions = (
      kind: Parameters<typeof crmRecordActions>[0],
      r: CrmRow,
    ) => ({ ...r, allowedActions: crmRecordActions(kind, r, uid) });
    Object.keys(sections).forEach((key) => {
      sections[key] = sections[key].map((r: CrmRow) =>
        withActions(
          key === "tasks" ? "task" : key === "files" ? "file" : "readonly",
          r,
        ),
      );
    });
    return {
      opportunity: { ...withActions("opportunity", o), searchIndex: undefined },
      client: await client(o.clientId),
      contacts: await contacts(o.clientId),
      contactIds: (
        await rows(K.opportunityContacts, "opportunityId", id, 200)
      ).map((c) => c.contactId),
      ...sections,
      offers: offers.map((r) => withActions("offer", r)),
      capabilities: technicianCrmCapabilities,
    };
  }
  async function options(uid: string): Promise<CrmOptions> {
    await actor(uid);
    const [
      users,
      crm,
      legacy,
      settings,
      documentation,
      documentationFolders,
      documentationSubfolders,
    ] = await Promise.all([
      rows("users", undefined, undefined, 0),
      rows(K.clients, undefined, undefined, 0),
      rows("clienti", undefined, undefined, 0),
      rows("settings", undefined, undefined, 0),
      rows("documentatii_files", undefined, undefined, 0),
      rows("documentatii_folders", undefined, undefined, 0),
      rows("documentatii_subfolders", undefined, undefined, 0),
    ]);
    const clients = new Map<string, CrmRow>();
    [...crm, ...legacy].forEach((c) => {
      if (!clients.has(c.id))
        clients.set(c.id, {
          id: c.id,
          name: c.name || c.nume,
          address: c.address || c.adresa,
          cui: c.cui || c.cif,
          type: c.type || "Persoană juridică",
        });
    });
    const tree = (target: string) => {
      const selected = new Set(
        settings
          .filter((s) => s.assignedTargets?.includes(target))
          .map((s) => s.id),
      );
      for (let i = 0; i < settings.length; i++) {
        const count = selected.size;
        settings.forEach((s) => {
          if (selected.has(s.parentId)) selected.add(s.id);
        });
        if (count === selected.size) break;
      }
      return settings.filter((s) => selected.has(s.id));
    };
    return {
      users: users
        .filter((u) => !["client", "kiosk"].includes(u.role))
        .map((u) => ({
          id: u.id,
          uid: u.id,
          displayName: u.displayName || u.email || u.id,
          email: u.email || "",
          role: u.role,
        })),
      clients: [...clients.values()]
        .filter((c) => c.name)
        .sort((a, b) => a.name.localeCompare(b.name, "ro")),
      clientFields: tree("dialogs.client.new"),
      equipmentFields: tree("dialogs.equipment.new"),
      documentation,
      documentationFolders,
      documentationSubfolders,
      revisionTemplates: tree("revisions.checklist.sections"),
      capabilities: technicianCrmCapabilities,
    };
  }
  async function internal(uid: string) {
    await actor(uid);
    const [threads, inbox, sent] = await Promise.all([
      db
        .collection(K.internalThreads)
        .where("participantUserIds", "array-contains", uid)
        .limit(300)
        .get(),
      rows(K.internalNotes, "toUserId", uid),
      rows(K.internalNotes, "fromUserId", uid),
    ]);
    return {
      threads: threads.docs
        .map(row)
        .map((r) => ({
          ...r,
          allowedActions: crmRecordActions("thread", r, uid),
        }))
        .sort(newest),
      legacyNotes: [
        ...new Map([...inbox, ...sent].map((n) => [n.id, n])).values(),
      ]
        .map((r) => ({
          ...r,
          allowedActions: crmRecordActions("legacy", r, uid),
        }))
        .sort(newest),
    };
  }
  async function thread(uid: string, id: string) {
    await actor(uid);
    const snap = await ref(K.internalThreads, id).get();
    if (!snap.exists || !ids(snap.data()?.participantUserIds).includes(uid))
      throw new CrmError("Nu ai acces la conversație.", 403);
    const messages = (
      await snap.ref.collection("messages").orderBy("createdAt", "asc").get()
    ).docs
      .map(row)
      .map((r) => ({
        ...r,
        allowedActions: crmRecordActions("message", r, uid),
      }));
    return {
      thread: { ...row(snap), allowedActions: ["thread.reply"] } as CrmRow,
      messages,
    };
  }
  async function receipt(uid: string, id: string) {
    await actor(uid);
    const d = await ref("crm_command_receipts", receiptId(uid, id)).get();
    return d.exists ? d.data()?.result : null;
  }

  async function command(uid: string, input: CrmCommand): Promise<CrmResult> {
    try {
      assertCrmCommand(input);
    } catch (e) {
      throw new CrmError((e as Error).message);
    }
    const hash = createHash("sha256")
      .update(JSON.stringify(input))
      .digest("hex");
    const now = clock(),
      stamp = Timestamp.fromDate(now),
      generated = createHash("sha256")
        .update(`${uid}:${input.id}`)
        .digest("hex")
        .slice(0, 28);
    return db.runTransaction(async (tx) => {
      const profile = await actor(uid, tx);
      const receiptRef = ref("crm_command_receipts", receiptId(uid, input.id)),
        previous = await tx.get(receiptRef);
      if (previous.exists) {
        if (previous.data()?.hash !== hash)
          throw new CrmError(
            "Identificatorul operației a fost reutilizat cu alte date.",
            409,
          );
        return previous.data()!.result as CrmResult;
      }
      const writes: Array<() => void> = [],
        p = input.payload,
        result: CrmResult = {
          id: input.id,
          action: input.action,
          entityId: input.entityId || generated,
        };
      const put = (r: DocumentReference, data: any) =>
        writes.push(() => tx.set(r, crmJsonForWrite(data), { merge: true }));
      const remove = (r: DocumentReference) => writes.push(() => tx.delete(r));
      const read = async (collection: string, id: string) => {
        const r = ref(collection, id),
          s = await tx.get(r);
        if (!s.exists) throw new CrmError("Înregistrarea nu există.", 404);
        return { ...s.data(), id: s.id } as CrmRow;
      };
      const activity = (
        o: string,
        type: string,
        payload: any,
        visibility = "GENERAL",
        visibleToUserIds: string[] = [],
      ) =>
        put(ref(K.activityLogs, `${generated}-${writes.length}`), {
          opportunityId: o,
          actorId: uid,
          type,
          payload,
          visibility,
          visibleToUserIds,
          createdAt: stamp,
        });
      const checkVersion = (r: CrmRow) => {
        if (
          input.expectedUpdatedAt &&
          crmJson(r.updatedAt) !== input.expectedUpdatedAt
        )
          throw new CrmError(
            "Datele au fost modificate între timp. Reîncarcă și încearcă din nou.",
            409,
          );
      };
      const user = async (id: string) => {
        const u = await read("users", id);
        if (["client", "kiosk"].includes(u.role))
          throw new CrmError("Utilizator neeligibil.");
      };
      const query = async (q: Query) =>
        (await tx.get(q)).docs.map(
          (s) => ({ ...s.data(), id: s.id }) as CrmRow,
        );
      const search = async (
        o: CrmRow,
        changes: Record<string, any> = {},
        extraParts: string[] = [],
        excludedId?: string,
      ) => {
        const c = await client(o.clientId);
        const cts = (await contacts(o.clientId)).map((c) =>
          changes.contactId === c.id
            ? {
                ...c,
                name: changes.name,
                phone: changes.phone,
                email: changes.email,
              }
            : c,
        );
        const rel = await query(
          db
            .collection(K.opportunityContacts)
            .where("opportunityId", "==", o.id)
            .limit(200),
        );
        const parts = [
          o.code,
          o.title,
          o.displayTitle,
          c?.name,
          ...extraParts,
          ...cts
            .filter(
              (c) =>
                rel.some((r) => r.contactId === c.id) ||
                c.id === o.primaryContactId,
            )
            .flatMap((c) => [c.name, c.phone, c.email, c.locationName]),
        ];
        for (const [collection, keys] of [
          [K.tasks, ["title"]],
          [K.notes, ["content"]],
          [K.internalNotes, ["message", "confirmationMessage"]],
          [K.emails, ["subject", "bodySnippet", "from"]],
          [K.calendarEvents, ["title", "location"]],
          [K.files, ["filename"]],
          [K.offers, ["subject", "message", "recipientEmail"]],
        ] as [string, string[]][]) {
          const entries = await query(
            db
              .collection(collection)
              .where("opportunityId", "==", o.id)
              .limit(300),
          );
          entries
            .filter((r) => r.id !== excludedId)
            .forEach((r) => keys.forEach((k) => parts.push(r[k])));
        }
        put(ref(K.opportunities, o.id), {
          searchIndex: [
            ...new Set(
              parts.filter(Boolean).map((s) => String(s).trim().toLowerCase()),
            ),
          ].join(" "),
          searchIndexUpdatedAt: stamp,
        });
      };
      if (input.action === "opportunity.create") {
        only(p, [
          "title",
          "clientId",
          "ownerId",
          "priority",
          "pipelineStage",
          "opportunityType",
          "assignedReadUserIds",
          "contactIds",
          "primaryContactId",
          "inboxMessageId",
        ]);
        const title = required(p.title, "Titlul"),
          clientId = safeId(p.clientId),
          ownerId = safeId(p.ownerId);
        if (!(await client(clientId)))
          throw new CrmError("Clientul nu există.");
        await user(ownerId);
        const readUsers = ids(p.assignedReadUserIds);
        await Promise.all(readUsers.map(user));
        const type = choice(
            p.opportunityType,
            CRM_OPPORTUNITY_SELECTABLE_TYPES,
            "Tip",
          ),
          priority = choice(p.priority, CRM_PRIORITIES, "Prioritate"),
          stage = normalizePipelineStageForOpportunityType(
            type,
            p.pipelineStage,
          );
        const cts = await contacts(clientId),
          contactIds = ids(p.contactIds);
        if (
          [...contactIds, p.primaryContactId]
            .filter(Boolean)
            .some((id) => !cts.some((c) => c.id === id))
        )
          throw new CrmError("Contactul nu aparține clientului.");
        const counter = ref(K.counters, "opportunity"),
          c = await tx.get(counter),
          number = Number(c.data()?.nextNumber || 0) + 1;
        if (number > 999999)
          throw new CrmError("S-a atins limita maximă de oportunități.");
        let inbox: CrmRow | undefined;
        if (p.inboxMessageId) {
          inbox = await read(K.inboxMessages, p.inboxMessageId);
          if (inbox.opportunityId)
            throw new CrmError("Emailul este deja asociat.", 409);
        }
        const code = formatOpportunityCode(number),
          editUsers = ids([ownerId, uid]);
        const o = {
          id: generated,
          number,
          code,
          title,
          displayTitle: `${code} - ${title}`,
          clientId,
          primaryContactId: p.primaryContactId || null,
          ownerId,
          priority,
          workStatus: "OPEN",
          pipelineStage: stage,
          opportunityType: type,
          amount: null,
          closeDate: null,
          wonAt: null,
          lostAt: null,
          lostReason: null,
          createdById: uid,
          updatedById: uid,
          readUserIds: ids([...editUsers, ...readUsers]),
          editUserIds: editUsers,
          createdAt: stamp,
          updatedAt: stamp,
          searchIndex: [
            code,
            title,
            (await client(clientId))?.name,
            ...cts
              .filter((c) => contactIds.includes(c.id))
              .flatMap((c) => [c.name, c.phone, c.email, c.locationName]),
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase(),
        };
        put(counter, { nextNumber: number });
        put(ref(K.opportunities, generated), o);
        contactIds.forEach((contactId, i) =>
          put(ref(K.opportunityContacts, `${generated}-${i}`), {
            opportunityId: generated,
            contactId,
            createdAt: stamp,
          }),
        );
        activity(generated, "CREATED", {
          code,
          opportunity: { ...o, assignedReadUserIds: readUsers, stage },
        });
        if (inbox) await linkInbox(inbox, o, "created_from_email");
        result.code = code;
      } else if (input.action === "client.create") {
        only(p, ["client"]);
        const raw = p.client;
        if (!raw || typeof raw !== "object")
          throw new CrmError("Date client invalide.");
        only(raw, [
          "nume",
          "cif",
          "cui",
          "regCom",
          "adresa",
          "email",
          "telefon",
          "reprezentantFirma",
          "functieReprezentant",
          "persoaneContact",
          "persoanaContact",
          "locatii",
          "dynamicSettings",
          "customFields",
          "contBancar",
          "banca",
          "numarLucrari",
        ]);
        for (const k of ["nume", "telefon", "reprezentantFirma"])
          required(raw[k], k);
        if (
          text(raw.cif) &&
          (
            await query(
              db
                .collection("clienti")
                .where("cif", "==", text(raw.cif))
                .limit(1),
            )
          ).length
        )
          throw new CrmError("Există deja un client cu acest CUI/CIF.", 409);
        const cs = Array.isArray(raw.persoaneContact)
          ? raw.persoaneContact.filter((c: any) =>
              Object.values(c).some(Boolean),
            )
          : [];
        if (cs.some((c: any) => !text(c.nume) || !text(c.telefon)))
          throw new CrmError(
            "Numele și telefonul contactelor sunt obligatorii.",
          );
        const locs = (Array.isArray(raw.locatii) ? raw.locatii : []).map(
          (l: any, i: number) => ({
            ...l,
            id: l.id || `${generated}-loc-${i}`,
            persoaneContact: (l.persoaneContact || []).map(
              (c: any, j: number) => ({
                ...c,
                id: c.id || `${generated}-loc-${i}-c-${j}`,
              }),
            ),
            echipamente: (l.echipamente || [])
              .filter((e: any) => text(e.nume) && text(e.cod))
              .map((e: any, j: number) => ({
                ...e,
                id: e.id || `${generated}-eq-${i}-${j}`,
              })),
          }),
        );
        const codes = locs.flatMap((l: any) =>
          l.echipamente.map((e: any) => text(e.cod)),
        );
        if (new Set(codes).size !== codes.length)
          throw new CrmError("Codurile echipamentelor trebuie să fie unice.");
        if (
          locs.some((l: any) =>
            l.echipamente.some(
              (e: any) =>
                e.cod.length > 10 ||
                !/[a-zA-Z]/.test(e.cod) ||
                !/[0-9]/.test(e.cod) ||
                !e.dynamicSettings?.["revision.checklistParentId"],
            ),
          )
        )
          throw new CrmError(
            "Echipamentul necesită cod cu litere și cifre (maximum 10 caractere) și checklist de revizie.",
          );
        const allClients = codes.length
          ? await query(db.collection("clienti"))
          : [];
        if (
          allClients.some((c) =>
            (c.locatii || []).some((l: any) =>
              (l.echipamente || []).some((e: any) =>
                codes.includes(text(e.cod)),
              ),
            ),
          )
        )
          throw new CrmError("Cod de echipament existent.", 409);
        const data = {
          ...raw,
          id: generated,
          cui: raw.cif || raw.cui || "",
          numarLucrari: 0,
          persoaneContact: ensureClientContactIds(generated, cs),
          persoanaContact: cs[0]?.nume || raw.reprezentantFirma,
          locatii: locs,
          createdAt: stamp,
          updatedAt: stamp,
          crmCreatedById: uid,
        };
        put(ref("clienti", generated), data);
        put(ref("logs", `crm-${generated}`), {
          utilizatorId: uid,
          utilizator: profile.displayName || profile.email || "Utilizator",
          actiune: "Creare client",
          categorie: "Clienți",
          tip: "Informație",
          detalii: `ID: ${generated}; nume: ${raw.nume}; email: ${raw.email || "-"}`,
          timestamp: stamp,
        });
      } else if (input.action === "client.photo") {
        only(p, ["locationId", "equipmentId", "fileId", "url", "path"]);
        const c = await read("clienti", result.entityId);
        if (c.crmCreatedById !== uid)
          throw new CrmError("Nu poți modifica acest client.", 403);
        const upload = await read(
          "crm_equipment_uploads",
          `${uid}-${safeId(p.fileId)}`,
        );
        if (
          upload.clientId !== c.id ||
          upload.locationId !== p.locationId ||
          upload.equipmentId !== p.equipmentId ||
          upload.path !== p.path ||
          upload.url !== p.url
        )
          throw new CrmError("Fotografie neautorizată.", 403);
        let found = false;
        const locs = (c.locatii || []).map((l: any) =>
          l.id === p.locationId
            ? {
                ...l,
                echipamente: (l.echipamente || []).map((e: any) => {
                  if (e.id !== p.equipmentId) return e;
                  found = true;
                  return { ...e, fotoPath: upload.path, fotoUrl: upload.url };
                }),
              }
            : l,
        );
        if (!found) throw new CrmError("Echipamentul nu există.", 404);
        put(ref("clienti", c.id), { locatii: locs, updatedAt: stamp });
      } else if (
        input.action.startsWith("opportunity.") ||
        input.action === "contact.update"
      ) {
        const o = await opportunity(uid, result.entityId, tx);
        checkVersion(o);
        if (input.action === "contact.update") {
          only(p, [
            "clientId",
            "contactId",
            "name",
            "phone",
            "email",
            "functie",
          ]);
          if (p.clientId !== o.clientId)
            throw new CrmError("Client neautorizat.", 403);
          const c = await read("clienti", o.clientId),
            primary = deriveLegacyPrimaryClientContact(c.id, c),
            name = required(p.name, "Numele"),
            phone = required(p.phone, "Telefonul");
          let found = false;
          const edit = (c: any) => {
            if (c.id !== p.contactId) return c;
            found = true;
            return {
              ...c,
              nume: name,
              telefon: phone,
              email: text(p.email),
              functie: text(p.functie),
            };
          };
          const locatii = (c.locatii || []).map((l: any) => ({
              ...l,
              persoaneContact: (l.persoaneContact || []).map(edit),
            })),
            persoaneContact = (c.persoaneContact || []).map(edit);
          const primaryPatch =
            primary?.id === p.contactId && !found
              ? {
                  reprezentantFirma: name,
                  persoanaContact: name,
                  telefon: phone,
                  email: text(p.email),
                  functieReprezentant: text(p.functie),
                }
              : {};
          if (!found && !Object.keys(primaryPatch).length)
            throw new CrmError("Contactul nu a fost găsit.");
          put(ref("clienti", c.id), {
            locatii,
            persoaneContact,
            ...primaryPatch,
            updatedAt: stamp,
          });
          await search(o, {
            contactId: p.contactId,
            name,
            phone,
            email: p.email,
          });
        } else if (input.action === "opportunity.update") {
          only(p, ["priority", "workStatus", "primaryContactId"]);
          if (p.priority) choice(p.priority, CRM_PRIORITIES, "Prioritate");
          if (p.workStatus) choice(p.workStatus, CRM_WORK_STATUSES, "Status");
          if (
            p.primaryContactId &&
            !(await contacts(o.clientId)).some(
              (c) => c.id === p.primaryContactId,
            )
          )
            throw new CrmError("Contact invalid.");
          put(ref(K.opportunities, o.id), {
            ...p,
            updatedAt: stamp,
            updatedById: uid,
          });
          activity(o.id, "UPDATED", { changes: p });
          await search({ ...o, ...p });
        } else {
          only(p, ["toStage", "lostReason", "createRecontactTask"]);
          if (
            !isPipelineStageAllowedForOpportunityType(
              o.opportunityType,
              p.toStage,
            )
          )
            throw new CrmError("Etapă invalidă pentru tipul oportunității.");
          if (isLostPipelineStage(p.toStage))
            required(p.lostReason, "Motivul pierderii");
          const automatic = await query(
            db
              .collection(K.tasks)
              .where("opportunityId", "==", o.id)
              .limit(300),
          );
          const stages = [
            ...(CRM_STAGE_AUTOMATION[p.toStage] || []),
            ...(isLostPipelineStage(p.toStage) && p.createRecontactTask
              ? [
                  {
                    key: "stage_pierdut_recontactare",
                    title: "Recontactare lead pierdut",
                    dueDaysOffset: 14,
                  },
                ]
              : []),
          ];
          const patch: any = {
            pipelineStage: p.toStage,
            updatedAt: stamp,
            updatedById: uid,
          };
          if (isLostPipelineStage(p.toStage))
            Object.assign(patch, {
              lostAt: stamp,
              lostReason: text(p.lostReason),
              wonAt: null,
            });
          else if (
            isWonPipelineStageForOpportunityType(o.opportunityType, p.toStage)
          )
            Object.assign(patch, {
              wonAt: stamp,
              lostAt: null,
              lostReason: null,
            });
          put(ref(K.opportunities, o.id), patch);
          activity(o.id, "STAGE_CHANGED", {
            from: o.pipelineStage,
            to: p.toStage,
            fromLabel:
              CRM_PIPELINE_STAGE_LABELS[o.pipelineStage] || o.pipelineStage,
            toLabel: CRM_PIPELINE_STAGE_LABELS[p.toStage] || p.toStage,
            lostReason: p.lostReason || null,
          });
          stages
            .filter((a) => !automatic.some((t) => t.automationKey === a.key))
            .forEach((a) => {
              const taskId = createHash("sha256")
                .update(`${o.id}:${a.key}`)
                .digest("hex")
                .slice(0, 28);
              put(ref(K.tasks, taskId), {
                opportunityId: o.id,
                title: a.title,
                status: "TODO",
                taskType: null,
                createdById: uid,
                assigneeId: o.ownerId,
                dueAt: Timestamp.fromMillis(
                  now.getTime() + a.dueDaysOffset * 86400000,
                ),
                visibility: "PRIVATE",
                visibleToUserIds: [],
                automationKey: a.key,
                createdAt: stamp,
                updatedAt: stamp,
              });
              activity(
                o.id,
                "TASK_CREATED",
                { taskId, title: a.title },
                "PRIVATE",
              );
            });
          await search(
            { ...o, ...patch },
            {},
            stages
              .filter((a) => !automatic.some((t) => t.automationKey === a.key))
              .map((a) => a.title),
          );
        }
      } else if (input.action.startsWith("task.")) {
        only(
          p,
          input.action === "task.update"
            ? ["status", "taskType", "assigneeId", "dueAt"]
            : [],
        );
        const t = await read(K.tasks, result.entityId),
          o = await opportunity(uid, t.opportunityId, tx);
        checkVersion(rowDate(t));
        const v = await query(
          db
            .collection(K.visibleTo)
            .where("entityId", "==", t.id)
            .where("entityType", "==", "TASK"),
        );
        if (
          t.assigneeId !== uid ||
          !canViewByVisibility({
            visibility: t.visibility || "GENERAL",
            creatorId: t.createdById,
            userId: uid,
            opportunityOwnerId: o.ownerId,
            visibleToUserIds: t.visibleToUserIds,
            customVisibleRows: v as any,
          })
        )
          throw new CrmError(
            "Poți gestiona numai sarcinile proprii vizibile.",
            403,
          );
        if (input.action === "task.delete") {
          remove(ref(K.tasks, t.id));
          v.forEach((r) => remove(ref(K.visibleTo, r.id)));
          activity(o.id, "TASK_DELETED", { taskId: t.id, task: t });
        } else {
          const patch: any = { updatedAt: stamp, updatedById: uid };
          if (input.action === "task.complete") patch.status = "CU_SUCCES";
          if (p.status)
            patch.status = choice(p.status, CRM_TASK_STATUSES, "Status");
          if ("taskType" in p)
            patch.taskType = p.taskType
              ? choice(p.taskType, CRM_TASK_TYPES, "Tip sarcină")
              : null;
          if ("assigneeId" in p) {
            if (p.assigneeId) await user(p.assigneeId);
            patch.assigneeId = p.assigneeId || null;
          }
          if ("dueAt" in p) patch.dueAt = date(p.dueAt);
          put(ref(K.tasks, t.id), patch);
          activity(o.id, "TASK_UPDATED", {
            taskId: t.id,
            before: t,
            changes: patch,
          });
          if (input.action === "task.complete")
            activity(o.id, "TASK_COMPLETED", {
              taskId: t.id,
              task: { ...t, ...patch },
              completedAt: now.toISOString(),
            });
        }
        await search(
          o,
          {},
          [],
          input.action === "task.delete" ? t.id : undefined,
        );
      } else if (input.action.startsWith("thread.")) {
        const creating = input.action === "thread.create";
        let thread: CrmRow | undefined;
        if (!creating) {
          thread = await read(K.internalThreads, result.entityId);
          if (!ids(thread.participantUserIds).includes(uid))
            throw new CrmError("Nu ai acces la conversație.", 403);
        }
        const threadId = creating ? generated : result.entityId;
        let message: any;
        let cycle = "NONE";
        if (input.action === "thread.confirm") {
          only(p, ["messageId", "confirmationMessage"]);
          const m = await read(
            `${K.internalThreads}/${threadId}/messages`,
            safeId(p.messageId),
          );
          if (m.fromUserId === uid || m.toUserId !== uid)
            throw new CrmError(
              "Doar destinatarul poate confirma mesajul.",
              403,
            );
          if (!m.requiresConfirmation || m.cycleStatus !== "PENDING") {
            result.messageId = m.id;
          } else {
            const confirmation = text(p.confirmationMessage) || "Confirmat";
            put(ref(`${K.internalThreads}/${threadId}/messages`, m.id), {
              cycleStatus: "CONFIRMED",
              confirmedAt: stamp,
              confirmedById: uid,
              confirmationMessage: confirmation,
              updatedAt: stamp,
            });
            message = {
              toUserId: m.fromUserId,
              message: confirmation,
              context: thread?.context || m.context || null,
              requiresConfirmation: false,
              deadlineAt: null,
              replyToMessageId: m.id,
            };
            cycle = "CONFIRMED";
          }
        } else {
          only(p, [
            "toUserId",
            "message",
            "context",
            "requiresConfirmation",
            "deadlineAt",
            "replyToMessageId",
          ]);
          await user(safeId(p.toUserId));
          if (p.toUserId === uid)
            throw new CrmError(
              "Destinatarul trebuie să fie un alt utilizator.",
            );
          if (
            !creating &&
            !ids(thread?.participantUserIds).includes(p.toUserId)
          )
            throw new CrmError(
              "Destinatarul nu participă la conversație.",
              403,
            );
          if (p.replyToMessageId)
            await read(
              `${K.internalThreads}/${threadId}/messages`,
              p.replyToMessageId,
            );
          cycle = p.requiresConfirmation === true ? "PENDING" : "NONE";
          message = {
            toUserId: p.toUserId,
            message: required(p.message, "Mesajul"),
            context: text(p.context) || null,
            requiresConfirmation: p.requiresConfirmation === true,
            deadlineAt:
              p.requiresConfirmation && p.deadlineAt
                ? date(p.deadlineAt)
                : null,
            replyToMessageId: p.replyToMessageId || null,
          };
        }
        if (message) {
          const messageId = `${generated}-msg`;
          put(ref(`${K.internalThreads}/${threadId}/messages`, messageId), {
            threadId,
            ...message,
            fromUserId: uid,
            cycleStatus: message.requiresConfirmation ? "PENDING" : "NONE",
            confirmedAt: null,
            confirmedById: null,
            confirmationMessage: null,
            createdById: uid,
            createdAt: stamp,
            updatedAt: stamp,
          });
          put(ref(K.internalThreads, threadId), {
            ...(creating ? { createdById: uid, createdAt: stamp } : {}),
            participantUserIds: ids([
              ...(thread?.participantUserIds || []),
              uid,
              message.toUserId,
            ]),
            context: message.context || thread?.context || null,
            updatedAt: stamp,
            lastMessageId: messageId,
            lastMessageAt: stamp,
            lastMessageById: uid,
            lastMessagePreview: message.message.slice(0, 180),
            lastMessageCycleStatus: cycle,
            lastMessageFromUserId: uid,
            lastMessageToUserId: message.toUserId,
            lastMessageDeadlineAt: message.deadlineAt,
          });
          result.entityId = threadId;
          result.messageId = messageId;
        }
      } else if (input.action === "internalNote.confirm") {
        only(p, ["confirmationMessage"]);
        const n = await read(K.internalNotes, result.entityId);
        if (n.toUserId !== uid || n.fromUserId === uid)
          throw new CrmError("Doar destinatarul poate confirma nota.", 403);
        if (n.status !== "CONFIRMED") {
          put(ref(K.internalNotes, n.id), {
            status: "CONFIRMED",
            confirmationMessage: text(p.confirmationMessage) || null,
            confirmedAt: stamp,
            confirmedById: uid,
            updatedAt: stamp,
          });
          if (n.opportunityId) {
            await opportunity(uid, n.opportunityId, tx);
            activity(n.opportunityId, "INTERNAL_NOTE_CONFIRMED", {
              ...n,
              confirmationMessage: text(p.confirmationMessage) || null,
              status: "CONFIRMED",
              confirmedAt: stamp,
            });
          }
        }
      } else if (input.action === "inbox.update") {
        only(p, ["category", "status"]);
        await read(K.inboxMessages, result.entityId);
        if (p.category)
          choice(
            p.category,
            [
              "OFERTA",
              "FACTURARE",
              "SUPORT",
              "INSTALARE",
              "ADMIN",
              "SPAM",
              "UNCLASSIFIED",
            ],
            "Categorie",
          );
        if (p.status)
          choice(p.status, ["NEW", "IN_PROGRESS", "DONE", "IGNORED"], "Status");
        put(ref(K.inboxMessages, result.entityId), { ...p, updatedAt: stamp });
      } else if (input.action === "inbox.link") {
        only(p, ["opportunityId", "linkMethod"]);
        const n = await read(K.inboxMessages, result.entityId),
          o = await opportunity(uid, safeId(p.opportunityId), tx);
        if (n.opportunityId && n.opportunityId !== o.id)
          throw new CrmError(
            "Emailul este deja asociat altei oportunități.",
            409,
          );
        if (!n.opportunityId)
          await linkInbox(
            n,
            o,
            choice(
              p.linkMethod || "manual_existing",
              [
                "subject_code",
                "sender_contact",
                "manual_existing",
                "created_from_email",
              ],
              "Asociere",
            ),
          );
      } else throw new CrmError("Acțiune nepermisă.", 403);
      async function linkInbox(n: CrmRow, o: CrmRow, method: string) {
        const existing = await query(
          db
            .collection(K.emails)
            .where("sourceInboxMessageId", "==", n.id)
            .limit(1),
        );
        if (existing[0] && existing[0].opportunityId !== o.id)
          throw new CrmError(
            "Emailul este deja asociat altei oportunități.",
            409,
          );
        const emailId = n.crmEmailId || existing[0]?.id || `inbox-${n.id}`;
        put(ref(K.emails, emailId), {
          opportunityId: o.id,
          source: "inbox",
          direction: "IN",
          subject: n.subject || "",
          from: n.from || "",
          to: n.to || [],
          cc: n.cc || [],
          bodySnippet: n.bodySnippet || "",
          sourceInboxMessageId: n.id,
          sentAt: n.receivedAt ? date(n.receivedAt) : stamp,
          createdById: uid,
          visibility: "GENERAL",
          visibleToUserIds: [],
          createdAt: stamp,
          updatedAt: stamp,
        });
        put(ref(K.inboxMessages, n.id), {
          opportunityId: o.id,
          opportunityCode: o.code,
          linkedAt: stamp,
          linkedByUserId: uid,
          linkMethod: method,
          crmEmailId: emailId,
          status: "DONE",
          updatedAt: stamp,
        });
        activity(o.id, "EMAIL_ADDED", {
          emailId,
          subject: n.subject || "",
          sourceInboxMessageId: n.id,
        });
        if (o.searchIndex)
          put(ref(K.opportunities, o.id), {
            searchIndex: [o.searchIndex, n.subject, n.bodySnippet, n.from]
              .filter(Boolean)
              .join(" ")
              .toLowerCase(),
            searchIndexUpdatedAt: stamp,
          });
        else
          await search(o, {}, [
            n.subject || "",
            n.bodySnippet || "",
            n.from || "",
          ]);
      }
      writes.forEach((write) => write());
      tx.set(receiptRef, { uid, hash, result, createdAt: stamp });
      return result;
    });
  }
  return {
    actor,
    list,
    detail,
    options,
    contacts,
    internal,
    thread,
    receipt,
    command,
    opportunity,
  };
}
function rowDate(r: CrmRow) {
  return { ...r, updatedAt: crmJson(r.updatedAt) };
}
function crmJsonForWrite(value: any): any {
  if (
    value instanceof Timestamp ||
    value instanceof FieldValue ||
    value instanceof Date
  )
    return value;
  if (Array.isArray(value)) return value.map(crmJsonForWrite);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, crmJsonForWrite(v)]),
    );
  return value;
}
