"use client"

import { useState, useMemo, useEffect } from "react"
import { Plus, Search, List, Grid3x3, Folder, Settings, Save, RefreshCw, Download, Loader2, Archive, Info, BarChart3, FileText } from "lucide-react"
import { DashboardShell } from "@/components/dashboard-shell"
import { DashboardHeader } from "@/components/dashboard-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
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
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/hooks/use-toast"
import { useAuth } from "@/contexts/AuthContext"
import { useRouter, useSearchParams } from "next/navigation"
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
import { DocumentatiiTab } from "@/components/settings/documentatii-tab"
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
  const router = useRouter()
  const searchParams = useSearchParams()

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
  const TAB_KEYS = ["variabile", "sistem", "documentatii"] as const
  type TabKey = (typeof TAB_KEYS)[number]
  const [activeTab, setActiveTab] = useState<TabKey>("variabile")
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set())
  const [stopHierarchy, setStopHierarchy] = useState(false)
  const [stopHierarchyLoading, setStopHierarchyLoading] = useState(false)
  const currentParentSetting = navigationPath.length ? navigationPath[navigationPath.length - 1] : null

  // Sync active tab from query param (only at root level)
  useEffect(() => {
    if (currentParentId) return
    const tab = searchParams.get("tab")
    if (TAB_KEYS.includes(tab as TabKey)) {
      setActiveTab(tab as TabKey)
    } else {
      setActiveTab("variabile")
    }
  }, [searchParams, currentParentId])

  const handleTabChange = (value: TabKey) => {
    setActiveTab(value)
    // Keep URL in sync so menu deep-links work reliably
    try {
      const params = new URLSearchParams(searchParams.toString())
      params.set("tab", value)
      // If someone has a leftover `parent` param, tabs should bring them back to root context.
      params.delete("parent")
      router.replace(`/dashboard/setari?${params.toString()}`)
    } catch {
      // ignore URL sync errors
    }
  }

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

  // Sync stopHierarchy flag from current parent
  useEffect(() => {
    setStopHierarchy(!!currentParentSetting?.stopHierarchy)
  }, [currentParentSetting])

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
    if (stopHierarchy && currentParentId) {
      toast({
        title: "Ierarhie oprită",
        description: "Nu poți crea sub-nivele aici. Repornește ierarhia pentru a continua.",
        variant: "destructive",
      })
      return
    }
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
    if (parent.stopHierarchy) {
      toast({
        title: "Ierarhie oprită",
        description: "Nu poți crea sub-nivele sub acest element până nu reactivăm ierarhia.",
        variant: "destructive",
      })
      return
    }
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
    setDeletingIds((prev) => {
      const next = new Set(prev)
      next.add(setting.id)
      return next
    })
    try {
      await deleteSetting(setting.id, userData?.uid || "", userData?.displayName || "Utilizator")
      toast({ title: "Setare ștearsă cu succes" })
    } catch (error) {
      console.error("Error deleting setting:", error)
      toast({ title: "Eroare la ștergere", variant: "destructive" })
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev)
        next.delete(setting.id)
        return next
      })
    }
  }

  const handleToggleStopHierarchy = async () => {
    if (!currentParentSetting) return
    const nextValue = !stopHierarchy
    setStopHierarchyLoading(true)
    try {
      await updateSetting(
        currentParentSetting.id,
        { stopHierarchy: nextValue },
        userData?.uid || "",
        userData?.displayName || "Utilizator"
      )
      setStopHierarchy(nextValue)
      setNavigationPath((prev) => {
        if (!prev.length) return prev
        const newPath = [...prev]
        const last = newPath[newPath.length - 1]
        newPath[newPath.length - 1] = { ...last, stopHierarchy: nextValue } as Setting
        return newPath
      })
      toast({
        title: nextValue ? "Ierarhia a fost oprită" : "Ierarhia a fost reactivată",
      })
    } catch (error) {
      console.error("Error toggling stopHierarchy:", error)
      toast({
        title: "Eroare",
        description: "Nu s-a putut actualiza starea ierarhiei.",
        variant: "destructive",
      })
    } finally {
      setStopHierarchyLoading(false)
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

  const handleDownloadCurrentDocument = () => {
    if (!currentParentSetting?.documentUrl) return
    try {
      window.open(currentParentSetting.documentUrl, "_blank", "noopener,noreferrer")
    } catch (error) {
      console.error("Error opening document:", error)
      toast({ title: "Nu am putut deschide documentul", variant: "destructive" })
    }
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
          <Tabs value={activeTab} onValueChange={(value: any) => handleTabChange(value)} className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="sistem" className="flex items-center gap-2">
                <Settings className="h-4 w-4" />
                Setări Sistem
              </TabsTrigger>
              <TabsTrigger value="variabile" className="flex items-center gap-2">
                <Folder className="h-4 w-4" />
                Variabile
              </TabsTrigger>
              <TabsTrigger value="documentatii" className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Documentații
              </TabsTrigger>
            </TabsList>

            {/* Tab Content: Setări Sistem */}
            <TabsContent value="sistem" className="mt-6 space-y-6">
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
                <>
                  {/* Setări generale (non-arhivare / non-dashboard) */}
                  {PREDEFINED_SETTINGS.filter(s => !s.id.startsWith('archive_') && !s.id.startsWith('dashboard_')).map((setting) => (
                  <Card key={setting.id} className="border-gray-200">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium text-gray-900">
                        {setting.name}
                      </CardTitle>
                      <CardDescription className="text-xs text-gray-600">
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
                  ))}

                  {/* Accordion pentru Motive Arhivare și Stări Dashboard */}
                  <Accordion type="multiple" className="space-y-4">
                    {/* Secțiune separată pentru Motive Arhivare */}
                    <AccordionItem value="motive-arhivare" className="border border-gray-200 rounded-lg px-1">
                      <AccordionTrigger className="hover:no-underline px-5 py-4">
                        <div className="flex items-center gap-3">
                          <Archive className="h-5 w-5 text-gray-700" />
                          <div className="text-left">
                            <div className="text-base font-semibold text-gray-900">
                              Motive arhivare
                            </div>
                            <div className="text-xs text-gray-600 mt-0.5 font-normal">
                              Configurează regulile care blochează arhivarea lucrărilor. Modificările se salvează automat.
                            </div>
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="px-5 pb-4 pt-2">
                      <div className="space-y-2">
                        {PREDEFINED_SETTINGS.filter(s => s.id.startsWith('archive_')).map((setting) => {
                          const isActive = Boolean(predefinedValues[setting.id] ?? setting.defaultValue)
                          return (
                            <div
                              key={setting.id}
                              className="flex items-center justify-between py-3 px-4 rounded-md border border-gray-200 hover:bg-gray-50/50 transition-colors"
                            >
                              <div className="flex-1 pr-4">
                                <Label 
                                  htmlFor={setting.id} 
                                  className="text-sm font-medium text-gray-900 cursor-pointer"
                                >
                                  {setting.name}
                                </Label>
                                <p className="text-xs text-gray-500 mt-0.5">
                                  {setting.description}
                                </p>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className={`text-xs font-medium min-w-[50px] text-right ${
                                  isActive ? 'text-blue-600' : 'text-gray-400'
                                }`}>
                                  {isActive ? 'Activ' : 'Inactiv'}
                                </span>
                                <Switch
                                  id={setting.id}
                                  checked={isActive}
                                  onCheckedChange={async (checked) => {
                                    setPredefinedValues((prev) => ({ ...prev, [setting.id]: checked }))
                                    // Salvare automată
                                    setSavingPredefined(true)
                                    try {
                                      await updatePredefinedSettingValue(setting.id, checked)
                                      toast({
                                        title: "✓ Salvat automat",
                                        description: `Regula "${setting.name}" a fost ${checked ? 'activată' : 'dezactivată'}.`,
                                      })
                                    } catch (error) {
                                      console.error("Eroare la salvarea setării:", error)
                                      toast({
                                        title: "Eroare",
                                        description: "Nu s-a putut salva setarea.",
                                        variant: "destructive",
                                      })
                                      // Revert la valoarea anterioară
                                      setPredefinedValues((prev) => ({ ...prev, [setting.id]: !checked }))
                                    } finally {
                                      setSavingPredefined(false)
                                    }
                                  }}
                                  disabled={loadingPredefined || savingPredefined}
                                />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                      
                      {/* Footer info */}
                      <div className="mt-4 p-3 bg-gray-50 rounded-md border border-gray-200">
                        <div className="flex gap-2 text-xs text-gray-600">
                          <Info className="h-3.5 w-3.5 flex-shrink-0 mt-0.5 text-gray-500" />
                          <p>
                            Regulile dezactivate nu vor mai bloca arhivarea, dar vor fi afișate ca "reguli ignorate" pe pagina lucrării.
                          </p>
                        </div>
                      </div>
                    </AccordionContent>
                    </AccordionItem>

                    {/* Secțiune separată pentru Stări Dashboard */}
                    <AccordionItem value="stari-dashboard" className="border border-gray-200 rounded-lg px-1">
                      <AccordionTrigger className="hover:no-underline px-5 py-4">
                        <div className="flex items-center gap-3">
                          <BarChart3 className="h-5 w-5 text-gray-700" />
                          <div className="text-left">
                            <div className="text-base font-semibold text-gray-900">
                              Stări dashboard
                            </div>
                            <div className="text-xs text-gray-600 mt-0.5 font-normal">
                              Configurează regulile de filtrare pentru fiecare box din /dashboard. Modificările se salvează automat.
                            </div>
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="px-5 pb-4 pt-2">
                      {[
                        {
                          title: "Întârziate",
                          enabledId: "dashboard_intarziate_enabled",
                          subIds: [
                            "dashboard_intarziate_require_exec_date",
                            "dashboard_intarziate_include_past_days",
                            "dashboard_intarziate_include_today",
                            "dashboard_intarziate_include_today_after_18",
                            "dashboard_intarziate_require_assigned",
                            "dashboard_intarziate_require_not_scanned",
                          ],
                        },
                        { title: "Amânate", enabledId: "dashboard_amanate_enabled", subIds: [] },
                        {
                          title: "Listate",
                          enabledId: "dashboard_listate_enabled",
                          subIds: ["dashboard_listate_require_no_technicians"],
                        },
                        {
                          title: "Nepreluate",
                          enabledId: "dashboard_nepreluate_enabled",
                          subIds: [
                            "dashboard_nepreluate_require_report_generated",
                            "dashboard_nepreluate_require_not_picked_up",
                          ],
                        },
                        {
                          title: "Nefacturate",
                          enabledId: "dashboard_nefacturate_enabled",
                          subIds: [
                            "dashboard_nefacturate_require_report_generated",
                            "dashboard_nefacturate_require_no_invoice",
                            "dashboard_nefacturate_require_no_reason",
                          ],
                        },
                        {
                          title: "Necesită ofertă",
                          enabledId: "dashboard_necesita_oferta_enabled",
                          subIds: [
                            "dashboard_necesita_oferta_require_flag",
                            "dashboard_necesita_oferta_require_no_response",
                          ],
                        },
                        {
                          title: "Ofertate (în așteptare)",
                          enabledId: "dashboard_ofertate_enabled",
                          subIds: [
                            "dashboard_ofertate_require_has_offer",
                            "dashboard_ofertate_require_no_response",
                          ],
                        },
                        {
                          title: "Status oferte",
                          enabledId: "dashboard_status_oferte_enabled",
                          subIds: [
                            "dashboard_status_oferte_include_accept",
                            "dashboard_status_oferte_include_reject",
                          ],
                        },
                        {
                          title: "Stare echipament",
                          enabledId: "dashboard_equipment_status_enabled",
                          subIds: [
                            "dashboard_equipment_status_include_non_functional",
                            "dashboard_equipment_status_include_partially_functional",
                          ],
                        },
                      ].map((group) => {
                        const enabledSetting = PREDEFINED_SETTINGS.find((s) => s.id === group.enabledId)
                        const enabledActive = Boolean(predefinedValues[group.enabledId] ?? enabledSetting?.defaultValue)

                        const saveToggle = async (settingId: string, checked: boolean, settingName?: string) => {
                          setPredefinedValues((prev) => ({ ...prev, [settingId]: checked }))
                          setSavingPredefined(true)
                          try {
                            await updatePredefinedSettingValue(settingId, checked)
                            toast({
                              title: "✓ Salvat automat",
                              description: settingName
                                ? `Setarea "${settingName}" a fost ${checked ? "activată" : "dezactivată"}.`
                                : "Setarea a fost salvată.",
                            })
                          } catch (error) {
                            console.error("Eroare la salvarea setării:", error)
                            toast({
                              title: "Eroare",
                              description: "Nu s-a putut salva setarea.",
                              variant: "destructive",
                            })
                            setPredefinedValues((prev) => ({ ...prev, [settingId]: !checked }))
                          } finally {
                            setSavingPredefined(false)
                          }
                        }

                        return (
                          <div key={group.enabledId} className="rounded-md border border-gray-200 overflow-hidden mb-3 last:mb-0">
                            <div className="flex items-center justify-between px-4 py-3 bg-white">
                              <div className="min-w-0 pr-4">
                                <div className="text-sm font-semibold text-gray-900 truncate">{group.title}</div>
                                <div className="text-xs text-gray-500 mt-0.5 truncate">
                                  {enabledSetting?.description || "Activează/dezactivează această stare pe dashboard."}
                                </div>
                              </div>
                              <div className="flex items-center gap-3 flex-shrink-0">
                                <span
                                  className={`text-xs font-medium min-w-[50px] text-right ${
                                    enabledActive ? "text-blue-600" : "text-gray-400"
                                  }`}
                                >
                                  {enabledActive ? "Activ" : "Inactiv"}
                                </span>
                                <Switch
                                  id={group.enabledId}
                                  checked={enabledActive}
                                  onCheckedChange={(checked) => saveToggle(group.enabledId, checked, enabledSetting?.name)}
                                  disabled={loadingPredefined || savingPredefined}
                                />
                              </div>
                            </div>

                            {group.subIds.length > 0 && (
                              <div className={`border-t px-4 py-3 space-y-2 ${enabledActive ? "" : "opacity-80"}`}>
                                {group.subIds.map((sid) => {
                                  const setting = PREDEFINED_SETTINGS.find((s) => s.id === sid)
                                  if (!setting) return null
                                  const isActive = Boolean(predefinedValues[sid] ?? setting.defaultValue)
                                  return (
                                    <div
                                      key={sid}
                                      className="flex items-center justify-between py-2 px-3 rounded-md border border-gray-200 hover:bg-gray-50/50 transition-colors"
                                    >
                                      <div className="flex-1 pr-4">
                                        <Label htmlFor={sid} className="text-sm font-medium text-gray-900 cursor-pointer">
                                          {setting.name}
                                        </Label>
                                        <p className="text-xs text-gray-500 mt-0.5">{setting.description}</p>
                                      </div>
                                      <div className="flex items-center gap-3">
                                        <span
                                          className={`text-xs font-medium min-w-[50px] text-right ${
                                            isActive ? "text-blue-600" : "text-gray-400"
                                          }`}
                                        >
                                          {isActive ? "Activ" : "Inactiv"}
                                        </span>
                                        <Switch
                                          id={sid}
                                          checked={isActive}
                                          onCheckedChange={(checked) => saveToggle(sid, checked, setting.name)}
                                          disabled={loadingPredefined || savingPredefined}
                                        />
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )
                      })}

                      <div className="mt-4 p-3 bg-gray-50 rounded-md border border-gray-200">
                        <div className="flex gap-2 text-xs text-gray-600">
                          <Info className="h-3.5 w-3.5 flex-shrink-0 mt-0.5 text-gray-500" />
                          <p>
                            Dacă dezactivezi o stare, boxul rămâne vizibil pe dashboard (marcat „Dezactivat"), dar nu mai
                            afișează tichete.
                          </p>
                        </div>
                      </div>
                    </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </>
              )}

              {/* Management numerotare rapoarte */}
              <Card className="border-gray-200">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-gray-900">
                    Management numerotare rapoarte
                  </CardTitle>
                  <CardDescription className="text-xs text-gray-600">
                    Configurează numărul următor pentru rapoartele generate
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-3">
                    {/* Afișare număr curent */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-600">Următorul număr de raport:</span>
                      {isLoadingReportNumber ? (
                        <div className="flex items-center gap-2">
                          <RefreshCw className="h-3 w-3 animate-spin text-gray-600" />
                          <span className="text-xs text-gray-600">Se încarcă...</span>
                        </div>
                      ) : (
                        <span className="text-sm font-semibold text-gray-900 bg-gray-100 px-2 py-1 rounded border border-gray-300">
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
                  <div className="flex flex-col items-center gap-2">
                    <Button onClick={handleCreate} disabled={stopHierarchy}>
                      <Plus className="mr-2 h-4 w-4" />
                      Creează primul element
                    </Button>
                    {currentParentId && (
                      <Button
                        variant={stopHierarchy ? "secondary" : "outline"}
                        onClick={handleToggleStopHierarchy}
                        disabled={stopHierarchyLoading}
                      >
                        {stopHierarchyLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {stopHierarchy ? "Repornește ierarhia" : "Oprește ierarhia"}
                      </Button>
                    )}
                    {stopHierarchy && (
                      <p className="text-xs text-muted-foreground">Crearea de sub-nivele este blocată aici.</p>
                    )}
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
                      isDeleting={deletingIds.has(setting.id)}
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
                    className={`border-dashed hover:border-primary/60 hover:bg-primary/5 transition flex items-center justify-center ${stopHierarchy ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
                    onClick={stopHierarchy ? undefined : handleCreate}
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
                      isDeleting={deletingIds.has(setting.id)}
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
                    className={`w-full rounded-md border border-dashed bg-background hover:bg-muted/30 transition-all px-3 py-3 flex items-center justify-center ${stopHierarchy ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
                    onClick={stopHierarchy ? undefined : handleCreate}
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

            {/* Tab Content: Documentații */}
            <TabsContent value="documentatii" className="mt-6">
              <DocumentatiiTab />
            </TabsContent>
          </Tabs>
        ) : (
          // When navigating into a subcategory (currentParentId exists), show only the variables view without tabs
          <div className="space-y-6">
            {/* Breadcrumbs și butoane acțiune */}
            <div className="flex items-center justify-between">
              <SettingsBreadcrumbs currentPath={navigationPath} onNavigate={handleNavigateToParent} />
              <div className="flex items-center gap-2">
                {stopHierarchy && (
                  <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
                    Oprire ierarhie activă
                  </Badge>
                )}
                {currentParentSetting?.documentUrl && (
                  <Button variant="outline" size="sm" onClick={handleDownloadCurrentDocument}>
                    <Download className="mr-2 h-4 w-4" />
                    Descarcă document
                  </Button>
                )}
                <Button onClick={handleCreate} size="sm" disabled={stopHierarchy}>
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
                      <div className="flex flex-col items-center gap-2">
                        <Button onClick={handleCreate} disabled={stopHierarchy}>
                          <Plus className="mr-2 h-4 w-4" />
                          Creează primul element
                        </Button>
                        {currentParentId && (
                          <Button
                            variant={stopHierarchy ? "secondary" : "outline"}
                            onClick={handleToggleStopHierarchy}
                            disabled={stopHierarchyLoading}
                          >
                            {stopHierarchyLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {stopHierarchy ? "Repornește ierarhia" : "Oprește ierarhia"}
                          </Button>
                        )}
                        {stopHierarchy && (
                          <p className="text-xs text-muted-foreground">Crearea de sub-nivele este blocată aici.</p>
                        )}
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
                      isDeleting={deletingIds.has(setting.id)}
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

