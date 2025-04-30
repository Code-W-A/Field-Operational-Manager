"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import { ro } from "date-fns/locale"
import { CalendarIcon, AlertCircle, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { MultiSelect } from "@/components/ui/multi-select"
import { Calendar } from "@/components/ui/calendar"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import {
  type Task,
  type TaskPriority,
  type TaskStatus,
  type TaskCategory,
  getTaskPriorityDisplay,
  getTaskStatusDisplay,
  getTaskCategoryDisplay,
} from "@/lib/firebase/tasks"
import { collection, getDocs } from "firebase/firestore"
import { db } from "@/lib/firebase/config"
import { useAuth } from "@/contexts/AuthContext"
import { Timestamp } from "firebase/firestore"

interface TaskFormProps {
  task?: Task
  isEdit?: boolean
  onCancel: () => void
  onSuccess: () => void
}

type UserOption = {
  value: string
  label: string
}

export function TaskForm({ task, isEdit = false, onCancel, onSuccess }: TaskFormProps) {
  const { userData } = useAuth()
  const router = useRouter()

  // Form state
  const [title, setTitle] = useState(task?.title || "")
  const [description, setDescription] = useState(task?.description || "")
  const [priority, setPriority] = useState<TaskPriority>(task?.priority || "medium")
  const [status, setStatus] = useState<TaskStatus>(task?.status || "not_started")
  const [category, setCategory] = useState<TaskCategory>(task?.category || "administrative")
  const [assignedTo, setAssignedTo] = useState<string[]>(task?.assignedTo || [])
  const [dueDate, setDueDate] = useState<Date | undefined>(task?.dueDate ? task.dueDate.toDate() : undefined)
  const [relatedWorkOrderId, setRelatedWorkOrderId] = useState(task?.relatedWorkOrderId || "")
  const [relatedClientId, setRelatedClientId] = useState(task?.relatedClientId || "")

  // Other state
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [userOptions, setUserOptions] = useState<UserOption[]>([])
  const [workOrderOptions, setWorkOrderOptions] = useState<{ value: string; label: string }[]>([])
  const [clientOptions, setClientOptions] = useState<{ value: string; label: string }[]>([])

  // Fetch users for assignment
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const usersCollection = collection(db, "users")
        const usersSnapshot = await getDocs(usersCollection)

        const options: UserOption[] = []
        usersSnapshot.forEach((doc) => {
          const userData = doc.data()
          options.push({
            value: doc.id,
            label: userData.displayName || userData.email || doc.id,
          })
        })

        setUserOptions(options)
      } catch (err) {
        console.error("Eroare la încărcarea utilizatorilor:", err)
      }
    }

    fetchUsers()
  }, [])

  // Fetch work orders and clients for related items
  useEffect(() => {
    const fetchRelatedData = async () => {
      try {
        // Fetch work orders
        const workOrdersCollection = collection(db, "lucrari")
        const workOrdersSnapshot = await getDocs(workOrdersCollection)

        const workOrders: { value: string; label: string }[] = []
        workOrdersSnapshot.forEach((doc) => {
          const workOrderData = doc.data()
          workOrders.push({
            value: doc.id,
            label: `${workOrderData.client} - ${workOrderData.tipLucrare} (${workOrderData.dataInterventie || "N/A"})`,
          })
        })

        setWorkOrderOptions(workOrders)

        // Fetch clients
        const clientsCollection = collection(db, "clienti")
        const clientsSnapshot = await getDocs(clientsCollection)

        const clients: { value: string; label: string }[] = []
        clientsSnapshot.forEach((doc) => {
          const clientData = doc.data()
          clients.push({
            value: doc.id,
            label: clientData.nume || doc.id,
          })
        })

        setClientOptions(clients)
      } catch (err) {
        console.error("Eroare la încărcarea datelor asociate:", err)
      }
    }

    fetchRelatedData()
  }, [])

  const validateForm = (): boolean => {
    if (!title.trim()) {
      setError("Titlul este obligatoriu")
      return false
    }

    if (!assignedTo.length) {
      setError("Trebuie să atribuiți sarcina cel puțin unei persoane")
      return false
    }

    setError(null)
    return true
  }

  const handleSubmit = async () => {
    try {
      if (!validateForm()) return

      setIsSubmitting(true)

      const taskData: Partial<Task> = {
        title,
        description,
        priority,
        status,
        category,
        assignedTo,
        dueDate: dueDate ? Timestamp.fromDate(dueDate) : null,
        relatedWorkOrderId: relatedWorkOrderId || undefined,
        relatedClientId: relatedClientId || undefined,
      }

      if (!isEdit) {
        // Create a new task
        const response = await fetch("/api/tasks", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(taskData),
        })

        if (!response.ok) {
          throw new Error("Eroare la crearea sarcinii")
        }
      } else if (task?.id) {
        // Update existing task
        const response = await fetch(`/api/tasks/${task.id}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(taskData),
        })

        if (!response.ok) {
          throw new Error("Eroare la actualizarea sarcinii")
        }
      }

      onSuccess()
    } catch (err) {
      console.error("Eroare la salvarea sarcinii:", err)
      setError(err instanceof Error ? err.message : "A apărut o eroare neașteptată")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <Label htmlFor="title">Titlu *</Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Introduceți titlul sarcinii"
          className={cn(error && !title.trim() ? "border-red-500" : "")}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Descriere</Label>
        <Textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Introduceți descrierea sarcinii"
          rows={4}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="priority">Prioritate *</Label>
          <Select value={priority} onValueChange={(value) => setPriority(value as TaskPriority)}>
            <SelectTrigger id="priority">
              <SelectValue placeholder="Selectați prioritatea" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">{getTaskPriorityDisplay("low")}</SelectItem>
              <SelectItem value="medium">{getTaskPriorityDisplay("medium")}</SelectItem>
              <SelectItem value="high">{getTaskPriorityDisplay("high")}</SelectItem>
              <SelectItem value="urgent">{getTaskPriorityDisplay("urgent")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="status">Status *</Label>
          <Select value={status} onValueChange={(value) => setStatus(value as TaskStatus)}>
            <SelectTrigger id="status">
              <SelectValue placeholder="Selectați statusul" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="not_started">{getTaskStatusDisplay("not_started")}</SelectItem>
              <SelectItem value="in_progress">{getTaskStatusDisplay("in_progress")}</SelectItem>
              <SelectItem value="on_hold">{getTaskStatusDisplay("on_hold")}</SelectItem>
              <SelectItem value="completed">{getTaskStatusDisplay("completed")}</SelectItem>
              <SelectItem value="canceled">{getTaskStatusDisplay("canceled")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="category">Categorie *</Label>
          <Select value={category} onValueChange={(value) => setCategory(value as TaskCategory)}>
            <SelectTrigger id="category">
              <SelectValue placeholder="Selectați categoria" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="administrative">{getTaskCategoryDisplay("administrative")}</SelectItem>
              <SelectItem value="technical">{getTaskCategoryDisplay("technical")}</SelectItem>
              <SelectItem value="client_related">{getTaskCategoryDisplay("client_related")}</SelectItem>
              <SelectItem value="internal">{getTaskCategoryDisplay("internal")}</SelectItem>
              <SelectItem value="other">{getTaskCategoryDisplay("other")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="dueDate">Data scadentă</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant={"outline"}
                className={cn("w-full justify-start text-left font-normal", !dueDate && "text-muted-foreground")}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {dueDate ? format(dueDate, "PPP", { locale: ro }) : <span>Selectați data</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <Calendar mode="single" selected={dueDate} onSelect={setDueDate} initialFocus locale={ro} />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="assignedTo">Asignat către *</Label>
        <MultiSelect
          options={userOptions}
          selected={assignedTo}
          onChange={setAssignedTo}
          placeholder="Selectați utilizatorii"
          emptyText="Nu există utilizatori disponibili"
          className={cn(error && !assignedTo.length ? "border-red-500" : "")}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="relatedWorkOrderId">Lucrare asociată</Label>
          <Select value={relatedWorkOrderId} onValueChange={setRelatedWorkOrderId}>
            <SelectTrigger id="relatedWorkOrderId">
              <SelectValue placeholder="Selectați lucrarea" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Niciuna</SelectItem>
              {workOrderOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="relatedClientId">Client asociat</Label>
          <Select value={relatedClientId} onValueChange={setRelatedClientId}>
            <SelectTrigger id="relatedClientId">
              <SelectValue placeholder="Selectați clientul" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Niciunul</SelectItem>
              {clientOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-4">
        <Button variant="outline" onClick={onCancel}>
          Anulează
        </Button>
        <Button onClick={handleSubmit} disabled={isSubmitting} className="bg-blue-600 hover:bg-blue-700">
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Se salvează...
            </>
          ) : isEdit ? (
            "Actualizează"
          ) : (
            "Adaugă"
          )}
        </Button>
      </div>
    </div>
  )
}
