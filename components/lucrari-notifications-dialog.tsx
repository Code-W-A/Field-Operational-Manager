"use client"

import React from "react"
import { useRouter } from "next/navigation"
import { Bell, Edit, User, Clock, Eye, CheckCircle2, AlertTriangle } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Card, CardContent } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Separator } from "@/components/ui/separator"
import { formatDistanceToNow } from "date-fns"
import { ro } from "date-fns/locale"

interface LucrareNotification {
  id: string
  lucrareId: string
  lucrareTitle: string
  modificationType: 'status' | 'tehnician' | 'data_interventie' | 'other'
  modifiedAt: Date
  description: string
  read: boolean
  priority: 'low' | 'medium' | 'high'
}

interface LucrariNotificationsDialogProps {
  isOpen: boolean
  onClose: () => void
  notifications: LucrareNotification[]
  onMarkAsRead: (lucrareId: string) => void // Schimbat pentru claritate
  onMarkAllAsRead: () => void
}

function getModificationIcon(type: LucrareNotification['modificationType']) {
  switch (type) {
    case 'status':
      return <AlertTriangle className="h-4 w-4" />
    case 'tehnician':
      return <User className="h-4 w-4" />
    case 'data_interventie':
      return <Clock className="h-4 w-4" />
    default:
      return <Edit className="h-4 w-4" />
  }
}

function getModificationColor(priority: LucrareNotification['priority']) {
  switch (priority) {
    case 'high':
      return 'text-red-600 bg-red-50 border-red-200'
    case 'medium':
      return 'text-orange-600 bg-orange-50 border-orange-200'
    case 'low':
      return 'text-blue-600 bg-blue-50 border-blue-200'
    default:
      return 'text-gray-600 bg-gray-50 border-gray-200'
  }
}

export function LucrariNotificationsDialog({ 
  isOpen, 
  onClose, 
  notifications, 
  onMarkAsRead, 
  onMarkAllAsRead 
}: LucrariNotificationsDialogProps) {
  const router = useRouter()

  const handleNotificationClick = (notification: LucrareNotification) => {
    // Marchează ca citită automat când navighează la lucrare
    if (!notification.read) {
      onMarkAsRead(notification.lucrareId) // Folosim lucrareId în loc de notification.id
    }
    
    // Navighează la lucrarea respectivă
    onClose()
    router.push(`/dashboard/lucrari/${notification.lucrareId}`)
  }

  const unreadCount = notifications.filter(n => !n.read).length

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[95vw] max-w-4xl max-h-[90vh] sm:max-h-[80vh]">
        <DialogHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-2 sm:space-y-0 pb-4">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            <DialogTitle className="text-lg sm:text-xl">Modificări Lucrări</DialogTitle>
            {unreadCount > 0 && (
              <Badge variant="destructive" className="ml-2">
                {unreadCount} necitite
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <Button 
                variant="outline" 
                size="sm"
                onClick={onMarkAllAsRead}
                className="text-xs sm:text-sm"
              >
                <CheckCircle2 className="h-4 w-4 mr-1" />
                <span className="hidden sm:inline">Marchează toate ca citite</span>
                <span className="sm:hidden">Citește toate</span>
              </Button>
            )}
          </div>
        </DialogHeader>

        <ScrollArea className="h-[50vh] sm:h-[400px] pr-2 sm:pr-4">
          {notifications.length === 0 ? (
            <Alert>
              <Bell className="h-4 w-4" />
              <AlertDescription>
                Nu există modificări recente pentru lucrări.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              {notifications.map((notification) => (
                <Card 
                  key={notification.id} 
                  className={`cursor-pointer transition-all hover:shadow-lg border-2 aspect-square ${
                    notification.read ? 'opacity-60' : getModificationColor(notification.priority)
                  }`}
                  onClick={() => handleNotificationClick(notification)}
                >
                  <CardContent className="p-3 sm:p-4 h-full flex flex-col justify-between">
                    {/* Header cu icon și badge */}
                    <div className="flex items-start justify-between mb-2">
                      <div className={`p-2 rounded-full ${getModificationColor(notification.priority)}`}>
                        {getModificationIcon(notification.modificationType)}
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {!notification.read && (
                          <Badge variant="destructive" className="text-[10px] px-1 py-0">
                            Nou
                          </Badge>
                        )}
                        <span className="text-[10px] text-muted-foreground text-right">
                          {formatDistanceToNow(notification.modifiedAt, { 
                            addSuffix: true, 
                            locale: ro 
                          })}
                        </span>
                      </div>
                    </div>
                    
                    {/* Conținut principal */}
                    <div className="flex-1 flex flex-col justify-center space-y-2">
                      <p className="font-semibold text-xs sm:text-sm line-clamp-2 text-center">
                        {notification.lucrareTitle}
                      </p>
                      
                      <p className="text-[11px] sm:text-xs text-muted-foreground line-clamp-2 text-center">
                        {notification.description}
                      </p>
                    </div>
                    
                    {/* Footer cu buton */}
                    <div className="mt-2">
                      <Button 
                        variant="ghost" 
                        size="sm"
                        className="text-[10px] sm:text-xs h-6 px-2 w-full"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleNotificationClick(notification)
                        }}
                      >
                        <Eye className="h-3 w-3 mr-1" />
                        <span className="hidden sm:inline">Vezi lucrarea</span>
                        <span className="sm:hidden">Vezi</span>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
      
      {/* CSS pentru line-clamp și styling custom */}
      <style jsx global>{`
        .line-clamp-2 {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
      `}</style>
    </Dialog>
  )
} 