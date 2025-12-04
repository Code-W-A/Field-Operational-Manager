"use client"

import { useState, useMemo, useEffect } from "react"
import { Plus, Search, List, Grid3x3, Folder, Settings, Save, RefreshCw } from "lucide-react"
import { DashboardShell } from "@/components/dashboard-shell"
import { DashboardHeader } from "@/components/dashboard-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
  PREDEFINED_SETTINGS, 
  ensurePredefinedSettings, 
  getPredefinedSettingValue, 
  updatePredefinedSettingValue 
} from "@/lib/firebase/predefined-settings"
import { getCurrentReportNumber, updateReportNumber } from "@/lib/firebase/firestore"
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
  // Initialize browser history state for in-page navigation so Back/Forward works across hierarchy levels
  useEffect(() => {
    try {
      // Ensure root state is present so the first Back returns to previous route correctly
      if (!window.history.state || window.history.state.__settingsNav !== true) {
        window.history.replaceState(
          { __settingsNav: true, parentId: null, path: [] },
          "",
          window.location.pathname + window.location.search + window.location.hash
        )
      }
      const onPopState = (e: PopStateEvent) => {
        const st: any = e.state
        if (st && st.__settingsNav === true) {
          // Restore in-page navigation level
          setCurrentParentId(st.parentId ?? null)
          setNavigationPath(Array.isArray(st.path) ? st.path : [])
        }
      }
      window.addEventListener("popstate", onPopState)
      return () => window.removeEventListener("popstate", onPopState)
    } catch {}
  }, [])

  // UI state
  const [viewMode, setViewMode] = useState<"grid" | "list">("list")
  const [searchQuery, setSearchQuery] = useState("")
  const [filterFavorite, setFilterFavorite] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [multiSelectMode, setMultiSelectMode] = useState(false)
  const [activeTab, setActiveTab] = useState<"sistem" | "variabile">("variabile")

  // Dialog state
  const [editorOpen, setEditorOpen] = useState(false)
  const [editorMode, setEditorMode] = useState<"create" | "edit">("create")
  const [editingSetting, setEditingSetting] = useState<Setting | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historySetting, setHistorySetting] = useState<Setting | null>(null)

  // Predefined settings state
  const [predefinedValues, setPredefinedValues] = useState<Record<string, any>>({})
  const [savingPredefined, setSavingPredefined] = useState(false)
  const [loadingPredefined, setLoadingPredefined] = useState(true)

  // Report number management state
  const [currentReportNumber, setCurrentReportNumber] = useState<number>(1)
  const [reportNumberInput, setReportNumberInput] = useState<string>("1")
  const [isLoadingReportNumber, setIsLoadingReportNumber] = useState(false)
  const [isSavingReportNumber, setIsSavingReportNumber] = useState(false)

  // Load settings
  const { settings, loading } = useSettings(currentParentId)

  // Load predefined settings and report number
  useEffect(() => {
    const loadPredefinedSettings = async () => {
      setLoadingPredefined(true)
      setIsLoadingReportNumber(true)
      try {
        await ensurePredefinedSettings()
        const loadedValues: Record<string, any> = {}
        for (const setting of PREDEFINED_SETTINGS) {
          const value = await getPredefinedSettingValue(setting.id)
          loadedValues[setting.id] = value
        }
        setPredefinedValues(loadedValues)

        // Load current report number
        const current = await getCurrentReportNumber()
        setCurrentReportNumber(current)
        setReportNumberInput(current.toString())
      } catch (error) {
        console.error("Eroare la încărcarea setărilor:", error)
        toast({
          title: "Eroare",
          description: "Nu s-au putut încărca toate setările.",
          variant: "destructive",
        })
      } finally {
        setLoadingPredefined(false)
        setIsLoadingReportNumber(false)
      }
    }
    loadPredefinedSettings()
  }, [])

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
    // Push in-page state so browser Back returns to previous level
    try {
      const nextPath = [...navigationPath, setting]
      window.history.pushState(
        { __settingsNav: true, parentId: setting.id, path: nextPath },
        "",
        window.location.pathname + `?parent=${encodeURIComponent(setting.id)}`
      )
    } catch {}
  }

  const handleNavigateToParent = (parentId: string | null) => {
    setCurrentParentId(parentId)
    if (parentId === null) {
      setNavigationPath([])
      try {
        window.history.pushState(
          { __settingsNav: true, parentId: null, path: [] },
          "",
          window.location.pathname
        )
      } catch {}
    } else {
      const index = navigationPath.findIndex((s) => s.id === parentId)
      if (index >= 0) {
        const newPath = navigationPath.slice(0, index + 1)
        setNavigationPath(newPath)
        try {
          window.history.pushState(
            { __settingsNav: true, parentId, path: newPath },
            "",
            window.location.pathname + `?parent=${encodeURIComponent(parentId)}`
          )
        } catch {}
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

  // Handle report number save
  const handleSaveReportNumber = async () => {
    const newNumber = parseInt(reportNumberInput, 10)
    
    if (isNaN(newNumber) || newNumber < 1) {
      toast({
        title: "Eroare validare",
        description: "Vă rugăm să introduceți un număr valid mai mare decât 0.",
        variant: "destructive",
      })
      return
    }
    
    setIsSavingReportNumber(true)
    try {
      await updateReportNumber(newNumber)
      setCurrentReportNumber(newNumber)
      
      toast({
        title: "Număr actualizat",
        description: `Următorul raport va avea numărul #${newNumber.toString().padStart(6, '0')}.`,
      })
    } catch (error) {
      console.error("Eroare la actualizarea numărului de raport:", error)
      toast({
        title: "Eroare",
        description: "Nu s-a putut actualiza numărul de raport.",
        variant: "destructive",
      })
    } finally {
      setIsSavingReportNumber(false)
    }
  }

  return (
    <DashboardShell>
      <DashboardHeader heading="Setări" text="">
      </DashboardHeader>

      <div className="space-y-6 pb-16">
        {/* Tabs pentru Setări Sistem și Variabile - Afișate doar la root level */}
        {!currentParentId ? (
          <Tabs value={activeTab} onValueChange={(value: any) => setActiveTab(value)} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="sistem" className="flex items-center gap-2">
                <Settings className="h-4 w-4" />
                Setări Sistem
              </TabsTrigger>
              <TabsTrigger value="variabile" className="flex items-center gap-2">
                <Folder className="h-4 w-4" />
                Variabile
              </TabsTrigger>
            </TabsList>

            {/* Tab Content: Setări Sistem */}
            <TabsContent value="sistem" className="mt-6 space-y-3">
              {loadingPredefined ? (
                <Card>
                  <CardContent className="py-12">
                    <div className="flex items-center justify-center gap-2 text-muted-foreground">
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      <span>Se încarcă setările sistem...</span>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                PREDEFINED_SETTINGS.map((setting) => (
                  <Card key={setting.id} className="bg-blue-50/50 border-blue-200">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        {setting.name}
                        <span className="text-xs font-normal text-muted-foreground bg-blue-100 px-2 py-0.5 rounded">
                          Sistem
                        </span>
                      </CardTitle>
                      <CardDescription className="text-xs">
                        {setting.description}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="flex gap-2 items-end">
                        <div className="flex-1">
                          <Label htmlFor={setting.id} className="text-xs text-muted-foreground">
                            Valoare {setting.valueType === "number" && "numerică"}
                          </Label>
                          <Input
                            id={setting.id}
                            type="text"
                            inputMode={setting.valueType === "number" ? "numeric" : undefined}
                            value={
                              setting.valueType === "number"
                                ? String(predefinedValues[setting.id] ?? setting.defaultValue ?? "")
                                : (predefinedValues[setting.id] ?? setting.defaultValue ?? "")
                            }
                            onChange={(e) => {
                              const inputValue = e.target.value
                              let newValue
                              
                              if (setting.valueType === "number") {
                                // Permite valoare goală și filtrează doar cifrele
                                const onlyDigits = inputValue.replace(/\D+/g, "")
                                newValue = onlyDigits
                              } else {
                                newValue = inputValue
                              }
                              
                              setPredefinedValues((prev) => ({
                                ...prev,
                                [setting.id]: newValue,
                              }))
                            }}
                            disabled={loadingPredefined}
                            className="mt-1"
                          />
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const s = PREDEFINED_SETTINGS.find((ps) => ps.id === setting.id)
                            if (s) {
                              setPredefinedValues((prev) => ({
                                ...prev,
                                [setting.id]: s.defaultValue,
                              }))
                            }
                          }}
                          disabled={savingPredefined || loadingPredefined}
                          title="Resetează la valoarea implicită"
                        >
                          <RefreshCw className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          onClick={async () => {
                            setSavingPredefined(true)
                            try {
                              let valueToSave = predefinedValues[setting.id]
                              
                              // Validare pentru valori numerice
                              if (setting.valueType === "number") {
                                const parsed = typeof valueToSave === "string" 
                                  ? parseFloat(valueToSave) 
                                  : valueToSave
                                
                                if (isNaN(parsed) || valueToSave === "" || valueToSave === "-") {
                                  toast({
                                    title: "Eroare validare",
                                    description: "Vă rugăm să introduceți o valoare numerică validă.",
                                    variant: "destructive",
                                  })
                                  setSavingPredefined(false)
                                  return
                                }
                                
                                valueToSave = parsed
                              }
                              
                              await updatePredefinedSettingValue(setting.id, valueToSave)
                              toast({
                                title: "Salvat",
                                description: "Setarea sistem a fost actualizată cu succes.",
                              })
                            } catch (error) {
                              console.error("Eroare la salvarea setării:", error)
                              toast({
                                title: "Eroare",
                                description: "Nu s-a putut salva setarea.",
                                variant: "destructive",
                              })
                            } finally {
                              setSavingPredefined(false)
                            }
                          }}
                          disabled={savingPredefined || loadingPredefined}
                        >
                          <Save className="h-4 w-4 mr-2" />
                          Salvează
                        </Button>
                      </div>
                  
                    </CardContent>
                  </Card>
                ))
              )}

              {/* Management numerotare rapoarte */}
              <Card className="bg-green-50/50 border-green-200">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    Management numerotare rapoarte
                    <span className="text-xs font-normal text-muted-foreground bg-green-100 px-2 py-0.5 rounded">
                      Sistem
                    </span>
                  </CardTitle>
             
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-3">
                    {/* Afișare număr curent */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Următorul număr de raport:</span>
                      {isLoadingReportNumber ? (
                        <div className="flex items-center gap-2">
                          <RefreshCw className="h-3 w-3 animate-spin text-green-600" />
                          <span className="text-xs text-green-600">Se încarcă...</span>
                        </div>
                      ) : (
                        <span className="text-sm font-bold text-green-900 bg-green-100 px-2 py-1 rounded border border-green-300">
                          #{currentReportNumber.toString().padStart(6, '0')}
                        </span>
                      )}
                    </div>

                    {/* Input și butoane */}
                    <div className="flex gap-2 items-end">
                      <div className="flex-1">
                        <Label htmlFor="report-number-input" className="text-xs text-muted-foreground">
                          Setează număr nou
                        </Label>
                        <Input
                          id="report-number-input"
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={reportNumberInput}
                          onChange={(e) => {
                            const onlyDigits = e.target.value.replace(/\D+/g, "")
                            setReportNumberInput(onlyDigits)
                          }}
                          onWheel={(e) => (e.currentTarget as HTMLInputElement).blur()}
                          placeholder="Număr"
                          disabled={isLoadingReportNumber || isSavingReportNumber}
                          className="mt-1"
                        />
                      </div>
                      <Button
                        size="sm"
                        onClick={handleSaveReportNumber}
                        disabled={isLoadingReportNumber || isSavingReportNumber}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        {isSavingReportNumber ? (
                          <>
                            <RefreshCw className="h-3 w-3 animate-spin mr-1" />
                            Se salvează...
                          </>
                        ) : (
                          <>
                            <Save className="h-4 w-4 mr-2" />
                            Actualizează
                          </>
                        )}
                      </Button>
                    </div>

              
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Tab Content: Variabile (Setări Dinamice) */}
            <TabsContent value="variabile" className="mt-6">
              <div className="space-y-6">
                {/* Breadcrumbs și butoane acțiune */}
                <div className="flex items-center justify-between">
                  <SettingsBreadcrumbs currentPath={navigationPath} onNavigate={handleNavigateToParent} />
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
                      {multiSelectMode ? "Deselectează" : "Selectare multiplă"}
                    </Button>
                  </div>
                </div>

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
            </TabsContent>
          </Tabs>
        ) : (
          // When navigating into a subcategory (currentParentId exists), show only the variables view without tabs
          <div className="space-y-6">
            {/* Breadcrumbs și butoane acțiune */}
            <div className="flex items-center justify-between">
              <SettingsBreadcrumbs currentPath={navigationPath} onNavigate={handleNavigateToParent} />
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
                  {multiSelectMode ? "Deselectează" : "Selectare multiplă"}
                </Button>
              </div>
            </div>

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

