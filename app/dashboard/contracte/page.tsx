"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { DashboardHeader } from "@/components/dashboard-header"
import { DashboardShell } from "@/components/dashboard-shell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { DataTable } from "@/components/data-table/data-table"

type ExtendedColumnDef<T> = ColumnDef<T> & {
  enableFiltering?: boolean
}
import { FilterButton } from "@/components/filter-button"
import { FilterModal, type FilterOption } from "@/components/filter-modal"
import {
  buildContractFilterOptions,
  countActiveContractFilters,
  filterContracts,
  normalizeActiveContractFilters,
  shouldShowFilteredEmptyState,
  type ActiveContractFilter,
} from "@/lib/contracts/contract-filters"
import { E2E_CONTRACT_CLIENTS, E2E_CONTRACTS } from "@/lib/contracts/e2e-fixtures"
import { isE2eTestMode } from "@/lib/utils/environment"
import { Badge } from "@/components/ui/badge"
import { ColumnDef } from "@tanstack/react-table"
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  addDoc,
} from "firebase/firestore"
import { db } from "@/lib/firebase/config"
import { addUserLogEntry } from "@/lib/firebase/firestore"
import { Plus, Pencil, Trash2, Loader2, AlertCircle, MoreHorizontal, FileText, DollarSign, Zap, Calendar, PauseCircle, PlayCircle } from "lucide-react"
import { getFunctions, httpsCallable } from "firebase/functions"
import app from "@/lib/firebase/config"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { toast } from "@/hooks/use-toast"
import { DynamicDialogFields } from "@/components/DynamicDialogFields"
import { addDays, format } from "date-fns"
import { ro } from "date-fns/locale"
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useTablePersistence } from "@/hooks/use-table-persistence"
import { UniversalSearch } from "@/components/universal-search"
import { getClienti, validateContractAssignment, type Echipament, type Locatie } from "@/lib/firebase/firestore"
import { ClientSelectButton } from "@/components/client-select-button"
import { MultiSelect, type Option } from "@/components/ui/multi-select"
import { ContractPricingDialog } from "@/components/contract-pricing-dialog"
import { useTargetList, useTargetValue } from "@/hooks/use-settings"
import { subscribeToSettingsByTarget, subscribeToSettings } from "@/lib/firebase/settings"
import type { Setting } from "@/types/settings"
import { getPredefinedSettingValue } from "@/lib/firebase/predefined-settings"
import { formatUiDate, toDateSafe } from "@/lib/utils/time-format"
import { getDocs, query as fsQuery, where } from "firebase/firestore"
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"
import { CustomDatePicker } from "@/components/custom-date-picker"
import { Card, CardContent } from "@/components/ui/card"
import { useAuth } from "@/contexts/AuthContext"
import {
  addMonthsDate,
  buildCalendarEventsFromContracts,
  buildEditDialogCalendarEvents,
  canOpenRevisionCalendar,
  computeRevisionSchedulePreview,
  filterCalendarEventsByContractId,
  getDefaultCalendarRange,
  resolveEditDialogCalendarPreview,
  startOfMonth,
  type CalendarEvent,
  type RevisionSchedulePreview,
} from "@/lib/contracts/revision-calendar"
import { isContractSuspended, type ContractStatus } from "@/lib/contracts/contract-status"

interface Contract {
  id: string
  name: string
  number: string
  type?: string // Legacy field
  clientId?: string
  locationId?: string
  locationName?: string
  locationNames?: string[]
  equipmentIds?: string[]
  startDate?: string
  recurrenceInterval?: number
  recurrenceUnit?: 'zile' | 'luni'
  recurrenceDayOfMonth?: number
  daysBeforeWork?: number
  pricing?: Record<string, number>
  lastAutoWorkGenerated?: string
  locatie?: string // Legacy field
  customFields?: Record<string, any> // Câmpuri dinamice din setări
  createdAt: any
  revisionSchedulePreview?: RevisionSchedulePreview[]
  status?: ContractStatus
  statusUpdatedAt?: any
  statusUpdatedBy?: string
  statusUpdatedByName?: string
  lastSuspendedAt?: any
  lastSuspendedBy?: string
  lastSuspendedByName?: string
  lastReactivatedAt?: any
  lastReactivatedBy?: string
  lastReactivatedByName?: string
}

interface Client {
  id: string
  nume: string
}

const COLORS = ["#2563eb", "#16a34a", "#d97706", "#dc2626", "#7c3aed", "#0891b2", "#b45309", "#ea580c"]

const getColorForId = (id: string) => {
  if (!id) return COLORS[0]
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) - hash + id.charCodeAt(i)
    hash |= 0
  }
  const idx = Math.abs(hash) % COLORS.length
  return COLORS[idx]
}

const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate()

export default function ContractsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { userData } = useAuth()
  const isReadOnlyDispatcher = userData?.role === "dispecer"
  const [contracts, setContracts] = useState<Contract[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isStatusDialogOpen, setIsStatusDialogOpen] = useState(false)

  const [newContractName, setNewContractName] = useState("")
  const [newContractNumber, setNewContractNumber] = useState("")
  const [newContractClientId, setNewContractClientId] = useState("UNASSIGNED")
  const [newContractLocationId, setNewContractLocationId] = useState("")
  const [newContractLocationName, setNewContractLocationName] = useState("")
  const [newContractLocationIds, setNewContractLocationIds] = useState<string[]>([])
  const [newContractLocationNames, setNewContractLocationNames] = useState<string[]>([])
  const [newContractEquipmentIds, setNewContractEquipmentIds] = useState<string[]>([])
  const [newContractStartDate, setNewContractStartDate] = useState<string>("")
  const [startDateInput, setStartDateInput] = useState<string>("")
  const [newContractRecurrenceInterval, setNewContractRecurrenceInterval] = useState<number>(90)
  const [newContractRecurrenceUnit, setNewContractRecurrenceUnit] = useState<'zile' | 'luni'>('zile')
  const [newContractDaysBeforeWork, setNewContractDaysBeforeWork] = useState<number>(10)
  const [newContractPricing, setNewContractPricing] = useState<Record<string, number>>({})
  const [newContractPricingCustomFields, setNewContractPricingCustomFields] = useState<Record<string, any>>({})
  const [isPricingDialogOpen, setIsPricingDialogOpen] = useState(false)
  const [recurrenceIntervalInput, setRecurrenceIntervalInput] = useState<string>("90")
  const [daysBeforeWorkInput, setDaysBeforeWorkInput] = useState<string>("10")
  const [newContract, setNewContract] = useState<any>({})
  const [clientLocations, setClientLocations] = useState<Locatie[]>([])
  const [clientEquipments, setClientEquipments] = useState<Echipament[]>([])
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [triggeringContractId, setTriggeringContractId] = useState<string | null>(null)
  
  // Hooks pentru setări
  const { items: recurrenceUnits } = useTargetList("contracts.create.recurrenceUnits")
  
  // State pentru setarea predefinită de zile înainte
  const [defaultDaysBeforeWork, setDefaultDaysBeforeWork] = useState<number>(10)
  
  // Încarcă setarea predefinită la mount
  useEffect(() => {
    const loadDefaultDays = async () => {
      const days = await getPredefinedSettingValue("contracts_default_days_before_work")
      setDefaultDaysBeforeWork(days || 10)
      setNewContractDaysBeforeWork(days || 10)
      setDaysBeforeWorkInput(String(days || 10))
    }
    loadDefaultDays()
  }, [])

const [showCloseAlert, setShowCloseAlert] = useState(false)
const [activeDialog, setActiveDialog] = useState<"add" | "edit" | "delete" | null>(null)
const [startDateWorkload, setStartDateWorkload] = useState<{ loading: boolean; count: number; error?: string }>({
  loading: false,
  count: 0,
})

  // Sincronizează input-urile text cu valorile numerice inițiale
  useEffect(() => {
    setRecurrenceIntervalInput(String(newContractRecurrenceInterval))
  }, [newContractRecurrenceInterval])

  // State pentru câmpurile dinamice din setări
  const [dynamicFieldsParents, setDynamicFieldsParents] = useState<Setting[]>([])
  const [dynamicFieldsChildren, setDynamicFieldsChildren] = useState<Record<string, Setting[]>>({})

  // State pentru tabelul avansat
  const [table, setTable] = useState<any>(null)
  const [tableSorting, setTableSorting] = useState([{ id: "createdAt", desc: true }])
  const [searchText, setSearchText] = useState("")
  const [activeFilters, setActiveFilters] = useState<ActiveContractFilter[]>([])
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false)
  const [columnOptions, setColumnOptions] = useState<any[]>([])
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list")
  const [calendarMode, setCalendarMode] = useState<"year" | "month" | "week">("month")
  const [calendarContractFilterId, setCalendarContractFilterId] = useState<string | null>(null)
  const [calendarFilterContractName, setCalendarFilterContractName] = useState<string | null>(null)
  const [calendarFilteredEvents, setCalendarFilteredEvents] = useState<CalendarEvent[] | null>(null)
  const [selectedDayEvents, setSelectedDayEvents] = useState<CalendarEvent[]>([])
  const [selectedDayDate, setSelectedDayDate] = useState<Date | null>(null)
  const [isDayPanelOpen, setIsDayPanelOpen] = useState(false)
  const [showWeekStrip, setShowWeekStrip] = useState(false)
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() => {
    const today = new Date()
    const day = today.getDay()
    const diff = day === 0 ? -6 : 1 - day // Monday as first day
    const monday = new Date(today)
    monday.setDate(today.getDate() + diff)
    return monday
  })

  // === Încarcă încărcarea (numărul de lucrări Revizie) pentru data de început selectată ===
  const loadStartDateWorkload = useCallback(
    async (isoDate: string) => {
      if (!isoDate) {
        setStartDateWorkload({ loading: false, count: 0 })
        return
      }

      setStartDateWorkload((prev) => ({ ...prev, loading: true, error: undefined }))

      const start = new Date(`${isoDate}T00:00:00.000Z`)
      const end = new Date(start)
      end.setUTCDate(end.getUTCDate() + 1)

      const dayStartIso = start.toISOString()
      const dayEndIso = end.toISOString()

      // Construim mai multe interogări pentru a acoperi tipuri diferite de câmp (Timestamp, ISO string, string simplu).
      const queries = [
        // Interval pe Timestamp/Date
        fsQuery(
          collection(db, "lucrari"),
          where("tipLucrare", "==", "Revizie"),
          where("dataInterventie", ">=", start),
          where("dataInterventie", "<", end),
        ),
        // Interval pe string ISO (fallback pentru câmp salvat ca string)
        fsQuery(
          collection(db, "lucrari"),
          where("tipLucrare", "==", "Revizie"),
          where("dataInterventie", ">=", dayStartIso),
          where("dataInterventie", "<", dayEndIso),
        ),
        // Egalitate pe string date-only (ex: "2025-01-01")
        fsQuery(
          collection(db, "lucrari"),
          where("tipLucrare", "==", "Revizie"),
          where("dataInterventie", "==", isoDate),
        ),
        // Egalitate pe Timestamp/Date (în caz că a fost salvat ca Date fără timp)
        fsQuery(
          collection(db, "lucrari"),
          where("tipLucrare", "==", "Revizie"),
          where("dataInterventie", "==", start),
        ),
      ]

      try {
        const snaps = await Promise.all(
          queries.map(async (q, idx) => {
            try {
              return await getDocs(q)
            } catch (err) {
              console.warn("loadStartDateWorkload query failed", { idx, err })
              return null
            }
          }),
        )

        // Deduplicăm documentele ca să nu numărăm de două ori același rezultat.
        const ids = new Set<string>()
        snaps
          .filter(Boolean)
          .forEach((snap) => {
            snap?.forEach((doc) => ids.add(doc.id))
          })

        // Adăugăm și reviziile din preview (folosit și în calendar) ca să fie aceeași valoare.
        const previewCount = contracts.reduce((acc, contract) => {
          const preview = (contract as any)?.revisionSchedulePreview
          if (!Array.isArray(preview)) return acc

          const countForContract = preview.reduce((innerAcc: number, item: any) => {
            const raw = item?.scheduledIso || item?.scheduledAt || item?.scheduledDate
            const date =
              raw?.toDate?.() instanceof Date
                ? raw.toDate()
                : raw && typeof raw.seconds === "number"
                  ? new Date(raw.seconds * 1000)
                  : raw
                  ? new Date(raw)
                  : null
            if (!date || Number.isNaN(date.getTime())) return innerAcc
            const day = date.toISOString().slice(0, 10)
            return day === isoDate ? innerAcc + 1 : innerAcc
          }, 0)

          return acc + countForContract
        }, 0)

        setStartDateWorkload({ loading: false, count: ids.size + previewCount })
      } catch (error) {
        console.error("Error loading workload for start date", error)
        setStartDateWorkload({ loading: false, count: 0, error: "Nu s-a putut încărca încărcarea pentru acea dată" })
      }
    },
    [db, contracts],
  )

  // Recalculează când se schimbă data de început
  useEffect(() => {
    if (newContractStartDate) {
      loadStartDateWorkload(newContractStartDate)
    } else {
      setStartDateWorkload({ loading: false, count: 0 })
    }
  }, [newContractStartDate, loadStartDateWorkload])

  // Persistența tabelului
  const { loadSettings, saveFilters, saveColumnVisibility, saveSorting, saveSearchText } = useTablePersistence("contracte")

  // Handler pentru schimbarea sortării
  const handleSortingChange = (newSorting: { id: string; desc: boolean }[]) => {
    setTableSorting(newSorting)
    saveSorting(newSorting)
  }

  // Handler pentru schimbarea search text-ului
  const handleSearchChange = (value: string) => {
    setSearchText(value)
    saveSearchText(value)
  }

  // Încărcăm setările salvate la inițializare
  useEffect(() => {
    const savedSettings = loadSettings()
    if (savedSettings.activeFilters) {
      setActiveFilters(savedSettings.activeFilters)
    }
    if (savedSettings.sorting) {
      setTableSorting(savedSettings.sorting)
    } else {
      // Dacă nu avem sortare salvată, setăm implicit descrescător pe createdAt
      setTableSorting([{ id: "createdAt", desc: true }])
    }
    if (savedSettings.searchText) {
      setSearchText(savedSettings.searchText)
    }
  }, [loadSettings])

  // Încărcăm câmpurile dinamice din setări pentru contracte
  useEffect(() => {
    const unsubscribeRefs: Record<string, () => void> = {}
    
    const unsubParents = subscribeToSettingsByTarget("dialogs.contract.new", (parents) => {
      setDynamicFieldsParents(parents)
      
      // Cleanup previous subscriptions
      Object.values(unsubscribeRefs).forEach((unsub) => unsub())
      const newUnsubRefs: Record<string, () => void> = {}
      
      // Subscribe to children for each parent
      parents.forEach((parent) => {
        newUnsubRefs[parent.id] = subscribeToSettings(parent.id, (children) => {
          setDynamicFieldsChildren((prev) => ({
            ...prev,
            [parent.id]: children,
          }))
        })
      })
      
      Object.assign(unsubscribeRefs, newUnsubRefs)
    })
    
    return () => {
      unsubParents()
      Object.values(unsubscribeRefs).forEach((unsub) => unsub())
    }
  }, [])

  // Sincronizăm câmpul de input text pentru data de început cu valoarea salvată
  useEffect(() => {
    if (newContractStartDate) {
      const d = toDateSafe(newContractStartDate)
      if (d) {
        try {
          setStartDateInput(formatUiDate(d))
        } catch {
          setStartDateInput("")
        }
      } else {
        setStartDateInput("")
      }
    } else {
      setStartDateInput("")
    }
  }, [newContractStartDate])

  // Deschide automat dialogul de editare dacă există parametrul edit în URL
  useEffect(() => {
    const editId = searchParams.get("edit")
    if (editId && contracts.length > 0 && !loading && !isReadOnlyDispatcher) {
      const contractToEdit = contracts.find(c => c.id === editId)
      if (contractToEdit) {
        openEditDialog(contractToEdit)
        // Remove the query parameter after opening the dialog
        router.replace("/dashboard/contracte", { scroll: false })
      }
    }
  }, [searchParams, contracts, loading, isReadOnlyDispatcher, router])

  // Populăm opțiunile pentru coloane când tabelul este disponibil
  useEffect(() => {
    if (table) {
      const savedSettings = loadSettings()
      const savedColumnVisibility = savedSettings.columnVisibility || {}
      
      const allColumns = table.getAllColumns()
      
      // Aplicăm vizibilitatea salvată
      allColumns.forEach((column: any) => {
        if (column.getCanHide() && savedColumnVisibility.hasOwnProperty(column.id)) {
          column.toggleVisibility(savedColumnVisibility[column.id])
        }
      })
      
      const options = allColumns
        .filter((column: any) => column.getCanHide())
        .map((column: any) => ({
          id: column.id,
          label:
            typeof column.columnDef.header === "string"
              ? column.columnDef.header
              : column.id.charAt(0).toUpperCase() + column.id.slice(1),
          isVisible: column.getIsVisible(),
        }))
      setColumnOptions(options)
    }
  }, [table, loadSettings])

  // Handler pentru comutarea vizibilității coloanelor
  const handleToggleColumn = (columnId: string) => {
    if (!table) return

    const column = table.getColumn(columnId)
    if (column) {
      column.toggleVisibility(!column.getIsVisible())

      // Actualizăm starea opțiunilor pentru a reflecta schimbările
      const newColumnOptions = columnOptions.map((option) => 
        option.id === columnId ? { ...option, isVisible: !option.isVisible } : option
      )
      setColumnOptions(newColumnOptions)
      
      // Salvăm vizibilitatea coloanelor
      const columnVisibility = newColumnOptions.reduce((acc, option) => {
        acc[option.id] = option.isVisible
        return acc
      }, {})
      saveColumnVisibility(columnVisibility)
    }
  }

  // Sortăm datele pe partea de client după încărcare
  const sortedContracts = useMemo(() => {
    if (!contracts.length || !tableSorting.length) return contracts

    return [...contracts].sort((a, b) => {
      const sortConfig = tableSorting[0] // Luăm prima sortare
      const { id: sortKey, desc } = sortConfig

      let aValue: any
      let bValue: any

      // Verificăm dacă sortKey este pentru câmpuri nested (customFields.xxx)
      if (sortKey.startsWith('customFields.')) {
        const fieldId = sortKey.replace('customFields.', '')
        aValue = (a as any).customFields?.[fieldId]
        bValue = (b as any).customFields?.[fieldId]
      } else {
        aValue = a[sortKey as keyof Contract]
        bValue = b[sortKey as keyof Contract]
      }

      // Tratăm cazul special pentru date
      if (sortKey === "createdAt") {
        aValue = aValue?.toDate ? aValue.toDate() : new Date(aValue || 0)
        bValue = bValue?.toDate ? bValue.toDate() : new Date(bValue || 0)
      }

      // Tratăm valorile null/undefined
      if (aValue == null && bValue == null) return 0
      if (aValue == null) return desc ? -1 : 1
      if (bValue == null) return desc ? 1 : -1

      // Comparare
      if (aValue < bValue) return desc ? 1 : -1
      if (aValue > bValue) return desc ? -1 : 1
      return 0
    })
  }, [contracts, tableSorting])

  const clientLookups = useMemo(
    () => clients.map((c) => ({ id: String(c.id || ""), nume: String(c.nume || "") })),
    [clients],
  )

  const filterOptions = useMemo(
    () => buildContractFilterOptions(contracts, clientLookups),
    [contracts, clientLookups],
  )

  const filteredContracts = useMemo(
    () => filterContracts(sortedContracts, activeFilters, searchText, clientLookups),
    [sortedContracts, activeFilters, searchText, clientLookups],
  )

  const activeFilterCount = useMemo(
    () => countActiveContractFilters(activeFilters, searchText),
    [activeFilters, searchText],
  )

  const showFilteredEmptyState = useMemo(
    () => shouldShowFilteredEmptyState(contracts.length, filteredContracts.length),
    [contracts.length, filteredContracts.length],
  )

  const handleApplyFilters = (filters: FilterOption[]) => {
    const normalized = normalizeActiveContractFilters(filters)
    setActiveFilters(normalized)
    saveFilters(normalized)
  }

  const handleResetFilters = () => {
    setActiveFilters([])
    saveFilters([])
  }

  const handleResetAllFiltersAndSearch = () => {
    handleResetFilters()
    handleSearchChange("")
  }

  const { start: calendarStart, end: calendarEnd } = useMemo(() => getDefaultCalendarRange(), [])

  const allCalendarEvents = useMemo(
    () => buildCalendarEventsFromContracts(contracts, calendarStart, calendarEnd),
    [contracts, calendarStart, calendarEnd],
  )

  const calendarEvents = useMemo(() => {
    if (calendarFilteredEvents) return calendarFilteredEvents
    if (calendarContractFilterId) {
      return filterCalendarEventsByContractId(allCalendarEvents, calendarContractFilterId)
    }
    return allCalendarEvents
  }, [allCalendarEvents, calendarFilteredEvents, calendarContractFilterId])

  const clearCalendarContractFilter = useCallback(() => {
    setCalendarContractFilterId(null)
    setCalendarFilterContractName(null)
    setCalendarFilteredEvents(null)
  }, [])

  const getEditFormRevisionParams = useCallback(
    () => ({
      startDate: newContractStartDate,
      recurrenceInterval: newContractRecurrenceInterval,
      recurrenceUnit: newContractRecurrenceUnit,
      daysBeforeWork: newContractDaysBeforeWork,
      locationIds: newContractLocationIds,
      locationNames: newContractLocationNames,
      locationId: newContractLocationId,
      locationName: newContractLocationName,
    }),
    [
      newContractStartDate,
      newContractRecurrenceInterval,
      newContractRecurrenceUnit,
      newContractDaysBeforeWork,
      newContractLocationIds,
      newContractLocationNames,
      newContractLocationId,
      newContractLocationName,
    ],
  )

  const handleViewRevisionCalendarFromEdit = useCallback(() => {
    if (!selectedContract?.id) return

    const preview = resolveEditDialogCalendarPreview(
      getEditFormRevisionParams(),
      selectedContract.revisionSchedulePreview,
    )

    if (!canOpenRevisionCalendar(preview)) {
      toast({
        title: "Calendar indisponibil",
        description: "Setați data de început și recurența reviziilor pentru a vedea calendarul.",
        variant: "destructive",
      })
      return
    }

    const events = buildEditDialogCalendarEvents(
      getEditFormRevisionParams(),
      {
        id: selectedContract.id,
        name: newContractName || selectedContract.name,
        number: newContractNumber || selectedContract.number,
      },
      selectedContract.revisionSchedulePreview,
      calendarStart,
      calendarEnd,
    )

    setCalendarContractFilterId(selectedContract.id)
    setCalendarFilterContractName(newContractName || selectedContract.name)
    setCalendarFilteredEvents(events)
    setIsEditDialogOpen(false)
    setViewMode("calendar")
    setCalendarMode("month")
  }, [
    selectedContract,
    getEditFormRevisionParams,
    newContractName,
    newContractNumber,
    calendarStart,
    calendarEnd,
  ])

  const calendarMonths = useMemo(() => {
    return Array.from({ length: 12 }).map((_, idx) => {
      const d = addMonthsDate(calendarStart, idx)
      return {
        key: `${d.getFullYear()}-${d.getMonth()}`,
        date: d,
        label: format(d, "MMM yyyy", { locale: ro }),
        days: daysInMonth(d.getFullYear(), d.getMonth()),
      }
    })
  }, [calendarStart])

  const legendEntries = useMemo(() => {
    const map = new Map<string, { contractId: string; contractName: string; color: string }>()
    calendarEvents.forEach((ev) => {
      if (!map.has(ev.contractId)) {
        map.set(ev.contractId, {
          contractId: ev.contractId,
          contractName: ev.contractName,
          color: getColorForId(ev.contractId),
        })
      }
    })
    return Array.from(map.values())
  }, [calendarEvents])

  const topBusyDays = useMemo(() => {
    const counts = new Map<string, { date: Date; count: number }>()
    calendarEvents.forEach((ev) => {
      const key = ev.date.toISOString().slice(0, 10)
      const existing = counts.get(key)
      if (existing) existing.count += 1
      else counts.set(key, { date: new Date(ev.date), count: 1 })
    })
    return Array.from(counts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
  }, [calendarEvents])

  const weekStripDays = useMemo(() => {
    if (!showWeekStrip) return []
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    const arr: { date: Date; count: number }[] = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      const key = d.toISOString().slice(0, 10)
      const count = calendarEvents.filter((ev) => ev.date.toISOString().slice(0, 10) === key).length
      arr.push({ date: d, count })
    }
    return arr
  }, [calendarEvents, showWeekStrip])

  // Generăm coloanele dinamice bazate pe câmpurile din setări
  const dynamicColumns = useMemo(() => {
    const cols: ExtendedColumnDef<Contract>[] = []
    
    dynamicFieldsParents.forEach((parent) => {
      const children = dynamicFieldsChildren[parent.id] || []
      const options = children.map((c) => c.name).filter((n) => n && n.trim().length > 0)
      
      if (options.length > 0) {
        cols.push({
          id: `customFields.${parent.id}`,
          // Folosim accessorFn pentru câmpuri nested
          accessorFn: (row) => (row as any).customFields?.[parent.id] || null,
          header: parent.name,
          enableHiding: true,
          enableSorting: true,
          enableFiltering: false,
          cell: ({ row }) => {
            const value = (row.original as any).customFields?.[parent.id]
            if (!value) return <span className="text-gray-400">-</span>
            return (
              <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                {value}
              </Badge>
            )
          },
          // Funcție personalizată pentru filtrare
          filterFn: (row, columnId, filterValue) => {
            const value = (row.original as any).customFields?.[parent.id]
            if (!filterValue || filterValue.length === 0) return true
            if (Array.isArray(filterValue)) {
              return filterValue.includes(value)
            }
            return value === filterValue
          },
        })
      }
    })
    
    return cols
  }, [dynamicFieldsParents, dynamicFieldsChildren])

  // Definim coloanele pentru tabelul de contracte
  const columns: ExtendedColumnDef<Contract>[] = useMemo(() => [
    {
      accessorKey: "name",
      header: "Nume Contract",
      enableHiding: true,
      enableSorting: true,
      enableFiltering: false,
      cell: ({ row }) => (
        <div className="font-medium">
          {row.original.name}
        </div>
      ),
    },
    {
      accessorKey: "number",
      header: "Număr Contract",
      enableHiding: true,
      enableSorting: true,
      enableFiltering: false,
      cell: ({ row }) => (
        <div className="font-mono text-sm">
          {row.original.number}
        </div>
      ),
    },
    {
      accessorKey: "equipmentIds",
      header: "Echipamente",
      enableHiding: true,
      enableSorting: false,
      enableFiltering: false,
      cell: ({ row }) => {
        const equipmentCount = row.original.equipmentIds?.length || 0
        
        if (equipmentCount === 0) {
          return (
            <Badge variant="outline" className="bg-gray-50 text-gray-600 border-gray-200">
              Niciun echipament
            </Badge>
          )
        }
        
        return (
          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
            {equipmentCount} {equipmentCount === 1 ? "echipament" : "echipamente"}
          </Badge>
        )
      },
    },
    {
      accessorKey: "recurrenceInterval",
      header: "Recurență",
      enableHiding: true,
      enableSorting: false,
      enableFiltering: false,
      cell: ({ row }) => {
        const interval = row.original.recurrenceInterval
        const unit = row.original.recurrenceUnit
        const dayOfMonth = row.original.recurrenceDayOfMonth
        
        if (!interval) {
          return (
            <Badge variant="outline" className="bg-gray-50 text-gray-600 border-gray-200">
              Fără recurență
            </Badge>
          )
        }
        
        const displayText = unit === 'luni' && dayOfMonth 
          ? `${interval} ${unit} (ziua ${dayOfMonth})`
          : `${interval} ${unit}`
        
        return (
          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
            {displayText}
          </Badge>
        )
      },
    },
    {
      accessorKey: "clientId",
      header: "Client Asignat",
      enableHiding: true,
      enableSorting: true,
      enableFiltering: false,
      cell: ({ row }) => {
        const clientId = row.original.clientId
        const client = clients.find(c => c.id === clientId)
        
        if (!clientId || !client) {
          return (
            <Badge variant="outline" className="bg-gray-50 text-gray-600 border-gray-200">
              Neasignat
            </Badge>
          )
        }
        
        return (
          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
            {client.nume}
          </Badge>
        )
      },
    },
    {
      accessorKey: "locatie",
      header: "Locație",
      enableHiding: true,
      enableSorting: true,
      enableFiltering: false,
      cell: ({ row }) => {
        const locatie = (row.original as any).locationNames?.length
          ? (row.original as any).locationNames.join(", ")
          : ((row.original as any).locationName || (row.original as any).locatie)
        
        if (!locatie) {
          return (
            <Badge variant="outline" className="bg-gray-50 text-gray-600 border-gray-200">
              Nespecificată
            </Badge>
          )
        }
        
        return (
          <div className="text-sm">
            {locatie}
          </div>
        )
      },
    },
    {
      accessorKey: "status",
      header: "Status",
      enableHiding: true,
      enableSorting: true,
      enableFiltering: false,
      cell: ({ row }) => {
        const suspended = isContractSuspended(row.original)
        return (
          <Badge variant={suspended ? "destructive" : "secondary"}>
            {suspended ? "Suspendat" : "Activ"}
          </Badge>
        )
      },
    },
    {
      accessorKey: "createdAt",
      header: "Data Adăugării",
      enableHiding: true,
      enableSorting: true,
      enableFiltering: false,
      cell: ({ row }) => {
        const date = row.original.createdAt
        if (!date) return "N/A"
        
        try {
          const dateObj = date.toDate ? date.toDate() : new Date(date)
          return (
            <div className="text-sm">
              {(() => { try { const { formatUiDate } = require("@/lib/utils/time-format"); return formatUiDate(dateObj) } catch { return "" } })()}
              <div className="text-xs text-muted-foreground">
                {format(dateObj, "HH:mm", { locale: ro })}
              </div>
            </div>
          )
        } catch (error) {
          return "Data invalidă"
        }
      },
    },
    // Inserăm coloanele dinamice înainte de acțiuni
    ...dynamicColumns,
    {
      id: "actions",
      header: "Acțiuni",
      enableHiding: false,
      enableSorting: false,
      enableFiltering: false,
      cell: ({ row }) =>
        isReadOnlyDispatcher ? (
          <span className="text-xs text-muted-foreground">Read-only</span>
        ) : (
          <div className="flex items-center justify-end gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="outline" 
                  size="icon" 
                  className="h-8 w-8 text-blue-600"
                  onClick={(e) => {
                    e.stopPropagation()
                    openEditDialog(row.original)
                  }}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Editează</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="outline" 
                  size="icon" 
                  className="h-8 w-8 text-red-600"
                  onClick={(e) => {
                    e.stopPropagation()
                    openDeleteDialog(row.original)
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Șterge</TooltipContent>
            </Tooltip>
          </div>
        ),
    },
  ], [clients, dynamicColumns, isReadOnlyDispatcher])

  // Încărcăm contractele și clienții din Firestore (sau fixture E2E)
  useEffect(() => {
    if (isE2eTestMode()) {
      setClients(E2E_CONTRACT_CLIENTS)
      setContracts(E2E_CONTRACTS as Contract[])
      setLoading(false)
      setError(null)
      return
    }

    const fetchData = async () => {
      try {
        setLoading(true)
        setError(null)

        // Încărcăm clienții
        const clientsList = await getClienti()
        setClients(clientsList.map(client => ({ id: client.id!, nume: client.nume })))

        const contractsQuery = query(collection(db, "contracts"), orderBy("name", "asc"))

        const unsubscribe = onSnapshot(
          contractsQuery,
          (snapshot) => {
            const contractsData = snapshot.docs.map((doc) => ({
              id: doc.id,
              ...doc.data(),
            })) as Contract[]

            // Contractele au fost încărcate cu succes

            setContracts(contractsData)
            setLoading(false)
          },
          (error) => {
            console.error("Eroare la încărcarea contractelor:", error)
            setError("Nu s-au putut încărca contractele. Vă rugăm să încercați din nou.")
            setLoading(false)
          },
        )

        return () => unsubscribe()
      } catch (error) {
        console.error("Eroare la încărcarea contractelor:", error)
        setError("Nu s-au putut încărca contractele. Vă rugăm să încercați din nou.")
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  // Încărcăm locațiile când se schimbă clientul selectat
  useEffect(() => {
    const loadClientLocations = async () => {
      if (!newContractClientId || newContractClientId === "UNASSIGNED") {
        setClientLocations([])
        setClientEquipments([])
        setNewContractLocationId("")
        setNewContractLocationName("")
        setNewContractLocationIds([])
        setNewContractLocationNames([])
        setNewContractEquipmentIds([])
        return
      }

      try {
        const clientsList = await getClienti()
        const selectedClient = clientsList.find(c => c.id === newContractClientId)
        
        if (selectedClient && selectedClient.locatii) {
          setClientLocations(selectedClient.locatii)
        } else {
          setClientLocations([])
        }
      } catch (error) {
        console.error("Eroare la încărcarea locațiilor:", error)
        setClientLocations([])
      }
    }

    loadClientLocations()
  }, [newContractClientId])

  // Încărcăm echipamentele când se schimbă locația/locațiile selectate
  useEffect(() => {
    const ids = newContractLocationIds.length ? newContractLocationIds : (newContractLocationId ? [newContractLocationId] : [])
    if (!ids.length) {
      setClientEquipments([])
      setNewContractEquipmentIds([])
      return
    }
    const eqs: Echipament[] = []
    for (const id of ids) {
      const selectedLocation = clientLocations.find(loc => loc.nume === id)
      if (selectedLocation?.echipamente?.length) {
        eqs.push(...selectedLocation.echipamente)
      }
    }
    setClientEquipments(eqs)
  }, [newContractLocationIds, newContractLocationId, clientLocations])

  // Inițializare valoare default pentru daysBeforeWork
  useEffect(() => {
    if (defaultDaysBeforeWork && !isEditDialogOpen) {
      setNewContractDaysBeforeWork(defaultDaysBeforeWork)
    }
  }, [defaultDaysBeforeWork, isEditDialogOpen])

  // Funcție pentru adăugarea unui contract nou
  const handleAddContract = async () => {
    if (isReadOnlyDispatcher) {
      toast({
        title: "Acțiune indisponibilă",
        description: "Dispecerul are acces doar pentru vizualizare la contracte.",
        variant: "destructive",
      })
      return
    }
    if (!newContractName || !newContractNumber) {
      toast({
        title: "Eroare",
        description: "Vă rugăm să completați toate câmpurile obligatorii",
        variant: "destructive",
      })
      return
    }

    try {
      setIsSubmitting(true)
      setError(null)

      // Validări explicite pentru recurență (notificări clare în UI)
      if (newContractRecurrenceInterval && newContractRecurrenceInterval > 0) {
        if (!newContractStartDate) {
          toast({
            title: "Lipsește data de început",
            description: "Pentru recurențe, setați data primei revizii.",
            variant: "destructive",
          })
          setIsSubmitting(false)
          return
        }
        if (!newContractClientId || newContractClientId === "UNASSIGNED") {
          toast({
            title: "Client necompletat",
            description: "Selectați un client pentru contractele recurente.",
            variant: "destructive",
          })
          setIsSubmitting(false)
          return
        }
        if ((newContractLocationIds.length === 0) && !newContractLocationId) {
          toast({
            title: "Lipsă locație",
            description: "Selectați locația pentru contractele recurente.",
            variant: "destructive",
          })
          setIsSubmitting(false)
          return
        }
        if (!newContractEquipmentIds || newContractEquipmentIds.length === 0) {
          toast({
            title: "Lipsesc echipamentele",
            description: "Selectați cel puțin un echipament pentru recurență.",
            variant: "destructive",
          })
          setIsSubmitting(false)
          return
        }
      }

      // Folosim sistemul robust de validare
      const validation = await validateContractAssignment(
        newContractNumber, 
        newContractClientId && newContractClientId !== "UNASSIGNED" ? newContractClientId : ""
      )

      if (!validation.isValid) {
        toast({
          title: "Eroare",
          description: validation.error,
          variant: "destructive",
        })
        setIsSubmitting(false)
        return
      }

      // Adăugăm contractul în Firestore
      const contractData: any = {
        name: newContractName,
        number: newContractNumber,
        status: "active",
        createdAt: serverTimestamp(),
        ...(newContract?.customFields ? { customFields: newContract.customFields } : {}),
      }

      // Adăugăm clientId doar dacă este selectat și nu este "UNASSIGNED"
      if (newContractClientId && newContractClientId !== "UNASSIGNED") {
        contractData.clientId = newContractClientId
        
        // Suport multi-locații
        const locs = newContractLocationIds.length ? newContractLocationIds : (newContractLocationId ? [newContractLocationId] : [])
        if (locs.length > 0) {
          contractData.locationNames = locs
          // legacy fallback
          contractData.locationId = locs[0]
          contractData.locationName = locs[0]
        }
        
        if (newContractEquipmentIds.length > 0) {
          contractData.equipmentIds = newContractEquipmentIds
        }
      }

      // Adăugăm recurență dacă este setată
      if (newContractRecurrenceInterval && newContractRecurrenceInterval > 0) {
        // Adăugăm data de început (obligatorie pentru recurență)
        if (newContractStartDate) {
          contractData.startDate = newContractStartDate
        }
        contractData.recurrenceInterval = newContractRecurrenceInterval
        contractData.recurrenceUnit = newContractRecurrenceUnit
        contractData.daysBeforeWork = newContractDaysBeforeWork
        // Ziua din lună nu mai este folosită
      }

      // Precalculăm următoarele date (până la 48 luni) și le stocăm pe contract
      contractData.revisionSchedulePreview = computeRevisionSchedulePreview({
        startDate: contractData.startDate,
        recurrenceInterval: contractData.recurrenceInterval,
        recurrenceUnit: contractData.recurrenceUnit,
        daysBeforeWork: contractData.daysBeforeWork,
        locationIds: newContractLocationIds,
        locationNames: newContractLocationNames,
        locationId: newContractLocationId,
        locationName: newContractLocationName,
      })
      contractData.revisionScheduleUpdatedAt = serverTimestamp()

      // Adăugăm prețurile dacă sunt setate
      if (Object.keys(newContractPricing).length > 0) {
        contractData.pricing = newContractPricing
      }

      const docRef = await addDoc(collection(db, "contracts"), contractData)
      // Backward compatible: persistăm și câmpul `id` în document (egal cu doc id)
      try {
        await updateDoc(doc(db, "contracts", docRef.id), { id: docRef.id } as any)
      } catch {}

      // Dacă avem recurență și date complete, declanșăm generarea pe backend (aceeași logică ca programata)
      if (
        newContractRecurrenceInterval &&
        newContractRecurrenceInterval > 0 &&
        newContractRecurrenceUnit &&
        (contractData.equipmentIds?.length || 0) > 0 &&
        newContractClientId &&
        newContractClientId !== "UNASSIGNED"
      ) {
        try {
          const functions = getFunctions(app, "europe-west1")
          const runFn = httpsCallable(functions, "runGenerateScheduledWorks")
          await runFn({ contractId: docRef.id })
        } catch (err) {
          console.error("Post-create generate error", err)
          // Nu blocăm fluxul; funcția programată va genera la orele stabilite
        }
      }

      // Log non-blocking
      void addUserLogEntry({
        actiune: "Creare contract",
        detalii: `ID: ${docRef.id}; nume: ${contractData.name}; număr: ${contractData.number}${contractData.clientId ? `; clientId: ${contractData.clientId}` : ""}`,
        categorie: "Contracte",
      })

      // Resetăm formularul și închidem dialogul
      setNewContractName("")
      setNewContractNumber("")
      setNewContractClientId("UNASSIGNED")
      setNewContractLocationId("")
      setNewContractLocationName("")
      setNewContractLocationIds([])
      setNewContractLocationNames([])
      setNewContractEquipmentIds([])
      setNewContractRecurrenceInterval(90)
      setNewContractRecurrenceUnit("zile")
      setNewContractDaysBeforeWork(10)
      setNewContractPricing({})
      setClientLocations([])
      setClientEquipments([])
      setIsAddDialogOpen(false)

      toast({
        title: "Contract adăugat",
        description: "Contractul a fost adăugat cu succes",
      })
    } catch (error) {
      console.error("Eroare la adăugarea contractului:", error)
      setError("Nu s-a putut adăuga contractul. Vă rugăm să încercați din nou.")
      toast({
        title: "Eroare",
        description: "Nu s-a putut adăuga contractul. Verificați câmpurile și încercați din nou.",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Funcție pentru editarea unui contract
  const handleEditContract = async () => {
    if (isReadOnlyDispatcher) {
      toast({
        title: "Acțiune indisponibilă",
        description: "Dispecerul are acces doar pentru vizualizare la contracte.",
        variant: "destructive",
      })
      return
    }
    if (!selectedContract || !newContractName || !newContractNumber) {
      toast({
        title: "Eroare",
        description: "Vă rugăm să completați toate câmpurile obligatorii",
        variant: "destructive",
      })
      return
    }

    try {
      setIsSubmitting(true)
      setError(null)

      // Folosim sistemul robust de validare pentru editare
      const validation = await validateContractAssignment(
        newContractNumber, 
        newContractClientId && newContractClientId !== "UNASSIGNED" ? newContractClientId : "",
        selectedContract.id // excludem contractul curent
      )

      if (!validation.isValid) {
        toast({
          title: "Eroare",
          description: validation.error,
          variant: "destructive",
        })
        setIsSubmitting(false)
        return
      }

      // Actualizăm contractul în Firestore
      const contractRef = doc(db, "contracts", selectedContract.id)
      const updateData: any = {
        name: newContractName,
        number: newContractNumber,
        updatedAt: serverTimestamp(),
        ...(newContract?.customFields ? { customFields: newContract.customFields } : {}),
      }
      // Backfill la orice editare: persistăm `id` în document (egal cu doc id)
      updateData.id = selectedContract.id

      // Gestionăm clientId - poate fi null pentru neasignat
      if (newContractClientId && newContractClientId !== "UNASSIGNED") {
        updateData.clientId = newContractClientId
        
        // Gestionăm locațiile (multi)
        const locs = newContractLocationIds.length ? newContractLocationIds : (newContractLocationId ? [newContractLocationId] : [])
        if (locs.length > 0) {
          updateData.locationNames = locs
          updateData.locationId = locs[0]
          updateData.locationName = locs[0]
        } else {
          updateData.locationNames = []
          updateData.locationId = null
          updateData.locationName = null
        }
        
        if (newContractEquipmentIds.length > 0) {
          updateData.equipmentIds = newContractEquipmentIds
        } else {
          updateData.equipmentIds = []
        }
      } else {
        updateData.clientId = null
        updateData.locationId = null
        updateData.locationName = null
        updateData.equipmentIds = []
      }

      // Gestionăm recurența
      if (newContractRecurrenceInterval && newContractRecurrenceInterval > 0) {
        // Adăugăm data de început
        if (newContractStartDate) {
          updateData.startDate = newContractStartDate
        } else {
          updateData.startDate = null
        }
        updateData.recurrenceInterval = newContractRecurrenceInterval
        updateData.recurrenceUnit = newContractRecurrenceUnit
        updateData.daysBeforeWork = newContractDaysBeforeWork
      } else {
        updateData.startDate = null
        updateData.recurrenceInterval = null
        updateData.recurrenceUnit = null
        updateData.daysBeforeWork = null
      }

      // Gestionăm prețurile
      if (Object.keys(newContractPricing).length > 0) {
        updateData.pricing = newContractPricing
      } else {
        updateData.pricing = {}
      }

      // Precalculăm următoarele date (până la 48 luni) și le stocăm pe contract
      updateData.revisionSchedulePreview = computeRevisionSchedulePreview({
        startDate: updateData.startDate || undefined,
        recurrenceInterval: updateData.recurrenceInterval || undefined,
        recurrenceUnit: updateData.recurrenceUnit || undefined,
        daysBeforeWork: updateData.daysBeforeWork || undefined,
        locationIds: newContractLocationIds,
        locationNames: newContractLocationNames,
        locationId: newContractLocationId,
        locationName: newContractLocationName,
      })
      updateData.revisionScheduleUpdatedAt = serverTimestamp()

      await updateDoc(contractRef, updateData)

      // Log dif non-blocking
      const changes: string[] = []
      if (selectedContract.name !== newContractName) changes.push(`name: "${selectedContract.name}" → "${newContractName}"`)
      if (selectedContract.number !== newContractNumber) changes.push(`number: "${selectedContract.number}" → "${newContractNumber}"`)
      const oldClient = selectedContract.clientId || "UNASSIGNED"
      const newClient = newContractClientId && newContractClientId !== "UNASSIGNED" ? newContractClientId : "UNASSIGNED"
      if (oldClient !== newClient) changes.push(`clientId: "${oldClient}" → "${newClient}"`)
      const detalii = changes.length ? changes.join("; ") : "Actualizare fără câmpuri esențiale modificate"
      void addUserLogEntry({
        actiune: "Actualizare contract",
        detalii: `ID: ${selectedContract.id}; ${detalii}`,
        categorie: "Contracte",
      })

      // Resetăm formularul și închidem dialogul
      setNewContractName("")
      setNewContractNumber("")
      setNewContractClientId("UNASSIGNED")
      setNewContractLocationId("")
      setNewContractLocationName("")
    setNewContractLocationIds([])
    setNewContractLocationNames([])
      setNewContractEquipmentIds([])
      setNewContractRecurrenceInterval(90)
      setNewContractRecurrenceUnit("zile")
      setNewContractDaysBeforeWork(10)
      setNewContractPricing({})
      setClientLocations([])
      setClientEquipments([])
      setSelectedContract(null)
      setIsEditDialogOpen(false)

      toast({
        title: "Contract actualizat",
        description: "Contractul a fost actualizat cu succes",
      })
    } catch (error) {
      console.error("Eroare la actualizarea contractului:", error)
      setError("Nu s-a putut actualiza contractul. Vă rugăm să încercați din nou.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleContractStatusChange = async () => {
    if (!selectedContract || isReadOnlyDispatcher) return

    const currentlySuspended = isContractSuspended(selectedContract)
    const nextStatus: ContractStatus = currentlySuspended ? "active" : "suspended"
    const actorId = String(userData?.uid || "")
    const actorName = String(userData?.displayName || userData?.email || "Utilizator necunoscut")

    try {
      setIsSubmitting(true)
      const localTimestamp = new Date().toISOString()
      const statusData: Record<string, any> = {
        status: nextStatus,
        statusUpdatedAt: serverTimestamp(),
        statusUpdatedBy: actorId,
        statusUpdatedByName: actorName,
        updatedAt: serverTimestamp(),
      }

      if (nextStatus === "suspended") {
        statusData.lastSuspendedAt = serverTimestamp()
        statusData.lastSuspendedBy = actorId
        statusData.lastSuspendedByName = actorName
      } else {
        statusData.lastReactivatedAt = serverTimestamp()
        statusData.lastReactivatedBy = actorId
        statusData.lastReactivatedByName = actorName
        statusData.lastAutoWorkGenerated = localTimestamp
      }

      if (isE2eTestMode()) {
        setContracts((current) =>
          current.map((contract) =>
            contract.id === selectedContract.id
              ? {
                  ...contract,
                  ...statusData,
                  statusUpdatedAt: localTimestamp,
                  ...(nextStatus === "suspended"
                    ? { lastSuspendedAt: localTimestamp }
                    : { lastReactivatedAt: localTimestamp }),
                }
              : contract,
          ),
        )
      } else {
        await updateDoc(doc(db, "contracts", selectedContract.id), statusData)
      }

      const updatedContract = {
        ...selectedContract,
        status: nextStatus,
        statusUpdatedAt: localTimestamp,
        ...(nextStatus === "suspended"
          ? { lastSuspendedAt: localTimestamp }
          : { lastReactivatedAt: localTimestamp }),
      }
      setSelectedContract(updatedContract)
      setIsStatusDialogOpen(false)

      void addUserLogEntry({
        actiune: nextStatus === "suspended" ? "Suspendare contract" : "Reactivare contract",
        detalii: `ID: ${selectedContract.id}; număr: ${selectedContract.number}; status: ${nextStatus}`,
        categorie: "Contracte",
      })

      toast({
        title: nextStatus === "suspended" ? "Contract suspendat" : "Contract reactivat",
        description:
          nextStatus === "suspended"
            ? "Contractul nu mai poate fi folosit pentru tichete noi."
            : "Contractul poate fi folosit din nou pentru tichete noi.",
      })
    } catch (error) {
      console.error("Eroare la schimbarea statusului contractului:", error)
      toast({
        title: "Eroare",
        description: "Nu s-a putut actualiza statusul contractului.",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Funcție pentru ștergerea unui contract
  const handleDeleteContract = async () => {
    if (isReadOnlyDispatcher) {
      toast({
        title: "Acțiune indisponibilă",
        description: "Dispecerul are acces doar pentru vizualizare la contracte.",
        variant: "destructive",
      })
      return
    }
    if (!selectedContract) return

    try {
      setIsSubmitting(true)
      setError(null)

      // Ștergem contractul din Firestore
      const contractRef = doc(db, "contracts", selectedContract.id)
      await deleteDoc(contractRef)

      // Log non-blocking
      void addUserLogEntry({
        actiune: "Ștergere contract",
        detalii: `ID: ${selectedContract.id}; nume: ${selectedContract.name}; număr: ${selectedContract.number}`,
        categorie: "Contracte",
      })

      // Resetăm starea și închidem dialogul
      setSelectedContract(null)
      setIsDeleteDialogOpen(false)

      toast({
        title: "Contract șters",
        description: "Contractul a fost șters cu succes",
      })
    } catch (error) {
      console.error("Eroare la ștergerea contractului:", error)
      setError("Nu s-a putut șterge contractul. Vă rugăm să încercați din nou.")
    } finally {
      setIsSubmitting(false)
    }
  }

  // Funcție pentru deschiderea dialogului de editare
  const openEditDialog = async (contract: Contract) => {
    if (isReadOnlyDispatcher) {
      return
    }
    setSelectedContract(contract)
    setNewContractName(contract.name)
    setNewContractNumber(contract.number)
    setNewContractClientId(contract.clientId || "UNASSIGNED")
    setNewContractLocationId(contract.locationId || "")
    setNewContractLocationName(contract.locationName || "")
    setNewContractLocationIds((contract.locationNames as any) || (contract.locationId ? [contract.locationId] : []))
    setNewContractLocationNames((contract.locationNames as any) || (contract.locationName ? [contract.locationName] : []))
    setNewContractEquipmentIds(contract.equipmentIds || [])
    setNewContractStartDate(contract.startDate || "")
    setNewContractRecurrenceInterval(contract.recurrenceInterval || 90)
    setNewContractRecurrenceUnit(contract.recurrenceUnit || "zile")
    setNewContractDaysBeforeWork(contract.daysBeforeWork ?? defaultDaysBeforeWork ?? 10)
    // Sincronizează și inputul text pentru a afișa valoarea din contract (nu default-ul)
    setDaysBeforeWorkInput(String(contract.daysBeforeWork ?? defaultDaysBeforeWork ?? 10))
    setNewContractPricing(contract.pricing || {})
    // Inițializează câmpurile dinamice cu valorile salvate în contract (pentru afișare corectă în dialog)
    setNewContract((prev: any) => ({
      ...(prev || {}),
      customFields: { ...(contract as any)?.customFields },
    }))
    
    // Încărcăm locațiile și echipamentele clientului dacă există un client asignat
    if (contract.clientId) {
      try {
        const clientsList = await getClienti()
        const selectedClient = clientsList.find(c => c.id === contract.clientId)
        
        if (selectedClient && selectedClient.locatii) {
          setClientLocations(selectedClient.locatii)
          
          // Încărcăm echipamentele pentru locațiile selectate
          const locs = (contract.locationNames as any) || (contract.locationId ? [contract.locationId] : [])
          if (Array.isArray(locs) && locs.length) {
            const eqs: Echipament[] = []
            for (const id of locs) {
              const l = selectedClient.locatii.find((x: any) => x.nume === id)
              if (l?.echipamente?.length) eqs.push(...l.echipamente)
            }
            setClientEquipments(eqs)
          }
        }
      } catch (error) {
        console.error("Eroare la încărcarea datelor clientului:", error)
      }
    }
    
    setIsEditDialogOpen(true)
  }

  // Funcție pentru deschiderea dialogului de ștergere
  const openDeleteDialog = (contract: Contract) => {
    if (isReadOnlyDispatcher) {
      return
    }
    setSelectedContract(contract)
    setIsDeleteDialogOpen(true)
  }

  // Funcție pentru formatarea datei
  const formatDate = (timestamp: any) => {
    if (!timestamp) return "N/A"

    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
      return format(date, "dd.MM.yyyy, HH:mm", { locale: ro })
    } catch (error) {
      return "Data invalidă"
    }
  }

  // Function to check if we should show the close confirmation dialog
  const handleCloseDialog = (dialogType: "add" | "edit" | "delete") => {
    // For contracts, we'll check if the form fields have values
    if (dialogType === "add" && (newContractName || newContractNumber || newContractLocationId || newContractLocationIds.length > 0 || newContractEquipmentIds.length > 0 || (newContractClientId && newContractClientId !== "UNASSIGNED"))) {
      setActiveDialog(dialogType)
      setShowCloseAlert(true)
    } else if (
      dialogType === "edit" &&
      (newContractName !== selectedContract?.name ||
        newContractNumber !== selectedContract?.number ||
        newContractLocationId !== (selectedContract?.locationId || "") ||
        JSON.stringify(newContractLocationIds) !== JSON.stringify((selectedContract?.locationNames as any) || []) ||
        JSON.stringify(newContractEquipmentIds) !== JSON.stringify(selectedContract?.equipmentIds || []) ||
        newContractStartDate !== (selectedContract?.startDate || "") ||
        newContractRecurrenceInterval !== (selectedContract?.recurrenceInterval || 90) ||
        newContractRecurrenceUnit !== (selectedContract?.recurrenceUnit || "zile") ||
        newContractDaysBeforeWork !== (selectedContract?.daysBeforeWork || 10) ||
        newContractClientId !== (selectedContract?.clientId || "UNASSIGNED"))
    ) {
      setActiveDialog(dialogType)
      setShowCloseAlert(true)
    } else {
      // No unsaved changes, close directly
      if (dialogType === "add") setIsAddDialogOpen(false)
      if (dialogType === "edit") setIsEditDialogOpen(false)
      if (dialogType === "delete") setIsDeleteDialogOpen(false)
    }
  }

  // Function to confirm dialog close
  const confirmCloseDialog = () => {
    setShowCloseAlert(false)

    // Reset form fields
    setNewContractName("")
    setNewContractNumber("")
    setNewContractClientId("UNASSIGNED")
    setNewContractLocationId("")
    setNewContractLocationName("")
    setNewContractLocationIds([])
    setNewContractLocationNames([])
    setNewContractEquipmentIds([])
    setNewContractStartDate("")
    setNewContractRecurrenceInterval(90)
    setNewContractRecurrenceUnit("zile")
    setNewContractDaysBeforeWork(10)
    setNewContractPricing({})
    setClientLocations([])
    setClientEquipments([])
    setSelectedContract(null)

    // Close the active dialog
    if (activeDialog === "add") setIsAddDialogOpen(false)
    if (activeDialog === "edit") setIsEditDialogOpen(false)
    if (activeDialog === "delete") setIsDeleteDialogOpen(false)

    setActiveDialog(null)
  }

  return (
    <TooltipProvider>
      <DashboardShell>
        {viewMode === "list" && (
          <DashboardHeader
            heading="Contracte"
            text={isReadOnlyDispatcher ? "Vizualizare contracte de mentenanță" : "Gestionați contractele din sistem"}
          >
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  clearCalendarContractFilter()
                  setViewMode("calendar")
                }}
              >
                Calendar revizii
              </Button>
              {!isReadOnlyDispatcher && (
                <Button onClick={() => setIsAddDialogOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" /> Adaugă Contract
                </Button>
              )}
            </div>
          </DashboardHeader>
        )}

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading ? (
        <div className="flex justify-center items-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <span className="ml-2 text-gray-600">Se încarcă contractele...</span>
        </div>
      ) : contracts.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Nu există contracte în sistem.</p>
          {!isReadOnlyDispatcher && (
            <Button onClick={() => setIsAddDialogOpen(true)} className="mt-4">
              <Plus className="mr-2 h-4 w-4" /> Adaugă primul contract
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {viewMode === "calendar" ? (
            <div className="space-y-4 pb-12" data-testid="contract-calendar-view">
              {/* Header compact în stil Planado */}
              <div className="flex items-center gap-4 px-4 py-2 bg-white border-b border-slate-200">
                <h1 className="text-xl font-bold text-slate-800">
                  {calendarFilterContractName ? `Calendar — ${calendarFilterContractName}` : "Calendar"}
                </h1>
                {calendarContractFilterId && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-blue-700"
                    data-testid="contract-calendar-clear-filter"
                    onClick={clearCalendarContractFilter}
                  >
                    Toate contractele
                  </Button>
                )}
                
                <div className="flex items-center gap-1 border-r pr-4">
                  <Button
                    variant={calendarMode === "year" ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setCalendarMode("year")}
                    className="h-8 px-3 text-sm"
                  >
                    An
                  </Button>
                  <Button
                    variant={calendarMode === "month" ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setCalendarMode("month")}
                    className="h-8 px-3 text-sm"
                  >
                    Lună
                  </Button>
                  <Button
                    variant={calendarMode === "week" ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setCalendarMode("week")}
                    className="h-8 px-3 text-sm"
                  >
                    Săptămână
                  </Button>
                </div>

          
                <div className="flex-1"></div>

                {/* Legendă încărcare */}
                <div className="flex items-center gap-3 border-r pr-4">
                  <span className="text-xs font-semibold text-slate-700">Încărcare:</span>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1">
                      <div className="h-3 w-3 rounded bg-emerald-500"></div>
                      <span className="text-xs text-slate-600">Mică (1-2)</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="h-3 w-3 rounded bg-amber-500"></div>
                      <span className="text-xs text-slate-600">Medie (3-4)</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="h-3 w-3 rounded bg-rose-600"></div>
                      <span className="text-xs text-slate-600">Mare (5+)</span>
                    </div>
                  </div>
                </div>

                {/* Butoane de acțiune */}
                <div className="flex items-center gap-2">
              
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      clearCalendarContractFilter()
                      setViewMode("list")
                    }}
                    className="h-8"
                    data-testid="contract-calendar-back-to-list"
                  >
                    Contracte
                  </Button>
              
                </div>
              </div>

              {showWeekStrip && (
                <Card>
                  <CardContent className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-slate-700">Rezumat săptămână</span>
                      <div className="flex items-center gap-2 flex-wrap">
                        {weekStripDays.map((d) => {
                          let color = "#10b981"
                          let colorDark = "#059669"
                          if (d.count > 4) {
                            color = "#e11d48"
                            colorDark = "#be123c"
                          } else if (d.count > 2) {
                            color = "#f59e0b"
                            colorDark = "#d97706"
                          }
                          return (
                            <div
                              key={d.date.toISOString()}
                              className="flex items-center gap-1 px-2 py-1 rounded-md border text-xs"
                              style={{ borderColor: colorDark + "40", backgroundColor: color + "20" }}
                            >
                              <div className="h-3 w-3 rounded" style={{ backgroundColor: color }} />
                              <span className="font-semibold text-slate-700">
                                {format(d.date, "EEE", { locale: ro })} ({d.count})
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

         

              {calendarEvents.length === 0 ? (
                <Card className="border-2 border-dashed" data-testid="contract-calendar-empty">
                  <CardContent className="py-16 text-center">
                    <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-slate-100 flex items-center justify-center">
                      <FileText className="h-10 w-10 text-slate-400" />
                    </div>
                    <p className="text-lg font-semibold text-slate-700">Nu există revizii programate</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Următoarele 12 luni nu au revizii planificate
                    </p>
                  </CardContent>
                </Card>
              ) : calendarMode === "month" ? (
                <Card className="border-2 shadow-md">
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <div className="min-w-[1400px]">
                        {/* Header fix cu zilele */}
                        <div className="sticky top-0 bg-gradient-to-b from-slate-100 to-slate-50 border-b-2 border-slate-300 z-10 shadow-sm">
                          <div className="flex">
                            <div className="w-40 flex-shrink-0 border-r-2 border-slate-300 px-3 py-2 font-bold text-slate-700 text-sm">
                              Lună / Zi
                            </div>
                            <div className="flex-1 grid" style={{ gridTemplateColumns: `repeat(31, minmax(40px, 1fr))` }}>
                              {Array.from({ length: 31 }).map((_, i) => {
                                const sampleDate = new Date(2024, 0, i + 1)
                                const dayOfWeek = sampleDate.getDay()
                                const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
                                
                                return (
                                  <div
                                    key={i}
                                    className={`text-center py-2 text-xs font-bold border-r border-slate-200 ${
                                      isWeekend ? "bg-red-50 text-red-700" : "text-slate-700"
                                    }`}
                                  >
                                    {i + 1}
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        </div>

                        {/* Rânduri pentru fiecare lună */}
                        <div>
                          {calendarMonths.map((month, monthIndex) => {
                            const monthEvents = calendarEvents.filter(
                              (ev) =>
                                ev.date.getFullYear() === month.date.getFullYear() &&
                                ev.date.getMonth() === month.date.getMonth(),
                            )
                            const today = new Date()
                            const isCurrentMonth = 
                              today.getFullYear() === month.date.getFullYear() && 
                              today.getMonth() === month.date.getMonth()

                            return (
                              <div
                                key={month.key}
                                className={`flex border-b-2 border-slate-200 transition-all hover:bg-slate-50 ${
                                  isCurrentMonth ? "bg-blue-50" : monthIndex % 2 === 0 ? "bg-white" : "bg-slate-50/40"
                                }`}
                              >
                                {/* Label luna */}
                                <div className={`w-40 flex-shrink-0 border-r-2 border-slate-300 px-3 py-2 flex flex-col justify-center ${
                                  isCurrentMonth ? "bg-gradient-to-r from-blue-500 to-blue-600 text-white" : ""
                                }`}>
                                  <div className={`text-base font-bold ${isCurrentMonth ? "text-white" : "text-slate-800"}`}>
                                    {month.label}
                                  </div>
                                  <div className={`text-xs mt-0.5 font-medium ${
                                    isCurrentMonth ? "text-blue-100" : "text-slate-600"
                                  }`}>
                                    {monthEvents.length} {monthEvents.length === 1 ? "revizie" : "revizii"}
                                  </div>
                                </div>

                                {/* Grid zile */}
                                <div className="flex-1 relative min-h-[45px]">
                                  <div className="grid h-full" style={{ gridTemplateColumns: `repeat(31, minmax(40px, 1fr))` }}>
                                    {Array.from({ length: 31 }).map((_, dayIndex) => {
                                      const dayNum = dayIndex + 1
                                      const isValidDay = dayNum <= month.days
                                      const dayDate = isValidDay 
                                        ? new Date(month.date.getFullYear(), month.date.getMonth(), dayNum)
                                        : null
                                      const isToday = dayDate && 
                                        dayDate.getDate() === today.getDate() &&
                                        dayDate.getMonth() === today.getMonth() &&
                                        dayDate.getFullYear() === today.getFullYear()
                                      const isWeekend = dayDate && (dayDate.getDay() === 0 || dayDate.getDay() === 6)

                                      return (
                                        <div
                                          key={dayIndex}
                                          className={`border-r border-slate-200 relative ${
                                            !isValidDay ? "bg-slate-200/30 bg-[linear-gradient(45deg,transparent_25%,rgba(0,0,0,.02)_25%,rgba(0,0,0,.02)_50%,transparent_50%,transparent_75%,rgba(0,0,0,.02)_75%,rgba(0,0,0,.02))] bg-[length:8px_8px]" : 
                                            isToday ? "bg-blue-200/40" :
                                            isWeekend ? "bg-red-50/50" : ""
                                          }`}
                                        >
                                          {isToday && (
                                            <div className="absolute inset-0 border-2 border-blue-500 pointer-events-none z-20 rounded-sm"></div>
                                          )}
                                        </div>
                                      )
                                    })}
                                  </div>

                                  {/* Evenimente - badge fin cu tooltip inteligent */}
                                  <div className="absolute inset-0 grid pointer-events-none" style={{ gridTemplateColumns: `repeat(31, minmax(40px, 1fr))` }}>
                                    {(() => {
                                      // Grupăm evenimentele pe zi
                                      const eventsByDay: Record<number, typeof monthEvents> = {}
                                      monthEvents.forEach((ev) => {
                                        const day = ev.date.getDate()
                                        if (!eventsByDay[day]) eventsByDay[day] = []
                                        eventsByDay[day].push(ev)
                                      })

                                      return Object.entries(eventsByDay).map(([day, dayEvents]) => {
                                        const dayIndex = Number(day) - 1
                                        const firstEvent = dayEvents[0]
                                        const count = dayEvents.length
                                        
                                        // Culoare bazată pe încărcare
                                        let color: string
                                        let colorDark: string
                                        if (count <= 2) {
                                          color = "#10b981" // emerald-500
                                          colorDark = "#059669" // emerald-600
                                        } else if (count <= 4) {
                                          color = "#f59e0b" // amber-500
                                          colorDark = "#d97706" // amber-600
                                        } else {
                                          color = "#e11d48" // rose-600
                                          colorDark = "#be123c" // rose-700
                                        }
                                        
                                        // Determină direcția tooltip-ului bazat pe poziția în calendar
                                        const tooltipSide = monthIndex < 6 ? "bottom" : "top"
                                        
                                        return (
                                          <div
                                            key={`day-${day}`}
                                            style={{ gridColumn: `${dayIndex + 1} / ${dayIndex + 2}` }}
                                            className="flex items-center justify-center p-1 pointer-events-auto"
                                          >
                                            <Tooltip delayDuration={200}>
                                              <TooltipTrigger asChild>
                                                <div
                                                  style={{ 
                                                    background: `linear-gradient(135deg, ${color} 0%, ${colorDark} 100%)`,
                                                    boxShadow: `0 2px 8px -2px ${color}80, 0 0 0 1px ${color}40`,
                                                  }}
                                                  className="w-full h-8 rounded-md transition-all duration-200 cursor-pointer hover:scale-105 hover:shadow-lg flex items-center justify-center relative group overflow-hidden"
                                                  onClick={() => {
                                                    const iso = firstEvent.date.toISOString().slice(0, 10)
                                                    setSelectedDayDate(firstEvent.date)
                                                    setSelectedDayEvents(
                                                      calendarEvents.filter((ev) => ev.date.toISOString().slice(0, 10) === iso),
                                                    )
                                                    setIsDayPanelOpen(true)
                                                  }}
                                                >
                                                  {/* Shine effect background */}
                                                  <div className="absolute inset-0 bg-gradient-to-br from-white/0 via-white/10 to-white/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                                                  
                                                  {/* Number */}
                                                  <div className="text-white text-xs font-bold relative z-10 drop-shadow-sm">
                                                    {dayEvents.length}
                                                  </div>
                                                  
                                                  {/* Border accent pe hover */}
                                                  <div 
                                                    className="absolute inset-0 rounded-md opacity-0 group-hover:opacity-100 transition-opacity"
                                                    style={{ 
                                                      boxShadow: `inset 0 0 0 2px ${colorDark}`,
                                                    }}
                                                  ></div>
                                                  {/* Heat bar */}
                                                  <div
                                                    className="absolute left-1 right-1 bottom-1 h-1 rounded-full opacity-90"
                                                    style={{ backgroundColor: colorDark }}
                                                  ></div>
                                                </div>
                                              </TooltipTrigger>
                                              <TooltipContent 
                                                side={tooltipSide}
                                                sideOffset={8}
                                                className="bg-white border-2 border-slate-200 shadow-2xl max-w-sm p-0 rounded-xl overflow-hidden"
                                              >
                                                <div className="space-y-0">
                                                  {/* Header tooltip */}
                                                  <div className="bg-gradient-to-r from-slate-700 to-slate-800 text-white px-4 py-3">
                                                    <div className="font-bold text-base">
                                                      {format(firstEvent.date, "EEEE, dd MMMM yyyy", { locale: ro })}
                                                    </div>
                                                    <div className="text-xs opacity-90 mt-1">
                                                      {dayEvents.length} {dayEvents.length === 1 ? "revizie programată" : "revizii programate"}
                                                    </div>
                                                  </div>
                                                  
                                                  {/* Histogram orar all-day */}
                                                  <div className="px-4 py-3 space-y-2 border-b border-slate-100">
                                                    <div className="text-xs font-semibold text-slate-700">Distribuție (all-day)</div>
                                                    <div className="flex items-end gap-2">
                                                      <div className="flex-1 bg-slate-100 rounded-sm h-2 relative">
                                                        <div
                                                          className="absolute left-0 top-0 h-full rounded-sm"
                                                          style={{
                                                            width: "100%",
                                                            background: `linear-gradient(90deg, ${color} 0%, ${colorDark} 100%)`,
                                                          }}
                                                        ></div>
                                                      </div>
                                                      <span className="text-[11px] text-slate-600 font-semibold">{dayEvents.length}</span>
                                                    </div>
                                                  </div>

                                                  {/* Listă revizii */}
                                                  <div className="p-3 space-y-2 max-h-[300px] overflow-y-auto">
                                                    {[...dayEvents].sort((a, b) => a.contractName.localeCompare(b.contractName)).map((ev) => (
                                                      <div 
                                                        key={ev.id} 
                                                        className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 transition-colors"
                                                      >
                                                        <div
                                                          className="h-4 w-4 rounded shadow-sm flex-shrink-0 mt-0.5"
                                                          style={{ backgroundColor: getColorForId(ev.contractId) }}
                                                        />
                                                        <div className="flex-1 min-w-0">
                                                          <p className="font-bold text-sm text-slate-800 truncate">{ev.contractName}</p>
                                                          {ev.contractNumber && (
                                                            <p className="text-xs text-slate-600 mt-0.5">Contract: {ev.contractNumber}</p>
                                                          )}
                                                          {ev.locationName && (
                                                            <p className="text-xs text-slate-600 mt-0.5 truncate">📍 {ev.locationName}</p>
                                                          )}
                                                        </div>
                                                      </div>
                                                    ))}
                                                  </div>
                                                </div>
                                              </TooltipContent>
                                            </Tooltip>
                                          </div>
                                        )
                                      })
                                    })()}
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ) : calendarMode === "year" ? (
                <Card className="border-2 shadow-md">
                  <CardContent className="p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {calendarMonths.map((month, monthIndex) => {
                        const monthEvents = calendarEvents.filter(
                          (ev) =>
                            ev.date.getFullYear() === month.date.getFullYear() &&
                            ev.date.getMonth() === month.date.getMonth(),
                        )
                        const today = new Date()
                        const isCurrentMonth = 
                          today.getFullYear() === month.date.getFullYear() && 
                          today.getMonth() === month.date.getMonth()

                        // Grupăm pe zile pentru acest mini-calendar
                        const eventsByDay: Record<number, typeof monthEvents> = {}
                        monthEvents.forEach((ev) => {
                          const day = ev.date.getDate()
                          if (!eventsByDay[day]) eventsByDay[day] = []
                          eventsByDay[day].push(ev)
                        })

                        return (
                          <Card 
                            key={month.key} 
                            className={`border-2 ${isCurrentMonth ? "border-blue-400 shadow-lg" : "border-slate-200"}`}
                          >
                            <div className={`px-3 py-2 border-b ${
                              isCurrentMonth ? "bg-blue-500 text-white" : "bg-slate-100"
                            }`}>
                              <h3 className={`font-bold text-sm ${isCurrentMonth ? "text-white" : "text-slate-800"}`}>
                                {month.label}
                              </h3>
                              <p className={`text-xs ${isCurrentMonth ? "text-blue-100" : "text-slate-600"}`}>
                                {monthEvents.length} revizii
                              </p>
                            </div>
                            <div className="p-2">
                              <div className="grid grid-cols-7 gap-1">
                                {/* Mini calendar grid */}
                                {Array.from({ length: month.days }).map((_, dayIndex) => {
                                  const dayNum = dayIndex + 1
                                  const dayDate = new Date(month.date.getFullYear(), month.date.getMonth(), dayNum)
                                  const isToday = 
                                    dayDate.getDate() === today.getDate() &&
                                    dayDate.getMonth() === today.getMonth() &&
                                    dayDate.getFullYear() === today.getFullYear()
                                  const dayEventsCount = eventsByDay[dayNum]?.length || 0
                                  
                                  let bgColor = ""
                                  if (dayEventsCount > 0) {
                                    if (dayEventsCount <= 2) {
                                      bgColor = "bg-emerald-500"
                                    } else if (dayEventsCount <= 4) {
                                      bgColor = "bg-amber-500"
                                    } else {
                                      bgColor = "bg-rose-600"
                                    }
                                  }

                                  return (
                                    <Tooltip key={dayIndex}>
                                      <TooltipTrigger asChild>
                                        <div
                                          className={`aspect-square rounded flex items-center justify-center text-[10px] font-bold cursor-pointer transition-all ${
                                            isToday ? "ring-2 ring-blue-500 bg-blue-100" :
                                            dayEventsCount > 0 ? `${bgColor} text-white hover:scale-110` :
                                            "bg-slate-100 text-slate-400"
                                          }`}
                                          onClick={() => {
                                            if (dayEventsCount > 0) {
                                              setSelectedDayEvents(eventsByDay[dayNum] || [])
                                              setSelectedDayDate(dayDate)
                                              setIsDayPanelOpen(true)
                                            }
                                          }}
                                        >
                                          {dayNum}
                                        </div>
                                      </TooltipTrigger>
                                      {dayEventsCount > 0 && (
                                        <TooltipContent className="text-xs">
                                          {dayNum} {month.label}: {dayEventsCount} {dayEventsCount === 1 ? "revizie" : "revizii"}
                                        </TooltipContent>
                                      )}
                                    </Tooltip>
                                  )
                                })}
                              </div>
                            </div>
                          </Card>
                        )
                      })}
                    </div>
                  </CardContent>
                </Card>
              ) : calendarMode === "week" ? (
                <Card className="border-2 shadow-md">
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <div className="min-w-[1000px]">
                        {/* Header săptămână */}
                        <div className="bg-gradient-to-b from-slate-100 to-slate-50 border-b-2 border-slate-300 p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  const prev = new Date(currentWeekStart)
                                  prev.setDate(prev.getDate() - 7)
                                  setCurrentWeekStart(prev)
                                }}
                                className="h-8"
                              >
                                ‹ Săptămâna anterioară
                              </Button>
                              <span className="font-bold text-slate-800">
                                {format(currentWeekStart, "dd MMM", { locale: ro })} - {format(addDays(currentWeekStart, 6), "dd MMM yyyy", { locale: ro })}
                              </span>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  const next = new Date(currentWeekStart)
                                  next.setDate(next.getDate() + 7)
                                  setCurrentWeekStart(next)
                                }}
                                className="h-8"
                              >
                                Săptămâna următoare ›
                              </Button>
                            </div>
                          </div>
                        </div>

                        {/* Grid săptămână */}
                        <div className="grid grid-cols-7 divide-x divide-slate-200">
                          {Array.from({ length: 7 }).map((_, dayOffset) => {
                            const dayDate = addDays(currentWeekStart, dayOffset)
                            const dayEvents = calendarEvents.filter(
                              (ev) =>
                                ev.date.getFullYear() === dayDate.getFullYear() &&
                                ev.date.getMonth() === dayDate.getMonth() &&
                                ev.date.getDate() === dayDate.getDate(),
                            )
                            const isToday = 
                              dayDate.getDate() === new Date().getDate() &&
                              dayDate.getMonth() === new Date().getMonth() &&
                              dayDate.getFullYear() === new Date().getFullYear()
                            const isWeekend = dayDate.getDay() === 0 || dayDate.getDay() === 6
                            const count = dayEvents.length

                            let color = "#10b981"
                            let colorDark = "#059669"
                            if (count > 2 && count <= 4) {
                              color = "#f59e0b"
                              colorDark = "#d97706"
                            } else if (count > 4) {
                              color = "#e11d48"
                              colorDark = "#be123c"
                            }

                            return (
                              <div
                                key={dayOffset}
                                className={`min-h-[400px] ${
                                  isToday ? "bg-blue-50" : isWeekend ? "bg-red-50/30" : "bg-white"
                                }`}
                              >
                                {/* Header zi */}
                                <div className={`p-3 border-b-2 ${
                                  isToday ? "bg-blue-500 text-white" : "bg-slate-100"
                                }`}>
                                  <div className={`text-xs font-semibold ${isToday ? "text-blue-100" : "text-slate-600"}`}>
                                    {format(dayDate, "EEEE", { locale: ro })}
                                  </div>
                                  <div className={`text-2xl font-bold ${isToday ? "text-white" : "text-slate-800"}`}>
                                    {dayDate.getDate()}
                                  </div>
                                  <div className={`text-xs ${isToday ? "text-blue-100" : "text-slate-600"}`}>
                                    {format(dayDate, "MMM yyyy", { locale: ro })}
                                  </div>
                                  {count > 0 && (
                                    <Badge 
                                      className="mt-2" 
                                      style={{ 
                                        backgroundColor: color,
                                        color: "white"
                                      }}
                                    >
                                      {count} {count === 1 ? "revizie" : "revizii"}
                                    </Badge>
                                  )}
                                </div>

                                {/* Lista evenimente zi */}
                                <div className="p-3 space-y-2">
                                  {dayEvents.length === 0 ? (
                                    <div className="text-center py-8 text-sm text-muted-foreground">
                                      Nicio revizie
                                    </div>
                                  ) : (
                                    dayEvents.map((ev) => (
                                      <div
                                        key={ev.id}
                                        className="p-3 rounded-lg border-2 bg-white hover:shadow-md transition-all cursor-pointer"
                                        style={{ borderColor: getColorForId(ev.contractId) + "40" }}
                                        onClick={() => {
                                          setSelectedDayEvents([ev])
                                          setSelectedDayDate(dayDate)
                                          setIsDayPanelOpen(true)
                                        }}
                                      >
                                        <div className="flex items-start gap-2">
                                          <div
                                            className="h-3 w-3 rounded shadow-sm flex-shrink-0 mt-0.5"
                                            style={{ backgroundColor: getColorForId(ev.contractId) }}
                                          />
                                          <div className="flex-1 min-w-0">
                                            <p className="font-bold text-sm text-slate-800">{ev.contractName}</p>
                                            {ev.contractNumber && (
                                              <p className="text-xs text-slate-600 mt-0.5">Nr: {ev.contractNumber}</p>
                                            )}
                                            {ev.locationName && (
                                              <p className="text-xs text-slate-600 mt-0.5">📍 {ev.locationName}</p>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    ))
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ) : null}
            </div>
          ) : (
            <>
              {/* Layout pentru căutare și filtrare */}
              <div className="flex flex-col sm:flex-row gap-2">
                <UniversalSearch 
                  onSearch={handleSearchChange} 
                  initialValue={searchText}
                  className="flex-1"
                  placeholder="Căutare contracte (nume, număr, client, locație)..."
                  dataTestId="contract-search"
                />
                <FilterButton
                  onClick={() => setIsFilterModalOpen(true)}
                  activeFilters={activeFilterCount}
                  dataTestId="contract-filter-button"
                />
                {activeFilterCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-10"
                    onClick={handleResetAllFiltersAndSearch}
                    data-testid="contract-reset-all"
                  >
                    Resetează tot
                  </Button>
                )}
              </div>

              <div className="text-sm text-muted-foreground" data-testid="contract-results-count">
                Afișate {filteredContracts.length} din {contracts.length} contracte
              </div>

              {showFilteredEmptyState ? (
                <div
                  className="text-center py-12 border rounded-lg bg-muted/20"
                  data-testid="contract-empty-filtered"
                >
                  <p className="text-muted-foreground">
                    Niciun contract nu corespunde filtrelor sau căutării curente.
                  </p>
                  <Button variant="outline" className="mt-4" onClick={handleResetAllFiltersAndSearch}>
                    Resetează filtrele și căutarea
                  </Button>
                </div>
              ) : (
              <div data-testid="contract-table">
              <DataTable
                columns={columns}
                data={filteredContracts as Contract[]}
                defaultSort={{ id: "createdAt", desc: true }}
                sorting={tableSorting}
                onSortingChange={handleSortingChange}
                onRowClick={(row) => router.push(`/dashboard/contracte/${row.id}`)}
                getRowClassName={(row) => {
                  const missing = !Array.isArray((row as any)?.equipmentIds) || ((row as any).equipmentIds?.length ?? 0) === 0
                  return missing ? "bg-red-100/70" : ""
                }}
                table={table}
                setTable={setTable}
                showFilters={false}
                persistenceKey="contracte"
              />
              </div>
              )}
            </>
          )}
        </div>
      )}

      <FilterModal
        isOpen={isFilterModalOpen}
        onClose={() => setIsFilterModalOpen(false)}
        title="Filtrare contracte"
        filterOptions={filterOptions}
        activeFilters={activeFilters as FilterOption[]}
        onApplyFilters={handleApplyFilters}
        onResetFilters={handleResetAllFiltersAndSearch}
      />

      {/* Panou detalii zi */}
      <Dialog open={isDayPanelOpen} onOpenChange={setIsDayPanelOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {selectedDayDate ? format(selectedDayDate, "EEEE, dd MMMM yyyy", { locale: ro }) : "Detalii zi"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-[70vh] overflow-y-auto">
            <div className="text-sm text-slate-600">
              {selectedDayEvents.length} {selectedDayEvents.length === 1 ? "revizie" : "revizii"} programate
            </div>
            {selectedDayEvents.length === 0 ? (
              <div className="text-sm text-muted-foreground">Nu există revizii în această zi.</div>
            ) : (
              <div className="space-y-2">
                {[...selectedDayEvents]
                  .sort((a, b) => a.contractName.localeCompare(b.contractName))
                  .map((ev) => (
                    <div
                      key={ev.id}
                      className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 bg-slate-50"
                    >
                      <div
                        className="h-3 w-3 rounded-full mt-1"
                        style={{ backgroundColor: getColorForId(ev.contractId) }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-semibold text-sm text-slate-800 truncate">{ev.contractName}</div>
                          {ev.contractNumber && (
                            <Badge variant="outline" className="font-mono text-xs">
                              {ev.contractNumber}
                            </Badge>
                          )}
                        </div>
                        {ev.locationName && (
                          <div className="text-xs text-slate-600 mt-1 truncate">📍 {ev.locationName}</div>
                        )}
                        <div className="flex items-center gap-2 mt-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8"
                            onClick={() => {
                              setIsDayPanelOpen(false)
                              router.push(`/dashboard/contracte/${ev.contractId}`)
                            }}
                          >
                            Vezi contract
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog pentru adăugarea unui contract nou */}
      <Dialog
        open={isAddDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            handleCloseDialog("add")
          } else {
            setIsAddDialogOpen(open)
          }
        }}
      >
        <DialogContent className="w-[calc(100%-2rem)] max-w-[900px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Adaugă Contract Nou</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {/* Rândul 1: Nume și Număr Contract pe 2 coloane */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="contractName">Nume Contract *</Label>
                <Input
                  id="contractName"
                  value={newContractName}
                  onChange={(e) => setNewContractName(e.target.value)}
                  placeholder="Introduceți numele contractului"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contractNumber">Număr Contract *</Label>
                <Input
                  id="contractNumber"
                  value={newContractNumber}
                  onChange={(e) => setNewContractNumber(e.target.value)}
                  placeholder="Introduceți numărul contractului"
                />
              </div>
            </div>

            {/* Rândul 2: Client și Locație */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="contractClient">Client Asignat (Opțional)</Label>
                <ClientSelectButton
                  clients={clients}
                  value={newContractClientId}
                  onValueChange={setNewContractClientId}
                  placeholder="Selectați clientul sau lăsați neasignat"
                />
              </div>
              {clientLocations.length > 0 && (
                <div className="space-y-2">
                  <Label>Locații</Label>
                  <MultiSelect
                    options={clientLocations.map((l) => ({ label: l.nume, value: l.nume }))}
                    selected={newContractLocationIds}
                    onChange={(vals) => {
                      setNewContractLocationIds(vals)
                      setNewContractLocationNames(vals)
                      // Recalculează echipamentele disponibile pentru locațiile selectate
                      try {
                        const selected = new Set(vals)
                        const nextEqs: Echipament[] = []
                        for (const loc of clientLocations) {
                          if (selected.has(loc.nume) && Array.isArray((loc as any).echipamente)) {
                            nextEqs.push(...((loc as any).echipamente as any[]))
                          }
                        }
                        setClientEquipments(nextEqs)
                        // Filtrează selecția curentă la echipamentele permise
                        if (Array.isArray(newContractEquipmentIds) && newContractEquipmentIds.length > 0) {
                          const allowed = new Set(nextEqs.map((eq: any) => eq.id || eq.cod))
                          const filtered = newContractEquipmentIds.filter((id) => allowed.has(id))
                          if (filtered.length !== newContractEquipmentIds.length) {
                            setNewContractEquipmentIds(filtered)
                          }
                        }
                      } catch {}
                    }}
                    placeholder="Selectați una sau mai multe locații"
                    emptyText="Clientul nu are locații"
                  />
                  <p className="text-xs text-gray-500">Selectați una sau mai multe locații pentru acest contract</p>
                </div>
              )}
            </div>

            {/* Echipamente - full width */}
            {(newContractLocationIds.length > 0 || newContractLocationId) && clientEquipments.length > 0 && (
              <div className="space-y-2">
                <Label>Echipamente</Label>
                <MultiSelect
                  options={clientEquipments.map((eq) => ({
                    label: `${eq.nume} (${eq.cod})`,
                    value: eq.id || eq.cod,
                  }))}
                  selected={newContractEquipmentIds}
                  onChange={setNewContractEquipmentIds}
                  placeholder="Selectați echipamentele"
                  emptyText="Nu există echipamente la această locație"
                />
              </div>
            )}

            {/* Recurența Reviziilor - 2 coloane */}
            <div className="space-y-2 border-t pt-4">
              <Label className="text-base font-semibold">Recurența Reviziilor</Label>
              
              {/* Data de început */}
              <div className="space-y-2">
                <Label htmlFor="startDate">Data de început (Prima revizie)</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Input
                      id="startDate_display"
                      value={startDateInput}
                      onChange={(e) => setStartDateInput(e.target.value)}
                      onBlur={(e) => {
                        const raw = e.target.value.trim()
                        if (!raw) {
                          setNewContractStartDate("")
                          setStartDateInput("")
                          return
                        }
                        const m = raw.match(/^(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{4})$/)
                        let d: Date | null = null
                        if (m) {
                          const day = parseInt(m[1], 10)
                          const month = parseInt(m[2], 10)
                          const year = parseInt(m[3], 10)
                          if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
                            d = new Date(year, month - 1, day)
                          }
                        } else {
                          const parsed = new Date(raw)
                          if (!isNaN(parsed.getTime())) d = parsed
                        }
                        if (!d || isNaN(d.getTime())) {
                          toast({
                            title: "Dată invalidă",
                            description: "Folosiți formatul zz.ll.aaaa, de exemplu 05.06.2020",
                            variant: "destructive",
                          })
                          if (newContractStartDate) {
                            const prev = toDateSafe(newContractStartDate)
                            setStartDateInput(prev ? formatUiDate(prev) : "")
                          } else {
                            setStartDateInput("")
                          }
                          return
                        }
                        const y = d.getFullYear()
                        const m2 = String(d.getMonth() + 1).padStart(2, "0")
                        const da = String(d.getDate()).padStart(2, "0")
                        const iso = `${y}-${m2}-${da}`
                        setNewContractStartDate(iso)
                        setStartDateInput(formatUiDate(d))
                      }}
                      placeholder="dd mmm yyyy"
                      className="text-left max-w-[260px]"
                    />
                  </PopoverTrigger>
                  <PopoverContent className="p-0 w-auto">
                    <CustomDatePicker
                      selectedDate={toDateSafe(newContractStartDate) || new Date()}
                      onDateChange={(date) => {
                        if (!date) {
                          setNewContractStartDate("")
                          setStartDateInput("")
                          return
                        }
                        const y = date.getFullYear()
                        const m = String(date.getMonth() + 1).padStart(2, "0")
                        const da = String(date.getDate()).padStart(2, "0")
                        const iso = `${y}-${m}-${da}`
                        setNewContractStartDate(iso)
                        setStartDateInput(formatUiDate(date))
                      }}
                      onClose={() => {}}
                    />
                  </PopoverContent>
                </Popover>
                <p className="text-xs text-gray-500">
                  Data primei revizii sau data de referință pentru calculul recurenței
                </p>
              {newContractStartDate && (
                <div className="text-xs flex items-center gap-2">
                  {startDateWorkload.loading ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
                      <span className="text-slate-600">Se verifică lucrările programate în această zi...</span>
                    </>
                  ) : startDateWorkload.error ? (
                    <span className="text-red-600">{startDateWorkload.error}</span>
                  ) : (
                    <span className="text-blue-700">
                      Pe {formatUiDate(toDateSafe(newContractStartDate)!)} există deja {startDateWorkload.count} lucrări (revizii) programate.
                    </span>
                  )}
                </div>
              )}
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="recurrenceInterval">Interval</Label>
                  <Input
                    id="recurrenceInterval"
                    type="text"
                    inputMode="numeric"
                    value={recurrenceIntervalInput}
                    onChange={(e) => {
                      const onlyDigits = e.target.value.replace(/\D+/g, "")
                      setRecurrenceIntervalInput(onlyDigits)
                      if (onlyDigits !== "") {
                        const parsed = parseInt(onlyDigits, 10)
                        if (!isNaN(parsed)) {
                          setNewContractRecurrenceInterval(parsed)
                        }
                      }
                    }}
                    placeholder="90"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="recurrenceUnit">Unitate</Label>
                  <Select value={newContractRecurrenceUnit} onValueChange={(value: 'zile' | 'luni') => setNewContractRecurrenceUnit(value)}>
                    <SelectTrigger id="recurrenceUnit">
                      <SelectValue placeholder="Selectați unitatea" />
                    </SelectTrigger>
                    <SelectContent>
                      {recurrenceUnits && recurrenceUnits.length > 0 ? (
                        recurrenceUnits.map((unit) => (
                          <SelectItem key={unit.id} value={unit.name}>
                            {unit.name}
                          </SelectItem>
                        ))
                      ) : (
                        <>
                          <SelectItem value="zile">zile</SelectItem>
                          <SelectItem value="luni">luni</SelectItem>
                        </>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              {/* Ziua din lună a fost eliminată */}
            </div>

            {/* Rândul pentru Zile înainte și Prețuri */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="daysBeforeWork">Zile înainte</Label>
                <Input
                  id="daysBeforeWork"
                  type="text"
                  inputMode="numeric"
                  value={daysBeforeWorkInput}
                  onChange={(e) => {
                    const onlyDigits = e.target.value.replace(/\D+/g, "")
                    setDaysBeforeWorkInput(onlyDigits)
                    if (onlyDigits !== "") {
                      const parsed = parseInt(onlyDigits, 10)
                      if (!isNaN(parsed)) {
                        setNewContractDaysBeforeWork(parsed)
                      }
                    }
                  }}
                  placeholder="10"
                />
                <p className="text-xs text-gray-500">
                  X zile înainte de data programată pentru revizie
                </p>
              </div>
              <div className="space-y-2">
                <Label>Prețuri Contract</Label>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsPricingDialogOpen(true)}
                  className="w-full justify-between"
                >
                  <span className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4" />
                    Adauga pret
                  </span>
                  {Object.keys(newContractPricing).length > 0 && (
                    <Badge variant="secondary">
                      {Object.keys(newContractPricing).length} prețuri setate
                    </Badge>
                  )}
                </Button>
                {Object.keys(newContractPricing).length > 0 && (
                  <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-1">
                    {Object.entries(newContractPricing).map(([name, value]) => (
                      <span
                        key={name}
                        className="inline-flex items-center gap-1 rounded border px-2 py-0.5 bg-muted"
                      >
                        <span>{name}:</span>
                        <span className="font-mono">{Number(value).toFixed(2)}</span>
                        <button
                          type="button"
                          className="ml-1 text-muted-foreground hover:text-foreground"
                          title="Șterge prețul"
                          onClick={() => {
                            setNewContractPricing((prev) => {
                              const next = { ...prev }
                              delete (next as any)[name]
                              return next
                            })
                          }}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Câmpuri dinamice din setări (legate la Dialog: Contract Nou) */}
            <DynamicDialogFields
              targetId="dialogs.contract.new"
              values={(newContract as any)?.customFields}
              onChange={(fieldKey, value) => {
                setNewContract((prev: any) => ({
                  ...(prev || {}),
                  customFields: { ...((prev as any)?.customFields || {}), [fieldKey]: value },
                }))
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => handleCloseDialog("add")}>
              Anulează
            </Button>
            <Button
              onClick={handleAddContract}
              disabled={isSubmitting || !newContractName || !newContractNumber}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Se procesează...
                </>
              ) : (
                "Adaugă"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog pentru editarea unui contract */}
      <Dialog
        open={isEditDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            handleCloseDialog("edit")
          } else {
            setIsEditDialogOpen(open)
          }
        }}
      >
        <DialogContent className="w-[calc(100%-2rem)] max-w-[900px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editează Contract</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <Alert className={isContractSuspended(selectedContract) ? "border-red-300 bg-red-50" : "border-green-300 bg-green-50"}>
              {isContractSuspended(selectedContract) ? (
                <PauseCircle className="h-4 w-4 text-red-600" />
              ) : (
                <PlayCircle className="h-4 w-4 text-green-600" />
              )}
              <AlertDescription
                className={isContractSuspended(selectedContract) ? "text-red-800" : "text-green-800"}
                data-testid="contract-edit-status"
              >
                Status contract: <strong>{isContractSuspended(selectedContract) ? "Suspendat" : "Activ"}</strong>
                {isContractSuspended(selectedContract)
                  ? ". Emiterea tichetelor noi și generarea automată a reviziilor sunt blocate."
                  : ". Contractul poate fi folosit pentru tichete noi și revizii automate."}
              </AlertDescription>
            </Alert>
            {/* Rândul 1: Nume și Număr Contract pe 2 coloane */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="editContractName">Nume Contract *</Label>
                <Input
                  id="editContractName"
                  value={newContractName}
                  onChange={(e) => setNewContractName(e.target.value)}
                  placeholder="Introduceți numele contractului"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="editContractNumber">Număr Contract *</Label>
                <Input
                  id="editContractNumber"
                  value={newContractNumber}
                  onChange={(e) => setNewContractNumber(e.target.value)}
                  placeholder="Introduceți numărul contractului"
                />
              </div>
            </div>

            {/* Rândul 2: Client și Locație */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="editContractClient">Client Asignat (Opțional)</Label>
                <ClientSelectButton
                  clients={clients}
                  value={newContractClientId}
                  onValueChange={setNewContractClientId}
                  placeholder="Selectați clientul sau lăsați neasignat"
                />
              </div>
              {clientLocations.length > 0 && (
                <div className="space-y-2">
                  <Label>Locații</Label>
                  <MultiSelect
                    options={clientLocations.map((l) => ({ label: l.nume, value: l.nume }))}
                    selected={newContractLocationIds}
                    onChange={(vals) => {
                      setNewContractLocationIds(vals)
                      setNewContractLocationNames(vals)
                      // Recalculează echipamentele disponibile pentru locațiile selectate
                      try {
                        const selected = new Set(vals)
                        const nextEqs: Echipament[] = []
                        for (const loc of clientLocations) {
                          if (selected.has(loc.nume) && Array.isArray((loc as any).echipamente)) {
                            nextEqs.push(...((loc as any).echipamente as any[]))
                          }
                        }
                        setClientEquipments(nextEqs)
                        // Filtrează selecția curentă la echipamentele permise
                        if (Array.isArray(newContractEquipmentIds) && newContractEquipmentIds.length > 0) {
                          const allowed = new Set(nextEqs.map((eq: any) => eq.id || eq.cod))
                          const filtered = newContractEquipmentIds.filter((id) => allowed.has(id))
                          if (filtered.length !== newContractEquipmentIds.length) {
                            setNewContractEquipmentIds(filtered)
                          }
                        }
                      } catch {}
                    }}
                    placeholder="Selectați una sau mai multe locații"
                    emptyText="Clientul nu are locații"
                  />
                  <p className="text-xs text-gray-500">Selectați una sau mai multe locații pentru acest contract</p>
                </div>
              )}
            </div>

            {/* Echipamente - full width */}
            {(newContractLocationIds.length > 0 || newContractLocationId) && clientEquipments.length > 0 && (
              <div className="space-y-2">
                <Label>Echipamente</Label>
                <MultiSelect
                  options={clientEquipments.map((eq) => ({
                    label: `${eq.nume} (${eq.cod})`,
                    value: eq.id || eq.cod,
                  }))}
                  selected={newContractEquipmentIds}
                  onChange={setNewContractEquipmentIds}
                  placeholder="Selectați echipamentele"
                  emptyText="Nu există echipamente la această locație"
                />
              </div>
            )}

            {/* Recurența Reviziilor - 2 coloane */}
            <div className="space-y-2 border-t pt-4">
              <Label className="text-base font-semibold">Recurența Reviziilor</Label>
              
              {/* Data de început */}
              <div className="space-y-2">
                <Label htmlFor="editStartDate">Data de început (Prima revizie)</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Input
                      id="editStartDate_display"
                      value={startDateInput}
                      onChange={(e) => setStartDateInput(e.target.value)}
                      onBlur={(e) => {
                        const raw = e.target.value.trim()
                        if (!raw) {
                          setNewContractStartDate("")
                          setStartDateInput("")
                          return
                        }
                        const m = raw.match(/^(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{4})$/)
                        let d: Date | null = null
                        if (m) {
                          const day = parseInt(m[1], 10)
                          const month = parseInt(m[2], 10)
                          const year = parseInt(m[3], 10)
                          if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
                            d = new Date(year, month - 1, day)
                          }
                        } else {
                          const parsed = new Date(raw)
                          if (!isNaN(parsed.getTime())) d = parsed
                        }
                        if (!d || isNaN(d.getTime())) {
                          toast({
                            title: "Dată invalidă",
                            description: "Folosiți formatul zz.ll.aaaa, de exemplu 05.06.2020",
                            variant: "destructive",
                          })
                          if (newContractStartDate) {
                            const prev = toDateSafe(newContractStartDate)
                            setStartDateInput(prev ? formatUiDate(prev) : "")
                          } else {
                            setStartDateInput("")
                          }
                          return
                        }
                        const y = d.getFullYear()
                        const m2 = String(d.getMonth() + 1).padStart(2, "0")
                        const da = String(d.getDate()).padStart(2, "0")
                        const iso = `${y}-${m2}-${da}`
                        setNewContractStartDate(iso)
                        setStartDateInput(formatUiDate(d))
                      }}
                      placeholder="dd mmm yyyy"
                      className="text-left max-w-[260px]"
                    />
                  </PopoverTrigger>
                  <PopoverContent className="p-0 w-auto">
                    <CustomDatePicker
                      selectedDate={toDateSafe(newContractStartDate) || new Date()}
                      onDateChange={(date) => {
                        if (!date) {
                          setNewContractStartDate("")
                          setStartDateInput("")
                          return
                        }
                        const y = date.getFullYear()
                        const m = String(date.getMonth() + 1).padStart(2, "0")
                        const da = String(date.getDate()).padStart(2, "0")
                        const iso = `${y}-${m}-${da}`
                        setNewContractStartDate(iso)
                        setStartDateInput(formatUiDate(date))
                      }}
                      onClose={() => {}}
                    />
                  </PopoverContent>
                </Popover>
                <p className="text-xs text-gray-500">
                  Data primei revizii sau data de referință pentru calculul recurenței
                </p>
              {newContractStartDate && (
                <div className="text-xs flex items-center gap-2">
                  {startDateWorkload.loading ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
                      <span className="text-slate-600">Se verifică lucrările programate în această zi...</span>
                    </>
                  ) : startDateWorkload.error ? (
                    <span className="text-red-600">{startDateWorkload.error}</span>
                  ) : (
                    <span className="text-blue-700">
                      Pe {formatUiDate(toDateSafe(newContractStartDate)!)} există deja {startDateWorkload.count} lucrări (revizii) programate.
                    </span>
                  )}
                </div>
              )}
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="editRecurrenceInterval">Interval</Label>
                  <Input
                    id="editRecurrenceInterval"
                    type="text"
                    inputMode="numeric"
                    value={recurrenceIntervalInput}
                    onChange={(e) => {
                      const onlyDigits = e.target.value.replace(/\D+/g, "")
                      setRecurrenceIntervalInput(onlyDigits)
                      if (onlyDigits !== "") {
                        const parsed = parseInt(onlyDigits, 10)
                        if (!isNaN(parsed)) {
                          setNewContractRecurrenceInterval(parsed)
                        }
                      }
                    }}
                    placeholder="90"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="editRecurrenceUnit">Unitate</Label>
                  <Select value={newContractRecurrenceUnit} onValueChange={(value: 'zile' | 'luni') => setNewContractRecurrenceUnit(value)}>
                    <SelectTrigger id="editRecurrenceUnit">
                      <SelectValue placeholder="Selectați unitatea" />
                    </SelectTrigger>
                    <SelectContent>
                      {recurrenceUnits && recurrenceUnits.length > 0 ? (
                        recurrenceUnits.map((unit) => (
                          <SelectItem key={unit.id} value={unit.name}>
                            {unit.name}
                          </SelectItem>
                        ))
                      ) : (
                        <>
                          <SelectItem value="zile">zile</SelectItem>
                          <SelectItem value="luni">luni</SelectItem>
                        </>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              {/* Ziua din lună a fost eliminată */}
            </div>

            {/* Rândul pentru Zile înainte și Prețuri */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="editDaysBeforeWork">Zile înainte</Label>
                <Input
                  id="editDaysBeforeWork"
                  type="text"
                  inputMode="numeric"
                  value={daysBeforeWorkInput}
                  onChange={(e) => {
                    const onlyDigits = e.target.value.replace(/\D+/g, "")
                    setDaysBeforeWorkInput(onlyDigits)
                    if (onlyDigits !== "") {
                      const parsed = parseInt(onlyDigits, 10)
                      if (!isNaN(parsed)) {
                        setNewContractDaysBeforeWork(parsed)
                      }
                    }
                  }}
                  placeholder="10"
                />
                <p className="text-xs text-gray-500">
                  X zile înainte de data programată pentru revizie
                </p>
              </div>
              <div className="space-y-2">
                <Label>Prețuri Contract</Label>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsPricingDialogOpen(true)}
                  className="w-full justify-between"
                >
                  <span className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4" />
                    Adauga pret
                  </span>
                  {Object.keys(newContractPricing).length > 0 && (
                    <Badge variant="secondary">
                      {Object.keys(newContractPricing).length} prețuri setate
                    </Badge>
                  )}
                </Button>
                {Object.keys(newContractPricing).length > 0 && (
                  <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-1">
                    {Object.entries(newContractPricing).map(([name, value]) => (
                      <span
                        key={name}
                        className="inline-flex items-center gap-1 rounded border px-2 py-0.5 bg-muted"
                      >
                        <span>{name}:</span>
                        <span className="font-mono">{Number(value).toFixed(2)}</span>
                        <button
                          type="button"
                          className="ml-1 text-muted-foreground hover:text-foreground"
                          title="Șterge prețul"
                          onClick={() => {
                            setNewContractPricing((prev) => {
                              const next = { ...prev }
                              delete (next as any)[name]
                              return next
                            })
                          }}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Câmpuri dinamice din setări (legate la Dialog: Editare Contract) */}
            <DynamicDialogFields
              targetId="dialogs.contract.new"
              values={(newContract as any)?.customFields}
              onChange={(fieldKey, value) => {
                setNewContract((prev: any) => ({
                  ...(prev || {}),
                  customFields: { ...((prev as any)?.customFields || {}), [fieldKey]: value },
                }))
              }}
            />
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              <Button
                type="button"
                variant="secondary"
                onClick={handleViewRevisionCalendarFromEdit}
                data-testid="contract-edit-view-calendar"
                className="w-full sm:w-auto"
              >
                <Calendar className="mr-2 h-4 w-4" />
                Vezi calendar revizii
              </Button>
              <Button
                type="button"
                variant={isContractSuspended(selectedContract) ? "outline" : "destructive"}
                onClick={() => setIsStatusDialogOpen(true)}
                data-testid="contract-edit-toggle-status"
                disabled={isSubmitting}
                className="w-full sm:w-auto"
              >
                {isContractSuspended(selectedContract) ? (
                  <PlayCircle className="mr-2 h-4 w-4" />
                ) : (
                  <PauseCircle className="mr-2 h-4 w-4" />
                )}
                {isContractSuspended(selectedContract) ? "Reactivează contractul" : "Suspendă contractul"}
              </Button>
            </div>
            <div className="flex w-full gap-2 sm:w-auto sm:justify-end">
            <Button variant="outline" onClick={() => handleCloseDialog("edit")}>
              Anulează
            </Button>
            <Button
              onClick={handleEditContract}
              disabled={isSubmitting || !newContractName || !newContractNumber}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Se procesează...
                </>
              ) : (
                "Salvează"
              )}
            </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isStatusDialogOpen} onOpenChange={setIsStatusDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isContractSuspended(selectedContract) ? "Reactivați contractul?" : "Suspendați contractul?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isContractSuspended(selectedContract)
                ? "Contractul va putea fi folosit din nou pentru tichete noi și pentru generarea viitoare a reviziilor."
                : "Nu se vor mai putea emite tichete noi pe acest contract, iar reviziile automate viitoare nu vor fi generate. Tichetele existente rămân neschimbate."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>Anulează</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault()
                void handleContractStatusChange()
              }}
              disabled={isSubmitting}
              data-testid="contract-confirm-toggle-status"
              className={isContractSuspended(selectedContract) ? "" : "bg-red-600 hover:bg-red-700"}
            >
              {isSubmitting ? "Se procesează..." : isContractSuspended(selectedContract) ? "Reactivează" : "Suspendă"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog pentru ștergerea unui contract */}
      <Dialog
        open={isDeleteDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            handleCloseDialog("delete")
          } else {
            setIsDeleteDialogOpen(open)
          }
        }}
      >
        <DialogContent className="w-[calc(100%-2rem)] max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Șterge Contract</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p>
              Sunteți sigur că doriți să ștergeți contractul <strong>{selectedContract?.name}</strong> cu numărul{" "}
              <strong>{selectedContract?.number}</strong>?
            </p>
            <p className="text-red-600 mt-2">Această acțiune nu poate fi anulată.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => handleCloseDialog("delete")}>
              Anulează
            </Button>
            <Button variant="destructive" onClick={handleDeleteContract} disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Se procesează...
                </>
              ) : (
                "Șterge"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={showCloseAlert} onOpenChange={setShowCloseAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmați închiderea</AlertDialogTitle>
            <AlertDialogDescription>
              Aveți modificări nesalvate. Sunteți sigur că doriți să închideți formularul? Toate modificările vor fi
              pierdute.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowCloseAlert(false)}>Nu, rămân în formular</AlertDialogCancel>
            <AlertDialogAction onClick={confirmCloseDialog}>Da, închide formularul</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog pentru prețuri */}
      <ContractPricingDialog
        open={isPricingDialogOpen}
        onOpenChange={setIsPricingDialogOpen}
        pricing={newContractPricing}
        onSave={setNewContractPricing}
        customFields={newContractPricingCustomFields}
        onCustomFieldsChange={setNewContractPricingCustomFields}
      />
    </DashboardShell>
    </TooltipProvider>
  )
}
