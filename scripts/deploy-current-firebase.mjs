import { spawnSync } from "node:child_process"

import { runCurrentProjectDeployGuard } from "./current-project-deploy-guard.mjs"

const argv = process.argv.slice(2)
const guard = runCurrentProjectDeployGuard(argv, process.env)
if (!guard.ok) process.exit(1)

const onlyIndex = argv.indexOf("--only")
const only = onlyIndex >= 0 ? String(argv[onlyIndex + 1] || "").trim() : ""
const allowedComponents = [
  "firestore:rules",
  "storage",
  "functions:onAttendanceCheckoutSync",
  "functions:onHrRequestApproved",
  "functions:onHrRequestCreatedEmail",
  "functions:onHrRequestStatusChangedEmail",
  "functions:sendHrRequestPendingApprovalReminders",
  "functions:runGenerateScheduledWorks",
].join(",")
if (only !== allowedComponents) {
  process.stderr.write(`--only must be exactly ${allowedComponents}\n`)
  process.exit(1)
}

const result = spawnSync("firebase", [
  "deploy",
  "--project",
  guard.projectId,
  "--only",
  allowedComponents,
], { stdio: "inherit", env: process.env })
process.exit(result.status ?? 1)
