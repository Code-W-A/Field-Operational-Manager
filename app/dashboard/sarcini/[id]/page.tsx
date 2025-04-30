"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import { ro } from "date-fns/locale"
import {
  getTaskById,
  updateTask,
  deleteTask,
  type Task,
  type TaskComment,
  getTaskPriorityDisplay,
  getTaskStatusDisplay,
  getTaskCategoryDisplay,
} from "@/lib/firebase/tasks"
import { DashboardHeader } from "@/components/dashboard-header"
import { DashboardShell } from "@/components/dashboard-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { AlertCircle, Calendar, Clock, Edit, Trash2, User, Building, FileText, ArrowLeft } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useAuth } from "@/contexts/AuthContext"
import { Timestamp, doc, getDoc } from "firebase/firestore"
import { db } from "@/lib/firebase/config"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export default function TaskDetailPage({ params }: { params: { id: string } }) {
  const { userData } = useAuth()
  const router = useRouter()
  const [task, setTask] = useState<Task | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [comment, setComment] = useState("")
  const [isSubmittingComment, setIsSubmittingComment] = useState(false)
  const [comments, setComments] = useState<TaskComment[]>([])
  const [relatedData, setRelatedData] = useState({
    workOrder: null as any,
    client: null as any,
  })

  // Fetch the task data
  useEffect(() => {
    const fetchTask = async () => {
      try {
        setIsLoading(true)
        const taskData = await getTaskById(params.id)

        if (!taskData) {
          setError("Sarcina nu a fost găsită")
          return
        }

        setTask(taskData)

        // Load comments
        if (taskData.comments) {
          setComments(taskData.comments)
        }

        // Fetch related data
        if (taskData.relatedWorkOrderId) {
          const workOrderRef = doc(db, "lucrari", taskData.relatedWorkOrderId)
          const workOrderSnap = await getDoc(workOrderRef)

          if (workOrderSnap.exists()) {
            setRelatedData((prev) => ({
              ...prev,
              workOrder: {
                id: workOrderSnap.id,
                ...workOrderSnap.data(),
              },
            }))
          }
        }

        if (taskData.relatedClientId) {
          const clientRef = doc(db, "clienti", taskData.relatedClientId)
          const clientSnap = await getDoc(clientRef)

          if (clientSnap.exists()) {
            setRelatedData((prev) => ({
              ...prev,
              client: {
                id: clientSnap.id,
                ...clientSnap.data(),
              },
            }))
          }
        }
      } catch (err) {
        console.error("Eroare la încărcarea sarcinii:", err)
        setError("A apărut o eroare la încărcarea sarcinii")
      } finally {
        setIsLoading(false)
      }
    }

    fetchTask()
  }, [params.id])

  const handleDeleteTask = async () => {
    try {
      if (!task?.id) return

      await deleteTask(task.id)
      router.push("/dashboard/sarcini")
    } catch (err) {
      console.error("Eroare la ștergerea sarcinii:", err)
      setError("A apărut o eroare la ștergerea sarcinii")
    }
  }

  const handleStatusChange = async (newStatus: string) => {
    try {
      if (!task?.id) return

      const updates: Partial<Task> = {
        status: newStatus as any,
      }

      // If completing the task, set the completion date
      if (newStatus === "completed") {
        updates.completedAt = Timestamp.now()
      }

      await updateTask(task.id, updates)

      // Update local state
      setTask((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          status: newStatus as any,
          completedAt: newStatus === "completed" ? Timestamp.now() : prev.completedAt,
        }
      })
    } catch (err) {
      console.error("Eroare la actualizarea statusului:", err)
      setError("A apărut o eroare la actualizarea statusului sarcinii")
    }
  }

  const handleAddComment = async () => {
    if (!comment.trim() || !task?.id || !userData?.uid) return

    try {
      setIsSubmittingComment(true)

      // Create new comment
      const newComment: TaskComment = {
        id: `comment_${Date.now()}`,
        content: comment.trim(),
        createdBy: userData.uid,
        createdAt: Timestamp.now(),
      }

      // Get existing comments
      const existingComments = task.comments || []

      // Update task with new comment
      await updateTask(task.id, {
        comments: [...existingComments, newComment],
      })

      // Update local state
      setComments((prev) => [...prev, newComment])
      setComment("")
    } catch (err) {
      console.error("Eroare la adăugarea comentariului:", err)
      setError("A apărut o eroare la adăugarea comentariului")
    } finally {
      setIsSubmittingComment(false)
    }
  }

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

  const formatDate = (timestamp: any) => {
    if (!timestamp) return "N/A"

    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
      return format(date, "PPP", { locale: ro })
    } catch (err) {
      console.error("Eroare la formatarea datei:", err)
      return "N/A"
    }
  }

  const formatDateTime = (timestamp: any) => {
    if (!timestamp) return "N/A"

    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
      return format(date, "PPp", { locale: ro })
    } catch (err) {
      console.error("Eroare la formatarea datei și orei:", err)
      return "N/A"
    }
  }

  return (
    <DashboardShell>
      <DashboardHeader
        heading={task?.title || "Detalii sarcină"}
        text={
          task ? (
            <div className="flex items-center gap-2 mt-1">
              <Badge className={getStatusColor(task.status)}>{getTaskStatusDisplay(task.status)}</Badge>
              <Badge variant="outline" className={getPriorityColor(task.priority)}>
                {getTaskPriorityDisplay(task.priority)}
              </Badge>
            </div>
          ) : (
            "Încărcare..."
          )
        }
      >
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Înapoi
          </Button>
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={() => setIsEditDialogOpen(true)}>
            <Edit className="h-4 w-4 mr-1" /> Editează
          </Button>
          <Button variant="destructive" size="sm" onClick={() => setIsDeleteDialogOpen(true)}>
            <Trash2 className="h-4 w-4 mr-1" /> Șterge
          </Button>
        </div>
      </DashboardHeader>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {isLoading ? (
        <div className="flex justify-center my-12">
          <div className="animate-spin h-8 w-8 border-4 border-blue-600 rounded-full border-t-transparent"></div>
        </div>
      ) : task ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Main content */}
          <div className="md:col-span-2 space-y-6">
            {/* Task details */}
            <Card>
              <CardHeader>
                <CardTitle>Detalii Sarcină</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h3 className="font-medium mb-2">Descriere</h3>
                  <p className="text-gray-700 whitespace-pre-wrap">{task.description || "Fără descriere"}</p>
                </div>

                <Separator />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center text-sm">
                      <Calendar className="h-4 w-4 mr-2 text-gray-500" />
                      <span className="text-gray-500 mr-2">Creat la:</span>
                      <span>{task.createdAt ? formatDateTime(task.createdAt) : "N/A"}</span>
                    </div>

                    <div className="flex items-center text-sm">
                      <Calendar className="h-4 w-4 mr-2 text-gray-500" />
                      <span className="text-gray-500 mr-2">Data scadentă:</span>
                      <span>{task.dueDate ? formatDate(task.dueDate) : "Fără dată scadentă"}</span>
                    </div>

                    {task.status === "completed" && task.completedAt && (
                      <div className="flex items-center text-sm">
                        <Clock className="h-4 w-4 mr-2 text-gray-500" />
                        <span className="text-gray-500 mr-2">Completat la:</span>
                        <span>{formatDateTime(task.completedAt)}</span>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center text-sm">
                      <User className="h-4 w-4 mr-2 text-gray-500" />
                      <span className="text-gray-500 mr-2">Asignat către:</span>
                      <span>{task.assignedTo?.length ? task.assignedTo.join(", ") : "Nimeni"}</span>
                    </div>

                    <div className="flex items-center text-sm">
                      <FileText className="h-4 w-4 mr-2 text-gray-500" />
                      <span className="text-gray-500 mr-2">Categorie:</span>
                      <span>{getTaskCategoryDisplay(task.category)}</span>
                    </div>
                  </div>
                </div>

                {(relatedData.workOrder || relatedData.client) && (
                  <>
                    <Separator />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {relatedData.workOrder && (
                        <div className="space-y-1">
                          <h3 className="font-medium flex items-center">
                            <FileText className="h-4 w-4 mr-1" /> Lucrare asociată
                          </h3>
                          <Button
                            variant="link"
                            className="p-0 h-auto text-blue-600"
                            onClick={() => router.push(`/dashboard/lucrari/${task.relatedWorkOrderId}`)}
                          >
                            {relatedData.workOrder.client} - {relatedData.workOrder.tipLucrare}
                          </Button>
                        </div>
                      )}

                      {relatedData.client && (
                        <div className="space-y-1">
                          <h3 className="font-medium flex items-center">
                            <Building className="h-4 w-4 mr-1" /> Client asociat
                          </h3>
                          <Button
                            variant="link"
                            className="p-0 h-auto text-blue-600"
                            onClick={() => router.push(`/dashboard/clienti/${task.relatedClientId}`)}
                          >
                            {relatedData.client.nume}
                          </Button>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </CardContent>
              <CardFooter className="border-t pt-6">
                <div className="flex flex-wrap gap-2">
                  {task.status !== "completed" && (
                    <Button className="bg-green-600 hover:bg-green-700" onClick={() => handleStatusChange("completed")}>
                      Marchează ca finalizată
                    </Button>
                  )}

                  {task.status !== "in_progress" && task.status !== "completed" && (
                    <Button
                      variant="outline"
                      className="text-blue-600 border-blue-200 hover:bg-blue-50"
                      onClick={() => handleStatusChange("in_progress")}
                    >
                      Începe lucrul
                    </Button>
                  )}

                  {task.status !== "on_hold" && task.status !== "completed" && (
                    <Button
                      variant="outline"
                      className="text-amber-600 border-amber-200 hover:bg-amber-50"
                      onClick={() => handleStatusChange("on_hold")}
                    >
                      Pune în așteptare
                    </Button>
                  )}

                  {task.status !== "canceled" && task.status !== "completed" && (
                    <Button
                      variant="outline"
                      className="text-red-600 border-red-200 hover:bg-red-50"
                      onClick={() => handleStatusChange("canceled")}
                    >
                      Anulează sarcina
                    </Button>
                  )}
                </div>
              </CardFooter>
            </Card>

            {/* Comments */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Comentarii</span>
                  <Badge variant="outline">{comments.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {comments.length === 0 ? (
                  <div className="text-center py-4 text-muted-foreground">
                    Nu există comentarii. Adăugați primul comentariu.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {comments.map((comment) => (
                      <div key={comment.id} className="flex gap-4">
                        <Avatar>
                          <AvatarFallback>{comment.createdBy?.substring(0, 2).toUpperCase() || "?"}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-medium">{comment.createdBy}</span>
                            <span className="text-xs text-muted-foreground">{formatDateTime(comment.createdAt)}</span>
                          </div>
                          <p className="text-gray-700 whitespace-pre-wrap">{comment.content}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
              <CardFooter className="border-t pt-6 flex gap-4">
                <div className="flex-1">
                  <Textarea
                    placeholder="Adaugă un comentariu..."
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                  />
                </div>
                <Button
                  className="bg-blue-600 hover:bg-blue-700"
                  disabled={!comment.trim() || isSubmittingComment}
                  onClick={handleAddComment}
                >
                  {isSubmittingComment ? (
                    <div className="animate-spin h-4 w-4 border-2 border-white rounded-full border-t-transparent"></div>
                  ) : (
                    "Adaugă"
                  )}
                </Button>
              </CardFooter>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Acțiuni rapide</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => router.push("/dashboard/sarcini")}
                >
                  <ArrowLeft className="h-4 w-4 mr-2" /> Înapoi la lista de sarcini
                </Button>

                <Button
                  variant="outline"
                  className="w-full justify-start text-blue-600"
                  onClick={() => setIsEditDialogOpen(true)}
                >
                  <Edit className="h-4 w-4 mr-2" /> Editează sarcina
                </Button>

                <Button
                  variant="outline"
                  className="w-full justify-start text-red-600"
                  onClick={() => setIsDeleteDialogOpen(true)}
                >
                  <Trash2 className="h-4 w-4 mr-2" /> Șterge sarcina
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : (
        <div className="text-center py-12">
          <p className="text-lg text-gray-500">Sarcina nu a fost găsită</p>
          <Button variant="outline" className="mt-4" onClick={() => router.push("/dashboard/sarcini")}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Înapoi la lista de sarcini
          </Button>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmare ștergere</DialogTitle>
            <DialogDescription>
              Ești sigur că vrei să ștergi această sarcină? Această acțiune nu poate fi anulată.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              Anulează
            </Button>
            <Button variant="destructive" onClick={handleDeleteTask}>
              Șterge
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog - This would be implemented separately */}
      {isEditDialogOpen && task && (
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>Editare sarcină</DialogTitle>
            </DialogHeader>
            {/* Here you would include your task edit form component */}
            <div className="py-4">
              <p>Implementează formularul de editare a sarcinii aici.</p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                Anulează
              </Button>
              <Button type="submit" form="edit-task-form">
                Salvează modificările
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </DashboardShell>
  )
}
