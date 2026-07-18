import assert from "node:assert/strict"
import test from "node:test"

import { mayUseExternalSmtp } from "./mail-transport-policy"

test("Functions SMTP is fail-closed when deployment markers are missing", () => {
  assert.equal(mayUseExternalSmtp({}), false)
  assert.equal(mayUseExternalSmtp({ APP_DEPLOYMENT_ENV: "production" }), false)
  assert.equal(mayUseExternalSmtp({ MAIL_TRANSPORT_MODE: "smtp" }), false)
})

test("Functions SMTP stays disabled in local and staging environments", () => {
  assert.equal(mayUseExternalSmtp({ APP_DEPLOYMENT_ENV: "local", MAIL_TRANSPORT_MODE: "smtp" }), false)
  assert.equal(mayUseExternalSmtp({ APP_DEPLOYMENT_ENV: "staging", MAIL_TRANSPORT_MODE: "smtp" }), false)
  assert.equal(mayUseExternalSmtp({ APP_DEPLOYMENT_ENV: "staging", MAIL_TRANSPORT_MODE: "sink" }), false)
})

test("Functions SMTP requires an explicit production SMTP policy", () => {
  assert.equal(mayUseExternalSmtp({ APP_DEPLOYMENT_ENV: "production", MAIL_TRANSPORT_MODE: "smtp" }), true)
  assert.equal(mayUseExternalSmtp({ APP_DEPLOYMENT_ENV: "production", MAIL_TRANSPORT_MODE: "disabled" }), false)
})
