import assert from "node:assert/strict"
import test from "node:test"
import { areSinkRecipientsAllowed, resolveMailTransportPolicy } from "./mail-transport-policy.server"

test("mail transport is fail-closed when mode is missing or invalid", () => {
  assert.equal(resolveMailTransportPolicy({}).mode, "disabled")
  assert.equal(resolveMailTransportPolicy({ MAIL_TRANSPORT_MODE: "unknown" }).mode, "disabled")
})

test("staging cannot enable SMTP and sink requires an allowlist", () => {
  assert.equal(resolveMailTransportPolicy({ APP_DEPLOYMENT_ENV: "staging", MAIL_TRANSPORT_MODE: "smtp" }).mode, "disabled")
  assert.equal(resolveMailTransportPolicy({ APP_DEPLOYMENT_ENV: "local", MAIL_TRANSPORT_MODE: "sink" }).mode, "disabled")
  assert.equal(resolveMailTransportPolicy({
    APP_DEPLOYMENT_ENV: "local",
    MAIL_TRANSPORT_MODE: "sink",
    MAIL_SINK_ALLOWED_DOMAINS: "e2e.invalid",
  }).mode, "sink")
})

test("SMTP is accepted only for the explicit production project with complete credentials", () => {
  const base = {
    APP_DEPLOYMENT_ENV: "production",
    MAIL_TRANSPORT_MODE: "smtp",
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: "field-operational-manager",
    EMAIL_SMTP_HOST: "smtp.example.invalid",
    EMAIL_SMTP_PORT: "465",
    EMAIL_USER: "sender@example.invalid",
    EMAIL_PASSWORD: "not-a-real-secret",
  }
  assert.equal(resolveMailTransportPolicy(base).mode, "smtp")
  assert.equal(resolveMailTransportPolicy({ ...base, NEXT_PUBLIC_FIREBASE_PROJECT_ID: "staging-project" }).mode, "disabled")
  assert.equal(resolveMailTransportPolicy({ ...base, EMAIL_PASSWORD: "" }).mode, "disabled")
})

test("sink validates every intended recipient domain", () => {
  assert.equal(areSinkRecipientsAllowed(["one@e2e.invalid", "TWO@E2E.INVALID"], ["e2e.invalid"]), true)
  assert.equal(areSinkRecipientsAllowed(["one@e2e.invalid", "two@nested.e2e.invalid"], [".invalid"]), true)
  assert.equal(areSinkRecipientsAllowed(["one@e2e.invalid", "real@example.com"], ["e2e.invalid"]), false)
  assert.equal(areSinkRecipientsAllowed(["one@notinvalid.example"], [".invalid"]), false)
  assert.equal(areSinkRecipientsAllowed([], ["e2e.invalid"]), true)
  assert.equal(areSinkRecipientsAllowed(["one@e2e.invalid"], []), false)
})
