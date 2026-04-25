import test from "node:test"
import assert from "node:assert/strict"
import { getCrmFileDownloadPath, getCrmFileOpenUrl, isCrmFileDownloadOnly } from "./file-preview"

test("isCrmFileDownloadOnly: xlsx and docx by mime", () => {
  assert.equal(
    isCrmFileDownloadOnly("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
    true
  )
  assert.equal(
    isCrmFileDownloadOnly("application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    true
  )
  assert.equal(isCrmFileDownloadOnly("application/vnd.ms-excel", "b.xls"), true)
  assert.equal(isCrmFileDownloadOnly("application/msword", "a.doc"), true)
})

test("isCrmFileDownloadOnly: extension when mime is generic", () => {
  assert.equal(isCrmFileDownloadOnly("application/octet-stream", "file.xlsx"), true)
  assert.equal(isCrmFileDownloadOnly("", "Raport.docx"), true)
})

test("isCrmFileDownloadOnly: false for pdf and images", () => {
  assert.equal(isCrmFileDownloadOnly("application/pdf"), false)
  assert.equal(isCrmFileDownloadOnly("image/png", "a.png"), false)
})

test("getCrmFileOpenUrl: empty for xlsx, direct url for pdf", () => {
  assert.equal(
    getCrmFileOpenUrl({
      url: "https://x.test/a.xlsx",
      mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      filename: "a.xlsx",
    }),
    ""
  )
  assert.equal(
    getCrmFileOpenUrl({
      url: "https://x.test/b.pdf",
      mime: "application/pdf",
      filename: "b.pdf",
    }),
    "https://x.test/b.pdf"
  )
})

test("getCrmFileOpenUrl: no Office Online URL for xlsx (direct storage url hidden)", () => {
  const u = "https://firebasestorage.googleapis.com/v0/b/bucket/o/f.xlsx?alt=media"
  const open = getCrmFileOpenUrl({
    url: u,
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    filename: "f.xlsx",
  })
  assert.equal(open, "")
  assert.equal(open.includes("view.officeapps.live.com"), false)
})

test("getCrmFileDownloadPath: encodes id", () => {
  assert.equal(getCrmFileDownloadPath("abc-123"), "/api/crm/files/abc-123/download")
  assert.equal(getCrmFileDownloadPath(""), "")
})
