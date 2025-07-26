"use client"

import React, { useState, useEffect } from "react"
import { Bell, AlertTriangle, Clock, FileX, UserX, CheckCircle, X, ClockAlert } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Card, CardContent } from "@/components/ui/card"
import { useWorkNotifications, WorkNotification } from "@/hooks/use-work-notifications"
import { useRouter } from "next/navigation"

const NotificationIcon = ({ type }: { type: WorkNotification['type'] }) => {
  switch (type) {
    case 'unassigned':
      return <UserX className="h-5 w-5" />
    case 'in_progress':
      return <Clock className="h-5 w-5" />
    case 'completed_uninvoiced':
      return <FileX className="h-5 w-5" />
    case 'postponed':
      return <ClockAlert className="h-5 w-5" />
    case 'overdue':
      return <AlertTriangle className="h-5 w-5" />
    default:
      return <Bell className="h-5 w-5" />
  }
}

interface WorkNotificationsWelcomeDialogProps {
  isOpen: boolean
  onClose: () => void
  userName?: string
}

export function WorkNotificationsWelcomeDialog({ 
  isOpen, 
  onClose,
  userName = "Utilizator"
}: WorkNotificationsWelcomeDialogProps) {
  const { summary, loading } = useWorkNotifications()
  const router = useRouter()

  const handleNotificationClick = (type: WorkNotification['type']) => {
    onClose()
    
    // Navigate to relevant page based on notification type
    switch (type) {
      case 'unassigned':
      case 'in_progress':
      case 'overdue':
      case 'postponed':
        router.push('/dashboard/lucrari')
        break
      case 'completed_uninvoiced':
        router.push('/dashboard/lucrari')
        break
      default:
        router.push('/dashboard/lucrari')
    }
  }

  const handleViewAllClick = () => {
    onClose()
    router.push('/dashboard/lucrari')
  }

  const hasNotifications = summary.totalNotifications > 0
  const hasCriticalNotifications = summary.criticalCount > 0

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md mx-auto">
        <DialogHeader className="text-center">
          <div className="flex items-center justify-center mb-2">
            {hasNotifications ? (
              <div className="relative">
                <Bell className={cn(
                  "h-8 w-8",
                  hasCriticalNotifications ? "text-red-600" : "text-orange-600"
                )} />
                <Badge
                  variant={hasCriticalNotifications ? "destructive" : "secondary"}
                  className="absolute -top-2 -right-2 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs font-bold min-w-[20px]"
                >
                  {summary.totalNotifications > 99 ? '99+' : summary.totalNotifications}
                </Badge>
              </div>
            ) : (
              null
            )}
          </div>
          <DialogTitle className="text-lg">
            Bună ziua, {userName}!
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : (
          <div className="space-y-4">
            {!hasNotifications ? (
              <Card className="border-green-200 bg-green-50">
                <CardContent className="p-4 text-center">
                  <CheckCircle className="h-12 w-12 text-green-600 mx-auto mb-3" />
                  <h3 className="font-semibold text-green-800 mb-2">Excelent!</h3>
                  <p className="text-sm text-green-700">
                    Toate lucrările sunt la zi. Nu există notificări.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <>
                <Card className={cn(
                  "border-2",
                  hasCriticalNotifications 
                    ? "border-red-200 bg-red-50" 
                    : "border-orange-200 bg-orange-50"
                )}>
                  <CardContent className="p-4 text-center">
                    <h3 className={cn(
                      "font-semibold mb-2",
                      hasCriticalNotifications ? "text-red-800" : "text-orange-800"
                    )}>
                      {hasCriticalNotifications 
                        ? "Atenție! Notificări importante" 
                        : "Notificări de monitorizare"
                      }
                    </h3>
                    <p className={cn(
                      "text-sm",
                      hasCriticalNotifications ? "text-red-700" : "text-orange-700"
                    )}>
                      {hasCriticalNotifications
                        ? `Există ${summary.criticalCount} situații critice care necesită atenție imediată.`
                        : `Există ${summary.totalNotifications} notificări care necesită atenție.`
                      }
                    </p>
                  </CardContent>
                </Card>

                <ScrollArea className="max-h-60">
                  <div className="space-y-2">
                    {summary.notifications.map((notification, index) => (
                      <Card
                        key={index}
                        className={cn(
                          "cursor-pointer transition-all hover:shadow-md",
                          notification.priority === 'high' 
                            ? "border-red-200 hover:border-red-300" 
                            : "border-orange-200 hover:border-orange-300"
                        )}
                        onClick={() => handleNotificationClick(notification.type)}
                      >
                        <CardContent className="p-3">
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "p-2 rounded-full flex-shrink-0",
                              notification.priority === 'high' 
                                ? "bg-red-100 text-red-600" 
                                : "bg-orange-100 text-orange-600"
                            )}>
                              <NotificationIcon type={notification.type} />
                            </div>
                            
                            <div className="flex-1 min-w-0">
                              <p className={cn(
                                "text-sm font-medium",
                                notification.color
                              )}>
                                {notification.description}
                              </p>
                              <p className="text-xs text-gray-500">
                                Click pentru a vizualiza
                              </p>
                            </div>
                            
                            <Badge
                              variant={notification.priority === 'high' ? 'destructive' : 'secondary'}
                              className="text-xs font-bold"
                            >
                              {notification.count}
                            </Badge>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </ScrollArea>
              </>
            )}

            <Separator />

            <div className="flex flex-col gap-2">
              {hasNotifications && (
                <Button
                  onClick={handleViewAllClick}
                  className="w-full"
                  variant={hasCriticalNotifications ? "destructive" : "default"}
                >
                  <Bell className="h-4 w-4 mr-2" />
                  Vezi toate lucrările
                </Button>
              )}
              
              <Button
                onClick={onClose}
                variant="outline"
                className="w-full"
              >
                <X className="h-4 w-4 mr-2" />
                {hasNotifications ? "Închide (voi verifica mai târziu)" : "Mergi la dashboard"}
              </Button>
            </div>

         
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
} 