"use client"

import { DialogTrigger } from "@/components/ui/dialog"
import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { DashboardHeader } from "@/components/dashboard-header"
import { DashboardShell } from "@/components/dashboard-shell"
import { format, parse, isAfter, isBefore } from "date-fns"
import { ro } from "date-fns/locale"
import { FileText, Eye, Pencil, Trash2, Loader2, AlertCircle, Plus, Mail, Check, Info, RefreshCw } from "lucide-react"
import { useMediaQuery } from "@/hooks/use-media-query"
import { useFirebaseCollection } from "@/hooks/use-firebase-collection"
import { addLucrare, deleteLucrare, updateLucrare, getLucrareById } from "@/lib/firebase/firestore"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { orderBy } from "firebase/firestore"
import { useAuth } from "@/contexts/AuthContext"
import { LucrareForm, type LucrareFormRef } from "@/components/lucrare-form"
import { DataTable } from "@/components/data-table/data-table"
import { useTablePersistence } from "@/hooks/use-table-persistence"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { doc, getDoc } from "firebase/firestore"
import { db } from "@/lib/firebase/config"
import { toast } from "@/components/ui/use-toast"
import { UniversalSearch } from "@/components/universal-search"
import { FilterButton } from "@/components/filter-button"
import { FilterModal, type FilterOption } from "@/components/filter-modal"
import { ColumnSelectionButton } from "@/components/column-selection-button"
import { ColumnSelectionModal } from "@/components/column-selection-modal"
import { sendWorkOrderNotifications } from "@/components/work-order-notification-service"
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
import {
  getWorkStatusClass,
  getWorkStatusRowClass,
  getInvoiceStatusClass,
  getWorkTypeClass,
  getEquipmentStatusClass,
} from "@/lib/utils/constants"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const ContractDisplay = ({ contractId }) => {
  const [contractNumber, setContractNumber] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchContract = async () => {
      if (!contractId) {
        setContractNumber(null)
        setLoading(false)
        return
      }

      try {
        const contractRef = doc(db, "contracts", contractId)
        const contractSnap = await getDoc(contractRef)

        if (contractSnap.exists()) {
          setContractNumber(contractSnap.data().number || null)
        } else {
          setContractNumber(null)
        }
      } catch (error) {
        console.error("Eroare la încărcarea contractului:", error)
        setContractNumber(null)
      } finally {
        setLoading(false)
      }
    }

    fetchContract()
  }, [contractId])

  if (loading) {
    return <span className="text-gray-400">Se încarcă...</span>
  }

  return <span>{contractNumber || "N/A"}</span>
}

export default function Lucrari() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const editId = searchParams.get("edit")
  const { userData } = useAuth()
  const isTechnician = userData?.role === "tehnician"
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [editLucrareId, setEditLucrareId] = useState<string | null>(null)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [lucrareToDelete, setLucrareToDelete] = useState<string | null>(null)
  const [isReassignment, setIsReassignment] = useState(false)
  const [originalWorkOrderId, setOriginalWorkOrderId] = useState(null)
  const [dataEmiterii, setDataEmiterii] = useState<Date | undefined>(new Date())
  const [dataInterventie, setDataInterventie] = useState<Date | undefined>(new Date())
  const [activeTab, setActiveTab] = useState("tabel")
  const [selectedLucrare, setSelectedLucrare] = useState(null)
  const [formData, setFormData] = useState({
    tipLucrare: "",
    tehnicieni: [],
    client: "",
    locatie: "",
    descriere: "",
    persoanaContact: "",
    telefon: "",
    statusLucrare: "Listată",
    statusFacturare: "Nefacturat",
    contract: "",
    defectReclamat: "",
    echipament: "",
    echipamentId: "",
    echipamentCod: "",
    persoaneContact: [],
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState([])
  const [tableInstance, setTableInstance] = useState(null)
  const [searchText, setSearchText] = useState("")
  const [filteredData, setFilteredData] = useState([])
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false)
  const [activeFilters, setActiveFilters] = useState<FilterOption[]>([])
  const [isColumnModalOpen, setIsColumnModalOpen] = useState(false)
  const [columnOptions, setColumnOptions] = useState<any[]>([])
  const [showCloseAlert, setShowCloseAlert] = useState(false)
  const addFormRef = useRef<LucrareFormRef>(null)
  const editFormRef = useRef<LucrareFormRef>(null)

  // Persistența tabelului
  const { loadSettings, saveFilters, saveColumnVisibility, saveSorting } = useTablePersistence("lucrari")

  // State pentru sorting persistent
  const [tableSorting, setTableSorting] = useState([{ id: "updatedAt", desc: true }])

  // Încărcăm setările salvate la inițializare
  useEffect(() => {
    const savedSettings = loadSettings()
    if (savedSettings.activeFilters) {
      setActiveFilters(savedSettings.activeFilters)
    }
    if (savedSettings.sorting) {
      setTableSorting(savedSettings.sorting)
    }
  }, [loadSettings])

  // Handler pentru schimbarea sortării
  const handleSortingChange = (newSorting: { id: string; desc: boolean }[]) => {
    setTableSorting(newSorting)
    saveSorting(newSorting)
  }

  // Obținem lucrările din Firebase - sortate după momentul introducerii în sistem
  const {
    data: rawLucrari,
    loading,
    error: fetchError,
  } = useFirebaseCollection("lucrari", [orderBy("createdAt", "desc")])

  // Sortare hibridă: prioritizăm lucrările cu updatedAt (modificate recent), apoi cele cu createdAt
  const lucrari = useMemo(() => {
    if (!rawLucrari || rawLucrari.length === 0) return []
    
    return [...rawLucrari].sort((a, b) => {
      // Ambele au updatedAt - sortăm după updatedAt
      if (a.updatedAt && b.updatedAt) {
        return b.updatedAt.toMillis() - a.updatedAt.toMillis()
      }
      
      // Doar a are updatedAt - a vine primul
      if (a.updatedAt && !b.updatedAt) {
        return -1
      }
      
      // Doar b are updatedAt - b vine primul  
      if (!a.updatedAt && b.updatedAt) {
        return 1
      }
      
      // Niciunul nu are updatedAt - sortăm după createdAt
      if (a.createdAt && b.createdAt) {
        return b.createdAt.toMillis() - a.createdAt.toMillis()
      }
      
      // Fallback la dataEmiterii dacă nu avem timestamps
      const dateA = a.dataEmiterii.split(".").reverse().join("")
      const dateB = b.dataEmiterii.split(".").reverse().join("")
      return dateB.localeCompare(dateA)
    })
  }, [rawLucrari])

  // Update the filteredLucrari function to include completed work orders that haven't been picked up
  const filteredLucrari = useMemo(() => {
    if (userData?.role === "tehnician" && userData?.displayName) {
      // console.log("Filtrare lucrări pentru tehnician:", userData.displayName)

      const filteredList = lucrari.filter((lucrare) => {
        // Verificăm dacă lucrarea este atribuită tehnicianului
        const isAssignedToTechnician =
          lucrare.tehnicieni && Array.isArray(lucrare.tehnicieni) && lucrare.tehnicieni.includes(userData.displayName)

        // Verificăm dacă lucrarea este finalizată și are raport generat și a fost preluată de dispecer
        const isFinalized = lucrare.statusLucrare === "Finalizat"
        const hasReportGenerated = lucrare.raportGenerat === true
        const isPickedUpByDispatcher = lucrare.preluatDispecer === true
        const isCompletedWithReportAndPickedUp = isFinalized && hasReportGenerated && isPickedUpByDispatcher

        // (debug) dacă ai nevoie poți reactiva acest log
        // if (process.env.NODE_ENV === "development" && isAssignedToTechnician && isFinalized) {
        //   console.log("Lucrare finalizată pentru tehnician:", lucrare)
        // }

        // Includem lucrarea doar dacă este atribuită tehnicianului și NU este finalizată cu raport și preluată de dispecer
        return isAssignedToTechnician && !isCompletedWithReportAndPickedUp
      })

      // console.info(`Tehnician: lucrări filtrate ${filteredList.length}/${lucrari.length}`)

      return filteredList
    }
    return lucrari
  }, [lucrari, userData?.role, userData?.displayName])

  // Helper function to check if a work order is completed with report but not picked up
  const isCompletedWithReportNotPickedUp = useCallback((lucrare) => {
    return lucrare.statusLucrare === "Finalizat" && lucrare.raportGenerat === true && lucrare.preluatDispecer === false
  }, [])

  // Modificăm funcția filterOptions pentru a include și echipamentele și statusul echipamentului
  const { data: tehnicieni } = useFirebaseCollection("users", [])
  const filterOptions = useMemo(() => {
    // Extragem toate valorile unice pentru tipuri de lucrări
    const tipuriLucrare = Array.from(new Set(filteredLucrari.map((lucrare) => lucrare.tipLucrare))).map((tip) => ({
      value: tip,
      label: tip,
    }))

    // Extragem toți tehnicienii unici
    const tehnicieniOptions = Array.from(new Set(filteredLucrari.flatMap((lucrare) => lucrare.tehnicieni))).map(
      (tehnician) => ({
        value: tehnician,
        label: tehnician,
      }),
    )

    // Extragem toți clienții unici
    const clienti = Array.from(new Set(filteredLucrari.map((lucrare) => lucrare.client))).map((client) => ({
      value: client,
      label: client,
    }))

    // Extragem toate echipamentele unice
    const echipamente = Array.from(new Set(filteredLucrari.map((lucrare) => lucrare.locatie)))
      .filter(Boolean)
      .map((echipament) => ({
        value: echipament,
        label: echipament,
      }))

    // Extragem toate statusurile de lucrare unice
    const statusuriLucrare = Array.from(new Set(filteredLucrari.map((lucrare) => lucrare.statusLucrare))).map(
      (status) => ({
        value: status,
        label: status,
      }),
    )

    // Extragem toate statusurile de facturare unice
    const statusuriFacturare = Array.from(new Set(filteredLucrari.map((lucrare) => lucrare.statusFacturare))).map(
      (status) => ({
        value: status,
        label: status,
      }),
    )

    // Extragem toate statusurile de echipament unice
    const statusuriEchipament = Array.from(
      new Set(filteredLucrari.map((lucrare) => lucrare.statusEchipament || "Nedefinit")),
    ).map((status) => ({
      value: status,
      label: status === "Nedefinit" ? "Nedefinit" : status,
    }))

    return [
      {
        id: "dataEmiterii",
        label: "Data emiterii",
        type: "dateRange",
        value: null,
      },
      {
        id: "dataInterventie",
        label: "Data intervenție",
        type: "dateRange",
        value: null,
      },
      {
        id: "tipLucrare",
        label: "Tip lucrare",
        type: "multiselect",
        options: tipuriLucrare,
        value: [],
      },
      {
        id: "tehnicieni",
        label: "Tehnicieni",
        type: "multiselect",
        options: tehnicieniOptions,
        value: [],
      },
      {
        id: "client",
        label: "Client",
        type: "multiselect",
        options: clienti,
        value: [],
      },
      {
        id: "locatie",
        label: "Echipament",
        type: "multiselect",
        options: echipamente,
        value: [],
      },
      {
        id: "statusLucrare",
        label: "Status lucrare",
        type: "multiselect",
        options: statusuriLucrare,
        value: [],
      },
      {
        id: "statusFacturare",
        label: "Status facturare",
        type: "multiselect",
        options: statusuriFacturare,
        value: [],
      },
      {
        id: "statusEchipament",
        label: "Status echipament",
        type: "multiselect",
        options: statusuriEchipament,
        value: [],
      },
      // Adăugăm această opțiune în array-ul filterOptions
      // Acest cod trebuie adăugat în array-ul filterOptions
      {
        id: "preluatStatus",
        label: "Status preluare",
        type: "multiselect",
        options: [
          { value: "preluat", label: "Preluat" },
          { value: "nepreluat", label: "Nepreluat" },
          { value: "nedefinit", label: "Nedefinit" },
        ],
        value: [],
      },
      {
        id: "necesitaOferta",
        label: "Necesită ofertă",
        type: "multiselect",
        options: [
          { value: "da", label: "Da" },
          { value: "nu", label: "Nu" },
        ],
        value: [],
      },
    ]
  }, [filteredLucrari, tehnicieni])

  // Adaugă această funcție după declararea constantei filterOptions
  const hasEquipmentStatusFilter = useMemo(() => {
    return activeFilters.some((filter) => filter.id === "statusEchipament" && filter.value && filter.value.length > 0)
  }, [activeFilters])

  // Modificăm funcția applyFilters pentru a gestiona filtrarea după echipament și statusul echipamentului
  const applyFilters = useCallback(
    (data) => {
      if (!activeFilters.length) return data

      return data.filter((item) => {
        return activeFilters.every((filter) => {
          // Dacă filtrul nu are valoare, îl ignorăm
          if (!filter.value || (Array.isArray(filter.value) && filter.value.length === 0)) {
            return true
          }

          switch (filter.id) {
            case "dataEmiterii":
              if (filter.value.from || filter.value.to) {
                try {
                  const itemDate = parse(item.dataEmiterii, "dd.MM.yyyy HH:mm", new Date())

                  if (filter.value.from) {
                    const fromDate = new Date(filter.value.from)
                    fromDate.setHours(0, 0, 0, 0)
                    if (isBefore(itemDate, fromDate)) return false
                  }

                  if (filter.value.to) {
                    const toDate = new Date(filter.value.to)
                    toDate.setHours(23, 59, 59, 999)
                    if (isAfter(itemDate, toDate)) return false
                  }

                  return true
                } catch (error) {
                  console.error("Eroare la parsarea datei:", error)
                  return true
                }
              }
              return true

            case "dataInterventie":
              if (filter.value.from || filter.value.to) {
                try {
                  const itemDate = parse(item.dataInterventie, "dd.MM.yyyy HH:mm", new Date())

                  if (filter.value.from) {
                    const fromDate = new Date(filter.value.from)
                    fromDate.setHours(0, 0, 0, 0)
                    if (isBefore(itemDate, fromDate)) return false
                  }

                  if (filter.value.to) {
                    const toDate = new Date(filter.value.to)
                    toDate.setHours(23, 59, 59, 999)
                    if (isAfter(itemDate, toDate)) return false
                  }

                  return true
                } catch (error) {
                  console.error("Eroare la parsarea datei:", error)
                  return true
                }
              }
              return true

            case "tehnicieni":
              // Verificăm dacă există o intersecție între tehnicienii selectați și cei ai lucrării
              return filter.value.some((tehnician) => item.tehnicieni.includes(tehnician))

            case "locatie":
              // Filtrare după echipament
              return filter.value.includes(item.locatie)

            case "statusEchipament":
              // Filtrare după statusul echipamentului
              if (!item.statusEchipament) {
                // Dacă lucrarea nu are status de echipament și filtrul include valoarea goală sau "Nedefinit"
                return filter.value.includes("") || filter.value.includes("Nedefinit")
              }
              return filter.value.includes(item.statusEchipament)

            // În funcția applyFilters, adăugăm un nou caz pentru necesitaOferta
            // Acest cod trebuie adăugat în switch-ul din funcția applyFilters
            case "preluatStatus":
              if (!filter.value || filter.value.length === 0) return true
              return filter.value.some((val) => {
                if (val === "preluat") return item.preluatDispecer === true
                if (val === "nepreluat")
                  return (
                    item.preluatDispecer === false && item.statusLucrare === "Finalizat" && item.raportGenerat === true
                  )
                if (val === "nedefinit")
                  return (
                    item.preluatDispecer === undefined ||
                    item.statusLucrare !== "Finalizat" ||
                    item.raportGenerat !== true
                  )
                return false
              })

            case "necesitaOferta":
              if (!filter.value || filter.value.length === 0) return true
              return filter.value.some((val) => {
                if (val === "da") return item[filter.id] === true
                if (val === "nu") return item[filter.id] !== true
                return false
              })

            default:
              // Pentru filtrele multiselect (tipLucrare, client, statusLucrare, statusFacturare)
              if (Array.isArray(filter.value)) {
                return filter.value.includes(item[filter.id])
              }
              return true
          }
        })
      })
    },
    [activeFilters],
  )

  // Aplicăm filtrarea manuală pe baza textului de căutare și a filtrelor active
  useEffect(() => {
    if (!searchText.trim() && !activeFilters.length) {
      setFilteredData(filteredLucrari)
      return
    }

    let filtered = filteredLucrari

    // Aplicăm filtrele active
    if (activeFilters.length) {
      filtered = applyFilters(filtered)
    }

    // Aplicăm căutarea globală
    if (searchText.trim()) {
      const lowercasedFilter = searchText.toLowerCase()
      filtered = filtered.filter((item) => {
        return Object.keys(item).some((key) => {
          const value = item[key]
          if (value === null || value === undefined) return false

          // Gestionăm array-uri (cum ar fi tehnicieni)
          if (Array.isArray(value)) {
            return value.some((v) => String(v).toLowerCase().includes(lowercasedFilter))
          }

          // Convertim la string pentru căutare
          return String(value).toLowerCase().includes(lowercasedFilter)
        })
      })
    }

    setFilteredData(filtered)
  }, [searchText, filteredLucrari, activeFilters]) // Eliminat applyFilters din dependencies pentru a evita re-render-uri infinite

  // Detectăm dacă suntem pe un dispozitiv mobil
  const isMobile = useMediaQuery("(max-width: 768px)")

  // Setăm automat vizualizarea cu carduri pe mobil
  useEffect(() => {
    if (isMobile) {
      setActiveTab("carduri")
    } else {
      setActiveTab("tabel")
    }
  }, [isMobile])

  // State pentru paginația cards
  const [cardsCurrentPage, setCardsCurrentPage] = useState(1)
  const [cardsPageSize, setCardsPageSize] = useState(12)

  // Persistența pentru cardsPageSize
  useEffect(() => {
    const savedCardsPageSize = localStorage.getItem("cardsPageSize_lucrari")
    if (savedCardsPageSize) {
      const pageSize = parseInt(savedCardsPageSize, 10)
      if ([6, 12, 24, 48].includes(pageSize)) {
        setCardsPageSize(pageSize)
      }
    }
  }, [])

  // Salvează cardsPageSize în localStorage când se schimbă
  const handleCardsPageSizeChange = (value: string) => {
    const pageSize = Number(value)
    setCardsPageSize(pageSize)
    setCardsCurrentPage(1)
    localStorage.setItem("cardsPageSize_lucrari", value)
  }

  // Calculăm datele pentru paginația cards
  const paginatedCardsData = useMemo(() => {
    const startIndex = (cardsCurrentPage - 1) * cardsPageSize
    const endIndex = startIndex + cardsPageSize
    return filteredData.slice(startIndex, endIndex)
  }, [filteredData, cardsCurrentPage, cardsPageSize])

  const totalCardsPages = Math.ceil(filteredData.length / cardsPageSize)

  // Reset paginația când se schimbă filtrele
  useEffect(() => {
    setCardsCurrentPage(1)
  }, [filteredData.length])

  // Verificăm dacă avem un ID de lucrare pentru editare din URL
  useEffect(() => {
    const fetchLucrareForEdit = async () => {
      if (editId) {
        try {
          // Dacă utilizatorul este tehnician, nu permitem editarea
          if (isTechnician) {
            toast({
              title: "Acces restricționat",
              description: "Nu aveți permisiunea de a edita lucrări.",
              variant: "destructive",
            })
            router.push("/dashboard/lucrari")
            return
          }

          const lucrare = await getLucrareById(editId)
          if (lucrare) {
            handleEdit(lucrare)
          }
        } catch (err) {
          console.error("Eroare la încărcarea lucrării pentru editare:", err)
        }
      }
    }

    fetchLucrareForEdit()
  }, [editId, isTechnician, router])

  // Actualizăm data emiterii și data intervenției la momentul deschiderii dialogului
  useEffect(() => {
    if (isAddDialogOpen) {
      setDataEmiterii(new Date())
      setDataInterventie(new Date())
    }
  }, [isAddDialogOpen])

  // Ascundem coloana de status facturare pentru tehnicienii
  useEffect(() => {
    if (userData?.role === "tehnician" && tableInstance) {
      const statusFacturareColumn = tableInstance.getColumn("statusFacturare")
      if (statusFacturareColumn) {
        statusFacturareColumn.toggleVisibility(false)
      }
    }
  }, [tableInstance, userData?.role])

  // Inițializăm datele filtrate și aplicăm filtrele active
  useEffect(() => {
    if (activeFilters.length > 0) {
      const filtered = applyFilters(filteredLucrari)
      setFilteredData(filtered)
    } else {
    setFilteredData(filteredLucrari)
    }
  }, [filteredLucrari, activeFilters]) // Eliminat applyFilters din dependencies pentru a evita re-render-uri infinite

  // Populate column options when table is available
  useEffect(() => {
    if (tableInstance) {
      const savedSettings = loadSettings()
      const savedColumnVisibility = savedSettings.columnVisibility || {}
      
      const allColumns = tableInstance.getAllColumns()
      
      // Aplicăm vizibilitatea salvată
      allColumns.forEach((column) => {
        if (column.getCanHide() && savedColumnVisibility.hasOwnProperty(column.id)) {
          column.toggleVisibility(savedColumnVisibility[column.id])
        }
      })
      
      const options = allColumns
        .filter((column) => column.getCanHide())
        .map((column) => ({
          id: column.id,
          label:
            typeof column.columnDef.header === "string"
              ? column.columnDef.header
              : column.id.charAt(0).toUpperCase() + column.id.slice(1),
          isVisible: column.getIsVisible(),
        }))
      setColumnOptions(options)
    }
  }, [tableInstance, isColumnModalOpen, loadSettings])

  const handleToggleColumn = (columnId: string) => {
    if (!tableInstance) return

    const column = tableInstance.getColumn(columnId)
    if (column) {
      column.toggleVisibility(!column.getIsVisible())

      // Update options state to reflect changes
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

  const handleSelectAllColumns = () => {
    if (!tableInstance) return

    tableInstance.getAllColumns().forEach((column) => {
      if (column.getCanHide()) {
        column.toggleVisibility(true)
      }
    })

    // Update all options to visible
    const newColumnOptions = columnOptions.map((option) => ({ ...option, isVisible: true }))
    setColumnOptions(newColumnOptions)
    
    // Salvăm vizibilitatea coloanelor
    const columnVisibility = newColumnOptions.reduce((acc, option) => {
      acc[option.id] = option.isVisible
      return acc
    }, {})
    saveColumnVisibility(columnVisibility)
  }

  const handleDeselectAllColumns = () => {
    if (!tableInstance) return

    tableInstance.getAllColumns().forEach((column) => {
      if (column.getCanHide() && column.id !== "actions") {
        column.toggleVisibility(false)
      }
    })

    // Update all options except actions to not visible
    const newColumnOptions = columnOptions.map((option) => ({
        ...option,
        isVisible: option.id === "actions" ? true : false,
    }))
    setColumnOptions(newColumnOptions)
    
    // Salvăm vizibilitatea coloanelor
    const columnVisibility = newColumnOptions.reduce((acc, option) => {
      acc[option.id] = option.isVisible
      return acc
    }, {})
    saveColumnVisibility(columnVisibility)
  }

  // Funcții pentru manipularea formularului de adăugare
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { id, value } = e.target
    setFormData(prev => ({ ...prev, [id]: value }))
  }, [])

  const handleSelectChange = useCallback((id: string, value: string) => {
    setFormData(prev => ({ ...prev, [id]: value }))
  }, [])

  const handleTehnicieniChange = useCallback((value: string) => {
    setFormData(prev => {
      const newTehnicieni = prev.tehnicieni.includes(value)
        ? prev.tehnicieni.filter(t => t !== value)
        : [...prev.tehnicieni, value]
      return { ...prev, tehnicieni: newTehnicieni }
    })
  }, [])

  const handleCustomChange = useCallback((field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }, [])

  const handleCloseAddDialog = useCallback(() => {
    setIsAddDialogOpen(false)
    setIsReassignment(false)
    setOriginalWorkOrderId(null)
    setFormData({
      tipLucrare: "",
      tehnicieni: [],
      client: "",
      locatie: "",
      echipament: "",
      descriere: "",
      persoanaContact: "",
      telefon: "",
      statusLucrare: "Programată",
      statusFacturare: "Nefacturat",
      contract: "",
      contractNumber: "",
      contractType: "",
      defectReclamat: "",
      persoaneContact: [],
      echipamentId: "",
      echipamentCod: "",
    })
    setFieldErrors([])
  }, [])

  const resetForm = () => {
    setDataEmiterii(new Date())
    setDataInterventie(new Date())
    setFormData({
      tipLucrare: "",
      tehnicieni: [],
      client: "",
      locatie: "",
      descriere: "",
      persoanaContact: "",
      telefon: "",
      statusLucrare: "Listată", // Schimbat din "În așteptare" în "Listată"
      statusFacturare: "Nefacturat",
      contract: "",
      defectReclamat: "",
      echipamentId: "",
      echipamentCod: "",
      echipament: "",
      persoaneContact: [],
    })
    setError(null)
    setFieldErrors([])
  }

  const validateForm = () => {
    const errors = []

    if (!dataEmiterii) errors.push("dataEmiterii")
    if (!dataInterventie) errors.push("dataInterventie")
    if (!formData.tipLucrare) errors.push("tipLucrare")
    if (!formData.client) errors.push("client")

    // Validăm câmpul contract doar dacă tipul lucrării este "Intervenție în contract"
    if (formData.tipLucrare === "Intervenție în contract" && !formData.contract) {
      errors.push("contract")
    }

    setFieldErrors(errors)

    return errors.length === 0
  }

  // Funcție pentru adăugarea unei noi lucrări
  const handleAddLucrare = useCallback(async (data: any) => {
    try {
      const dataToSubmit = {
        ...data,
        // Adăugăm timestamp-ul de creare
        dataCreare: new Date(),
        // Adăugăm datele de re-intervenție dacă este cazul
        ...(isReassignment && originalWorkOrderId && {
          lucrareOriginala: originalWorkOrderId,
          mesajReatribuire: `Re-intervenție pentru: ${formData.originalWorkOrderInfo || `lucrarea ${originalWorkOrderId}`}`,
        }),
      }

      await addLucrare(dataToSubmit)
      
      // Resetăm starea de re-intervenție
      setIsReassignment(false)
      setOriginalWorkOrderId(null)
      
      // Reset form și închidere dialog
      setFormData({
        tipLucrare: "",
        tehnicieni: [],
        client: "",
        locatie: "",
        echipament: "",
        descriere: "",
        persoanaContact: "",
        telefon: "",
        statusLucrare: "Programată",
        statusFacturare: "Nefacturat",
        contract: "",
        contractNumber: "",
        contractType: "",
        defectReclamat: "",
        persoaneContact: [],
        echipamentId: "",
        echipamentCod: "",
      })
      setFieldErrors([])
      setIsAddDialogOpen(false)
      
      toast({
        title: "Succes",
        description: isReassignment ? "Re-intervenția a fost creată cu succes." : "Lucrarea a fost adăugată cu succes.",
      })
    } catch (error) {
      console.error("Eroare la adăugarea lucrării:", error)
      toast({
        title: "Eroare",
        description: "A apărut o eroare la adăugarea lucrării.",
        variant: "destructive",
      })
    }
  }, [addLucrare, toast, isReassignment, originalWorkOrderId, formData])

  const handleSubmit = async () => {
    try {
      setIsSubmitting(true)
      setError(null)

      if (!validateForm()) {
        setError("Vă rugăm să completați toate câmpurile obligatorii")
        setIsSubmitting(false)
        return
      }

      // Setăm automat statusul lucrării în funcție de prezența tehnicienilor
      const statusLucrare = formData.tehnicieni && formData.tehnicieni.length > 0 ? "Atribuită" : "Listată"

      const newLucrare = {
        dataEmiterii: format(dataEmiterii, "dd.MM.yyyy HH:mm"),
        dataInterventie: format(dataInterventie, "dd.MM.yyyy HH:mm"),
        ...formData,
        statusLucrare: statusLucrare, // Suprascriem statusul cu valoarea calculată
        // Dacă este re-intervenție, adăugăm referința către lucrarea originală
        ...(isReassignment && originalWorkOrderId
          ? {
              lucrareOriginala: originalWorkOrderId,
              mesajReatribuire: `Re-intervenție pentru: ${formData.originalWorkOrderInfo || `lucrarea ${originalWorkOrderId}`}`,
            }
          : {}),
      }

      // Adăugăm lucrarea în Firestore
      const lucrareId = await addLucrare(newLucrare)

      // Resetăm starea de re-intervenție
      if (isReassignment) {
        setIsReassignment(false)
        setOriginalWorkOrderId(null)
      }

      // Trimitem notificări prin email
      try {
        // Obținem lucrarea completă cu ID pentru a o trimite la notificări
        const lucrareCompleta = { id: lucrareId, ...newLucrare }

        console.log("Sending notifications for new work order:", lucrareId)

        // Trimitem notificările
        const notificationResult = await sendWorkOrderNotifications(lucrareCompleta)

        if (notificationResult.success) {
          // Extragem email-urile tehnicienilor
          const techEmails = notificationResult.result?.technicianEmails || []
          const successfulTechEmails = techEmails.filter((t) => t.success).map((t) => t.email)

          // Construim mesajul pentru toast
          let emailMessage = "Email-uri trimise către:\n"

          // Verificăm dacă clientul are email
          const clientEmailResult = notificationResult.result?.clientEmail

          if (clientEmailResult?.success) {
            emailMessage += `Client: ${clientEmailResult.recipient || "Email trimis"}\n`
          } else {
            emailMessage += "Client: Email indisponibil sau netrimis\n"
          }

          if (successfulTechEmails.length > 0) {
            emailMessage += `Tehnicieni: ${successfulTechEmails.join(", ")}`
          } else {
            emailMessage += "Tehnicieni: Email-uri indisponibile sau netrimise"
          }

          // Afișăm toast de succes pentru email-uri
          toast({
            title: "Notificări trimise",
            description: emailMessage,
            variant: "default",
            className: "whitespace-pre-line",
            icon: <Mail className="h-4 w-4" />,
          })
        } else {
          // Afișăm toast de eroare pentru email-uri
          toast({
            title: "Eroare la trimiterea notificărilor",
            description: `Nu s-au putut trimite email-urile: ${notificationResult.error || "Eroare necunoscută"}`,
            variant: "destructive",
            icon: <AlertCircle className="h-4 w-4" />,
          })
        }
      } catch (notificationError) {
        console.error("Eroare la trimiterea notificărilor:", notificationError)

        // Afișăm toast de eroare pentru email-uri
        toast({
          title: "Eroare la trimiterea notificărilor",
          description: `A apărut o excepție: ${notificationError.message || "Eroare necunoscută"}`,
          variant: "destructive",
          icon: <AlertCircle className="h-4 w-4" />,
        })
      }

      // Închidem dialogul și resetăm formularul
      setIsAddDialogOpen(false)
      resetForm()

      // Afișăm toast de succes pentru adăugarea lucrării
      toast({
        title: "Lucrare adăugată",
        description: "Lucrarea a fost adăugată cu succes.",
        variant: "default",
        icon: <Check className="h-4 w-4" />,
      })
    } catch (err) {
      console.error("Eroare la adăugarea lucrării:", err)
      setError("A apărut o eroare la adăugarea lucrării. Încercați din nou.")
      setIsSubmitting(false)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleEdit = (lucrare) => {
    setSelectedLucrare(lucrare)

    // Convertim string-urile de dată în obiecte Date
    try {
      // Verificăm dacă data conține și ora
      const dateFormatEmiterii = lucrare.dataEmiterii.includes(" ") ? "dd.MM.yyyy HH:mm" : "dd.MM.yyyy"
      const dateFormatInterventie = lucrare.dataInterventie.includes(" ") ? "dd.MM.yyyy HH:mm" : "dd.MM.yyyy"

      const emitereDate = parse(lucrare.dataEmiterii, dateFormatEmiterii, new Date())
      const interventieDate = parse(lucrare.dataInterventie, dateFormatInterventie, new Date())

      setDataEmiterii(emitereDate)
      setDataInterventie(interventieDate)
    } catch (error) {
      console.error("Eroare la parsarea datelor:", error)
      setDataEmiterii(new Date())
      setDataInterventie(new Date())
    }

    // Populăm formularul cu datele lucrării
    setFormData({
      tipLucrare: lucrare.tipLucrare,
      tehnicieni: [...lucrare.tehnicieni],
      client: lucrare.client,
      locatie: lucrare.locatie,
      descriere: lucrare.descriere,
      persoanaContact: lucrare.persoanaContact,
      telefon: lucrare.telefon,
      statusLucrare: lucrare.statusLucrare,
      statusFacturare: lucrare.statusFacturare,
      contract: lucrare.contract || "",
      defectReclamat: lucrare.defectReclamat || "",
      echipamentId: lucrare.echipamentId || "", // ← nou
      echipamentCod: lucrare.echipamentCod || "", // ← nou
      echipament: lucrare.echipament,
    })

    setIsEditDialogOpen(true)
  }

  const handleUpdate = async () => {
    if (!selectedLucrare?.id) return

    try {
      setIsSubmitting(true)
      setError(null)

      if (!validateForm()) {
        setError("Vă rugăm să completați toate câmpurile obligatorii")
        setIsSubmitting(false)
        return
      }

      // Verificăm dacă statusul curent este "Listată" sau "Atribuită"
      // Doar în acest caz actualizăm automat statusul
      let statusLucrare = formData.statusLucrare
      if (statusLucrare === "Listată" || statusLucrare === "Atribuită") {
        statusLucrare = formData.tehnicieni && formData.tehnicieni.length > 0 ? "Atribuită" : "Listată"
      }

      const updatedLucrare = {
        ...formData,
        statusLucrare: statusLucrare, // Folosim statusul calculat
        dataEmiterii: format(dataEmiterii, "dd.MM.yyyy HH:mm"),
        dataInterventie: format(dataInterventie, "dd.MM.yyyy HH:mm"),
      }

      await updateLucrare(selectedLucrare.id, updatedLucrare)

      // Obținem lucrarea completă cu ID pentru a o trimite la notificări
      const lucrareCompleta = { id: selectedLucrare.id, ...updatedLucrare }

      // Trimitem notificări prin email doar dacă s-a schimbat data intervenției sau tehnicienii
      if (
        selectedLucrare.dataInterventie !== updatedLucrare.dataInterventie ||
        JSON.stringify(selectedLucrare.tehnicieni) !== JSON.stringify(updatedLucrare.tehnicieni)
      ) {
        try {
          // Trimitem notificările
          const notificationResult = await sendWorkOrderNotifications(lucrareCompleta)

          if (notificationResult.success) {
            // Extragem email-urile tehnicienilor
            const techEmails = notificationResult.result?.technicianEmails || []
            const successfulTechEmails = techEmails.filter((t) => t.success).map((t) => t.email)

            // Construim mesajul pentru toast
            let emailMessage = "Email-uri trimise către:\n"

            // Verificăm dacă clientul are email
            const clientEmailResult = notificationResult.result?.clientEmail

            if (clientEmailResult?.success) {
              emailMessage += `Client: ${clientEmailResult.recipient || "Email trimis"}\n`
            } else {
              emailMessage += "Client: Email indisponibil sau netrimis\n"
            }

            if (successfulTechEmails.length > 0) {
              emailMessage += `Tehnicieni: ${successfulTechEmails.join(", ")}`
            } else {
              emailMessage += "Tehnicieni: Email-uri indisponibile sau netrimise"
            }

            // Afișăm toast de succes pentru email-uri
            toast({
              title: "Notificări trimise",
              description: emailMessage,
              variant: "default",
              className: "whitespace-pre-line",
              icon: <Mail className="h-4 w-4" />,
            })
          } else {
            // Afișăm toast de eroare pentru email-uri
            toast({
              title: "Eroare la trimiterea notificărilor",
              description: `Nu s-au putut trimite email-urile: ${notificationResult.error || "Eroare necunoscută"}`,
              variant: "destructive",
              icon: <AlertCircle className="h-4 w-4" />,
            })
          }
        } catch (notificationError) {
          console.error("Eroare la trimiterea notificărilor:", notificationError)

          // Afișăm toast de eroare pentru email-uri
          toast({
            title: "Eroare la trimiterea notificărilor",
            description: `A apărut o excepție: ${notificationError.message || "Eroare necunoscută"}`,
            variant: "destructive",
            icon: <AlertCircle className="h-4 w-4" />,
          })
        }
      }

      setIsEditDialogOpen(false)
      resetForm()

      // Afișăm toast de succes pentru actualizarea lucrării
      toast({
        title: "Lucrare actualizată",
        description: "Lucrarea a fost actualizată cu succes.",
        variant: "default",
        icon: <Check className="h-4 w-4" />,
      })

      // Dacă am venit din URL, redirecționăm înapoi la lista de lucrări
      if (editId) {
        router.push("/dashboard/lucrari")
      }
    } catch (err) {
      console.error("Eroare la actualizarea lucrării:", err)
      setError("A apărut o eroare la actualizarea lucrării. Încercați din nou.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async (id) => {
    if (window.confirm("Sunteți sigur că doriți să ștergeți această lucrare?")) {
      try {
        await deleteLucrare(id)
      } catch (err) {
        console.error("Eroare la ștergerea lucrării:", err)
        alert("A apărut o eroare la ștergerea lucrării.")
      }
    }
  }

  // De asemenea, trebuie să actualizăm funcția handleViewDetails pentru a asigura consistența
  const handleViewDetails = (lucrare) => {
    // For technicians, if the work order is completed with report but not picked up, don't allow navigation
    if (isTechnician && isCompletedWithReportNotPickedUp(lucrare)) {
      toast({
        title: "Acces restricționat",
        description: "Lucrarea este finalizată și în așteptare de preluare de către dispecer.",
        variant: "default",
        icon: <Info className="h-4 w-4" />,
      })
      return
    }

    if (!lucrare || !lucrare.id) {
      console.error("ID-ul lucrării nu este valid:", lucrare)
      toast({
        title: "Eroare",
        description: "ID-ul lucrării nu este valid",
        variant: "destructive",
      })
      return
    }

    router.push(`/dashboard/lucrari/${lucrare.id}`)
  }

  const handleGenerateReport = useCallback(
    (lucrare) => {
      // For technicians, if the work order is completed with report but not picked up, don't allow report generation
      if (isTechnician && isCompletedWithReportNotPickedUp(lucrare)) {
        toast({
          title: "Acces restricționat",
          description: "Lucrarea este finalizată și în așteptare de preluare de către dispecer.",
          variant: "default",
          icon: <Info className="h-4 w-4" />,
        })
        return
      }

      // Verificăm că lucrare și lucrare.id sunt valide
      if (!lucrare || !lucrare.id) {
        console.error("ID-ul lucrării nu este valid:", lucrare)
        toast({
          title: "Eroare",
          description: "ID-ul lucrării nu este valid",
          variant: "destructive",
        })
        return
      }

      // Redirecționăm către pagina de raport cu ID-ul corect
      router.push(`/raport/${lucrare.id}`)
    },
    [router, isTechnician, isCompletedWithReportNotPickedUp],
  )

  // Modificăm funcția handleDispatcherPickup pentru a permite doar preluarea, nu și anularea
  const handleDispatcherPickup = async (lucrare) => {
    if (!lucrare || !lucrare.id) {
      console.error("ID-ul lucrării nu este valid:", lucrare)
      toast({
        title: "Eroare",
        description: "ID-ul lucrării nu este valid",
        variant: "destructive",
      })
      return
    }

    // Dacă lucrarea este deja preluată, nu facem nimic
    if (lucrare.preluatDispecer) return

    try {
      await updateLucrare(lucrare.id, { preluatDispecer: true })

      toast({
        title: "Lucrare preluată",
        description: "Lucrarea a fost marcată ca preluată de dispecer.",
        variant: "default",
        icon: <Check className="h-4 w-4" />,
      })
    } catch (error) {
      console.error("Eroare la actualizarea stării de preluare:", error)
      toast({
        title: "Eroare",
        description: "A apărut o eroare la actualizarea stării de preluare.",
        variant: "destructive",
      })
    }
  }

  // Funcție pentru reatribuirea unei lucrări (pentru dispecer)
  const handleReassign = useCallback(async (originalLucrare: any) => {
    try {
      // Creăm un mesaj informativ cu detaliile lucrării originale
      const originalInfo = `${originalLucrare.client} - ${originalLucrare.locatie} (${originalLucrare.dataInterventie})`
      
      // Precompletăm formularul cu datele din lucrarea originală
      const prefilledData = {
        tipLucrare: originalLucrare.tipLucrare || "",
        tehnicieni: originalLucrare.tehnicieni || [],
        client: originalLucrare.client || "",
        locatie: originalLucrare.locatie || "",
        echipament: originalLucrare.echipament || "",
        descriere: originalLucrare.descriere || "",
        persoanaContact: originalLucrare.persoanaContact || "",
        telefon: originalLucrare.telefon || "",
        statusLucrare: "Listată", // Resetăm statusul
        statusFacturare: "Nefacturat", // Resetăm statusul facturării
        contract: originalLucrare.contract || "",
        contractNumber: originalLucrare.contractNumber || "",
        contractType: originalLucrare.contractType || "",
        defectReclamat: originalLucrare.defectReclamat || "",
        persoaneContact: originalLucrare.persoaneContact || [],
        echipamentId: originalLucrare.echipamentId || "",
        echipamentCod: originalLucrare.echipamentCod || "",
        // Stocăm informațiile originale pentru mesaj
        originalWorkOrderInfo: originalInfo,
      }

      // Setăm datele în formularul de adăugare
      setFormData(prefilledData)
      
      // Setăm un indicator că este re-intervenție
      setIsReassignment(true)
      setOriginalWorkOrderId(originalLucrare.id)
      
      // Resetăm erorile și deschidem dialogul
      setFieldErrors([])
      setIsAddDialogOpen(true)
      
    } catch (error) {
      console.error("Eroare la precompletarea formularului de reatribuire:", error)
      toast({
        title: "Eroare",
        description: "A apărut o eroare la precompletarea formularului de reatribuire.",
        variant: "destructive",
      })
    }
  }, [toast])

  // Funcție pentru a verifica dacă o lucrare necesită reatribuire (bazat pe status finalizare intervenție)
  const needsReassignment = useCallback((lucrare: any) => {
    // Reatribuirea este disponibilă doar pentru lucrări cu status finalizare "NEFINALIZAT"
    return lucrare.statusFinalizareInterventie === "NEFINALIZAT"
  }, [])

  const handleApplyFilters = (filters) => {
    // Filtrăm doar filtrele care au valori
    const filtersWithValues = filters.filter((filter) => {
      if (filter.type === "dateRange") {
        return filter.value && (filter.value.from || filter.value.to)
      }
      if (Array.isArray(filter.value)) {
        return filter.value.length > 0
      }
      return filter.value
    })

    setActiveFilters(filtersWithValues)
    saveFilters(filtersWithValues) // Salvăm filtrele în localStorage
  }

  const handleResetFilters = () => {
    setActiveFilters([])
    saveFilters([]) // Salvăm lista goală în localStorage
  }

  // Definim coloanele pentru DataTable
  const columns = [
    {
      accessorKey: "updatedAt",
      header: "Ultima modificare",
      enableHiding: true,
      enableFiltering: false,
      cell: ({ row }) => {
        const lucrare = row.original
        const hasUpdatedAt = lucrare.updatedAt
        const hasCreatedAt = lucrare.createdAt
        
        // Verificăm dacă lucrarea a fost modificată (updatedAt diferit de createdAt)
        const wasModified = hasUpdatedAt && hasCreatedAt && 
          Math.abs(lucrare.updatedAt.toMillis() - lucrare.createdAt.toMillis()) > 1000; // diferență > 1 secundă
        
        if (wasModified) {
          // Afișăm data ultimei modificări
          const updatedDate = lucrare.updatedAt.toDate()
          const formattedDate = format(updatedDate, "dd.MM.yyyy", { locale: ro })
          const formattedTime = format(updatedDate, "HH:mm", { locale: ro })
          
          return (
            <div className="flex flex-col text-sm">
              <div className="font-medium text-blue-600">
                Modificat: {formattedDate}
              </div>
              <div className="text-gray-500 text-xs">
                {formattedTime}
              </div>
            </div>
          )
        } else if (hasCreatedAt) {
          // Afișăm data creării dacă nu a fost modificată
          const createdDate = lucrare.createdAt.toDate()
          const formattedDate = format(createdDate, "dd.MM.yyyy", { locale: ro })
          const formattedTime = format(createdDate, "HH:mm", { locale: ro })
          
          return (
            <div className="flex flex-col text-sm">
              <div className="font-medium text-green-600">
                Creat: {formattedDate}
              </div>
              <div className="text-gray-500 text-xs">
                {formattedTime}
              </div>
            </div>
          )
        } else {
          // Fallback la data emiterii
          return (
            <div className="flex flex-col text-sm">
              <div className="font-medium text-gray-600">
                {lucrare.dataEmiterii}
              </div>
              <div className="text-gray-500 text-xs">
                Din formular
              </div>
            </div>
          )
        }
      },
    },
    {
      accessorKey: "dataEmiterii",
      header: "Data Emiterii",
      enableHiding: true,
      enableFiltering: true,
    },
    {
      accessorKey: "dataInterventie",
      header: "Data solicitată intervenție",
      enableHiding: true,
      enableFiltering: true,
    },
    {
      accessorKey: "tipLucrare",
      header: "Tip Lucrare",
      enableHiding: true,
      enableFiltering: true,
      cell: ({ row }) => (
        <Badge variant="outline" className={getWorkTypeClass(row.original.tipLucrare)}>
          {row.original.tipLucrare}
        </Badge>
      ),
    },
    {
      accessorKey: "defectReclamat",
      header: "Defect reclamat",
      enableHiding: true,
      enableFiltering: true,
      cell: ({ row }) => (
        <div className="max-w-[200px] truncate" title={row.original.defectReclamat}>
          {row.original.defectReclamat || "-"}
        </div>
      ),
    },
    {
      accessorKey: "contract",
      header: "Contract",
      enableHiding: true,
      enableFiltering: true,
      cell: ({ row }) => {
        if (row.original.tipLucrare !== "Intervenție în contract") return null
        return <ContractDisplay contractId={row.original.contract} />
      },
    },
    {
      accessorKey: "tehnicieni",
      header: "Tehnicieni",
      enableHiding: true,
      enableFiltering: true,
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          {row.original.tehnicieni.map((tehnician, index) => (
            <Badge key={index} variant="secondary" className="bg-gray-100">
              {tehnician}
            </Badge>
          ))}
        </div>
      ),
    },
    {
      accessorKey: "client",
      header: "Client",
      enableHiding: true,
      enableFiltering: true,
    },
    {
      accessorKey: "locatie",
      header: "Locație / Echipament",
      enableHiding: true,
      enableFiltering: true,
      cell: ({ row }) => {
            return (
              <div>
            <div className="font-medium">{row.original.locatie}</div>
            {row.original.echipamentCod && (
              <div className="text-sm text-gray-500">Cod: {row.original.echipamentCod}</div>
            )}
              </div>
            )
      },
    },
    {
      accessorKey: "statusEchipament",
      header: "Status Echipament",
      enableHiding: true,
      enableFiltering: true,
      cell: ({ row }) => {
        if (!row.original.statusEchipament) return null
        return (
          <Badge className={getEquipmentStatusClass(row.original.statusEchipament)}>
            {row.original.statusEchipament}
          </Badge>
        )
      },
    },
    {
      accessorKey: "statusLucrare",
      header: "Status Lucrare",
      enableHiding: true,
      enableFiltering: true,
      cell: ({ row }) => (
        <Badge className={getWorkStatusClass(row.original.statusLucrare)}>{row.original.statusLucrare}</Badge>
      ),
    },
    {
      accessorKey: "statusFacturare",
      header: "Status Facturare",
      enableHiding: true,
      enableFiltering: true,
      cell: ({ row }) => (
        <Badge className={getInvoiceStatusClass(row.original.statusFacturare)}>{row.original.statusFacturare}</Badge>
      ),
    },
    {
      accessorKey: "preluatDispecer",
      header: "Preluat Dispecer",
      enableHiding: true,
      enableFiltering: true,
      cell: ({ row }) => {
        const isFinalized = row.original.statusLucrare === "Finalizat"
        const hasReportGenerated = row.original.raportGenerat === true
        const isPickedUp = row.original.preluatDispecer === true

        if (isFinalized && hasReportGenerated) {
          
          if (userData?.role === "tehnician") {
            return isPickedUp ? (
              <Badge className="bg-green-100 text-green-800">Preluat</Badge>
            ) : (
              <Badge className="bg-yellow-100 text-yellow-800">În așteptare</Badge>
            )
          } else {
            return isPickedUp ? (
              <Badge className="bg-green-100 text-green-800">Preluat</Badge>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-2 text-blue-600 border-blue-200 hover:bg-blue-50"
                onClick={(e) => {
                  e.stopPropagation()
                  handleDispatcherPickup(row.original)
                }}
              >
                <Check className="h-4 w-4 mr-1" /> Preia
              </Button>
            )
          }
        }
        return null
      },
    },
    {
      accessorKey: "necesitaOferta",
      header: "Status ofertă",
      enableHiding: true,
      enableFiltering: true,
      cell: ({ row }) => {
        const statusOferta = row.original.statusOferta || (row.original.necesitaOferta ? "DA" : "NU")
        
        if (statusOferta === "DA") {
          return <Badge className="bg-orange-100 text-orange-800">Necesită ofertă</Badge>
        } else if (statusOferta === "OFERTAT") {
          return <Badge className="bg-blue-100 text-blue-800">Ofertat</Badge>
        }
        return null
      },
    },
    {
      id: "actions",
      header: "Acțiuni",
      enableHiding: false,
      enableFiltering: false,
      cell: ({ row }) => {
        // Check if the work order is completed with report but not picked up
        const isCompletedNotPickedUp = isCompletedWithReportNotPickedUp(row.original)

        // For technicians, if the work order is completed with report but not picked up, show a disabled state
        if (isTechnician && isCompletedNotPickedUp) {
          return (
            <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 px-2 text-gray-400 border-gray-200 cursor-not-allowed opacity-60"
                        disabled
                        aria-label="Vizualizare dezactivată"
                      >
                        <Eye className="h-4 w-4" />
                        <span className="ml-1">Vizualizează</span>
                      </Button>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Lucrarea este finalizată și în așteptare de preluare de către dispecer</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 px-2 text-gray-400 border-gray-200 cursor-not-allowed opacity-60"
                        disabled
                        aria-label="Raport dezactivat"
                      >
                        <FileText className="h-4 w-4" />
                        <span className="ml-1">Raport</span>
                      </Button>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Lucrarea este finalizată și în așteptare de preluare de către dispecer</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          )
        }

        // Normal actions for non-technicians or non-completed work orders
        return (
          <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
            {!isTechnician && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-2 text-blue-600 border-blue-200 hover:bg-blue-50"
                onClick={(e) => {
                  e.stopPropagation()
                  handleEdit(row.original)
                }}
                aria-label="Editează lucrarea"
              >
                <Pencil className="h-4 w-4" />
                <span className="ml-1">Editează</span>
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-2 text-green-600 border-green-200 hover:bg-green-50"
              onClick={(e) => {
                e.stopPropagation()
                handleGenerateReport(row.original)
              }}
              aria-label="Generează raport"
            >
              <FileText className="h-4 w-4" />
              <span className="ml-1">Raport</span>
            </Button>
            {/* Buton de reatribuire pentru dispeceri/admini când lucrarea are situații critice */}
            {!isTechnician && needsReassignment(row.original) && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-2 text-orange-600 border-orange-200 hover:bg-orange-50"
                onClick={(e) => {
                  e.stopPropagation()
                  handleReassign(row.original)
                }}
                aria-label="Reatribuie lucrarea"
              >
                <RefreshCw className="h-4 w-4" />
                <span className="ml-1">Reatribuie</span>
              </Button>
            )}
            {userData?.role === "admin" && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-2 text-red-600 border-red-200 hover:bg-red-50"
                onClick={(e) => {
                  e.stopPropagation()
                  handleDelete(row.original.id)
                }}
                aria-label="Șterge lucrarea"
              >
                <Trash2 className="h-4 w-4" />
                <span className="ml-1">Șterge</span>
              </Button>
            )}
          </div>
        )
      },
    },
  ]

  // Function to check if we should show the close confirmation dialog
  const handleCloseEditDialog = () => {
    if (editFormRef.current?.hasUnsavedChanges()) {
      setShowCloseAlert(true)
    } else {
      setIsEditDialogOpen(false)
    }
  }

  // Function to confirm dialog close
  const confirmCloseDialog = () => {
    setShowCloseAlert(false)

    // Determine which dialog to close
    if (isAddDialogOpen) {
      setIsAddDialogOpen(false)
    } else if (isEditDialogOpen) {
      setIsEditDialogOpen(false)
    }
  }

  // Modificăm funcția getRowClassName pentru a verifica dacă row și row.original există
  const getRowClassName = (row) => {
    // Verificăm dacă row și row.original există
    if (!row || !row.statusLucrare) {
      return ""
    }
    return getWorkStatusRowClass(row)
  }

  return (
    <DashboardShell>
      <DashboardHeader heading="Lucrări" text="Gestionați toate lucrările și intervențiile">
        {!isTechnician && (
          <Dialog
            open={isAddDialogOpen}
            onOpenChange={(open) => {
              if (!open) {
                handleCloseAddDialog()
              } else {
                setIsAddDialogOpen(open)
              }
            }}
          >
            <DialogTrigger asChild>
              <Button className="bg-blue-600 hover:bg-blue-700">
                <Plus className="mr-2 h-4 w-4" /> <span className="hidden sm:inline">Adaugă</span> Lucrare
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Adaugă Lucrare Nouă</DialogTitle>
              </DialogHeader>
              
              {/* Banner pentru re-intervenții */}
              {isReassignment && originalWorkOrderId && (
                <div className="mb-4 p-3 bg-blue-100 border border-blue-300 rounded-md">
                  <div className="flex items-center">
                    <span className="text-blue-800 font-medium">
                      Re-intervenție: Acest formular este precompletat cu datele din lucrarea originală pentru{" "}
                      <strong>{formData.originalWorkOrderInfo || originalWorkOrderId}</strong>
                    </span>
                  </div>
                </div>
              )}
              
              <LucrareForm
                ref={addFormRef}
                dataEmiterii={dataEmiterii}
                setDataEmiterii={setDataEmiterii}
                dataInterventie={dataInterventie}
                setDataInterventie={setDataInterventie}
                formData={formData}
                handleInputChange={handleInputChange}
                handleSelectChange={handleSelectChange}
                handleTehnicieniChange={handleTehnicieniChange}
                handleCustomChange={handleCustomChange}
              fieldErrors={fieldErrors}
              setFieldErrors={setFieldErrors}
              />
              <DialogFooter className="flex-col gap-2 sm:flex-row">
                <Button variant="outline" onClick={handleCloseAddDialog}>
                  Anulează
                </Button>
                <Button className="bg-blue-600 hover:bg-blue-700" onClick={handleSubmit} disabled={isSubmitting}>
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
        )}

        {/* Dialog pentru editarea lucrării */}
        <Dialog
          open={isEditDialogOpen}
          onOpenChange={(open) => {
            if (!open) {
              handleCloseEditDialog()
            } else {
              setIsEditDialogOpen(open)
            }
          }}
        >
          <DialogContent className="w-[calc(100%-2rem)] max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Editează Lucrare</DialogTitle>
              <DialogDescription>Modificați detaliile lucrării</DialogDescription>
            </DialogHeader>
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <LucrareForm
              ref={editFormRef}
              isEdit={true}
              dataEmiterii={dataEmiterii}
              setDataEmiterii={setDataEmiterii}
              dataInterventie={dataInterventie}
              setDataInterventie={setDataInterventie}
              formData={formData}
              handleInputChange={handleInputChange}
              handleSelectChange={handleSelectChange}
              handleTehnicieniChange={handleTehnicieniChange}
              fieldErrors={fieldErrors}
              onCancel={() => handleCloseEditDialog()}
              handleCustomChange={handleCustomChange}
            />
            <DialogFooter className="flex-col gap-2 sm:flex-row">
              <Button variant="outline" onClick={handleCloseEditDialog}>
                Anulează
              </Button>
              <Button className="bg-blue-600 hover:bg-blue-700" onClick={handleUpdate} disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Se procesează...
                  </>
                ) : (
                  "Actualizează"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DashboardHeader>

      {/* Legendă pentru statusuri */}
      <div className="mb-4 p-4 border rounded-md bg-white">
        <h3 className="text-sm font-medium mb-2">Legendă statusuri:</h3>
        <div className="flex flex-wrap gap-2">
          <div className="flex items-center">
            <div className="w-4 h-4 mr-1 bg-red-100 border border-red-500 border-l-4 rounded"></div>
            <span className="text-xs">Situații critice (NEFINALIZAT / Echipament nefuncțional / Status ofertă: DA)</span>
          </div>
          <div className="flex items-center">
            <div className="w-4 h-4 mr-1 bg-gray-50 border border-gray-200 rounded"></div>
            <span className="text-xs">Listată</span>
          </div>
          <div className="flex items-center">
            <div className="w-4 h-4 mr-1 bg-yellow-50 border border-yellow-200 rounded"></div>
            <span className="text-xs">Atribuită</span>
          </div>
          <div className="flex items-center">
            <div className="w-4 h-4 mr-1 bg-blue-50 border border-blue-200 rounded"></div>
            <span className="text-xs">În lucru</span>
          </div>
          <div className="flex items-center">
            <div className="w-4 h-4 mr-1 bg-green-50 border border-green-200 rounded"></div>
            <span className="text-xs">Finalizat</span>
          </div>
          <div className="flex items-center">
            <div className="w-4 h-4 mr-1 bg-orange-50 border border-orange-200 rounded"></div>
            <span className="text-xs">În așteptare</span>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:justify-between gap-4">
          <div className="flex items-center space-x-2">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-[200px]">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="tabel">Tabel</TabsTrigger>
                <TabsTrigger value="carduri">Carduri</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>

        {/* Adăugăm câmpul de căutare universal și butonul de filtrare */}
        <div className="flex flex-col sm:flex-row gap-2">
          <UniversalSearch onSearch={setSearchText} className="flex-1" />
          <div className="flex gap-2">
            <FilterButton onClick={() => setIsFilterModalOpen(true)} activeFilters={activeFilters.length} />
            <ColumnSelectionButton
              onClick={() => setIsColumnModalOpen(true)}
              hiddenColumnsCount={columnOptions.filter((col) => !col.isVisible).length}
            />
          </div>
        </div>

        {/* Adaugă acest cod după secțiunea de căutare universală și butonul de filtrare */}
        {hasEquipmentStatusFilter && (
          <div className="mt-2">
            <Badge variant="outline" className="bg-blue-50 text-blue-800 border-blue-200">
              Filtrare după status echipament activă
            </Badge>
          </div>
        )}

        {/* Modal de filtrare */}
        <FilterModal
          isOpen={isFilterModalOpen}
          onClose={() => setIsFilterModalOpen(false)}
          title="Filtrare lucrări"
          filterOptions={filterOptions}
          activeFilters={activeFilters}
          onApplyFilters={handleApplyFilters}
          onResetFilters={handleResetFilters}
        />

        {/* Modal de selecție coloane */}
        <ColumnSelectionModal
          isOpen={isColumnModalOpen}
          onClose={() => setIsColumnModalOpen(false)}
          title="Vizibilitate coloane"
          columns={columnOptions}
          onToggleColumn={handleToggleColumn}
          onSelectAll={handleSelectAllColumns}
          onDeselectAll={handleDeselectAllColumns}
        />

        {loading ? (
          <div className="flex justify-center items-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            <span className="ml-2 text-gray-600">Se încarcă lucrările...</span>
          </div>
        ) : fetchError ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              A apărut o eroare la încărcarea lucrărilor. Încercați să reîmprospătați pagina.
            </AlertDescription>
          </Alert>
        ) : activeTab === "tabel" ? (
            <DataTable
              columns={columns}
              data={filteredData}
            defaultSort={{ id: "updatedAt", desc: true }}
            sorting={tableSorting}
            onSortingChange={handleSortingChange}
              onRowClick={(lucrare) => handleViewDetails(lucrare)}
              table={tableInstance}
              setTable={setTableInstance}
              showFilters={false}
              getRowClassName={getRowClassName}
              persistenceKey="lucrari"
            />
        ) : (
          <div className="space-y-4">
            {/* Controale pentru paginația cards */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <p className="text-sm font-medium">Carduri per pagină</p>
                <Select
                  value={`${cardsPageSize}`}
                  onValueChange={handleCardsPageSizeChange}
                >
                  <SelectTrigger className="h-8 w-[70px]">
                    <SelectValue placeholder={cardsPageSize} />
                  </SelectTrigger>
                  <SelectContent side="top">
                    {[6, 12, 24, 48].map((pageSize) => (
                      <SelectItem key={pageSize} value={`${pageSize}`}>
                        {pageSize}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex w-[100px] items-center justify-center text-sm font-medium">
                Pagina {cardsCurrentPage} din {totalCardsPages || 1}
              </div>
            </div>

            {/* Grid cu cards */}
            <div className="grid gap-4 px-4 sm:px-0 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-4 w-full overflow-auto">
              {paginatedCardsData.map((lucrare) => {
              // Check if the work order is completed with report but not picked up
              const isCompletedNotPickedUp = isCompletedWithReportNotPickedUp(lucrare)

              return (
                <Card
                  key={lucrare.id}
                  className={`overflow-hidden ${
                    isTechnician && isCompletedNotPickedUp ? "cursor-default" : "cursor-pointer hover:shadow-md"
                  } ${lucrare ? getWorkStatusRowClass(lucrare) : ""}`}
                  onClick={() => {
                    if (!(isTechnician && isCompletedNotPickedUp)) {
                      handleViewDetails(lucrare)
                    }
                  }}
                >
                  <CardContent className="p-0">
                    <div className="flex items-center justify-between border-b p-4">
                      <div>
                        <h3 className="font-medium">{lucrare.client}</h3>
                        <p className="text-sm text-muted-foreground">
                        Locatie: {lucrare.locatie}
                             
                        </p>
                      </div>
                      <Badge className={getWorkStatusClass(lucrare.statusLucrare)}>{lucrare.statusLucrare}</Badge>
                    </div>
                    <div className="p-4">
                      <div className="mb-4 space-y-2">
                        <div className="flex justify-between">
                          <span className="text-sm font-medium text-muted-foreground">Tip:</span>
                          <Badge variant="outline" className={getWorkTypeClass(lucrare.tipLucrare)}>
                            {lucrare.tipLucrare}
                          </Badge>
                        </div>
                        {lucrare.defectReclamat && (
                          <div>
                            <span className="text-sm font-medium text-muted-foreground">Defect reclamat:</span>
                            <p className="text-sm line-clamp-2" title={lucrare.defectReclamat}>
                              {lucrare.defectReclamat}
                            </p>
                          </div>
                        )}
                        {lucrare.tipLucrare === "Intervenție în contract" && (
                          <div className="flex justify-between">
                            <span className="text-sm font-medium text-muted-foreground">Contract:</span>
                            <ContractDisplay contractId={lucrare.contract} />
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span className="text-sm font-medium text-muted-foreground">Data emiterii:</span>
                          <span className="text-sm">{lucrare.dataEmiterii}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm font-medium text-muted-foreground">Data solicitată:</span>
                          <span className="text-sm">{lucrare.dataInterventie}</span>
                        </div>
                        <div>
                          <span className="text-sm font-medium text-muted-foreground">Tehnicieni:</span>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {lucrare.tehnicieni.map((tehnician, index) => (
                              <Badge key={index} variant="secondary" className="bg-gray-100">
                                {tehnician}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        {lucrare.statusEchipament && (
                          <div className="flex justify-between">
                            <span className="text-sm font-medium text-muted-foreground">Status echipament:</span>
                            <Badge className={getEquipmentStatusClass(lucrare.statusEchipament)}>
                              {lucrare.statusEchipament}
                            </Badge>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span className="text-sm font-medium text-muted-foreground">Contact:</span>
                          <span className="text-sm">{lucrare.persoanaContact}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm font-medium text-muted-foreground">Telefon:</span>
                          <span className="text-sm">{lucrare.telefon}</span>
                        </div>
                      </div>
                      {/* Adăugăm acest cod în secțiunea de carduri, după statusul lucrării
                      Acest cod trebuie adăugat în componenta Card, în secțiunea de detalii */}
                      {(lucrare.statusOferta === "DA" || (lucrare.statusOferta === undefined && lucrare.necesitaOferta)) && (
                        <div className="flex justify-between mt-2">
                          <span className="text-sm font-medium text-muted-foreground">Ofertă:</span>
                          <Badge className="bg-orange-100 text-orange-800">Necesită ofertă</Badge>
                        </div>
                      )}
                      {lucrare.statusOferta === "OFERTAT" && (
                        <div className="flex justify-between mt-2">
                          <span className="text-sm font-medium text-muted-foreground">Ofertă:</span>
                          <Badge className="bg-blue-100 text-blue-800">Ofertat</Badge>
                        </div>
                      )}
                      {lucrare.statusLucrare === "Finalizat" && lucrare.raportGenerat === true && (
                        <div className="flex justify-between items-center mt-2 mb-2">
                          <span className="text-sm font-medium text-muted-foreground">Status preluare:</span>
                          {lucrare.preluatDispecer ? (
                            <Badge className="bg-green-100 text-green-800">Preluat</Badge>
                          ) : (
                            <>
                              {userData?.role === "tehnician" ? (
                                <Badge className="bg-yellow-100 text-yellow-800">În așteptare</Badge>
                              ) : (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 px-2 text-blue-600 border-blue-200 hover:bg-blue-50"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleDispatcherPickup(lucrare)
                                  }}
                                >
                                  <Check className="h-3 w-3 mr-1" /> Preia
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      )}
                      <div className="mb-4">
                        <p className="text-sm font-medium text-muted-foreground">Descriere:</p>
                        <p className="text-sm line-clamp-2" title={lucrare.descriere}>
                          {lucrare.descriere}
                        </p>
                      </div>
                      <div className="flex items-center justify-between">
                        {userData?.role !== "tehnician" && (
                          <Badge className={getInvoiceStatusClass(lucrare.statusFacturare)}>
                            {lucrare.statusFacturare}
                          </Badge>
                        )}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="sm" className="gap-1">
                              Acțiuni
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                            {/* For technicians, if the work order is completed with report but not picked up, disable actions */}
                            {isTechnician && isCompletedNotPickedUp ? (
                              <DropdownMenuItem disabled className="text-gray-400 cursor-not-allowed">
                                <Info className="mr-2 h-4 w-4" /> Lucrare în așteptare de preluare
                              </DropdownMenuItem>
                            ) : (
                              <>
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleViewDetails(lucrare)
                                  }}
                                >
                                  <Eye className="mr-2 h-4 w-4" /> Vizualizează
                                </DropdownMenuItem>
                                {!isTechnician && (
                                  <DropdownMenuItem
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleEdit(lucrare)
                                    }}
                                  >
                                    <Pencil className="mr-2 h-4 w-4" /> Editează
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleGenerateReport(lucrare)
                                  }}
                                >
                                  <FileText className="mr-2 h-4 w-4" /> Generează Raport
                                </DropdownMenuItem>
                                {/* Opțiune de reatribuire pentru dispeceri/admini când lucrarea are situații critice */}
                                {!isTechnician && needsReassignment(lucrare) && (
                                  <DropdownMenuItem
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleReassign(lucrare)
                                    }}
                                  >
                                    <RefreshCw className="mr-2 h-4 w-4" /> Reatribuie lucrarea
                                  </DropdownMenuItem>
                                )}
                                {userData?.role === "admin" && (
                                  <DropdownMenuItem
                                    className="text-red-600"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleDelete(lucrare.id)
                                    }}
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" /> Șterge
                                  </DropdownMenuItem>
                                )}
                              </>
                            )}
                            {userData?.role !== "tehnician" &&
                              lucrare.statusLucrare === "Finalizat" &&
                              lucrare.raportGenerat === true &&
                              !lucrare.preluatDispecer && (
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleDispatcherPickup(lucrare)
                                  }}
                                >
                                  <Check className="mr-2 h-4 w-4" /> Preia lucrarea
                                </DropdownMenuItem>
                              )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
              {paginatedCardsData.length === 0 && filteredData.length === 0 && (
                <div className="col-span-full text-center py-10">
                  {userData?.role === "tehnician" ? (
                    <div>
                      <p className="text-muted-foreground mb-2">Nu aveți lucrări active în acest moment.</p>
                      <p className="text-sm text-muted-foreground">
                        Lucrările finalizate cu raport generat și preluate de dispecer nu mai sunt afișate.
                      </p>
                    </div>
                  ) : (
                    <p className="text-muted-foreground">Nu există lucrări care să corespundă criteriilor de căutare.</p>
                  )}
                </div>
              )}
            </div>

            {/* Paginația pentru cards */}
            {totalCardsPages > 1 && (
              <div className="flex items-center justify-center space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCardsCurrentPage(cardsCurrentPage - 1)}
                  disabled={cardsCurrentPage === 1}
                >
                  Anterioară
                </Button>
                <div className="flex items-center space-x-1">
                  {Array.from({ length: totalCardsPages }, (_, i) => i + 1)
                    .filter((page) => {
                      const distance = Math.abs(page - cardsCurrentPage)
                      return distance <= 2 || page === 1 || page === totalCardsPages
                    })
                    .map((page, index, filteredPages) => {
                      const prevPage = filteredPages[index - 1]
                      const showEllipsis = prevPage && page - prevPage > 1
                      
                      return (
                        <div key={page} className="flex items-center">
                          {showEllipsis && <span className="px-2 text-muted-foreground">...</span>}
                          <Button
                            variant={page === cardsCurrentPage ? "default" : "outline"}
                            size="sm"
                            className="w-8 h-8 p-0"
                            onClick={() => setCardsCurrentPage(page)}
                          >
                            {page}
                          </Button>
                        </div>
                      )
                    })}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCardsCurrentPage(cardsCurrentPage + 1)}
                  disabled={cardsCurrentPage === totalCardsPages}
                >
                  Următoarea
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
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
    </DashboardShell>
  )
}
