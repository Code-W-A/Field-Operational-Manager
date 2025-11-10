"use client"

import { useState, useMemo } from "react"
import { Plus, Search, List, Grid3x3, Folder } from "lucide-react"
import { DashboardShell } from "@/components/dashboard-shell"
import { DashboardHeader } from "@/components/dashboard-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Checkbox } from "@/components/ui/checkbox"
import { useToast } from "@/hooks/use-toast"
import { useAuth } from "@/contexts/AuthContext"
import type { Setting } from "@/types/settings"
import { useSettings } from "@/hooks/use-settings"
import {
  createSetting,
  updateSetting,
  deleteSetting,
  duplicateSetting,
  updateSettingsOrder,
  revertSetting,
} from "@/lib/firebase/settings"
import { SettingsBreadcrumbs } from "@/components/settings/settings-breadcrumbs"
import { SettingCard } from "@/components/settings/setting-card"
import { SettingRow } from "@/components/settings/setting-row"
import { SettingEditorDialog } from "@/components/settings/setting-editor-dialog"
import { SettingHistoryDialog } from "@/components/settings/setting-history-dialog"
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

function SortableSettingCard({ setting, ...props }: any) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: setting.id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <SettingCard setting={setting} dragHandleProps={listeners} {...props} />
    </div>
  )
}

function SortableSettingRow({ setting, ...props }: any) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: setting.id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <SettingRow setting={setting} dragHandleProps={listeners} {...props} />
    </div>
  )
}

export default function SetariPage() {
  const { userData } = useAuth()
  const { toast } = useToast()

  // Navigation state
  const [currentParentId, setCurrentParentId] = useState<string | null>(null)
  const [navigationPath, setNavigationPath] = useState<Setting[]>([])

  // UI state
  const [viewMode, setViewMode] = useState<"grid" | "list">("list")
  const [searchQuery, setSearchQuery] = useState("")
  const [filterFavorite, setFilterFavorite] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [multiSelectMode, setMultiSelectMode] = useState(false)

  // Dialog state
  const [editorOpen, setEditorOpen] = useState(false)
  const [editorMode, setEditorMode] = useState<"create" | "edit">("create")
  const [editingSetting, setEditingSetting] = useState<Setting | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historySetting, setHistorySetting] = useState<Setting | null>(null)

  // Load settings
  const { settings, loading } = useSettings(currentParentId)

  // Access control: only admin can view this page
  if (userData && userData.role !== "admin") {
    return (
      <DashboardShell>
        <DashboardHeader heading="Setări" text="" />
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
          <div className="text-2xl font-semibold">Acces restricționat</div>
          <div className="text-muted-foreground">Această pagină este disponibilă doar pentru conturi de tip administrator.</div>
        </div>
      </DashboardShell>
    )
  }

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // Filtered and sorted settings
  const filteredSettings = useMemo(() => {
    let filtered = [...settings]

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(
        (s) =>
          s.name.toLowerCase().includes(query) ||
          s.description?.toLowerCase().includes(query) ||
          s.path.toLowerCase().includes(query)
      )
    }

    // Favorite filter
    if (filterFavorite) {
      filtered = filtered.filter((s) => s.favorite)
    }

    return filtered
  }, [settings, searchQuery, filterFavorite])

  // Handlers
  const handleNavigate = (setting: Setting) => {
    // Allow navigation for both categories and variables (to show their children)
    setCurrentParentId(setting.id)
    setNavigationPath([...navigationPath, setting])
  }

  const handleNavigateToParent = (parentId: string | null) => {
    setCurrentParentId(parentId)
    if (parentId === null) {
      setNavigationPath([])
    } else {
      const index = navigationPath.findIndex((s) => s.id === parentId)
      if (index >= 0) {
        setNavigationPath(navigationPath.slice(0, index + 1))
      }
    }
  }

  const handleCreate = () => {
    setEditorMode("create")
    setEditingSetting(null)
    setEditorOpen(true)
  }

  const handleEdit = (setting: Setting) => {
    setEditorMode("edit")
    setEditingSetting(setting)
    setEditorOpen(true)
  }

  const handleAddChild = (parent: Setting) => {
    setCurrentParentId(parent.id)
    setNavigationPath([...navigationPath, parent])
    setTimeout(() => {
      setEditorMode("create")
      setEditingSetting(null)
      setEditorOpen(true)
    }, 100)
  }

  const handleSave = async (data: any) => {
    try {
      if (editorMode === "create") {
        await createSetting(
          { ...data, parentId: currentParentId },
          userData?.uid || "",
          userData?.displayName || "Utilizator"
        )
        toast({ title: "Setare creată cu succes" })
      } else if (editingSetting) {
        await updateSetting(editingSetting.id, data, userData?.uid || "", userData?.displayName || "Utilizator")
        toast({ title: "Setare actualizată cu succes" })
      }
    } catch (error) {
      console.error("Error saving setting:", error)
      toast({ title: "Eroare la salvare", variant: "destructive" })
    }
  }

  const handleDelete = async (setting: Setting) => {
    try {
      await deleteSetting(setting.id, userData?.uid || "", userData?.displayName || "Utilizator")
      toast({ title: "Setare ștearsă cu succes" })
    } catch (error) {
      console.error("Error deleting setting:", error)
      toast({ title: "Eroare la ștergere", variant: "destructive" })
    }
  }

  const handleDuplicate = async (setting: Setting, deepClone: boolean) => {
    try {
      await duplicateSetting(setting.id, userData?.uid || "", userData?.displayName || "Utilizator", deepClone)
      toast({ title: "Setare duplicată cu succes" })
    } catch (error) {
      console.error("Error duplicating setting:", error)
      toast({ title: "Eroare la duplicare", variant: "destructive" })
    }
  }

  const handleToggleFavorite = async (setting: Setting) => {
    try {
      await updateSetting(
        setting.id,
        { favorite: !setting.favorite },
        userData?.uid || "",
        userData?.displayName || "Utilizator"
      )
    } catch (error) {
      console.error("Error toggling favorite:", error)
    }
  }

  const handleViewHistory = (setting: Setting) => {
    setHistorySetting(setting)
    setHistoryOpen(true)
  }

  const toggleSelect = (setting: Setting) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(setting.id)) next.delete(setting.id)
      else next.add(setting.id)
      return next
    })
  }

  const isSelected = (id: string) => selectedIds.has(id)

  const selectAll = () => {
    setSelectedIds(new Set(filteredSettings.map((s) => s.id)))
  }

  const clearSelection = () => setSelectedIds(new Set())

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    setBulkDeleteOpen(false)
    try {
      await Promise.all(
        ids.map((id) => deleteSetting(id, userData?.uid || "", userData?.displayName || "Utilizator"))
      )
      toast({ title: `Șterse ${ids.length} setări` })
      clearSelection()
    } catch (error) {
      console.error("Error bulk deleting:", error)
      toast({ title: "Eroare la ștergere multiplă", variant: "destructive" })
    }
  }

  const handleRevert = async (historyId: string) => {
    if (!historySetting) return
    try {
      await revertSetting(historySetting.id, historyId, userData?.uid || "", userData?.displayName || "Utilizator")
      toast({ title: "Setare revenită cu succes" })
    } catch (error) {
      console.error("Error reverting:", error)
      toast({ title: "Eroare la revenire", variant: "destructive" })
    }
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event

    if (!over || active.id === over.id) return

    const oldIndex = filteredSettings.findIndex((s) => s.id === active.id)
    const newIndex = filteredSettings.findIndex((s) => s.id === over.id)

    if (oldIndex === -1 || newIndex === -1) return

    const reordered = arrayMove(filteredSettings, oldIndex, newIndex)

    // Update orders in Firestore
    const updates = reordered.map((setting, index) => ({
      id: setting.id,
      order: index,
    }))

    try {
      await updateSettingsOrder(updates, userData?.uid || "", userData?.displayName || "Utilizator")
    } catch (error) {
      console.error("Error updating order:", error)
      toast({ title: "Eroare la reordonare", variant: "destructive" })
    }
  }

  return (
    <DashboardShell>
      <DashboardHeader heading="Setări" text="">
        <div className="flex items-center gap-2">
          <Button onClick={handleCreate} size="sm">
            <Plus className="mr-2 h-4 w-4" />
            Element nou
          </Button>
          <Button
            variant={multiSelectMode ? "default" : "outline"}
            size="sm"
            onClick={() => {
              if (multiSelectMode) {
                clearSelection()
                setMultiSelectMode(false)
              } else {
                setMultiSelectMode(true)
              }
            }}
          >
            {multiSelectMode ? "Gata selectarea" : "Selectare multiplă"}
          </Button>
        </div>
      </DashboardHeader>

      <div className="space-y-6 pb-16">
        {/* Breadcrumbs */}
        <SettingsBreadcrumbs currentPath={navigationPath} onNavigate={handleNavigateToParent} />

        {/* Bulk actions bar */}
        {multiSelectMode && (
          <div className="flex items-center justify-between p-3 rounded-md bg-muted/40 border">
            <div className="text-sm">
              Selectate: <span className="font-medium">{selectedIds.size}</span>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={selectAll}>
                Selectează toate
              </Button>
              <Button variant="outline" size="sm" onClick={clearSelection}>
                Deselectează
              </Button>
              <Button variant="destructive" size="sm" onClick={() => setBulkDeleteOpen(true)}>
                Șterge selectate
              </Button>
            </div>
          </div>
        )}

        <Separator />

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="flex flex-1 gap-2 w-full sm:w-auto">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Caută setări..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant={filterFavorite ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterFavorite(!filterFavorite)}
            >
              Favorite
            </Button>
            <ToggleGroup type="single" value={viewMode} onValueChange={(val: any) => val && setViewMode(val)}>
              <ToggleGroupItem value="grid" aria-label="Grid view">
                <Grid3x3 className="h-4 w-4" />
              </ToggleGroupItem>
              <ToggleGroupItem value="list" aria-label="List view">
                <List className="h-4 w-4" />
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 space-y-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            <p className="text-muted-foreground">Se încarcă setările...</p>
          </div>
        ) : filteredSettings.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16 space-y-4">
              {searchQuery || filterFavorite ? (
                <>
                  <div className="p-4 rounded-full bg-muted">
                    <Search className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <div className="text-center space-y-2">
                    <h3 className="text-lg font-semibold">Niciun rezultat</h3>
                    <p className="text-muted-foreground max-w-md">
                      Nu s-au găsit elemente care să corespundă criteriilor de căutare. 
                      Încearcă să modifici filtrele aplicate.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSearchQuery("")
                      setFilterFavorite(false)
                    }}
                  >
                    Resetează filtrele
                  </Button>
                </>
              ) : (
                <>
                  <div className="p-4 rounded-full bg-primary/10">
                    <Folder className="h-8 w-8 text-primary" />
                  </div>
                  <div className="text-center space-y-2">
                    <h3 className="text-lg font-semibold">Nicio setare încă</h3>
                    <p className="text-muted-foreground max-w-md">
                      Începe prin a crea prima setare. 
                      Construiește structura cu setări și subsetări.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={handleCreate}>
                      <Plus className="mr-2 h-4 w-4" />
                      Creează primul element
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={filteredSettings.map((s) => s.id)} strategy={verticalListSortingStrategy}>
              {viewMode === "grid" ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {filteredSettings.map((setting) => (
                    <SortableSettingCard
                      key={setting.id}
                      setting={setting}
                      selected={isSelected(setting.id)}
                      onToggleSelect={toggleSelect}
                      showCheckbox={multiSelectMode}
                      onNavigate={handleNavigate}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                      onDuplicate={handleDuplicate}
                      onToggleFavorite={handleToggleFavorite}
                      onViewHistory={handleViewHistory}
                      onAddChild={handleAddChild}
                    />
                  ))}
                  {/* Add new card shortcut at the end (right of the last card) */}
                  <Card
                    className="border-dashed hover:border-primary/60 hover:bg-primary/5 transition cursor-pointer flex items-center justify-center"
                    onClick={handleCreate}
                  >
                    <CardContent className="flex items-center justify-center py-10">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <div className="p-2 rounded-full bg-muted">
                          <Plus className="h-5 w-5" />
                        </div>
                        <span className="text-sm font-medium">Adaugă setare</span>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredSettings.map((setting) => (
                    <SortableSettingRow
                      key={`row-${setting.id}`}
                      setting={setting}
                      selected={isSelected(setting.id)}
                      onToggleSelect={toggleSelect}
                      showCheckbox={multiSelectMode}
                      onNavigate={handleNavigate}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                      onDuplicate={handleDuplicate}
                      onToggleFavorite={handleToggleFavorite}
                      onViewHistory={handleViewHistory}
                      onAddChild={handleAddChild}
                    />
                  ))}
                  {/* Add new row shortcut at the end of the list */}
                  <div
                    className="w-full rounded-md border border-dashed bg-background hover:bg-muted/30 transition-all px-3 py-3 flex items-center justify-center cursor-pointer"
                    onClick={handleCreate}
                  >
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Plus className="h-4 w-4" />
                      <span className="text-sm font-medium">Adaugă setare</span>
                    </div>
                  </div>
                </div>
              )}
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* Dialogs */}
      <SettingEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        setting={editingSetting}
        parentId={currentParentId}
        onSave={handleSave}
        mode={editorMode}
      />

      <SettingHistoryDialog
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        setting={historySetting}
        onRevert={handleRevert}
      />

      {/* Bulk delete confirm */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmare ștergere multiplă</AlertDialogTitle>
            <AlertDialogDescription>
              Ești sigur că vrei să ștergi {selectedIds.size} element
              {selectedIds.size === 1 ? "" : "e"}? Această acțiune va șterge și toate subsetările lor.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Anulează</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete}>Șterge</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardShell>
  )
}

