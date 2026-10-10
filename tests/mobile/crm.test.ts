import { test, after } from "node:test";
import assert from "node:assert/strict";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import {
  technicianCrmService,
  CrmError,
} from "../../lib/crm/technician-service";
import { CRM_COLLECTIONS as K } from "../../lib/crm/constants";
import type { CrmCommand, CrmAction } from "../../packages/fom-domain/crm";
if (
  !["127.0.0.1:18189", "127.0.0.1:8189"].includes(
    process.env.FIRESTORE_EMULATOR_HOST || "",
  )
)
  throw new Error("Local CRM Emulator required");
const app = initializeApp(
    {
      projectId:
        process.env.FIRESTORE_EMULATOR_HOST === "127.0.0.1:18189"
          ? "demo-fom-crm"
          : "demo-fom-mobile-auth",
    },
    "crm-tests",
  ),
  db = getFirestore(app),
  service = technicianCrmService(db, () => new Date("2026-10-10T10:00:00Z"));
const prefix = `crm-${Date.now()}`,
  tech = `${prefix}-tech`,
  other = `${prefix}-other`,
  admin = `${prefix}-admin`,
  clientId = `${prefix}-client`,
  opp = `${prefix}-opp`;
let seq = 0;
const command = (
  action: CrmAction,
  entityId: string | undefined,
  payload: any = {},
): CrmCommand => ({
  id: `${prefix}-command-${++seq}`,
  action,
  entityId,
  payload,
});
const row = async (c: string, id: string, value: any) =>
  db
    .collection(c)
    .doc(id)
    .set({ createdAt: Timestamp.now(), ...value });
async function seed() {
  await Promise.all([
    row("users", tech, { role: "tehnician", displayName: "Fixture" }),
    row("users", other, { role: "tehnician", displayName: "Other" }),
    row("users", admin, { role: "admin" }),
    row("clienti", clientId, {
      nume: "Client Fixture",
      reprezentantFirma: "Contact",
      telefon: "0700000000",
      persoaneContact: [
        { id: "contact-1", nume: "Contact secundar", telefon: "07111" },
      ],
    }),
    row(K.opportunities, opp, {
      title: "Fixture",
      code: "OP.12",
      clientId,
      ownerId: tech,
      readUserIds: [tech],
      editUserIds: [tech],
      priority: "MEDIUM",
      pipelineStage: "OFERTA_TRANSMISA",
      opportunityType: "VANZARI",
      updatedAt: Timestamp.fromDate(new Date("2026-10-10T08:00:00Z")),
    }),
  ]);
}
test("shared server service parity and permissions", async (t) => {
  await seed();
  await t.test(
    "roles, owner, read/edit sharing and explicit permissions",
    async () => {
      await assert.rejects(() => service.list(admin), /Nu ai acces/);
      await assert.rejects(() => service.detail(other, opp), /acces/);
      assert.ok((await service.list(tech)).some((o) => o.id === opp));
      await row(K.opportunityAccess, `${prefix}-permission`, {
        userId: other,
        opportunityId: opp,
        permission: "VIEW",
      });
      assert.equal((await service.detail(other, opp)).opportunity.id, opp);
      await row(K.opportunities, `${prefix}-shared`, {
        clientId,
        title: "Shared",
        ownerId: other,
        readUserIds: [tech],
        editUserIds: [],
        opportunityType: "VANZARI",
        pipelineStage: "OFERTA_TRANSMISA",
      });
      assert.ok(
        (await service.list(tech)).some((o) => o.id === `${prefix}-shared`),
      );
    },
  );
  await t.test(
    "visibility and only assigned tasks; offers exclude portal authentication secrets",
    async () => {
      await Promise.all([
        row(K.notes, `${prefix}-private`, {
          opportunityId: opp,
          content: "SECRET",
          visibility: "PRIVATE",
          createdById: other,
        }),
        row(K.notes, `${prefix}-custom`, {
          opportunityId: opp,
          content: "Visible",
          visibility: "CUSTOM",
          visibleToUserIds: [tech],
          createdById: other,
        }),
        row(K.tasks, `${prefix}-task`, {
          opportunityId: opp,
          title: "Assigned",
          assigneeId: tech,
          status: "TODO",
          visibility: "GENERAL",
          createdById: other,
        }),
        row(K.tasks, `${prefix}-foreign`, {
          opportunityId: opp,
          title: "Foreign",
          assigneeId: other,
          status: "TODO",
          visibility: "GENERAL",
          createdById: other,
        }),
        row(K.offers, `${prefix}-offer`, {
          opportunityId: opp,
          version: 1,
          status: "SENT",
          snapshot: { total: 100 },
          actionToken: "SECRET-TOKEN",
          verification: { codeHash: "SECRET-HASH" },
        }),
      ]);
      const d = await service.detail(other, opp);
      assert.equal(
        d.notes.some((n) => n.id === `${prefix}-custom`),
        false,
      );
      const own = await service.detail(tech, opp);
      assert.deepEqual(
        own.tasks.map((t) => t.id),
        [`${prefix}-task`],
      );
      assert.equal(own.capabilities.createTask, false);
      assert.equal(own.capabilities.offerEvidence, false);
      assert.equal(JSON.stringify(own.offers).includes("SECRET"), false);
      await assert.rejects(
        () =>
          service.command(
            tech,
            command("task.update", `${prefix}-foreign`, {
              status: "IN_PROGRESS",
            }),
          ),
        /proprii/,
      );
    },
  );
  await t.test(
    "create opportunity idempotently and preserve contact/access/counter/activity",
    async () => {
      const c = command("opportunity.create", undefined, {
        title: "New",
        clientId,
        ownerId: tech,
        priority: "HIGH",
        pipelineStage: "OFERTA_TRANSMISA",
        opportunityType: "VANZARI",
        assignedReadUserIds: [other],
        contactIds: ["contact-1"],
      });
      const [a, b] = await Promise.all([
        service.command(tech, c),
        service.command(tech, c),
      ]);
      assert.deepEqual(a, b);
      assert.equal(
        (await service.detail(other, a.entityId)).opportunity.title,
        "New",
      );
      const logs = await db
        .collection(K.activityLogs)
        .where("opportunityId", "==", a.entityId)
        .where("type", "==", "CREATED")
        .get();
      assert.equal(logs.size, 1);
      assert.deepEqual((await service.detail(tech, a.entityId)).contactIds, [
        "contact-1",
      ]);
      assert.deepEqual(await service.receipt(tech, c.id), a);
      await assert.rejects(
        () =>
          service.command(tech, {
            ...c,
            payload: { ...c.payload, title: "Different" },
          }),
        /reutilizat/,
      );
    },
  );
  await t.test(
    "metadata allowlist, conflicts, stage loss reason and automation once",
    async () => {
      await assert.rejects(
        () =>
          service.command(
            tech,
            command("opportunity.update", opp, { ownerId: other }),
          ),
        /nepermise/,
      );
      await assert.rejects(
        () =>
          service.command(tech, {
            ...command("opportunity.update", opp, { priority: "URGENT" }),
            expectedUpdatedAt: "2000-01-01",
          }),
        /modificate/,
      );
      await assert.rejects(
        () =>
          service.command(
            tech,
            command("opportunity.stage", opp, { toStage: "OFERTA_REFUZATA" }),
          ),
        /Motivul/,
      );
      const c = command("opportunity.stage", opp, {
        toStage: "NEGOCIERE_OFERTA",
      });
      await service.command(tech, c);
      await service.command(tech, c);
      const tasks = await db
        .collection(K.tasks)
        .where("opportunityId", "==", opp)
        .where("automationKey", "==", "stage_negociere_oferta_actualizare")
        .get();
      assert.equal(tasks.size, 1);
      await service.command(
        tech,
        command("opportunity.stage", opp, {
          toStage: "OFERTA_REFUZATA",
          lostReason: "Fixture",
          createRecontactTask: true,
        }),
      );
      assert.equal(
        (await service.detail(tech, opp)).opportunity.lostReason,
        "Fixture",
      );
    },
  );
  await t.test(
    "task update/reassign, completion and delete; forbidden task fields",
    async () => {
      await assert.rejects(
        () =>
          service.command(
            tech,
            command("task.update", `${prefix}-task`, { visibility: "GENERAL" }),
          ),
        /nepermise/,
      );
      await service.command(
        tech,
        command("task.update", `${prefix}-task`, {
          taskType: "VIZITA_CLIENT",
          dueAt: "2026-10-12T06:00:00Z",
          status: "IN_PROGRESS",
        }),
      );
      await service.command(tech, command("task.complete", `${prefix}-task`));
      assert.equal(
        (await db.doc(`${K.tasks}/${prefix}-task`).get()).data()?.status,
        "CU_SUCCES",
      );
      await service.command(tech, command("task.delete", `${prefix}-task`));
      assert.equal(
        (await db.doc(`${K.opportunities}/${opp}`).get())
          .data()
          ?.searchIndex?.includes("assigned"),
        false,
      );
      assert.equal(
        (await db.doc(`${K.tasks}/${prefix}-task`).get()).exists,
        false,
      );
    },
  );
  await t.test(
    "conversations only participants; confirmation creates one reply; legacy notes retained",
    async () => {
      const created = await service.command(
        tech,
        command("thread.create", undefined, {
          toUserId: other,
          message: "Confirmă",
          requiresConfirmation: true,
          deadlineAt: "2026-10-11T06:00:00Z",
        }),
      );
      const messages = (await service.thread(other, created.entityId)).messages;
      assert.equal(messages.length, 1);
      await assert.rejects(
        () =>
          service.command(
            tech,
            command("thread.confirm", created.entityId, {
              messageId: messages[0].id,
            }),
          ),
        /destinatarul/,
      );
      const confirmation = command("thread.confirm", created.entityId, {
        messageId: messages[0].id,
        confirmationMessage: "Primit",
      });
      await service.command(other, confirmation);
      await service.command(other, confirmation);
      const conversation = await service.thread(tech, created.entityId);
      assert.equal(conversation.messages.length, 2);
      assert.equal(conversation.thread.lastMessageCycleStatus, "CONFIRMED");
      await assert.rejects(
        () =>
          service.command(
            tech,
            command("thread.reply", created.entityId, {
              toUserId: admin,
              message: "Add outsider",
            }),
          ),
        /neeligibil|participă/,
      );
      await row(K.internalNotes, `${prefix}-legacy`, {
        fromUserId: other,
        toUserId: tech,
        message: "Legacy",
        status: "PENDING",
      });
      assert.ok(
        (await service.internal(tech)).legacyNotes.some(
          (n) => n.id === `${prefix}-legacy`,
        ),
      );
      await service.command(
        tech,
        command("internalNote.confirm", `${prefix}-legacy`, {}),
      );
      assert.equal(
        (await db.doc(`${K.internalNotes}/${prefix}-legacy`).get()).data()
          ?.status,
        "CONFIRMED",
      );
    },
  );
  await t.test(
    "common inbox category/status only and atomic linking without duplicate email",
    async () => {
      const id = `${prefix}-email`;
      await row(K.inboxMessages, id, {
        subject: "Fixture",
        from: "test@example.test",
        to: [],
        bodySnippet: "Test",
        receivedAt: Timestamp.now(),
        status: "NEW",
        category: "OFERTA",
      });
      await assert.rejects(
        () =>
          service.command(
            tech,
            command("inbox.update", id, { assignedToUserId: other }),
          ),
        /nepermise/,
      );
      await service.command(
        tech,
        command("inbox.update", id, {
          status: "IN_PROGRESS",
          category: "SUPORT",
        }),
      );
      const link = command("inbox.link", id, {
        opportunityId: opp,
        linkMethod: "manual_existing",
      });
      await Promise.all([
        service.command(tech, link),
        service.command(tech, link),
      ]);
      const emails = await db
        .collection(K.emails)
        .where("sourceInboxMessageId", "==", id)
        .get();
      assert.equal(emails.size, 1);
      assert.equal(
        (await db.doc(`${K.inboxMessages}/${id}`).get()).data()?.status,
        "DONE",
      );
      await assert.rejects(
        () =>
          service.command(
            tech,
            command("inbox.link", id, { opportunityId: `${prefix}-shared` }),
          ),
        /deja asociat/,
      );
    },
  );
  await t.test(
    "new client writes legacy schema, prevents duplicate CIF and validates equipment",
    async () => {
      const payload = {
        client: {
          nume: "Client nou",
          telefon: "0700",
          reprezentantFirma: "Fixture",
          cif: prefix,
          persoaneContact: [{ nume: "A", telefon: "B" }],
          locatii: [
            {
              nume: "Sediu",
              echipamente: [
                {
                  nume: "Motor",
                  cod: "MOT12",
                  dynamicSettings: {
                    "revision.checklistParentId": "fixture-template",
                  },
                },
              ],
            },
          ],
          customFields: { test: "custom" },
        },
      };
      const c = command("client.create", undefined, payload),
        result = await service.command(tech, c);
      assert.deepEqual(await service.command(tech, c), result);
      const saved = (await db.doc(`clienti/${result.entityId}`).get()).data()!;
      assert.equal(saved.id, result.entityId);
      assert.ok(saved.locatii[0].echipamente[0].id);
      assert.ok(saved.persoaneContact[0].id);
      assert.equal(saved.customFields.test, "custom");
      await assert.rejects(
        () =>
          service.command(tech, command("client.create", undefined, payload)),
        /CUI/,
      );
      await assert.rejects(
        () =>
          service.command(
            tech,
            command("client.create", undefined, {
              client: {
                ...payload.client,
                cif: prefix + "2",
                locatii: [{ echipamente: [{ nume: "Bad", cod: "12" }] }],
              },
            }),
          ),
        /cod/,
      );
    },
  );
});
after(async () => {
  for (const c of Object.values(K)) {
    const docs = await db.collection(c).get();
    for (const d of docs.docs) {
      if (
        d.id.startsWith(prefix) ||
        d.data().createdById === tech ||
        d.data().actorId === tech ||
        d.data().linkedByUserId === tech ||
        d.data().opportunityId === opp
      ) {
        if (c === K.internalThreads) await db.recursiveDelete(d.ref);
        else await d.ref.delete();
      }
    }
  }
  for (const c of ["users", "clienti", "crm_command_receipts", "logs"]) {
    const docs = await db.collection(c).get();
    for (const d of docs.docs)
      if (
        d.id.startsWith(prefix) ||
        d.data().crmCreatedById === tech ||
        d.data().uid === tech ||
        d.data().uid === other ||
        d.data().userId === tech ||
        d.data().utilizatorId === tech
      )
        await d.ref.delete();
  }
  await deleteApp(app);
});
