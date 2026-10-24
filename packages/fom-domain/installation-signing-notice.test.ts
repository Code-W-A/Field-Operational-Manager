import test from "node:test";
import assert from "node:assert/strict";
import { installationSigningNotice as notice } from "./installation-signing-notice";
import type { InstallationSheet } from "./installation";

const member = { uid: "mihai", name: "Mihai Sima", role: "principal" as const, active: false };
const sheet: Partial<InstallationSheet> = {
  state: "awaiting_signature", canSign: false, principalUid: member.uid,
  principalName: member.name, participants: [member],
};
const alin = { uid: "alin", role: "tehnician" };

test("2168: assignment does not imply participation; explanation is pure", () => {
  const before = structuredClone(sheet);
  const result = notice(sheet, alin)!;
  assert.equal(result.message, "Nu poți semna această fișă deoarece nu ești înregistrat ca participant. Atribuirea pe tichet nu acordă automat drept de semnare.");
  assert.equal(result.participants, "Participant înregistrat: Mihai Sima.");
  assert.match(result.summary, /nu ești participant/);
  assert.deepEqual(sheet, before);
});

test("legacy missing participants falls back to principal, but an empty array does not", () => {
  assert.equal(notice({ ...sheet, participants: undefined }, alin)!.participants, "Participant înregistrat: Mihai Sima.");
  const empty = notice({ ...sheet, participants: [] }, alin)!;
  assert.doesNotMatch(empty.message, /nu ești înregistrat/);
  assert.doesNotMatch(empty.participants, /Mihai/);
  assert.match(empty.participants, /incomplete/);
});

for (const role of ["admin", "dispecer", undefined]) {
  test(`role ${role}: neutral explanation`, () => {
    assert.doesNotMatch(notice(sheet, { uid: "alin", role })!.message, /Nu poți|nu ești/);
  });
}

test("moved and stopped participants remain participants; canSign is never inferred", () => {
  for (const canSign of [true, false, undefined]) {
    const moved = { ...sheet, canSign, participants: [{ ...member, moved: true }] };
    assert.doesNotMatch(notice(moved, { uid: "mihai", role: "tehnician" })!.message, /nu ești înregistrat/);
    assert.equal(moved.canSign, canSign);
  }
  assert.doesNotMatch(notice({ ...sheet, canSign: undefined }, alin)!.message, /nu ești înregistrat/);
  assert.doesNotMatch(notice({ ...sheet, canSign: true }, alin)!.message, /nu ești înregistrat/);
});

test("inactive and unavailable access take precedence over missing membership", () => {
  const inactive = notice(sheet, { ...alin, inactive: true, accessAvailable: false })!;
  assert.match(inactive.message, /închis, arhivat sau anulat/);
  assert.equal(inactive.participants, "");
  const access = notice(sheet, { ...alin, accessAvailable: false })!;
  assert.match(access.message, /accesul.*pontajul/);
  assert.doesNotMatch(access.message, /participant/);
});

test("draft and signed sheets never show signing restrictions", () => {
  for (const state of ["draft", "closed"] as const)
    assert.equal(notice({ ...sheet, state }, { ...alin, inactive: true }), null);
});

test("missing identity or member UIDs is not evidence of nonparticipation", () => {
  assert.doesNotMatch(notice(sheet, { role: "tehnician" })!.message, /nu ești înregistrat/);
  assert.doesNotMatch(notice({ ...sheet, participants: [{ ...member, uid: "" }] }, alin)!.message, /nu ești înregistrat/);
});

test("incomplete names never leak identifiers or claim a complete signer list", () => {
  const result = notice({ ...sheet, participants: [member, { ...member, uid: "private-uid", name: " " }] }, alin)!;
  assert.match(result.participants, /incomplete/);
  assert.doesNotMatch(result.message, /nu ești înregistrat/);
  assert.doesNotMatch(JSON.stringify(result), /private-uid/);
});

test("multiple long names are retained as display text", () => {
  const result = notice({ ...sheet, participants: [member, { ...member, uid: "stefan", name: "Ștefan Rusu cu un nume foarte lung", role: "secondary", moved: true }] }, alin)!;
  assert.equal(result.participants, "Participanți înregistrați: Mihai Sima, Ștefan Rusu cu un nume foarte lung.");
});
