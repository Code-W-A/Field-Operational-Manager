"use client"

import { useEffect } from "react"
import * as Sentry from "@sentry/nextjs"
import type { User } from "firebase/auth"
import type { UserData } from "@/lib/firebase/auth"

type MockPreviewUser = {
  uid: string
  displayName?: string | null
  role?: string
} | null

/**
 * Leagă evenimentele Sentry de utilizatorul curent (fără email — doar id / nume afișat / rol).
 */
export function useSentryUserSync(params: {
  firebaseUser: User | null
  userData: UserData | null
  isPreview: boolean
  mockUser: MockPreviewUser
}): void {
  const { firebaseUser, userData, isPreview, mockUser } = params

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return

    if (isPreview) {
      if (mockUser) {
        Sentry.setUser({
          id: mockUser.uid,
          username: mockUser.displayName ?? undefined,
          segment: mockUser.role,
        })
      } else {
        Sentry.setUser(null)
      }
      return
    }

    if (firebaseUser) {
      Sentry.setUser({
        id: firebaseUser.uid,
        username: userData?.displayName ?? firebaseUser.displayName ?? undefined,
        segment: userData?.role,
      })
    } else {
      Sentry.setUser(null)
    }
  }, [firebaseUser, userData, isPreview, mockUser])
}
