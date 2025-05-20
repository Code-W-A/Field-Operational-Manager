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
import { FileText, Eye, Pencil, Trash2, Loader2, AlertCircle, Plus, Mail, Check, Info } from "lucide-react"
import { useMediaQuery } from "@/hooks/use-media-query"
import { useFirebaseCollection } from "@/hooks/use-firebase-collection"
import { addLucrare, deleteLucrare, updateLucrare, getLucrareById } from "@/lib/firebase/firestore"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { orderBy } from "firebase/firestore"
import { useAuth } from "@/contexts/AuthContext"
import { LucrareForm, type LucrareFormRef } from "@/components/lucrare-form"
import { DataTable } from "@/components/data-table/data-table"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Card, CardContent } from "@/components/ui/card"
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
} from "@/lib/utils/constants"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

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
  const [dataEmiterii, setDataEmiterii] = useState(new Date())
  const [dataInterventie, setDataInterventie] = useState(new Date())
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
  const [error, setError] = useState(null)
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

  // Obținem lucrările din Firebase
  const {
    data: lucrari,
    loading,
    error: fetchError,
  } = useFirebaseCollection("lucrari", [orderBy("dataEmiterii", "desc")])

  // Update the filteredLucrari function to include completed work orders that haven't been picked up
  const filteredLucrari = useMemo(() => {
    if (userData?.role === "tehnician" && userData?.displayName) {
      console.log("Filtrare lucrări pentru tehnician:", userData.displayName)

      const filteredList = lucrari.filter((lucrare) => {
        // Verificăm dacă lucrarea este atribuită tehnicianului
        const isAssignedToTechnician =
          lucrare.tehnicieni && Array.isArray(lucrare.tehnicieni) && lucrare.tehnicieni.includes(userData.displayName)

        // Verificăm dacă lucrarea este finalizată și are raport generat și a fost preluată de dispecer
        const isFinalized = lucrare.statusLucrare === "Finalizat"
        const hasReportGenerated = lucrare.raportGenerat === true
        const isPickedUpByDispatcher = lucrare.preluatDispecer === true
        const isCompletedWithReportAndPickedUp = isFinalized && hasReportGenerated && isPickedUpByDispatcher

        // Pentru depanare
        if (isAssignedToTechnician && isFinalized) {
          console.log("Lucrare finalizată pentru tehnician:", {
            id: lucrare.id,
            client: lucrare.client,
            statusLucrare: lucrare.statusLucrare,
            raportGenerat: lucrare.raportGenerat,
            preluatDispecer: lucrare.preluatDispecer,
            isCompletedWithReportAndPickedUp,
          })
        }

        // Includem lucrarea doar dacă este atribuită tehnicianului și NU este finalizată cu raport și preluată de dispecer
        return isAssignedToTechnician && !isCompletedWithReportAndPickedUp
      })

      console.log(`Filtrat ${lucrari.length} lucrări -> ${filteredList.length} lucrări pentru tehnician`)
      return filteredList
    }
    return lucrari
  }, [lucrari, userData?.role, userData?.displayName])

  // Helper function to check if a work order is completed with report but not picked up
  const isCompletedWithReportNotPickedUp = useCallback((lucrare) => {
    return lucrare.statusLucrare === "Finalizat" && lucrare.raportGenerat === true && lucrare.preluatDispecer === false
  }, [])

  // Modificăm funcția filterOptions pentru a include și echipamentele
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
    ]
  }, [filteredLucrari, tehnicieni])

  // Modificăm funcția applyFilters pentru a gestiona filtrarea după echipament
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
  }, [searchText, filteredLucrari, activeFilters, applyFilters])

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

  // Inițializăm datele filtrate
  useEffect(() => {
    setFilteredData(filteredLucrari)
  }, [filteredLucrari])

  // Populate column options when table is available
  useEffect(() => {
    if (tableInstance) {
      const allColumns = tableInstance.getAllColumns()
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
  }, [tableInstance, isColumnModalOpen])

  const handleToggleColumn = (columnId: string) => {
    if (!tableInstance) return

    const column = tableInstance.getColumn(columnId)
    if (column) {
      column.toggleVisibility(!column.getIsVisible())

      // Update options state to reflect changes
      setColumnOptions((prev) =>
        prev.map((option) => (option.id === columnId ? { ...option, isVisible: !option.isVisible } : option)),
      )
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
    setColumnOptions((prev) => prev.map((option) => ({ ...option, isVisible: true })))
  }

  const handleDeselectAllColumns = () => {
    if (!tableInstance) return

    tableInstance.getAllColumns().forEach((column) => {
      if (column.getCanHide() && column.id !== "actions") {
        column.toggleVisibility(false)
      }
    })

    // Update all options except actions to not visible
    setColumnOptions((prev) =>
      prev.map((option) => ({
        ...option,
        isVisible: option.id === "actions" ? true : false,
      })),
    )
  }

  const handleInputChange = (e) => {
    const { id, value } = e.target
    setFormData((prev) => ({ ...prev, [id]: value }))
  }

  const handleSelectChange = (id, value) => {
    setFormData((prev) => ({ ...prev, [id]: value }))
  }

  const handleTehnicieniChange = (value) => {
    // Verificăm dacă tehnicianul este deja selectat
    if (formData.tehnicieni.includes(value)) {
      // Dacă da, îl eliminăm
      const newTehnicieni = formData.tehnicieni.filter((tech) => tech !== value)

      // Actualizăm statusul doar dacă este "Listată" sau "Atribuită"
      let newStatus = formData.statusLucrare
      if (formData.statusLucrare === "Listată" || formData.statusLucrare === "Atribuită") {
        newStatus = newTehnicieni.length > 0 ? "Atribuită" : "Listată"
      }

      setFormData((prev) => ({
        ...prev,
        tehnicieni: newTehnicieni,
        statusLucrare: newStatus,
      }))
    } else {
      // Dacă nu, îl adăugăm
      // Actualizăm statusul doar dacă este "Listată" sau "Atribuită"
      let newStatus = formData.statusLucrare
      if (formData.statusLucrare === "Listată" || formData.statusLucrare === "Atribuită") {
        newStatus = "Atribuită" // Dacă adăugăm un tehnician, statusul devine "Atribuită"
      }

      setFormData((prev) => ({
        ...prev,
        tehnicieni: [...prev.tehnicieni, value],
        statusLucrare: newStatus,
      }))
    }
  }

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
      }

      // Adăugăm lucrarea în Firestore
      const lucrareId = await addLucrare(newLucrare)

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
  }

  const handleResetFilters = () => {
    setActiveFilters([])
  }

  // Definim coloanele pentru DataTable
  const columns = [
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
      accessorKey: "echipament",
      header: "Echipament",
      enableHiding: true,
      enableFiltering: true,
      cell: ({ row }) => {
        // Verificăm dacă există câmpul echipament
        if (row.original.echipament) {
          // Dacă există și codul echipamentului, îl afișăm între paranteze
          if (row.original.echipamentCod) {
            return (
              <div>
                {row.original.echipament} <span className="text-gray-500">({row.original.echipamentCod})</span>
              </div>
            )
          }
          // Altfel, afișăm doar numele echipamentului
          return <div>{row.original.echipament}</div>
        }
        // Dacă nu există echipament, afișăm locația
        return <div>{row.original.locatie}</div>
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
  const handleCustomChange = useCallback(
    (field: string, value: any) => {
      setFormData((prev) => ({ ...prev, [field]: value }))
    },
    [], //  ← dependenţe goale ⇒ funcţia NU-şi mai schimbă referinţa
  )
  // Function to check if we should show the close confirmation dialog
  const handleCloseAddDialog = () => {
    if (addFormRef.current?.hasUnsavedChanges()) {
      setShowCloseAlert(true)
    } else {
      setIsAddDialogOpen(false)
    }
  }

  // Function to check if we should show the close confirmation dialog for edit
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
            <DialogContent className="w-[calc(100%-2rem)] max-w-[600px] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Adaugă Lucrare Nouă</DialogTitle>
                <DialogDescription>Completați detaliile pentru a crea o lucrare nouă</DialogDescription>
              </DialogHeader>
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
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
                fieldErrors={fieldErrors}
                onCancel={() => handleCloseAddDialog()}
                handleCustomChange={handleCustomChange}
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

        {/* Modal de filtrare */}
        <FilterModal
          isOpen={isFilterModalOpen}
          onClose={() => setIsFilterModalOpen(false)}
          title="Filtrare lucrări"
          filterOptions={filterOptions}
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
          <div className="rounded-md border">
            <DataTable
              columns={columns}
              data={filteredData}
              defaultSort={{ id: "dataEmiterii", desc: true }}
              onRowClick={(lucrare) => handleViewDetails(lucrare)}
              table={tableInstance}
              setTable={setTableInstance}
              showFilters={false}
              getRowClassName={getRowClassName}
            />
          </div>
        ) : (
          // Modificăm și partea din vizualizarea carduri pentru a adăuga verificări suplimentare
          <div className="grid gap-4 px-4 sm:px-0 sm:grid-cols-2 lg:grid-cols-3 w-full overflow-auto">
            {filteredData.map((lucrare) => {
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
                          {lucrare.echipament ? (
                            <>
                              {lucrare.echipament}
                              {lucrare.echipamentCod && (
                                <span className="text-gray-500"> ({lucrare.echipamentCod})</span>
                              )}
                            </>
                          ) : (
                            lucrare.locatie
                          )}
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
                        <div className="flex justify-between">
                          <span className="text-sm font-medium text-muted-foreground">Contact:</span>
                          <span className="text-sm">{lucrare.persoanaContact}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm font-medium text-muted-foreground">Telefon:</span>
                          <span className="text-sm">{lucrare.telefon}</span>
                        </div>
                      </div>
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
            {filteredData.length === 0 && (
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
