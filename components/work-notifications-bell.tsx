"use client"

import React, { useState } from "react"
import { Bell } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { WorkModificationsDialog } from "./work-modifications-dialog"
import { useWorkModifications } from "@/hooks/use-work-modifications"



interface WorkNotificationsBellProps {
  className?: string
}

export function WorkNotificationsBell({ className }: WorkNotificationsBellProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  // Lazy loading - hook-ul citește doar când dialogul este deschis
  const { modifications, loading, unreadCount } = useWorkModifications(isDialogOpen)

  const hasUnreadNotifications = unreadCount > 0

  return (
    <>
      <div className={cn("relative", className)}>
        <Button 
          variant="ghost" 
          size="sm" 
          className={cn(
            "relative",
            hasUnreadNotifications && "text-red-600 hover:text-red-700"
          )}
          onClick={() => setIsDialogOpen(true)}
          disabled={loading && !isDialogOpen} // Disable doar dacă se încarcă pentru prima dată
        >
          <Bell className={cn(
            "h-5 w-5 transition-colors",
            hasUnreadNotifications ? "text-red-600" : "text-gray-600",
            loading && !isDialogOpen && "animate-pulse" // Animație când se încarcă
          )} />
          {hasUnreadNotifications && (
            <Badge
              variant="destructive"
              className="absolute -top-2 -right-2 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs font-bold min-w-[20px] animate-pulse"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </Badge>
          )}
        </Button>
      </div>

      <WorkModificationsDialog 
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
      />
    </>
  )
} 