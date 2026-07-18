import assert from "node:assert/strict"
import test from "node:test"

import {
  CURRENT_FIREBASE_PROJECT_ID,
  parseExplicitProjectArgument,
  validateCurrentProjectDeploy,
} from "./current-project-deploy-guard.mjs"

test("current-project deploy guard requires an explicit exact project", () => {
  for (const projectId of ["", "default", "production", "other-project", "demo-fom-pontaj-e2e"]) {
    assert.equal(validateCurrentProjectDeploy({ projectId, allow: "true" }).ok, false)
  }
  assert.equal(validateCurrentProjectDeploy({ projectId: CURRENT_FIREBASE_PROJECT_ID, allow: "true" }).ok, true)
})

test("current-project deploy guard requires the owner confirmation variable", () => {
  assert.equal(validateCurrentProjectDeploy({ projectId: CURRENT_FIREBASE_PROJECT_ID, allow: "" }).ok, false)
  assert.equal(validateCurrentProjectDeploy({ projectId: CURRENT_FIREBASE_PROJECT_ID, allow: "false" }).ok, false)
})

test("project argument parser never falls back to an alias", () => {
  assert.equal(parseExplicitProjectArgument([]), "")
  assert.equal(parseExplicitProjectArgument(["--project"]), "")
  assert.equal(parseExplicitProjectArgument(["--project", CURRENT_FIREBASE_PROJECT_ID]), CURRENT_FIREBASE_PROJECT_ID)
})
