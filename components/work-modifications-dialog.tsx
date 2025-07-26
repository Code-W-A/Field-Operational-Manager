"use client"

import React from "react"
import { Bell, Edit, User, Clock, Eye, CheckCircle2, X, AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Card, CardContent } from "@/components/ui/card"
import { useRouter } from "next/navigation"
import { formatDistanceToNow } from "date-fns"
import { ro } from "date-fns/locale"
import { useAuth } from "@/contexts/AuthContext"
import { useWorkModifications } from "@/hooks/use-work-modifications"

export interface WorkModification {
  id: string
  lucrareId: string
  lucrareTitle: string // client + locatie
  modificationType: 'status' | 'assignment' | 'details' | 'schedule' | 'completion'
  modifiedBy: string
  modifiedByName: string
  modifiedAt: Date
  oldValue?: string
  newValue?: string
  description: string
  read: boolean
  priority: 'high' | 'medium' | 'low'
}

interface WorkModificationsDialogProps {
  isOpen: boolean
  onClose: () => void
}

const getModificationIcon = (type: WorkModification['modificationType']) => {
  switch (type) {
    case 'status':
      return <AlertTriangle className="h-4 w-4" />
    case 'assignment':
      return <User className="h-4 w-4" />
    case 'details':
      return <Edit className="h-4 w-4" />
    case 'schedule':
      return <Clock className="h-4 w-4" />
    case 'completion':
      return <CheckCircle2 className="h-4 w-4" />
    default:
      return <Bell className="h-4 w-4" />
  }
}

const getModificationColor = (type: WorkModification['modificationType'], priority: string) => {
  if (priority === 'high') return 'text-red-600'
  
  switch (type) {
    case 'status':
      return 'text-orange-600'
    case 'assignment':
      return 'text-blue-600'
    case 'details':
      return 'text-gray-600'
    case 'schedule':
      return 'text-purple-600'
    case 'completion':
      return 'text-green-600'
    default:
      return 'text-gray-600'
  }
}

export function WorkModificationsDialog({ isOpen, onClose }: WorkModificationsDialogProps) {
  const router = useRouter()
  const { userData } = useAuth()
  // Lazy loading - hook-ul citește doar când dialogul este deschis
  const { modifications, loading, unreadCount, markAsRead, markAllAsRead } = useWorkModifications(isOpen)

  const handleModificationClick = (modification: WorkModification) => {
    // Marchează ca citită automat când navighează la lucrare
    if (!modification.read) {
      markAsRead(modification.id)
    }
    
    // Navighează la lucrarea respectivă
    onClose()
    router.push(`/dashboard/lucrari/${modification.lucrareId}`)
  }

  const handleMarkAllAsRead = () => {
    markAllAsRead()
  }

  const hasUnreadNotifications = unreadCount > 0

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Modificări Lucrări
              {hasUnreadNotifications && (
                <Badge variant="destructive" className="text-xs">
                  {unreadCount} noi
                </Badge>
              )}
            </DialogTitle>
            {hasUnreadNotifications && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleMarkAllAsRead}
                className="text-xs"
              >
                Marchează toate ca citite
              </Button>
            )}
          </div>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            <span className="ml-2 text-gray-600">Se încarcă modificările...</span>
          </div>
        ) : modifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <CheckCircle2 className="h-12 w-12 text-green-500 mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Nu sunt modificări noi</h3>
            <p className="text-gray-500 text-center">
              Nu există modificări recent la lucrări făcute de alți utilizatori.
            </p>
          </div>
        ) : (
          <ScrollArea className="flex-1 pr-4">
            <div className="space-y-3">
              {modifications.map((modification) => (
                <Card
                  key={modification.id}
                  className={cn(
                    "cursor-pointer transition-all hover:shadow-md border-l-4",
                    !modification.read 
                      ? "bg-blue-50 border-l-blue-500 hover:bg-blue-100" 
                      : "border-l-gray-200 hover:bg-gray-50",
                    modification.priority === 'high' && !modification.read && "bg-red-50 border-l-red-500"
                  )}
                  onClick={() => handleModificationClick(modification)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className={cn(
                        "p-2 rounded-full flex-shrink-0",
                        !modification.read 
                          ? modification.priority === 'high' 
                            ? "bg-red-100 text-red-600"
                            : "bg-blue-100 text-blue-600"
                          : "bg-gray-100 text-gray-600"
                      )}>
                        {getModificationIcon(modification.modificationType)}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <h4 className={cn(
                            "text-sm font-medium truncate",
                            !modification.read ? "text-gray-900" : "text-gray-700"
                          )}>
                            {modification.lucrareTitle}
                          </h4>
                          <Badge
                            variant={!modification.read ? "default" : "secondary"}
                            className="text-xs flex-shrink-0"
                          >
                            {!modification.read ? "Nou" : "Citit"}
                          </Badge>
                        </div>
                        
                        <p className={cn(
                          "text-sm mb-2",
                          getModificationColor(modification.modificationType, modification.priority)
                        )}>
                          {modification.description}
                        </p>
                        
                        <div className="flex items-center justify-between text-xs text-gray-500">
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {modification.modifiedByName}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatDistanceToNow(modification.modifiedAt, { 
                              addSuffix: true, 
                              locale: ro 
                            })}
                          </span>
                        </div>
                        
                        {modification.oldValue && modification.newValue && (
                          <div className="mt-2 p-2 bg-gray-50 rounded text-xs">
                            <div className="flex items-center gap-2">
                              <span className="text-red-600">Din:</span>
                              <span className="text-gray-700">{modification.oldValue}</span>
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-green-600">În:</span>
                              <span className="text-gray-700">{modification.newValue}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>
        )}

        <Separator />

        <div className="flex justify-between items-center pt-4">
          <div className="text-xs text-gray-500">
            Total: {modifications.length} modificări
            {hasUnreadNotifications && ` • ${unreadCount} necitite`}
          </div>
          
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              <X className="h-4 w-4 mr-2" />
              Închide
            </Button>
            <Button onClick={() => { onClose(); router.push('/dashboard/lucrari') }}>
              <Eye className="h-4 w-4 mr-2" />
              Vezi toate lucrările
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
} 