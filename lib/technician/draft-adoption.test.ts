import { test } from "node:test";
import assert from "node:assert/strict";
import { validatePrivatePhoto } from "./draft-adoption";
import {
  privatePhotoPath,
  type SavedTicketDraft,
} from "../../packages/fom-domain";
const path = privatePhotoPath("owner", "work~sheet~sheet", "photo_1234");
const input = { path, draftId: "work~sheet~sheet", saveId: "save_12345" };
const saved: SavedTicketDraft = {
  schemaVersion: 1,
  ownerUid: "owner",
  draftId: input.draftId,
  key: "work:sheet:sheet",
  workId: "work",
  targetId: "sheet",
  kind: "installation",
  baseVersion: "v1",
  sheetRevision: 1,
  localRevision: 1,
  saveId: input.saveId,
  deviceId: "device_123",
  expectedHead: null,
  content: { finding: "montaj" },
  photos: [
    {
      id: "photo_1234",
      path,
      name: "photo.jpg",
      contentType: "image/jpeg",
      size: 32,
    },
  ],
  accepted: true,
  savedAt: 1,
};
test("adoption accepts only exact owner, receipt, work, target and photo", () => {
  assert.equal(
    validatePrivatePhoto(
      input,
      saved,
      "owner",
      "work",
      "photo_1234",
      "installation",
      "sheet",
    ).path,
    path,
  );
  for (const change of [
    { ownerUid: "other" },
    { workId: "other" },
    { targetId: "other" },
    { saveId: "other" },
    { accepted: false },
    { photos: [] },
  ])
    assert.throws(() =>
      validatePrivatePhoto(
        input,
        { ...saved, ...change } as SavedTicketDraft,
        "owner",
        "work",
        "photo_1234",
        "installation",
        "sheet",
      ),
    );
  assert.throws(() =>
    validatePrivatePhoto(
      { ...input, path: "mobile-drafts/other/image" },
      saved,
      "owner",
      "work",
      "photo_1234",
      "installation",
      "sheet",
    ),
  );
  assert.throws(() =>
    validatePrivatePhoto(
      input,
      saved,
      "owner",
      "work",
      "photo_1234",
      "attendance-selfie",
      "sheet",
    ),
  );
  assert.throws(() =>
    validatePrivatePhoto(
      input,
      saved,
      "owner",
      "work",
      "photo_1234",
      "medical",
      "sheet",
    ),
  );
});
test("revision adoption cannot reuse photos from a different equipment or installation", () => {
  const revision = { ...saved, kind: "revision" as const };
  assert.equal(
    validatePrivatePhoto(
      input,
      revision,
      "owner",
      "work",
      "photo_1234",
      "photo",
      "sheet",
    ).id,
    "photo_1234",
  );
  assert.throws(() =>
    validatePrivatePhoto(
      input,
      revision,
      "owner",
      "work",
      "photo_1234",
      "photo",
      "other",
    ),
  );
  assert.throws(() =>
    validatePrivatePhoto(
      input,
      saved,
      "owner",
      "work",
      "photo_1234",
      "photo",
      "sheet",
    ),
  );
});
