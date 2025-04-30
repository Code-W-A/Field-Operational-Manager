"use client"

import { useState } from "react"
import { format } from "date-fns"
import { ro } from "date-fns/locale"
import { AlertCircle, CalendarIcon, Clock, CheckCircle, XCircle } from "lucide-react"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { type Task, getTaskPriorityDisplay, getTaskStatusDisplay, getTaskCategoryDisplay } from "@/lib/firebase/tasks"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { TaskForm } from "@/components/task-form"
import { Alert, AlertDescription } from "@/components/ui/alert"

interface TaskCardProps {
  task: Task
  onUpdate: (id: string, data: Partial<Task>) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onView?: (task: Task) => void
  compact?: boolean
}

export function TaskCard({ task, onUpdate, onDelete, onView, compact = false }: TaskCardProps) {
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "low":
        return "bg-green-100 text-green-800 border-green-200"
      case "medium":
        return "bg-blue-100 text-blue-800 border-blue-200"
      case "high":
        return "bg-orange-100 text-orange-800 border-orange-200"
      case "urgent":
        return "bg-red-100 text-red-800 border-red-200"
      default:
        return "bg-gray-100 text-gray-800 border-gray-200"
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "not_started":
        return "bg-gray-100 text-gray-800"
      case "in_progress":
        return "bg-blue-100 text-blue-800"
      case "on_hold":
        return "bg-yellow-100 text-yellow-800"
      case "completed":
        return "bg-green-100 text-green-800"
      case "canceled":
        return "bg-red-100 text-red-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  const getCategoryColor = (category: string) => {
    switch (category) {
      case "administrative":
        return "bg-purple-100 text-purple-800 border-purple-200"
      case "technical":
        return "bg-cyan-100 text-cyan-800 border-cyan-200"
      case "client_related":
        return "bg-yellow-100 text-yellow-800 border-yellow-200"
      case "internal":
        return "bg-teal-100 text-teal-800 border-teal-200"
      case "other":
        return "bg-gray-100 text-gray-800 border-gray-200"
      default:
        return "bg-gray-100 text-gray-800 border-gray-200"
    }
  }

  const handleStatusChange = async (newStatus: string) => {
    try {
      setIsLoading(true)
      setError(null)
      await onUpdate(task.id!, { status: newStatus as any })
    } catch (err) {
      console.error("Error updating task status:", err)
      setError("Eroare la actualizarea statusului")
    } finally {
      setIsLoading(false)
    }
  }

  const handleDeleteConfirm = async () => {
    try {
      setIsLoading(true)
      setError(null)
      await onDelete(task.id!)
      setIsConfirmDialogOpen(false)
    } catch (err) {
      console.error("Error deleting task:", err)
      setError("Eroare la ștergerea sarcinii")
    } finally {
      setIsLoading(false)
    }
  }

  const formatDate = (timestamp: any) => {
    if (!timestamp) return null

    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
      return format(date, "PPP", { locale: ro })
    } catch (err) {
      console.error("Error formatting date:", err)
      return null
    }
  }

  // Render compact card for dashboard use
  if (compact) {
    return (
      <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => onView?.(task)}>
        <CardContent className="p-3">
          <div className="flex justify-between items-start mb-2">
            <div className="font-medium truncate mr-2">{task.title}</div>
            <Badge className={getStatusColor(task.status)}>{getTaskStatusDisplay(task.status)}</Badge>
          </div>
          <div className="flex items-center text-xs text-muted-foreground mb-1">
            {task.dueDate && (
              <div className="flex items-center">
                <CalendarIcon className="mr-1 h-3 w-3" />
                <span>{formatDate(task.dueDate)}</span>
              </div>
            )}
          </div>
          <Badge variant="outline" className={getPriorityColor(task.priority)}>
            {getTaskPriorityDisplay(task.priority)}
          </Badge>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="p-4 border-b">
            <div className="flex justify-between items-start mb-2">
              <h3 className="font-medium">{task.title}</h3>
              <Badge className={getStatusColor(task.status)}>{getTaskStatusDisplay(task.status)}</Badge>
            </div>
            {task.description && <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{task.description}</p>}
          </div>

          <div className="p-4 grid gap-2 text-sm">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Prioritate:</span>
              <Badge variant="outline" className={getPriorityColor(task.priority)}>
                {getTaskPriorityDisplay(task.priority)}
              </Badge>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Categorie:</span>
              <Badge variant="outline" className={getCategoryColor(task.category)}>
                {getTaskCategoryDisplay(task.category)}
              </Badge>
            </div>

            {task.dueDate && (
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Data scadentă:</span>
                <span className="flex items-center">
                  <CalendarIcon className="mr-1 h-3 w-3" />
                  {formatDate(task.dueDate)}
                </span>
              </div>
            )}

            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Asignat către:</span>
              <div className="flex flex-wrap gap-1 justify-end">
                {task.assignedTo.length > 0 ? (
                  <Badge variant="outline">
                    {task.assignedTo.length > 1 ? `${task.assignedTo.length} persoane` : "1 persoană"}
                  </Badge>
                ) : (
                  <span className="text-muted-foreground">Nimeni</span>
                )}
              </div>
            </div>
          </div>
        </CardContent>

        <CardFooter className="flex justify-between p-4 pt-0 border-t">
          <div className="flex gap-2">
            {task.status !== "completed" && (
              <Button
                variant="ghost"
                size="sm"
                className="text-green-600 hover:text-green-700 hover:bg-green-50"
                onClick={() => handleStatusChange("completed")}
                disabled={isLoading}
              >
                <CheckCircle className="h-4 w-4 mr-1" />
                Completează
              </Button>
            )}
            {task.status !== "canceled" && task.status !== "completed" && (
              <Button
                variant="ghost"
                size="sm"
                className="text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                onClick={() => handleStatusChange("on_hold")}
                disabled={isLoading}
              >
                <Clock className="h-4 w-4 mr-1" />
                În așteptare
              </Button>
            )}
          </div>

          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setIsEditDialogOpen(true)} disabled={isLoading}>
              Editează
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
              onClick={() => setIsConfirmDialogOpen(true)}
              disabled={isLoading}
            >
              <XCircle className="h-4 w-4 mr-1" />
              Șterge
            </Button>
          </div>
        </CardFooter>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editează sarcina</DialogTitle>
          </DialogHeader>
          <TaskForm
            task={task}
            isEdit={true}
            onSuccess={() => setIsEditDialogOpen(false)}
            onCancel={() => setIsEditDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isConfirmDialogOpen} onOpenChange={setIsConfirmDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Șterge sarcina</DialogTitle>
          </DialogHeader>

          <div className="py-4">
            <p>Sunteți sigur că doriți să ștergeți această sarcină? Această acțiune nu poate fi anulată.</p>

            {error && (
              <Alert variant="destructive" className="mt-4">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsConfirmDialogOpen(false)} disabled={isLoading}>
              Anulează
            </Button>
            <Button variant="destructive" onClick={handleDeleteConfirm} disabled={isLoading}>
              {isLoading ? "Se șterge..." : "Șterge"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
