"use client"

import React, { useState } from "react"
import { Bell } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { useLucrariNotifications } from "@/hooks/use-lucrari-notifications"
import { LucrariNotificationsDialog } from "./lucrari-notifications-dialog"
import type { Lucrare } from "@/lib/firebase/firestore"

interface LucrariNotificationsBellProps {
  lucrari: Lucrare[]
  className?: string
}

export function LucrariNotificationsBell({ lucrari, className }: LucrariNotificationsBellProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useLucrariNotifications(lucrari)

  const hasUnreadNotifications = unreadCount > 0

  return (
    <>
      <div className={cn("relative inline-block", className)}>
        <Button 
          variant="ghost" 
          size="sm" 
          className={cn(
            "relative p-2",
            hasUnreadNotifications && "text-red-600 hover:text-red-700"
          )}
          onClick={() => setIsDialogOpen(true)}
        >
          <Bell className={cn(
            "h-6 w-6 transition-all duration-300",
            hasUnreadNotifications ? 
              "text-red-600 animate-[pulse_2s_ease-in-out_infinite]" : 
              "text-gray-600"
          )} />
        </Button>
        
        {/* Badge separat, poziționat relativ la container - mai mare și mai vizibil */}
        {hasUnreadNotifications && (
          <Badge
            variant="destructive"
            className="absolute -top-2 -right-2 h-6 w-6 rounded-full p-0 flex items-center justify-center text-xs font-bold animate-pulse border-2 border-white shadow-lg"
            style={{
              minWidth: unreadCount > 9 ? '24px' : '24px',
              fontSize: unreadCount > 99 ? '10px' : '12px'
            }}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </Badge>
        )}
      </div>

      <LucrariNotificationsDialog 
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        notifications={notifications}
        onMarkAsRead={markAsRead}
        onMarkAllAsRead={markAllAsRead}
      />
      
      {/* CSS pentru animația de pulse */}
      <style jsx>{`
        @keyframes pulse {
          0%, 100% { 
            opacity: 1;
            transform: scale(1);
          }
          50% { 
            opacity: 0.7;
            transform: scale(1.05);
          }
        }
      `}</style>
    </>
  )
} 