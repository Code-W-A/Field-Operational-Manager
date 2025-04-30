"use client"

import { useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import type { Task } from "@/lib/firebase/tasks"
import { TaskCard } from "@/components/task-card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Grid3X3, Rows, Search, Plus, SlidersHorizontal } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { TaskForm } from "@/components/task-form"

interface TaskListProps {
  tasks: Task[]
  onUpdateTask: (id: string, data: Partial<Task>) => Promise<void>
  onDeleteTask: (id: string) => Promise<void>
  isLoading?: boolean
}

export function TaskList({ tasks, onUpdateTask, onDeleteTask, isLoading = false }: TaskListProps) {
  const router = useRouter()
  const [searchText, setSearchText] = useState("")
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [priorityFilter, setPriorityFilter] = useState<string>("all")
  const [sortBy, setSortBy] = useState<string>("dueDate")
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)

  // Filter and sort tasks
  const filteredTasks = useMemo(() => {
    return tasks
      .filter((task) => {
        // Filter by search text
        const matchesSearch =
          searchText === "" ||
          task.title.toLowerCase().includes(searchText.toLowerCase()) ||
          task.description.toLowerCase().includes(searchText.toLowerCase())

        // Filter by status
        const matchesStatus = statusFilter === "all" || task.status === statusFilter

        // Filter by priority
        const matchesPriority = priorityFilter === "all" || task.priority === priorityFilter

        return matchesSearch && matchesStatus && matchesPriority
      })
      .sort((a, b) => {
        // Sort by selected field
        if (sortBy === "dueDate") {
          const dateA = a.dueDate ? a.dueDate.toMillis() : Number.POSITIVE_INFINITY
          const dateB = b.dueDate ? b.dueDate.toMillis() : Number.POSITIVE_INFINITY
          return dateA - dateB
        } else if (sortBy === "priority") {
          const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 }
          return (
            priorityOrder[a.priority as keyof typeof priorityOrder] -
            priorityOrder[b.priority as keyof typeof priorityOrder]
          )
        } else if (sortBy === "title") {
          return a.title.localeCompare(b.title)
        } else if (sortBy === "status") {
          const statusOrder = { not_started: 0, in_progress: 1, on_hold: 2, completed: 3, canceled: 4 }
          return statusOrder[a.status as keyof typeof statusOrder] - statusOrder[b.status as keyof typeof statusOrder]
        }
        return 0
      })
  }, [tasks, searchText, statusFilter, priorityFilter, sortBy])

  // Count tasks by status for filter badges
  const statusCounts = useMemo(() => {
    const counts = {
      not_started: 0,
      in_progress: 0,
      on_hold: 0,
      completed: 0,
      canceled: 0,
      total: tasks.length,
    }

    tasks.forEach((task) => {
      if (counts.hasOwnProperty(task.status)) {
        counts[task.status as keyof typeof counts]++
      }
    })

    return counts
  }, [tasks])

  const handleTaskView = (task: Task) => {
    if (task.id) {
      router.push(`/dashboard/sarcini/${task.id}`)
    }
  }

  return (
    <>
      <div className="flex flex-col space-y-4">
        {/* Header with add button and view toggles */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <Button className="bg-blue-600 hover:bg-blue-700" onClick={() => setIsAddDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Adaugă sarcină
          </Button>

          <div className="flex items-center space-x-2">
            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "grid" | "list")} className="w-[180px]">
              <TabsList>
                <TabsTrigger value="grid" className="flex items-center">
                  <Grid3X3 className="h-4 w-4 mr-2" />
                  Grid
                </TabsTrigger>
                <TabsTrigger value="list" className="flex items-center">
                  <Rows className="h-4 w-4 mr-2" />
                  Listă
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>

        {/* Search and filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Caută sarcini..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="pl-8"
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <div className="w-full sm:w-auto">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <div className="flex items-center">
                    <SlidersHorizontal className="mr-2 h-3.5 w-3.5" />
                    <span>Status</span>
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toate ({statusCounts.total})</SelectItem>
                  <SelectItem value="not_started">Neîncepute ({statusCounts.not_started})</SelectItem>
                  <SelectItem value="in_progress">În progres ({statusCounts.in_progress})</SelectItem>
                  <SelectItem value="on_hold">În așteptare ({statusCounts.on_hold})</SelectItem>
                  <SelectItem value="completed">Finalizate ({statusCounts.completed})</SelectItem>
                  <SelectItem value="canceled">Anulate ({statusCounts.canceled})</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="w-full sm:w-auto">
              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <div className="flex items-center">
                    <SlidersHorizontal className="mr-2 h-3.5 w-3.5" />
                    <span>Prioritate</span>
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toate</SelectItem>
                  <SelectItem value="urgent">Urgentă</SelectItem>
                  <SelectItem value="high">Ridicată</SelectItem>
                  <SelectItem value="medium">Medie</SelectItem>
                  <SelectItem value="low">Scăzută</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="w-full sm:w-auto">
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <div className="flex items-center">
                    <SlidersHorizontal className="mr-2 h-3.5 w-3.5" />
                    <span>Sortează după</span>
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dueDate">Data scadentă</SelectItem>
                  <SelectItem value="priority">Prioritate</SelectItem>
                  <SelectItem value="title">Titlu</SelectItem>
                  <SelectItem value="status">Status</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Task filter badges */}
        <div className="flex flex-wrap gap-2">
          {statusFilter !== "all" && (
            <Badge
              variant="secondary"
              className="flex items-center gap-1 px-3 py-1"
              onClick={() => setStatusFilter("all")}
            >
              Status:{" "}
              {statusFilter === "not_started"
                ? "Neîncepute"
                : statusFilter === "in_progress"
                  ? "În progres"
                  : statusFilter === "on_hold"
                    ? "În așteptare"
                    : statusFilter === "completed"
                      ? "Finalizate"
                      : "Anulate"}
              <span className="ml-1 cursor-pointer">×</span>
            </Badge>
          )}

          {priorityFilter !== "all" && (
            <Badge
              variant="secondary"
              className="flex items-center gap-1 px-3 py-1"
              onClick={() => setPriorityFilter("all")}
            >
              Prioritate:{" "}
              {priorityFilter === "urgent"
                ? "Urgentă"
                : priorityFilter === "high"
                  ? "Ridicată"
                  : priorityFilter === "medium"
                    ? "Medie"
                    : "Scăzută"}
              <span className="ml-1 cursor-pointer">×</span>
            </Badge>
          )}

          {searchText && (
            <Badge variant="secondary" className="flex items-center gap-1 px-3 py-1" onClick={() => setSearchText("")}>
              Căutare: {searchText}
              <span className="ml-1 cursor-pointer">×</span>
            </Badge>
          )}
        </div>

        {/* Tasks grid/list */}
        {filteredTasks.length === 0 ? (
          <div className="text-center p-8 bg-gray-50 rounded-lg">
            <p className="text-muted-foreground">Nu există sarcini care să corespundă criteriilor.</p>
          </div>
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredTasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onUpdate={onUpdateTask}
                onDelete={onDeleteTask}
                onView={handleTaskView}
              />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredTasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onUpdate={onUpdateTask}
                onDelete={onDeleteTask}
                onView={handleTaskView}
              />
            ))}
          </div>
        )}
      </div>

      {/* Add Task Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Adaugă sarcină nouă</DialogTitle>
          </DialogHeader>
          <TaskForm
            onSuccess={() => {
              setIsAddDialogOpen(false)
            }}
            onCancel={() => setIsAddDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  )
}
