import test from "node:test";
import assert from "node:assert/strict";
import { Timestamp } from "firebase-admin/firestore";
import { NextRequest } from "next/server";
import PizZip from "pizzip";

test("HR document downloads normalize Firestore dates before generating documents", async (t) => {
  // Initialize an isolated demo project; all database reads below are stubbed.
  process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS = "true";
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "demo-fom-document-test";
  process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:9";
  process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9";
  const { adminDb } = require("../firebase/admin");
  const { documentHandlers } = require("./document-http");
  const createdAt = Timestamp.fromDate(new Date("2026-11-04T16:30:27.592Z"));
  let row: Record<string, any>;
  t.mock.method(adminDb, "collection", (collection: string) => ({
    doc: (id: string) => ({
      get: async () => ({
        id,
        exists: collection === "hrRequests",
        data: () => collection === "hrRequests" ? row : undefined,
      }),
    }),
  }));
  const { GET } = documentHandlers(async () => ({ uid: "test-user" }));
  const request = (id = "test-request") => new NextRequest(
    `https://example.invalid/api/mobile/document?requestId=${encodeURIComponent(id)}`,
  );
  const fixture = (kind: string) => ({
    kind,
    requesterUid: "test-user",
    employeeId: "test-employee",
    employeeName: "Angajat Test",
    sectorId: "test-sector",
    documentSerial: 57,
    status: "approved",
    createdAt,
    updatedAt: createdAt,
    payload: {
      kind,
      reason: "Document de test",
      startDate: "2026-11-04",
      endDate: "2026-11-05",
      clientName: "Client Test",
      date: "2026-11-04",
      overtimeHours: 1,
    },
  });
  try {
    for (const kind of ["DEL", "CO", "CFP"]) {
      await t.test(`${kind}: actual DOCX template renders with a Firestore Timestamp`, async () => {
        row = fixture(kind);
        const response = await GET(request());
        assert.equal(response.status, 200, await response.clone().text());
        assert.match(response.headers.get("Content-Type")!, /wordprocessingml/);
        assert.match(response.headers.get("Content-Disposition")!, /\.docx/);
        const zip = new PizZip(Buffer.from(await response.arrayBuffer()));
        const xml = zip.file("word/document.xml")!.asText();
        assert.match(xml, /04\.11\.2026/);
        assert.doesNotMatch(xml, /Invalid Date|\{\{/);
        assert.equal(row.createdAt, createdAt, "source record is unchanged");
      });
    }
    await t.test("existing PDF requests still download as PDF", async () => {
      row = fixture("ADD_OVERTIME");
      const response = await GET(request());
      assert.equal(response.status, 200);
      assert.match(response.headers.get("Content-Type")!, /application\/pdf/);
      assert.equal(Buffer.from(await response.arrayBuffer()).subarray(0, 5).toString(), "%PDF-");
    });
    await t.test("another employee cannot download the request", async () => {
      row = { ...fixture("DEL"), requesterUid: "another-user" };
      const response = await GET(request());
      assert.equal(response.status, 403);
    });
    await t.test("invalid identifiers are rejected", async () => {
      assert.equal((await GET(request("../invalid"))).status, 400);
    });
  } finally {
    t.mock.restoreAll();
    await adminDb.terminate();
  }
});
