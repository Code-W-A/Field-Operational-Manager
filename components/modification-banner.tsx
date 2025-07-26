"use client"

import React from "react"
import { X, AlertTriangle, User, Clock, Edit, CheckCircle2 } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { formatDistanceToNow } from "date-fns"
import { ro } from "date-fns/locale"
import type { WorkModification } from "@/components/work-modifications-dialog"

interface ModificationBannerProps {
  modification: WorkModification
  onDismiss: () => void
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
      return <AlertTriangle className="h-4 w-4" />
  }
}

const getModificationColor = (type: WorkModification['modificationType'], priority: string) => {
  if (priority === 'high') return 'border-red-500 bg-red-50'
  
  switch (type) {
    case 'status':
      return 'border-orange-500 bg-orange-50'
    case 'assignment':
      return 'border-blue-500 bg-blue-50'
    case 'details':
      return 'border-gray-500 bg-gray-50'
    case 'schedule':
      return 'border-purple-500 bg-purple-50'
    case 'completion':
      return 'border-green-500 bg-green-50'
    default:
      return 'border-gray-500 bg-gray-50'
  }
}

const getModificationTextColor = (type: WorkModification['modificationType'], priority: string) => {
  if (priority === 'high') return 'text-red-700'
  
  switch (type) {
    case 'status':
      return 'text-orange-700'
    case 'assignment':
      return 'text-blue-700'
    case 'details':
      return 'text-gray-700'
    case 'schedule':
      return 'text-purple-700'
    case 'completion':
      return 'text-green-700'
    default:
      return 'text-gray-700'
  }
}

export function ModificationBanner({ modification, onDismiss }: ModificationBannerProps) {
  const colorClasses = getModificationColor(modification.modificationType, modification.priority)
  const textColorClasses = getModificationTextColor(modification.modificationType, modification.priority)

  return (
    <Alert className={cn("relative border-l-4 mb-6", colorClasses)}>
      <div className="flex items-start gap-3">
        <div className={cn("p-1", textColorClasses)}>
          {getModificationIcon(modification.modificationType)}
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <span className={cn("font-medium text-sm", textColorClasses)}>
                Modificare recentă
              </span>
              {modification.priority === 'high' && (
                <Badge variant="destructive" className="text-xs">
                  Prioritate înaltă
                </Badge>
              )}
            </div>
            
            <Button
              variant="ghost"
              size="sm"
              onClick={onDismiss}
              className="h-6 w-6 p-0 hover:bg-white/50"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          
          <AlertDescription className={cn("mb-3", textColorClasses)}>
            <div className="font-medium mb-1">{modification.description}</div>
            
            {modification.oldValue && modification.newValue && (
              <div className="mt-2 p-2 bg-white/70 rounded border text-xs">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-red-600 font-medium">Din:</span>
                  <span className="text-gray-800">{modification.oldValue}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-green-600 font-medium">În:</span>
                  <span className="text-gray-800">{modification.newValue}</span>
                </div>
              </div>
            )}
          </AlertDescription>
          
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-4">
              <span className={cn("flex items-center gap-1", textColorClasses)}>
                <User className="h-3 w-3" />
                {modification.modifiedByName}
              </span>
              <span className={cn("flex items-center gap-1", textColorClasses)}>
                <Clock className="h-3 w-3" />
                {formatDistanceToNow(modification.modifiedAt, { 
                  addSuffix: true, 
                  locale: ro 
                })}
              </span>
            </div>
            
            <Badge variant="outline" className="text-xs">
              Accesat din notificări
            </Badge>
          </div>
        </div>
      </div>
    </Alert>
  )
} 