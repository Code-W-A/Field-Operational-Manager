import { NextResponse } from "next/server"
import { InstallationError } from "./validation"
import { RequireRoleError } from "@/lib/auth/require-role"
import { ContactAssociationError } from "@/firebase-functions/src/client-ticket-sync"

export function installationFailure(error: unknown) {
  if (error instanceof ContactAssociationError) return NextResponse.json({ error: error.message }, { status: 400 })
  if (error instanceof InstallationError || error instanceof RequireRoleError) return NextResponse.json({ error: error.message }, { status: error.status })
  console.error("[installation]", error instanceof Error ? error.message : "Unknown error")
  return NextResponse.json({ error: "Operația nu a putut fi salvată. Reîncercați." }, { status: 500 })
}
