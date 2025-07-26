"use client"

import React from "react"
import { useAuth } from "@/contexts/AuthContext"
import { WorkNotificationsWelcomeDialog } from "@/components/work-notifications-welcome-dialog"

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  // DEZACTIVAT: Dialog welcome notifications
  // const { userData, showWelcomeDialog, hideWelcomeDialog } = useAuth()
  // const isAdminOrDispatcher = userData?.role === 'admin' || userData?.role === 'dispecer'
  // const userName = userData?.displayName || "Utilizator"

  return (
    <>
      {children}
      {/* DEZACTIVAT: Dialog welcome notifications
      {isAdminOrDispatcher && (
        <WorkNotificationsWelcomeDialog
          isOpen={showWelcomeDialog}
          onClose={hideWelcomeDialog}
          userName={userName}
        />
      )}
      */}
    </>
  )
} 