import type { NextRequest } from "next/server"
import { FieldValue } from "firebase-admin/firestore"
import { adminDb } from "@/lib/firebase/admin"
import { requireVerifiedRole } from "@/lib/auth/require-role"
import { policyHandlers } from "./handlers"

const document = () => adminDb.collection("mobileUpdatePolicies").doc("android")
export const updatePolicyHandlers = policyHandlers({
  requireAdmin: request => requireVerifiedRole(["admin"], request as NextRequest),
  read: async () => (await document().get()).data(),
  save: async (policy, uid) => {
    await document().set({ ...policy, updatedAt: FieldValue.serverTimestamp(), updatedBy: uid })
  },
})
