"use client"

import { useMemo } from "react"
import { useRouter } from "next/navigation"
import type { Task } from "@/lib/firebase/tasks"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { TaskCard } from "@/components/task-card"
import { Clock, AlertCircle, CheckCircle } from "lucide-react"

interface TaskDashboardProps {
  tasks: Task[]
  onUpdateTask: (id: string, data: Partial<Task>) => Promise<void>
  onDeleteTask: (id: string) => Promise<void>
  isLoading?: boolean
}

export function TaskDashboard({ tasks, onUpdateTask, onDeleteTask, isLoading = false }: TaskDashboardProps) {
  const router = useRouter()

  // Calculate task statistics
  const stats = useMemo(() => {
    const total = tasks.length
    const completed = tasks.filter((t) => t.status === "completed").length
    const inProgress = tasks.filter((t) => t.status === "in_progress").length
    const notStarted = tasks.filter((t) => t.status === "not_started").length
    const onHold = tasks.filter((t) => t.status === "on_hold").length
    const canceled = tasks.filter((t) => t.status === "canceled").length

    const totalActive = total - completed - canceled
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0

    // Tasks by priority
    const urgent = tasks.filter(
      (t) => t.priority === "urgent" && t.status !== "completed" && t.status !== "canceled",
    ).length
    const high = tasks.filter(
      (t) => t.priority === "high" && t.status !== "completed" && t.status !== "canceled",
    ).length

    return {
      total,
      completed,
      inProgress,
      notStarted,
      onHold,
      canceled,
      totalActive,
      completionRate,
      urgent,
      high,
    }
  }, [tasks])

  // Sort tasks by due date
  const upcomingTasks = useMemo(() => {
    return [...tasks]
      .filter((t) => {
        // Filter only active tasks with due dates
        return t.dueDate && t.status !== "completed" && t.status !== "canceled"
      })
      .sort((a, b) => {
        const dateA = a.dueDate ? a.dueDate.toMillis() : Number.POSITIVE_INFINITY
        const dateB = b.dueDate ? b.dueDate.toMillis() : Number.POSITIVE_INFINITY
        return dateA - dateB
      })
      .slice(0, 5) // Take only top 5
  }, [tasks])

  // Get high priority tasks
  const highPriorityTasks = useMemo(() => {
    return [...tasks]
      .filter((t) => {
        // Filter high priority active tasks
        return (t.priority === "urgent" || t.priority === "high") && t.status !== "completed" && t.status !== "canceled"
      })
      .sort((a, b) => {
        // Sort by priority first, then due date
        if (a.priority === b.priority) {
          const dateA = a.dueDate ? a.dueDate.toMillis() : Number.POSITIVE_INFINITY
          const dateB = b.dueDate ? b.dueDate.toMillis() : Number.POSITIVE_INFINITY
          return dateA - dateB
        }
        return a.priority === "urgent" ? -1 : 1
      })
      .slice(0, 5) // Take only top 5
  }, [tasks])

  const handleTaskView = (task: Task) => {
    if (task.id) {
      router.push(`/dashboard/sarcini/${task.id}`)
    }
  }

  return (
    <div className="space-y-6">
      {/* Stats cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Sarcini</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.total}</div>
            <div className="text-xs text-muted-foreground mt-1">{stats.completionRate}% finalizate</div>
            <Progress value={stats.completionRate} className="h-1 mt-3" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Sarcini Active</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.totalActive}</div>
            <div className="flex flex-wrap gap-2 mt-3">
              <Badge variant="outline" className="bg-gray-100">
                {stats.notStarted} neîncepute
              </Badge>
              <Badge variant="outline" className="bg-blue-100">
                {stats.inProgress} în progres
              </Badge>
              <Badge variant="outline" className="bg-yellow-100">
                {stats.onHold} în așteptare
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Sarcini Prioritare</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.urgent + stats.high}</div>
            <div className="flex flex-wrap gap-2 mt-3">
              <Badge variant="outline" className="bg-red-100 text-red-800">
                {stats.urgent} urgente
              </Badge>
              <Badge variant="outline" className="bg-orange-100 text-orange-800">
                {stats.high} prioritate ridicată
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Sarcini Finalizate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.completed}</div>
            <div className="flex items-center mt-3">
              <CheckCircle className="h-4 w-4 text-green-500 mr-1" />
              <span className="text-xs text-muted-foreground">{stats.canceled} sarcini anulate</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tasks sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upcoming Tasks */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center">
              <Clock className="h-5 w-5 mr-2 text-blue-600" />
              Sarcini Apropiate
            </CardTitle>
          </CardHeader>
          <CardContent>
            {upcomingTasks.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">Nu există sarcini apropiate</div>
            ) : (
              <div className="space-y-3">
                {upcomingTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onUpdate={onUpdateTask}
                    onDelete={onDeleteTask}
                    onView={handleTaskView}
                    compact
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* High Priority Tasks */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center">
              <AlertCircle className="h-5 w-5 mr-2 text-red-600" />
              Sarcini cu Prioritate Mare
            </CardTitle>
          </CardHeader>
          <CardContent>
            {highPriorityTasks.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">Nu există sarcini de prioritate mare</div>
            ) : (
              <div className="space-y-3">
                {highPriorityTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onUpdate={onUpdateTask}
                    onDelete={onDeleteTask}
                    onView={handleTaskView}
                    compact
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
