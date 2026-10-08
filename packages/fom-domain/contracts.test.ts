import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assertCommand,
  emptyBundle,
  readBootstrap,
  FOM_CONTRACT_VERSION,
  interventionPatch,
  validateRevision,
  validateProducts,
  isPngSignature,
  requestCreateDraft,
  requestPeriod,
  timestampMillis,
  equipmentFor,
  assigned,
  readInstallation,
  type Command,
  type CanonicalCommand,
} from "./index";
import { fields, signatures, verifyQr } from "./installation-validation";
import { validateHrRequestCreateInput } from "./hr-validation";
import { validateHrRequestCreateInput as webHrValidation } from "../../lib/hr/request-validation";
import { fields as webInstallationFields } from "../../lib/installations/validation";
const png =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB1UAAAAASUVORK5CYII=";
const command = (
  action: Command["action"],
  payload: Command["payload"],
): Command => ({
  mutationId: "contract_command",
  action,
  entityId: "work-1",
  occurredAt: "2026-10-07T10:00:00Z",
  baseVersion: null,
  payload,
});
const sections = [
  {
    id: "root__root",
    title: "Control",
    items: [{ id: "item-1", label: "Stare", state: "functional" as const }],
  },
];
test("all action payloads retain the Next.js contract and old unversioned queues", () => {
  const fixtures: CanonicalCommand[] = [
    { ...command("verify", {}), action: "verify", payload: { code: "QR-1" } },
    {
      ...command("intervention.save", {}),
      action: "intervention.save",
      payload: {
        constatareLaLocatie: "Constatare",
        statusEchipament: "Funcțional",
      },
    },
    {
      ...command("postpone", {}),
      action: "postpone",
      payload: { motivAmanare: "Piesa necesară lipsește" },
    },
    {
      ...command("revision.save", {}),
      action: "revision.save",
      payload: { equipmentId: "eq-1", sections },
    },
    {
      ...command("report.later", {}),
      action: "report.later",
      payload: { products: [] },
    },
    {
      ...command("report.finalize", {}),
      action: "report.finalize",
      payload: { semnaturaTehnician: png, semnaturaBeneficiar: png },
    },
    {
      ...command("attendance.start", {}),
      action: "attendance.start",
      payload: { specialDayConfirmed: true },
    },
    {
      ...command("attendance.stop", {}),
      action: "attendance.stop",
      payload: {},
    },
    {
      ...command("request.create", {}),
      action: "request.create",
      payload: {
        kind: "CO",
        sectorId: "department-1",
        payload: { kind: "CO", startDate: "2026-12-01", endDate: "2026-12-02" },
      },
    },
    {
      ...command("notification.read", {}),
      action: "notification.read",
      payload: {},
    },
    {
      ...command("installation", {}),
      action: "installation",
      payload: { action: "start", equipmentId: "eq-1", qrRaw: "QR-1" },
    },
  ];
  for (const fixture of fixtures) {
    assert.doesNotThrow(() =>
      assertCommand(JSON.parse(JSON.stringify(fixture))),
    );
    assert.doesNotThrow(() =>
      assertCommand({ ...fixture, contractVersion: FOM_CONTRACT_VERSION }),
    );
  }
});
test("reject malformed envelope, unsupported versions, and payloads before writing", () => {
  for (const change of [
    { contractVersion: 2 },
    { entityId: "" },
    { baseVersion: 1 },
    { payload: [] },
    { occurredAt: "never" },
    { predecessorId: "foreign/path" },
  ])
    assert.throws(() =>
      assertCommand({ ...command("verify", { code: "QR" }), ...change }),
    );
  assert.throws(() =>
    assertCommand(command("postpone", { motivAmanare: "scurt" })),
  );
  assert.throws(() =>
    assertCommand(command("notification.read", { tehnicieni: ["outsider"] })),
  );
  assert.throws(() =>
    assertCommand(
      command("revision.save", {
        equipmentId: "eq",
        sections: [{ id: "x", title: "X", items: null }],
      }),
    ),
  );
  assert.throws(() =>
    assertCommand(
      command("request.create", {
        kind: "CO",
        sectorId: "department",
        payload: { kind: "CM", startDate: "2026-12-01", endDate: "2026-12-02" },
      }),
    ),
  );
});
test("legacy fields and frozen snapshots roundtrip without migration or mutation", () => {
  const legacy = {
    id: "old",
    tipLucrare: "Intervenție",
    statusLucrare: "Finalizat",
    tehnicieni: ["Tehnician"],
    echipamentCod: "OLD-QR",
    anOldExtension: { keep: true },
    raportSnapshot: {
      dataGenerare: "2020-01-01T10:00:00Z",
      clientInfo: { nume: "Nume semnat" },
      numarRaport: "#000012",
      imaginiDefecte: [
        { url: "https://storage.test/legacy.jpg", fileName: "legacy.jpg" },
      ],
      products: [{ name: "Legacy", quantity: 0, price: 0, um: "buc" }],
    },
  };
  const bundle = { ...emptyBundle(), works: [legacy] };
  const before = JSON.stringify(bundle);
  assert.deepEqual(
    readBootstrap({ projectId: "demo-contract", bundle }, "demo-contract")
      .works[0],
    legacy,
  );
  assert.equal(JSON.stringify(bundle), before);
  assert(
    assigned(legacy, {
      uid: "tech",
      displayName: "Tehnician",
      role: "tehnician",
    }),
  );
  assert.equal(equipmentFor(legacy)[0].code, "OLD-QR");
  assert.throws(() =>
    readBootstrap({ projectId: "other", bundle }, "demo-contract"),
  );
  assert.throws(() =>
    readBootstrap(
      { projectId: "demo-contract", contractVersion: 2, bundle },
      "demo-contract",
    ),
  );
  assert.throws(() =>
    readBootstrap(
      { projectId: "demo-contract", bundle: { ...bundle, works: [{}] } },
      "demo-contract",
    ),
  );
});
test("warranty writes are whitelisted and preserve private note as a separate field", () => {
  const patch = interventionPatch(
    {
      constatareLaLocatie: "C",
      notaInternaTehnician: "Internă",
      tehnicianGarantieDecizie: "nu_intra",
      tehnicianGarantieNuIntraMotiv: " Uzură ",
      necesitaOferta: false,
      comentariiOferta: "old",
      raportGenerat: true,
      tehnicieni: [],
    },
    { tipLucrare: "Intervenție în garanție" },
  );
  assert.equal(patch.tehnicianGarantieNuIntraMotiv, "Uzură");
  assert.equal(patch.tehnicianConfirmaGarantie, false);
  assert.equal(patch.comentariiOferta, "");
  assert(!("raportGenerat" in patch));
  assert(!("tehnicieni" in patch));
  assert.throws(() =>
    interventionPatch(
      { tehnicianGarantieDecizie: "nu_intra" },
      { tipLucrare: "Intervenție în garanție" },
    ),
  );
});
test("revision identity and states must match the equipment's frozen checklist", () => {
  assert.deepEqual(
    validateRevision(sections, sections),
    sections.map((s) => ({
      ...s,
      items: s.items.map((i) => ({ ...i, obs: "" })),
    })),
  );
  assert.throws(() =>
    validateRevision([{ ...sections[0], id: "other" }], sections),
  );
  assert.throws(() =>
    validateRevision(
      [
        {
          ...sections[0],
          items: [{ ...sections[0].items[0], state: undefined }],
        },
      ],
      sections,
    ),
  );
});
test("portable PNG validation and products preserve the web formats", () => {
  assert(isPngSignature(png));
  assert(!isPngSignature("data:image/png;base64,SGVsbG8="));
  assert.deepEqual(
    validateProducts([
      { name: "Piesă", quantity: "2", price: "25", um: "buc", total: 999 },
    ]),
    [{ id: "", name: "Piesă", quantity: 2, price: 25, um: "buc", total: 50 }],
  );
  assert.throws(() =>
    validateProducts([{ name: "Piesă", quantity: -1, price: 25 }]),
  );
});
test("web import paths and mobile imports execute the same HR and installation validators", () => {
  assert.equal(webHrValidation, validateHrRequestCreateInput);
  assert.equal(webInstallationFields, fields);
  const input = {
    finding: "Constatare",
    operations: "Montaj",
    installationStatus: "blocked",
    blockReason: "Piese lipsă",
    internalNote: "Internă",
  };
  assert.deepEqual(fields(input, true), input);
  assert.throws(() => fields({ ...input, blockReason: "" }, true));
  const signed = signatures(
    {
      beneficiaryName: "Beneficiar",
      technicianSignature: png,
      beneficiarySignature: png,
      technicianName: "Spoof",
    },
    "Principal",
  );
  assert.equal(signed.technicianName, "Principal");
  verifyQr(
    '{"type":"equipment","id":"eq","code":"QR","client":"Client","location":"Loc"}',
    { id: "eq", code: "QR", name: "Eq", model: "" },
    "Client",
    "Loc",
  );
  assert.throws(() =>
    verifyQr(
      "other",
      { id: "eq", code: "QR", name: "Eq", model: "" },
      "Client",
      "Loc",
    ),
  );
});
test("offline medical draft is distinct from server-ready request", () => {
  const input = {
    kind: "CM",
    sectorId: "department",
    payload: { kind: "CM", startDate: "2026-12-01", endDate: "2026-12-02" },
  };
  assert.deepEqual(requestCreateDraft(input, true), input);
  assert.throws(() => assertCommand(command("request.create", input)));
  assert.throws(() => requestCreateDraft(input));
  assert.equal(
    requestPeriod({
      payload: {
        kind: "IN",
        date: "2026-12-01",
        startTime: "10:00",
        endTime: "11:00",
      },
    }).start,
    "2026-12-01",
  );
});
test("timestamp adapters support existing SDK/numeric/JSON values without changing stored fields", () => {
  const ms = Date.parse("2026-10-07T10:00:00Z");
  assert.equal(timestampMillis(ms), ms);
  assert.equal(timestampMillis(new Date(ms).toISOString()), ms);
  assert.equal(timestampMillis({ seconds: ms / 1000, nanoseconds: 0 }), ms);
  assert.equal(timestampMillis({ toMillis: () => ms }), ms);
  assert.equal(timestampMillis("invalid"), undefined);
});
test("installation reads reject unknown schema versions and malformed sessions", () => {
  const value = {
    work: { id: "work", installation: { schemaVersion: 1 } },
    canStart: true,
    sheets: [],
    currentSession: null,
  };
  assert.equal(readInstallation(value), value);
  assert.throws(() =>
    readInstallation({
      ...value,
      work: { ...value.work, installation: { schemaVersion: 2 } },
    }),
  );
  assert.throws(() =>
    readInstallation({ ...value, currentSession: { role: "principal" } }),
  );
});
