"use client"

import { useState, useEffect, useMemo } from "react"
import { DashboardHeader } from "@/components/dashboard-header"
import { DashboardShell } from "@/components/dashboard-shell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { DataTable } from "@/components/data-table/data-table"
import { EnhancedFilterSystem } from "@/components/data-table/enhanced-filter-system"
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
  getDoc,
} from "firebase/firestore"
import { db } from "@/lib/firebase/config"
import { addUserLogEntry } from "@/lib/firebase/firestore"
import { Plus, Pencil, Trash2, Loader2, AlertCircle, MoreHorizontal, FileText, DollarSign } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { toast } from "@/components/ui/use-toast"
import { DynamicDialogFields } from "@/components/DynamicDialogFields"
import { format } from "date-fns"
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
import { getClienti, isContractAvailableForClient, validateContractAssignment, type Echipament, type Locatie } from "@/lib/firebase/firestore"
import { ClientSelectButton } from "@/components/client-select-button"
import { MultiSelect, type Option } from "@/components/ui/multi-select"
import { ContractPricingDialog } from "@/components/contract-pricing-dialog"
import { useTargetList, useTargetValue } from "@/hooks/use-settings"
import { subscribeToSettingsByTarget, subscribeToSettings } from "@/lib/firebase/settings"
import type { Setting } from "@/types/settings"
import { getPredefinedSettingValue } from "@/lib/firebase/predefined-settings"

interface Contract {
  id: string
  name: string
  number: string
  type?: string // Legacy field
  clientId?: string
  locationId?: string
  locationName?: string
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
}

interface Client {
  id: string
  nume: string
}

export default function ContractsPage() {
  const [contracts, setContracts] = useState<Contract[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)

  const [newContractName, setNewContractName] = useState("")
  const [newContractNumber, setNewContractNumber] = useState("")
  const [newContractClientId, setNewContractClientId] = useState("UNASSIGNED")
  const [newContractLocationId, setNewContractLocationId] = useState("")
  const [newContractLocationName, setNewContractLocationName] = useState("")
  const [newContractEquipmentIds, setNewContractEquipmentIds] = useState<string[]>([])
  const [newContractStartDate, setNewContractStartDate] = useState<string>("")
  const [newContractRecurrenceInterval, setNewContractRecurrenceInterval] = useState<number>(90)
  const [newContractRecurrenceUnit, setNewContractRecurrenceUnit] = useState<'zile' | 'luni'>('zile')
  const [newContractRecurrenceDayOfMonth, setNewContractRecurrenceDayOfMonth] = useState<number>(1)
  const [newContractDaysBeforeWork, setNewContractDaysBeforeWork] = useState<number>(10)
  const [newContractPricing, setNewContractPricing] = useState<Record<string, number>>({})
  const [newContractPricingCustomFields, setNewContractPricingCustomFields] = useState<Record<string, any>>({})
  const [isPricingDialogOpen, setIsPricingDialogOpen] = useState(false)
  const [newContract, setNewContract] = useState<any>({})
  const [clientLocations, setClientLocations] = useState<Locatie[]>([])
  const [clientEquipments, setClientEquipments] = useState<Echipament[]>([])
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  
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
    }
    loadDefaultDays()
  }, [])

  const [showCloseAlert, setShowCloseAlert] = useState(false)
  const [activeDialog, setActiveDialog] = useState<"add" | "edit" | "delete" | null>(null)

  // State pentru câmpurile dinamice din setări
  const [dynamicFieldsParents, setDynamicFieldsParents] = useState<Setting[]>([])
  const [dynamicFieldsChildren, setDynamicFieldsChildren] = useState<Record<string, Setting[]>>({})

  // State pentru tabelul avansat
  const [table, setTable] = useState<any>(null)
  const [tableSorting, setTableSorting] = useState([{ id: "createdAt", desc: true }])
  const [searchText, setSearchText] = useState("")
  const [activeFilters, setActiveFilters] = useState<any[]>([])
  const [columnOptions, setColumnOptions] = useState<any[]>([])

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

  // Handler-ele pentru filtre au fost eliminate - EnhancedFilterSystem gestionează persistența automat

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

  // Setăm search-ul global în tabel când se schimbă searchText
  useEffect(() => {
    if (table && searchText !== undefined) {
      table.setGlobalFilter(searchText)
    }
  }, [table, searchText])

  // Forțăm aplicarea search-ului când table-ul devine disponibil și avem searchText salvat
  useEffect(() => {
    if (table && searchText.trim() && !loading) {
      // Mic delay pentru a se asigura că table-ul este complet inițializat
      const timeoutId = setTimeout(() => {
        table.setGlobalFilter(searchText)
      }, 100)

      return () => clearTimeout(timeoutId)
    }
  }, [table, searchText, loading])

  // Persistența filtrelor este acum gestionată automat de EnhancedFilterSystem

  // Generăm coloanele dinamice bazate pe câmpurile din setări
  const dynamicColumns = useMemo(() => {
    const cols: ColumnDef<Contract>[] = []
    
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
          enableFiltering: true,
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
  const columns: ColumnDef<Contract>[] = useMemo(() => [
    {
      accessorKey: "name",
      header: "Nume Contract",
      enableHiding: true,
      enableSorting: true,
      enableFiltering: true,
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
      enableFiltering: true,
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
      enableFiltering: true,
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
      enableFiltering: true,
      cell: ({ row }) => {
        const locatie = row.original.locatie
        
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
      accessorKey: "createdAt",
      header: "Data Adăugării",
      enableHiding: true,
      enableSorting: true,
      enableFiltering: true,
      cell: ({ row }) => {
        const date = row.original.createdAt
        if (!date) return "N/A"
        
        try {
          const dateObj = date.toDate ? date.toDate() : new Date(date)
          return (
            <div className="text-sm">
              {format(dateObj, "dd.MM.yyyy", { locale: ro })}
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
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant="outline" 
                size="icon" 
                className="h-8 w-8 text-blue-600"
                onClick={() => openEditDialog(row.original)}
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
                onClick={() => openDeleteDialog(row.original)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Șterge</TooltipContent>
          </Tooltip>
        </div>
      ),
    },
  ], [clients, dynamicColumns])

  // Încărcăm contractele și clienții din Firestore
  useEffect(() => {
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

  // Încărcăm echipamentele când se schimbă locația selectată
  useEffect(() => {
    if (!newContractLocationId) {
      setClientEquipments([])
      setNewContractEquipmentIds([])
      return
    }

    const selectedLocation = clientLocations.find(loc => loc.nume === newContractLocationId)
    if (selectedLocation && selectedLocation.echipamente) {
      setClientEquipments(selectedLocation.echipamente)
    } else {
      setClientEquipments([])
    }
  }, [newContractLocationId, clientLocations])

  // Inițializare valoare default pentru daysBeforeWork
  useEffect(() => {
    if (defaultDaysBeforeWork && !isEditDialogOpen) {
      const defaultValue = parseInt(defaultDaysBeforeWork as string, 10)
      if (!isNaN(defaultValue)) {
        setNewContractDaysBeforeWork(defaultValue)
      }
    }
  }, [defaultDaysBeforeWork, isEditDialogOpen])

  // Funcție pentru adăugarea unui contract nou
  const handleAddContract = async () => {
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
        createdAt: serverTimestamp(),
        ...(newContract?.customFields ? { customFields: newContract.customFields } : {}),
      }

      // Adăugăm clientId doar dacă este selectat și nu este "UNASSIGNED"
      if (newContractClientId && newContractClientId !== "UNASSIGNED") {
        contractData.clientId = newContractClientId
        
        // Adăugăm locația și echipamentele dacă sunt selectate
        if (newContractLocationId) {
          contractData.locationId = newContractLocationId
          contractData.locationName = newContractLocationName
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
        // Adăugăm ziua din lună doar pentru recurență lunară
        if (newContractRecurrenceUnit === 'luni') {
          contractData.recurrenceDayOfMonth = newContractRecurrenceDayOfMonth
        }
      }

      // Adăugăm prețurile dacă sunt setate
      if (Object.keys(newContractPricing).length > 0) {
        contractData.pricing = newContractPricing
      }

      const docRef = await addDoc(collection(db, "contracts"), contractData)

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
    } finally {
      setIsSubmitting(false)
    }
  }

  // Funcție pentru editarea unui contract
  const handleEditContract = async () => {
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

      // Gestionăm clientId - poate fi null pentru neasignat
      if (newContractClientId && newContractClientId !== "UNASSIGNED") {
        updateData.clientId = newContractClientId
        
        // Gestionăm locația și echipamentele
        if (newContractLocationId) {
          updateData.locationId = newContractLocationId
          updateData.locationName = newContractLocationName
        } else {
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
        // Adăugăm ziua din lună doar pentru recurență lunară
        if (newContractRecurrenceUnit === 'luni') {
          updateData.recurrenceDayOfMonth = newContractRecurrenceDayOfMonth
        } else {
          updateData.recurrenceDayOfMonth = null
        }
      } else {
        updateData.startDate = null
        updateData.recurrenceInterval = null
        updateData.recurrenceUnit = null
        updateData.recurrenceDayOfMonth = null
        updateData.daysBeforeWork = null
      }

      // Gestionăm prețurile
      if (Object.keys(newContractPricing).length > 0) {
        updateData.pricing = newContractPricing
      } else {
        updateData.pricing = {}
      }

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

  // Funcție pentru ștergerea unui contract
  const handleDeleteContract = async () => {
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
    setSelectedContract(contract)
    setNewContractName(contract.name)
    setNewContractNumber(contract.number)
    setNewContractClientId(contract.clientId || "UNASSIGNED")
    setNewContractLocationId(contract.locationId || "")
    setNewContractLocationName(contract.locationName || "")
    setNewContractEquipmentIds(contract.equipmentIds || [])
    setNewContractStartDate(contract.startDate || "")
    setNewContractRecurrenceInterval(contract.recurrenceInterval || 90)
    setNewContractRecurrenceUnit(contract.recurrenceUnit || "zile")
    setNewContractRecurrenceDayOfMonth(contract.recurrenceDayOfMonth || 1)
    setNewContractDaysBeforeWork(contract.daysBeforeWork || 10)
    setNewContractPricing(contract.pricing || {})
    
    // Încărcăm locațiile și echipamentele clientului dacă există un client asignat
    if (contract.clientId) {
      try {
        const clientsList = await getClienti()
        const selectedClient = clientsList.find(c => c.id === contract.clientId)
        
        if (selectedClient && selectedClient.locatii) {
          setClientLocations(selectedClient.locatii)
          
          // Încărcăm echipamentele pentru locația selectată
          if (contract.locationId) {
            const selectedLocation = selectedClient.locatii.find(loc => loc.nume === contract.locationId)
            if (selectedLocation && selectedLocation.echipamente) {
              setClientEquipments(selectedLocation.echipamente)
            }
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
    if (dialogType === "add" && (newContractName || newContractNumber || newContractLocationId || newContractEquipmentIds.length > 0 || (newContractClientId && newContractClientId !== "UNASSIGNED"))) {
      setActiveDialog(dialogType)
      setShowCloseAlert(true)
    } else if (
      dialogType === "edit" &&
      (newContractName !== selectedContract?.name ||
        newContractNumber !== selectedContract?.number ||
        newContractLocationId !== (selectedContract?.locationId || "") ||
        JSON.stringify(newContractEquipmentIds) !== JSON.stringify(selectedContract?.equipmentIds || []) ||
        newContractStartDate !== (selectedContract?.startDate || "") ||
        newContractRecurrenceInterval !== (selectedContract?.recurrenceInterval || 90) ||
        newContractRecurrenceUnit !== (selectedContract?.recurrenceUnit || "zile") ||
        newContractRecurrenceDayOfMonth !== (selectedContract?.recurrenceDayOfMonth || 1) ||
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
    setNewContractEquipmentIds([])
    setNewContractStartDate("")
    setNewContractRecurrenceInterval(90)
    setNewContractRecurrenceUnit("zile")
    setNewContractRecurrenceDayOfMonth(1)
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
      <DashboardHeader heading="Contracte" text="Gestionați contractele din sistem">
        <Button onClick={() => setIsAddDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Adaugă Contract
        </Button>
      </DashboardHeader>

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
          <Button onClick={() => setIsAddDialogOpen(true)} className="mt-4">
            <Plus className="mr-2 h-4 w-4" /> Adaugă primul contract
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Layout pentru căutare și filtrare */}
          <div className="flex flex-col sm:flex-row gap-2">
            <UniversalSearch 
              onSearch={handleSearchChange} 
              initialValue={searchText}
              className="flex-1"
              placeholder="Căutare contracte..."
            />
            {/* EnhancedFilterSystem se va randa cu propriul său buton de filtrare */}
            {table && <EnhancedFilterSystem table={table} persistenceKey="contracte" />}
          </div>
          
          {/* Tabelul de contracte */}
          <DataTable
            columns={columns}
            data={sortedContracts}
            defaultSort={{ id: "createdAt", desc: true }}
            sorting={tableSorting}
            onSortingChange={handleSortingChange}
            table={table}
            setTable={setTable}
            showFilters={false}
            persistenceKey="contracte"
          />
        </div>
      )}

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
                  <Label htmlFor="contractLocatie">Locație</Label>
                  <Select value={newContractLocationId} onValueChange={(value) => {
                    setNewContractLocationId(value)
                    setNewContractLocationName(value)
                  }}>
                    <SelectTrigger id="contractLocatie">
                      <SelectValue placeholder="Selectați locația pentru acest contract" />
                    </SelectTrigger>
                    <SelectContent>
                      {clientLocations.map((locatie) => (
                        <SelectItem key={locatie.nume} value={locatie.nume}>
                          {locatie.nume}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-gray-500">Selectați locația pentru care se aplică contractul</p>
                </div>
              )}
            </div>

            {/* Echipamente - full width */}
            {newContractLocationId && clientEquipments.length > 0 && (
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
                <Input
                  id="startDate"
                  type="date"
                  value={newContractStartDate}
                  onChange={(e) => setNewContractStartDate(e.target.value)}
                  placeholder="Selectați data"
                />
                <p className="text-xs text-gray-500">
                  Data primei revizii sau data de referință pentru calculul recurenței
                </p>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="recurrenceInterval">Interval</Label>
                  <Input
                    id="recurrenceInterval"
                    type="number"
                    min="1"
                    value={newContractRecurrenceInterval}
                    onChange={(e) => setNewContractRecurrenceInterval(parseInt(e.target.value) || 90)}
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
              
              {/* Ziua din lună - doar pentru recurență lunară */}
              {newContractRecurrenceUnit === 'luni' && (
                <div className="space-y-2 mt-4">
                  <Label htmlFor="recurrenceDayOfMonth">Ziua din lună</Label>
                  <Select 
                    value={newContractRecurrenceDayOfMonth.toString()} 
                    onValueChange={(value) => setNewContractRecurrenceDayOfMonth(parseInt(value))}
                  >
                    <SelectTrigger id="recurrenceDayOfMonth">
                      <SelectValue placeholder="Selectați ziua" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[200px]">
                      {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                        <SelectItem key={day} value={day.toString()}>
                          {day}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-gray-500">
                    Revizia va fi programată în această zi a lunii
                  </p>
                </div>
              )}
            </div>

            {/* Rândul pentru Zile înainte și Prețuri */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="daysBeforeWork">Zile înainte</Label>
                <Input
                  id="daysBeforeWork"
                  type="number"
                  min="1"
                  value={newContractDaysBeforeWork}
                  onChange={(e) => setNewContractDaysBeforeWork(parseInt(e.target.value) || 10)}
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
                    Setează Prețurile
                  </span>
                  {Object.keys(newContractPricing).length > 0 && (
                    <Badge variant="secondary">
                      {Object.keys(newContractPricing).length} prețuri setate
                    </Badge>
                  )}
                </Button>
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
                  <Label htmlFor="editContractLocatie">Locație</Label>
                  <Select value={newContractLocationId} onValueChange={(value) => {
                    setNewContractLocationId(value)
                    setNewContractLocationName(value)
                  }}>
                    <SelectTrigger id="editContractLocatie">
                      <SelectValue placeholder="Selectați locația pentru acest contract" />
                    </SelectTrigger>
                    <SelectContent>
                      {clientLocations.map((locatie) => (
                        <SelectItem key={locatie.nume} value={locatie.nume}>
                          {locatie.nume}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-gray-500">Selectați locația pentru care se aplică contractul</p>
                </div>
              )}
            </div>

            {/* Echipamente - full width */}
            {newContractLocationId && clientEquipments.length > 0 && (
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
                <Input
                  id="editStartDate"
                  type="date"
                  value={newContractStartDate}
                  onChange={(e) => setNewContractStartDate(e.target.value)}
                  placeholder="Selectați data"
                />
                <p className="text-xs text-gray-500">
                  Data primei revizii sau data de referință pentru calculul recurenței
                </p>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="editRecurrenceInterval">Interval</Label>
                  <Input
                    id="editRecurrenceInterval"
                    type="number"
                    min="1"
                    value={newContractRecurrenceInterval}
                    onChange={(e) => setNewContractRecurrenceInterval(parseInt(e.target.value) || 90)}
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
              
              {/* Ziua din lună - doar pentru recurență lunară */}
              {newContractRecurrenceUnit === 'luni' && (
                <div className="space-y-2 mt-4">
                  <Label htmlFor="editRecurrenceDayOfMonth">Ziua din lună</Label>
                  <Select 
                    value={newContractRecurrenceDayOfMonth.toString()} 
                    onValueChange={(value) => setNewContractRecurrenceDayOfMonth(parseInt(value))}
                  >
                    <SelectTrigger id="editRecurrenceDayOfMonth">
                      <SelectValue placeholder="Selectați ziua" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[200px]">
                      {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                        <SelectItem key={day} value={day.toString()}>
                          {day}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-gray-500">
                    Revizia va fi programată în această zi a lunii
                  </p>
                </div>
              )}
            </div>

            {/* Rândul pentru Zile înainte și Prețuri */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="editDaysBeforeWork">Zile înainte</Label>
                <Input
                  id="editDaysBeforeWork"
                  type="number"
                  min="1"
                  value={newContractDaysBeforeWork}
                  onChange={(e) => setNewContractDaysBeforeWork(parseInt(e.target.value) || 10)}
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
                    Setează Prețurile
                  </span>
                  {Object.keys(newContractPricing).length > 0 && (
                    <Badge variant="secondary">
                      {Object.keys(newContractPricing).length} prețuri setate
                    </Badge>
                  )}
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
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
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
