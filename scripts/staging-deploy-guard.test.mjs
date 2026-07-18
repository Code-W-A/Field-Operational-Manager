import assert from "node:assert/strict"
import test from "node:test"
import { validateStagingConfiguration } from "./staging-deploy-guard.mjs"

const syntheticFixture = {
  APP_DEPLOYMENT_ENV: "staging",
  NEXT_PUBLIC_APP_ENV: "staging",
  STAGING_MARKER: "true",
  VERCEL_ENV: "preview",
  FIREBASE_DEPLOY_PROJECT_ID: "unit-test-stage-fixture",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "unit-test-stage-fixture",
  NEXT_PUBLIC_FIREBASE_API_KEY: "public-test-value",
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "unit-test-stage-fixture.firebaseapp.com",
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: "unit-test-stage-fixture.appspot.com",
  NEXT_PUBLIC_FIREBASE_APP_ID: "public-test-app-id",
  NEXT_PUBLIC_FIREBASE_FUNCTIONS_REGION: "europe-west1",
  NEXT_PUBLIC_FUNCTIONS_BASE_URL: "https://europe-west1-unit-test-stage-fixture.cloudfunctions.net",
  NEXT_PUBLIC_APP_URL: "https://unit-test-stage-fixture.example.invalid",
  MAIL_TRANSPORT_MODE: "disabled",
  REVERSE_GEOCODE_MODE: "disabled",
  NEXT_PUBLIC_E2E_ENABLED: "false",
  STAGING_FIREBASE_PROJECT_ALLOWLIST: "unit-test-stage-fixture",
  STAGING_APPROVED_COMMIT: "approved-commit",
  STAGING_REQUIRE_CLEAN_WORKTREE: "true",
}
const repository = { commit: "approved-commit", clean: true }

test("guard rejects empty, aliases, placeholders, production, and unknown projects", () => {
  for (const projectId of ["", "default", "staging", "staging-project-id", "field-operational-manager", "unknown-project"]) {
    const result = validateStagingConfiguration({
      ...syntheticFixture,
      FIREBASE_DEPLOY_PROJECT_ID: projectId,
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: projectId,
      STAGING_FIREBASE_PROJECT_ALLOWLIST: "",
    }, repository)
    assert.equal(result.ok, false, projectId || "empty")
  }
})

test("guard rejects SMTP, production targets, dirty worktrees, and unapproved commits", () => {
  assert.equal(validateStagingConfiguration({ ...syntheticFixture, MAIL_TRANSPORT_MODE: "smtp" }, repository).ok, false)
  assert.equal(validateStagingConfiguration({ ...syntheticFixture, NEXT_PUBLIC_APP_URL: "https://fom-nrg.vercel.app" }, repository).ok, false)
  assert.equal(validateStagingConfiguration({ ...syntheticFixture, NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: "field-operational-manager.appspot.com" }, repository).ok, false)
  assert.equal(validateStagingConfiguration({ ...syntheticFixture, VERCEL_ENV: "production" }, repository).ok, false)
  assert.equal(validateStagingConfiguration(syntheticFixture, { ...repository, clean: false }).ok, false)
  assert.equal(validateStagingConfiguration(syntheticFixture, { commit: "other", clean: true }).ok, false)
})

test("pure validator accepts only a structurally valid synthetic fixture", () => {
  assert.equal(validateStagingConfiguration(syntheticFixture, repository).ok, true)
})
