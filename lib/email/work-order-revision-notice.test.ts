import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { getRevisionClientNotice, REVISION_CLIENT_NOTICE_TEXT } from "./work-order-revision-notice"

test("adds the exact notice to revision client emails in HTML and plain text", () => {
  const notice = getRevisionClientNotice("Revizie", false)

  assert.ok(notice)
  assert.equal(notice.text, REVISION_CLIENT_NOTICE_TEXT)
  assert.match(notice.html, /<strong>Înștiințare:<\/strong>/)
  assert.match(notice.html, /30–45 de minute/)
  assert.match(notice.html, /va fi facturată suplimentar\./)
})

test("recognizes revision work types regardless of surrounding spaces or letter case", () => {
  assert.ok(getRevisionClientNotice("  REVIZIE  ", false))
})

test("does not add the notice to other work types or postponed emails", () => {
  assert.equal(getRevisionClientNotice("Intervenție", false), null)
  assert.equal(getRevisionClientNotice("Revizie", true), null)
})

test("the route inserts the notice only in the client email section", () => {
  const routePath = path.join(process.cwd(), "app/api/notifications/work-order/route.ts")
  const routeSource = fs.readFileSync(routePath, "utf8")
  const clientEmailMarker = routeSource.indexOf("// Send email to client/location contacts")
  const htmlInsertion = routeSource.indexOf("revisionClientNotice?.html")
  const textInsertion = routeSource.indexOf("revisionClientNotice?.text")

  assert.ok(clientEmailMarker >= 0)
  assert.ok(htmlInsertion > clientEmailMarker)
  assert.ok(textInsertion > clientEmailMarker)
  assert.equal(routeSource.match(/revisionClientNotice\?\.html/g)?.length, 1)
  assert.equal(routeSource.match(/revisionClientNotice\?\.text/g)?.length, 1)
})
