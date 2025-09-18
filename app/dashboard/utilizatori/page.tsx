"use client"

import type React from "react"

import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { DashboardHeader } from "@/components/dashboard-header"
import { DashboardShell } from "@/components/dashboard-shell"
import { Plus, Pencil, Trash2, Loader2, AlertCircle, ChevronsUpDown, Check, Eye, EyeOff } from "lucide-react"
import { collection, query, orderBy, getDocs, doc, getDoc } from "firebase/firestore"
import { db } from "@/lib/firebase/config"
import { registerUser, deleteUserAccount, type UserData, type UserRole } from "@/lib/firebase/auth"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useAuth } from "@/contexts/AuthContext"
import { UserEditForm } from "@/components/user-edit-form"
import { DataTable } from "@/components/data-table/data-table"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useMediaQuery } from "@/hooks/use-media-query"
import { UniversalSearch } from "@/components/universal-search"
import { ColumnSelectionButton } from "@/components/column-selection-button"
import { ColumnSelectionModal } from "@/components/column-selection-modal"
import { FilterButton } from "@/components/filter-button"
import { FilterModal, type FilterOption } from "@/components/filter-modal"
import { useTablePersistence } from "@/hooks/use-table-persistence"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { useToast } from "@/components/ui/use-toast"
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
import { MultiSelect } from "@/components/ui/multi-select"
import { Dialog as UiDialog, DialogContent as UiDialogContent, DialogHeader as UiDialogHeader, DialogTitle as UiDialogTitle, DialogFooter as UiDialogFooter } from "@/components/ui/dialog"
import { Checkbox } from "@/components/ui/checkbox"

export default function Utilizatori() {
  const { userData: currentUser } = useAuth()
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<UserData | null>(null)
  const [utilizatori, setUtilizatori] = useState<UserData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    confirmPassword: "",
    displayName: "",
    phoneNumber: "",
    role: "" as UserRole,
    clientId: "",
    allowedLocationNames: [] as string[],
  })
  const [clientsForSelect, setClientsForSelect] = useState<Array<{id:string; nume:string; locatii?: any[]; email?: string}>>([])
  const [selectedClientLocations, setSelectedClientLocations] = useState<string[]>([])
  const [clientAccess, setClientAccess] = useState<Array<{ clientId: string; locationNames: string[] }>>([])
  const [isClientPickerOpen2, setIsClientPickerOpen2] = useState(false)
  const [locationDialogOpen, setLocationDialogOpen] = useState(false)
  const [pendingClientId, setPendingClientId] = useState<string>("")
  const [pendingLocations, setPendingLocations] = useState<string[]>([])
  const [selectedClientsDialogOpen, setSelectedClientsDialogOpen] = useState(false)
  const clientOptions = useMemo(() => clientsForSelect.map(c => ({ label: c.nume || c.id, value: c.id })), [clientsForSelect])
  const aggregatedLocationOptions = useMemo(() => {
    const selected = clientsForSelect.filter(c => pendingClientId === c.id)
    const names = new Set<string>()
    selected.forEach(c => (c.locatii || []).forEach((l:any) => names.add(l?.nume)))
    return Array.from(names).sort((a,b)=> (a||"").localeCompare(b||"","ro",{sensitivity:"base"})).map(n => ({ label: n, value: n }))
  }, [clientsForSelect, pendingClientId])
  const [sendInvite, setSendInvite] = useState<boolean>(false)
  const [inviteRecipients, setInviteRecipients] = useState<string[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [userToDelete, setUserToDelete] = useState<UserData | null>(null)
  const [table, setTable] = useState<any>(null)
  const [searchText, setSearchText] = useState("")
  const [filteredData, setFilteredData] = useState<UserData[]>([])
  const [isColumnModalOpen, setIsColumnModalOpen] = useState(false)
  const [columnOptions, setColumnOptions] = useState<any[]>([])
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false)
  const [activeFilters, setActiveFilters] = useState<FilterOption[]>([])
  const [showCloseAlert, setShowCloseAlert] = useState(false)
  const [activeDialog, setActiveDialog] = useState<"add" | "edit" | "delete" | null>(null)
  const editFormRef = useRef<any>(null)
  const [isClientPickerOpen, setIsClientPickerOpen] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const { toast } = useToast()

  const sortedClientsForSelect = useMemo(() => {
    return [...clientsForSelect].sort((a, b) => (a.nume || "").localeCompare(b.nume || "", "ro", { sensitivity: "base" }))
  }, [clientsForSelect])

  // Add state for activeTab
  const [activeTab, setActiveTab] = useState("tabel")

  // Persistența tabelului
  const { loadSettings, saveFilters, saveColumnVisibility, saveSorting, saveSearchText } = useTablePersistence("utilizatori")

  // Detect if we're on a mobile device
  const isMobile = useMediaQuery("(max-width: 768px)")

  // Get users from Firebase
  const fetchUtilizatori = async () => {
    try {
      setLoading(true)
      const q = query(collection(db, "users"), orderBy("displayName"))
      const querySnapshot = await getDocs(q)

      const users: UserData[] = []
      querySnapshot.forEach((doc) => {
        users.push({ uid: doc.id, ...(doc.data() as any) } as unknown as UserData)
      })

      setUtilizatori(users)
      setFilteredData(users) // Inițializăm datele filtrate
      setError(null)
    } catch (err) {
      console.error("Eroare la încărcarea utilizatorilor:", err)
      setError("A apărut o eroare la încărcarea utilizatorilor.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchUtilizatori()
  }, [])

  // Fetch clients for client-user creation
  useEffect(() => {
    const loadClients = async () => {
      try {
        const snap = await getDocs(collection(db, "clienti"))
        const list: Array<{id:string; nume:string; locatii?: any[]}> = []
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }))
        setClientsForSelect(list.sort((a, b) => (a.nume || "").localeCompare(b.nume || "", "ro", { sensitivity: "base" })))
      } catch (e) {
        console.warn("Nu s-au putut încărca clienții pentru cont client:", e)
      }
    }
    loadClients()
  }, [])

  // Încărcăm setările salvate la inițializare
  useEffect(() => {
    const savedSettings = loadSettings()
    if (savedSettings.activeFilters) {
      setActiveFilters(savedSettings.activeFilters)
    }
    if (savedSettings.searchText) {
      setSearchText(savedSettings.searchText)
    }
  }, [loadSettings])

  // Handler pentru schimbarea search text-ului
  const handleSearchChange = (value: string) => {
    setSearchText(value)
    saveSearchText(value)
  }

  // Define filter options based on user data
  const filterOptions = useMemo<FilterOption[]>(() => {
    // Extract unique roles for multiselect filter
    const roleOptions = Array.from(new Set(utilizatori.map((user) => user.role))).map((role) => ({
      value: role,
      label: role === "admin" ? "Administrator" : role === "dispecer" ? "Dispecer" : "Tehnician",
    }))

    // Create a date range for last login
    return [
      {
        id: "role",
        label: "Rol",
        type: "multiselect",
        options: roleOptions,
        value: [],
      } as unknown as FilterOption,
      {
        id: "lastLogin",
        label: "Ultima autentificare",
        type: "dateRange",
        value: null,
      } as unknown as FilterOption,
    ]
  }, [utilizatori])

  // Apply active filters
  const applyFilters = useCallback(
    (data: UserData[]) => {
      if (!activeFilters.length) return data

      return data.filter((item) => {
        return activeFilters.every((filter) => {
          // If filter has no value, ignore it
          if (!filter.value || (Array.isArray(filter.value) && filter.value.length === 0)) {
            return true
          }

          switch (filter.id) {
            case "role":
              // For multiselect filters
              if (Array.isArray(filter.value)) {
                return filter.value.includes(item.role)
              }
              return true

            case "lastLogin":
              if (filter.value.from || filter.value.to) {
                try {
                  if (!item.lastLogin) return false
                  const ts: any = item.lastLogin as any
                  const itemDate = ts?.toDate ? ts.toDate() : new Date(ts)

                  if (filter.value.from) {
                    const fromDate = new Date(filter.value.from)
                    fromDate.setHours(0, 0, 0, 0)
                    if (itemDate < fromDate) return false
                  }

                  if (filter.value.to) {
                    const toDate = new Date(filter.value.to)
                    toDate.setHours(23, 59, 59, 999)
                    if (itemDate > toDate) return false
                  }

                  return true
                } catch (error) {
                  console.error("Eroare la parsarea datei:", error)
                  return true
                }
              }
              return true

            default:
              return true
          }
        })
      })
    },
    [activeFilters],
  )

  // Apply manual filtering based on search text and active filters
  useEffect(() => {
    // Dacă nu avem date, nu facem nimic
    if (!utilizatori || utilizatori.length === 0) {
      setFilteredData([])
      return
    }

    let filtered = utilizatori

    // Apply active filters
    if (activeFilters.length) {
      filtered = applyFilters(filtered)
    }

    // Apply global search
    if (searchText.trim()) {
      const lowercasedFilter = searchText.toLowerCase()
      filtered = filtered.filter((item) => {
        return Object.keys(item as any).some((key) => {
          const value = (item as any)[key]
          if (value === null || value === undefined) return false

          // Handle arrays (if any)
          if (Array.isArray(value)) {
            return value.some((v) => String(v).toLowerCase().includes(lowercasedFilter))
          }

          // Convert to string for search
          return String(value).toLowerCase().includes(lowercasedFilter)
        })
      })
    }

    setFilteredData(filtered)
  }, [searchText, utilizatori, activeFilters]) // Eliminat applyFilters din dependencies

  // Forțăm refiltrarea când datele se încarcă și avem un searchText salvat
  useEffect(() => {
    if (!loading && utilizatori && utilizatori.length > 0 && searchText.trim()) {
      // Trigger o refiltrare pentru a aplica searchText-ul încărcat din localStorage
      const timeoutId = setTimeout(() => {
        // Forțăm o actualizare a filteredData aplicând din nou filtrarea
        let filtered = utilizatori

        if (activeFilters.length) {
          filtered = applyFilters(filtered)
        }

        if (searchText.trim()) {
          const lowercasedFilter = searchText.toLowerCase()
          filtered = filtered.filter((item) => {
            return Object.keys(item as any).some((key) => {
              const value = (item as any)[key]
              if (value === null || value === undefined) return false

              if (Array.isArray(value)) {
                return value.some((v) => String(v).toLowerCase().includes(lowercasedFilter))
              }

              return String(value).toLowerCase().includes(lowercasedFilter)
            })
          })
        }

        setFilteredData(filtered)
      }, 100) // Mic delay pentru a se asigura că toate datele sunt încărcate

      return () => clearTimeout(timeoutId)
    }
  }, [loading, utilizatori, searchText, activeFilters]) // Trigger când loading se termină

  // Automatically set card view on mobile
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
    const savedCardsPageSize = localStorage.getItem("cardsPageSize_utilizatori")
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
    localStorage.setItem("cardsPageSize_utilizatori", value)
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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { id, value } = e.target
    setFormData((prev) => ({ ...prev, [id]: value }))
  }

  const handleSelectChange = (value: string) => {
    setFormData((prev) => ({ ...prev, role: value as UserRole }))
  }

  const handleClientChange = (value: string) => {
    setPendingClientId(value)
    // Reset selected locations when client changes
    setSelectedClientLocations([])
    // Precompletează emailul cu emailul principal al clientului (dacă există)
    const selected = clientsForSelect.find((c) => c.id === value) as any
    if (selected?.email) {
      setFormData((prev) => ({ ...prev, email: selected.email }))
    }
    // Activăm implicit trimiterea invitației pentru rol client
    setSendInvite(true)
  }

  const addClientAccessEntry = () => {
    if (!pendingClientId) return
    const newEntry = { clientId: pendingClientId, locationNames: [...pendingLocations] }
    setClientAccess((prev) => {
      const without = prev.filter((e) => e.clientId !== pendingClientId)
      return [...without, newEntry]
    })
    setPendingClientId("")
    setPendingLocations([])
    setLocationDialogOpen(false)
  }

  const removeClientAccessEntry = (clientId: string) => {
    setClientAccess((prev) => prev.filter((e) => e.clientId !== clientId))
  }

  const handleToggleLocation = (locName: string) => {
    setSelectedClientLocations((prev) =>
      prev.includes(locName) ? prev.filter((n) => n !== locName) : [...prev, locName],
    )
  }

  const handleToggleTempLocation = (locName: string) => {
    setPendingLocations((prev) =>
      prev.includes(locName) ? prev.filter((n) => n !== locName) : [...prev, locName],
    )
  }

  // Recalculează destinatarii invitației
  useEffect(() => {
    if (formData.role !== "client") {
      setInviteRecipients([])
      return
    }
    const recipients = new Set<string>()
    const mainEmail = formData.email?.trim()
    const isValid = (e?: string) => !!e && /.+@.+\..+/.test(e)
    if (isValid(mainEmail)) recipients.add(mainEmail!)
    // parcurgem toate intrările selectate
    clientAccess.forEach((entry) => {
      const client = clientsForSelect.find((c) => c.id === entry.clientId) as any
      if (isValid(client?.email)) recipients.add(client.email)
      const selectedLocs = (client?.locatii || []).filter((l: any) => entry.locationNames.includes(l?.nume))
      selectedLocs.forEach((l: any) => {
        (l?.persoaneContact || []).forEach((p: any) => {
          if (isValid(p?.email)) recipients.add(p.email)
        })
      })
    })
    setInviteRecipients(Array.from(recipients))
  }, [formData.role, formData.email, clientAccess, clientsForSelect])

  const handleSubmit = async () => {
    try {
      setIsSubmitting(true)
      setFormError(null)

      // Validation
      if (!formData.email || !formData.password || !formData.displayName || !formData.role) {
        const msg = "Vă rugăm să completați toate câmpurile obligatorii"
        setFormError(msg)
        toast({ variant: "destructive", title: "Formular incomplet", description: msg })
        setIsSubmitting(false)
        return
      }

      if (formData.password !== formData.confirmPassword) {
        const msg = "Parolele nu coincid"
        setFormError(msg)
        toast({ variant: "destructive", title: "Eroare parolă", description: msg })
        setIsSubmitting(false)
        return
      }

      if (formData.password.length < 6) {
        const msg = "Parola trebuie să aibă cel puțin 6 caractere"
        setFormError(msg)
        toast({ variant: "destructive", title: "Parolă prea scurtă", description: msg })
        setIsSubmitting(false)
        return
      }

      // Register the user (support clientAccess for client role)
      const access = formData.role === "client" ? clientAccess : []
      await registerUser(
        formData.email,
        formData.password,
        formData.displayName,
        formData.role,
        formData.phoneNumber,
        access,
      )

      toast({ title: "Utilizator creat", description: `Contul pentru ${formData.displayName} a fost creat cu succes.` })

      // Trimitem invitația dacă este rol client și s-a bifat opțiunea
      if (formData.role === "client" && sendInvite && inviteRecipients.length) {
        try {
          const origin = (typeof window !== 'undefined' ? window.location.origin : '')
          const subject = "Invitație acces Portal Client – FOM"
          const content = `Bună ziua,\n\nVă-am creat acces în Portalul Client FOM.\n\nEmail: ${formData.email}\nParolă provizorie: ${formData.password}\nPortal: ${origin}/portal\n\nDupă autentificare, vă rugăm să schimbați parola din cont.\n\nVă mulțumim!`
          const html = `
            <div style="font-family:Arial,sans-serif;line-height:1.5">
              <h2 style="margin:0 0 12px;color:#0f56b3">Invitație acces Portal Client – FOM</h2>
              <p>Vă-am creat acces în Portalul Client FOM.</p>
              <p><strong>Email:</strong> ${formData.email}<br/>
                 <strong>Parolă provizorie:</strong> ${formData.password}<br/>
                 <strong>Portal:</strong> <a href="${origin}/portal" target="_blank">${origin}/portal</a></p>
              <p>După autentificare, vă rugăm să schimbați parola din cont.</p>
              <p>Vă mulțumim!</p>
            </div>`
          const resp = await fetch("/api/users/invite", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ to: inviteRecipients, subject, content, html }),
          })
          if (!resp.ok) throw new Error("Invite email failed")
          toast({ title: "Invitație trimisă", description: `Email trimis către: ${inviteRecipients.join(", ")}` })
        } catch (e) {
          console.warn("Trimitere invitație eșuată (non-blocking):", e)
          toast({ variant: "destructive", title: "Invitație eșuată", description: "Nu s-a putut trimite emailul de invitație." })
        }
      } else if (formData.role === "client" && sendInvite && !inviteRecipients.length) {
        toast({ variant: "destructive", title: "Nu există destinatari valizi", description: "Verificați adresele de email ale clientului/locațiilor." })
      }

      // Reload the user list
      await fetchUtilizatori()

      // Close the dialog and reset the form
      setIsAddDialogOpen(false)
      setFormData({
        email: "",
        password: "",
        confirmPassword: "",
        displayName: "",
        phoneNumber: "",
        role: "" as UserRole,
        clientId: "",
        allowedLocationNames: [],
      })
      setSelectedClientLocations([])
      setClientAccess([])
      setPendingClientId("")
      setPendingLocations([])
    } catch (err: any) {
      console.error("Eroare la înregistrarea utilizatorului:", err)
      const code = err?.code || ""
      const map: Record<string, string> = {
        "auth/email-already-in-use": "Adresa de email este deja utilizată.",
        "auth/invalid-email": "Adresa de email nu este validă.",
        "auth/weak-password": "Parola este prea slabă (minim 6 caractere).",
        "auth/operation-not-allowed": "Crearea de conturi este dezactivată.",
        "auth/network-request-failed": "Eroare de rețea. Încercați din nou.",
      }
      const msg = map[code] || "A apărut o eroare la înregistrarea utilizatorului. Încercați din nou."
      setFormError(msg)
      toast({ variant: "destructive", title: "Eroare creare cont", description: msg })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleApplyFilters = (filters: FilterOption[]) => {
    // Filter only filters that have values
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

  const handleEdit = (user: UserData) => {
    setSelectedUser(user)
    setIsEditDialogOpen(true)
  }

  const handleEditSuccess = () => {
    setIsEditDialogOpen(false)
    fetchUtilizatori()
  }

  const handleDeleteClick = (user: UserData) => {
    setUserToDelete(user)
    setDeleteConfirmOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!userToDelete || !userToDelete.uid) return

    try {
      setIsSubmitting(true)
      await deleteUserAccount(userToDelete.uid)
      await fetchUtilizatori()
      setDeleteConfirmOpen(false)
      setUserToDelete(null)
    } catch (err) {
      console.error("Eroare la ștergerea utilizatorului:", err)
      setError("A apărut o eroare la ștergerea utilizatorului.")
    } finally {
      setIsSubmitting(false)
    }
  }

  // Populate column options when table is available
  useEffect(() => {
    if (table) {
      const allColumns = table.getAllColumns()
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
  }, [table, isColumnModalOpen])

  const handleToggleColumn = (columnId: string) => {
    if (!table) return

    const column = table.getColumn(columnId)
    if (column) {
      column.toggleVisibility(!column.getIsVisible())

      // Update options state to reflect changes
      setColumnOptions((prev) =>
        prev.map((option) => (option.id === columnId ? { ...option, isVisible: !option.isVisible } : option)),
      )
    }
  }

  const handleSelectAllColumns = () => {
    if (!table) return

    table.getAllColumns().forEach((column: any) => {
      if (column.getCanHide()) {
        column.toggleVisibility(true)
      }
    })

    // Update all options to visible
    setColumnOptions((prev) => prev.map((option) => ({ ...option, isVisible: true })))
  }

  const handleDeselectAllColumns = () => {
    if (!table) return

    table.getAllColumns().forEach((column: any) => {
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

  const getRolColor = (rol: string) => {
    switch (rol.toLowerCase()) {
      case "admin":
        return "bg-purple-100 text-purple-800 hover:bg-purple-200"
      case "dispecer":
        return "bg-blue-100 text-blue-800 hover:bg-blue-200"
      case "tehnician":
        return "bg-green-100 text-green-800 hover:bg-green-200"
      default:
        return "bg-gray-100 text-gray-800 hover:bg-gray-200"
    }
  }

  const getStatusColor = (status: string) => {
    return status.toLowerCase() === "activ"
      ? "bg-green-100 text-green-800 hover:bg-green-200"
      : "bg-red-100 text-red-800 hover:bg-red-200"
  }

  const formatDate = (timestamp: any) => {
    if (!timestamp) return "N/A"

    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
      const day = date.getDate().toString().padStart(2, "0")
      const month = (date.getMonth() + 1).toString().padStart(2, "0")
      const year = date.getFullYear()
      const hour = date.getHours().toString().padStart(2, "0")
      const minute = date.getMinutes().toString().padStart(2, "0")
      
      return `${day}.${month}.${year} ${hour}:${minute}`
    } catch (err) {
      console.error("Eroare la formatarea datei:", err)
      return "N/A"
    }
  }

  // Define columns for DataTable
  const columns = useMemo(
    () => [
      {
        accessorKey: "displayName",
        header: "Nume",
        enableFiltering: true,
        cell: ({ row }: any) => <span className="font-medium">{row.original.displayName}</span>,
      },
      {
        accessorKey: "email",
        header: "Email",
        enableFiltering: true,
      },
      {
        accessorKey: "phoneNumber",
        header: "Telefon",
        enableFiltering: true,
        cell: ({ row }: any) => <span>{(row.original as any).phoneNumber || (row.original as any).telefon || "N/A"}</span>,
      },
      {
        accessorKey: "role",
        header: "Rol",
        enableFiltering: true,
        cell: ({ row }: any) => (
          <Badge className={getRolColor(row.original.role)}>
            {row.original.role === "admin"
              ? "Administrator"
              : row.original.role === "dispecer"
                ? "Dispecer"
                : row.original.role === "tehnician"
                  ? "Tehnician"
                  : "Client"}
          </Badge>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        enableFiltering: true,
        cell: () => <Badge className={getStatusColor("Activ")}>Activ</Badge>,
      },
      {
        accessorKey: "lastLogin",
        header: "Ultima Autentificare",
        enableFiltering: true,
        cell: ({ row }: any) => <span>{formatDate(row.original.lastLogin)}</span>,
      },
      {
        id: "actions",
        enableFiltering: false,
        cell: ({ row }: any) => (
          <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 text-blue-600"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleEdit(row.original)
                  }}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Editează</TooltipContent>
            </Tooltip>
            {row.original.uid !== currentUser?.uid && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 text-red-600"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDeleteClick(row.original)
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Șterge</TooltipContent>
              </Tooltip>
            )}
          </div>
        ),
      },
    ],
    [currentUser?.uid],
  )

  // Function to check if we should show the close confirmation dialog for add
  const handleCloseAddDialog = () => {
    // Check if any form fields have values
    if (formData.email || formData.password || formData.displayName || formData.phoneNumber || formData.role) {
      setActiveDialog("add")
      setShowCloseAlert(true)
    } else {
      setIsAddDialogOpen(false)
    }
  }

  // Function to check if we should show the close confirmation dialog for edit
  const handleCloseEditDialog = () => {
    if (editFormRef.current?.hasUnsavedChanges?.()) {
      setActiveDialog("edit")
      setShowCloseAlert(true)
    } else {
      setIsEditDialogOpen(false)
    }
  }

  // Function to check if we should show the close confirmation dialog for delete
  const handleCloseDeleteDialog = () => {
    setActiveDialog("delete")
    setShowCloseAlert(true)
  }

  // Function to confirm dialog close
  const confirmCloseDialog = () => {
    setShowCloseAlert(false)

    // Close the active dialog
    if (activeDialog === "add") setIsAddDialogOpen(false)
    if (activeDialog === "edit") setIsEditDialogOpen(false)
    if (activeDialog === "delete") setDeleteConfirmOpen(false)

    setActiveDialog(null)
  }

  return (
    <TooltipProvider>
      <DashboardShell>
      <DashboardHeader heading="Management Utilizatori" text="Gestionați utilizatorii și drepturile de acces">
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
              <Plus className="mr-2 h-4 w-4" /> <span className="hidden sm:inline">Adaugă</span> Utilizator
            </Button>
          </DialogTrigger>
          <DialogContent className={`w-[calc(100%-2rem)] ${formData.role === "client" ? "max-w-[800px]" : "max-w-[500px]"}`}>
            <DialogHeader>
              <DialogTitle>Adaugă Utilizator Nou</DialogTitle>
              <DialogDescription>Completați detaliile pentru a adăuga un utilizator nou</DialogDescription>
            </DialogHeader>
            {formError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            )}
            <div className={`py-4 ${formData.role === "client" ? "grid grid-cols-1 lg:grid-cols-2 gap-6" : "grid gap-4"}`}>
              {/* Coloana stângă - Informații de bază */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="displayName" className="text-sm font-medium">
                    Nume Complet
                  </label>
                  <Input
                    id="displayName"
                    placeholder="Introduceți numele complet"
                    value={formData.displayName}
                    onChange={handleInputChange}
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="email" className="text-sm font-medium">
                    Email
                  </label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="Adresă de email"
                    value={formData.email}
                    onChange={handleInputChange}
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="phoneNumber" className="text-sm font-medium">
                    Telefon
                  </label>
                  <Input
                    id="phoneNumber"
                    placeholder="Număr de telefon"
                    value={formData.phoneNumber}
                    onChange={handleInputChange}
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="role" className="text-sm font-medium">
                    Rol
                  </label>
                  <Select value={formData.role} onValueChange={handleSelectChange}>
                    <SelectTrigger id="role">
                      <SelectValue placeholder="Selectați rolul" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Administrator</SelectItem>
                      <SelectItem value="dispecer">Dispecer</SelectItem>
                      <SelectItem value="tehnician">Tehnician</SelectItem>
                      <SelectItem value="client">Client</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Pentru roluri non-client, parolele rămân în aceeași coloană */}
                {formData.role !== "client" && (
                  <>
                    <div className="space-y-2">
                      <label htmlFor="password" className="text-sm font-medium">
                        Parolă
                      </label>
                      <div className="relative">
                        <Input
                          id="password"
                          type={showPassword ? "text" : "password"}
                          placeholder="Introduceți parola"
                          value={formData.password}
                          onChange={handleInputChange}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((v) => !v)}
                          className="absolute inset-y-0 right-2 flex items-center text-muted-foreground"
                          aria-label={showPassword ? "Ascunde parola" : "Arată parola"}
                          title={showPassword ? "Ascunde parola" : "Arată parola"}
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label htmlFor="confirmPassword" className="text-sm font-medium">
                        Confirmă Parola
                      </label>
                      <div className="relative">
                        <Input
                          id="confirmPassword"
                          type={showConfirmPassword ? "text" : "password"}
                          placeholder="Confirmați parola"
                          value={formData.confirmPassword}
                          onChange={handleInputChange}
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword((v) => !v)}
                          className="absolute inset-y-0 right-2 flex items-center text-muted-foreground"
                          aria-label={showConfirmPassword ? "Ascunde parola" : "Arată parola"}
                          title={showConfirmPassword ? "Ascunde parola" : "Arată parola"}
                        >
                          {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Coloana dreaptă - Informații client (doar pentru rol client) */}
              {formData.role === "client" && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Adaugă client</label>
                    <Popover open={isClientPickerOpen2} onOpenChange={setIsClientPickerOpen2}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" role="combobox" aria-expanded={isClientPickerOpen2} className="w-full justify-between">
                          Selectează client
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="p-0 w-[--radix-popover-trigger-width] max-w-[90vw]">
                        <Command shouldFilter={true}>
                          <CommandInput placeholder="Căutați clientul..." />
                          <CommandEmpty>Nu s-au găsit clienți.</CommandEmpty>
                          <CommandList className="max-h-[240px] overflow-y-auto overflow-x-auto whitespace-nowrap">
                            <CommandGroup>
                              {sortedClientsForSelect.map((c) => (
                                <CommandItem
                                  key={c.id}
                                  value={`${c.nume}__${c.id}`}
                                  onSelect={() => {
                                    setIsClientPickerOpen2(false)
                                    setPendingClientId(c.id)
                                    // preselectăm nimic; deschidem dialogul de locații
                                    setPendingLocations([])
                                    setLocationDialogOpen(true)
                                  }}
                                  className="whitespace-nowrap"
                                >
                                  <span className="inline-block min-w-max">{c.nume}</span>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>
                  
                  <div className="text-xs text-muted-foreground">
                    După selectarea unui client, se va deschide un dialog pentru alegerea locațiilor. După salvare, clientul cu locațiile selectate va fi adăugat mai jos.
                  </div>

                  {clientAccess.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium">Clienți selectați</label>
                        <div className="text-sm text-muted-foreground">{clientAccess.length} clienți adăugați</div>
                      </div>
                      <div>
                        <Button type="button" variant="outline" size="sm" onClick={() => setSelectedClientsDialogOpen(true)}>Arată clienții selectați</Button>
                      </div>
                    </div>
                  )}

                  {/* Bifa și buton pentru trimitere invitație */}
                  <div className="flex items-center justify-between gap-4 border rounded p-3">
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={sendInvite}
                        onCheckedChange={(v: boolean) => setSendInvite(!!v)}
                      />
                      <span>Trimite invitație la salvare</span>
                    </label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={inviteRecipients.length === 0}
                      onClick={async () => {
                        try {
                          if (inviteRecipients.length === 0) return
                          const origin = (typeof window !== 'undefined' ? window.location.origin : '')
                          const subject = "Invitație acces Portal Client – FOM"
                          const content = `Bună ziua,\n\nVă-am creat/actualizat acces în Portalul Client FOM.\n\nEmail: ${formData.email}\nPortal: ${origin}/portal\n\nDupă autentificare, vă rugăm să schimbați parola din cont (dacă a fost resetată).\n\nVă mulțumim!`
                          const html = `
                            <div style="font-family:Arial,sans-serif;line-height:1.5">
                              <h2 style="margin:0 0 12px;color:#0f56b3">Invitație acces Portal Client – FOM</h2>
                              <p>Vă-am creat/actualizat acces în Portalul Client FOM.</p>
                              <p><strong>Email:</strong> ${formData.email}<br/>
                                 <strong>Portal:</strong> <a href="${origin}/portal" target="_blank">${origin}/portal</a></p>
                              <p>După autentificare, vă rugăm să schimbați parola din cont (dacă a fost resetată).</p>
                              <p>Vă mulțumim!</p>
                            </div>`
                          const resp = await fetch('/api/users/invite', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ to: inviteRecipients, subject, content, html })
                          })
                          if (!resp.ok) throw new Error('Invite email failed')
                          toast({ title: 'Invitație trimisă', description: `Email trimis către: ${inviteRecipients.join(', ')}` })
                        } catch (e) {
                          console.warn('Trimitere invitație eșuată', e)
                          toast({ variant: 'destructive', title: 'Invitație eșuată', description: 'Nu s-a putut trimite emailul de invitație.' })
                        }
                      }}
                    >
                      Trimite invitație
                    </Button>
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="password" className="text-sm font-medium">
                      Parolă
                    </label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        placeholder="Introduceți parola"
                        value={formData.password}
                        onChange={handleInputChange}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute inset-y-0 right-2 flex items-center text-muted-foreground"
                        aria-label={showPassword ? "Ascunde parola" : "Arată parola"}
                        title={showPassword ? "Ascunde parola" : "Arată parola"}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="confirmPassword" className="text-sm font-medium">
                      Confirmă Parola
                    </label>
                    <div className="relative">
                      <Input
                        id="confirmPassword"
                        type={showConfirmPassword ? "text" : "password"}
                        placeholder="Confirmați parola"
                        value={formData.confirmPassword}
                        onChange={handleInputChange}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword((v) => !v)}
                        className="absolute inset-y-0 right-2 flex items-center text-muted-foreground"
                        aria-label={showConfirmPassword ? "Ascunde parola" : "Arată parola"}
                        title={showConfirmPassword ? "Ascunde parola" : "Arată parola"}
                      >
                        {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
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
      </DashboardHeader>

      {/* Dialog pentru editarea utilizatorului */}
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
        <DialogContent className={`w-[calc(100%-2rem)] ${(selectedUser?.role || "") === "client" ? "max-w-[800px]" : "max-w-[500px]"}`}>
          <DialogHeader>
            <DialogTitle>Editează Utilizator</DialogTitle>
            <DialogDescription>Modificați detaliile utilizatorului</DialogDescription>
          </DialogHeader>
          {selectedUser && (
            <UserEditForm
              ref={editFormRef}
              user={selectedUser}
              onSuccess={handleEditSuccess}
              onCancel={handleCloseEditDialog}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog pentru confirmarea ștergerii */}
      <Dialog
        open={deleteConfirmOpen}
        onOpenChange={(open) => {
          if (!open && userToDelete) {
            handleCloseDeleteDialog()
          } else {
            setDeleteConfirmOpen(open)
          }
        }}
      >
        <DialogContent className="w-[calc(100%-2rem)] max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Confirmare ștergere</DialogTitle>
            <DialogDescription>
              Sunteți sigur că doriți să ștergeți utilizatorul {userToDelete?.displayName}?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>
              Anulează
            </Button>
            <Button variant="destructive" onClick={handleDeleteConfirm} disabled={isSubmitting}>
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

      {/* Dialog pentru selectarea locațiilor clientului selectat */}
      <UiDialog open={locationDialogOpen} onOpenChange={(o) => { if (!o) { setLocationDialogOpen(false) } }}>
        <UiDialogContent className="w-[calc(100%-2rem)] max-w-[520px]">
          <UiDialogHeader>
            <UiDialogTitle>Locații pentru {clientsForSelect.find(c => c.id === pendingClientId)?.nume || "client"}</UiDialogTitle>
          </UiDialogHeader>
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-muted-foreground">Selectați locațiile permise</div>
            {(() => {
              const all = (clientsForSelect.find(c => c.id === pendingClientId)?.locatii || []).map((l:any) => l?.nume)
              const allSelected = all.length > 0 && all.every((n:string) => pendingLocations.includes(n))
              return (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPendingLocations(allSelected ? [] : all)}
                >
                  {allSelected ? "Deselectează tot" : "Selectează tot"}
                </Button>
              )
            })()}
          </div>
          <div className="max-h-[320px] overflow-auto border rounded p-2 space-y-1">
            {(clientsForSelect.find(c => c.id === pendingClientId)?.locatii || []).map((l: any, idx: number) => (
              <label key={idx} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={pendingLocations.includes(l.nume)}
                  onCheckedChange={() => setPendingLocations((prev: string[]) => prev.includes(l.nume) ? prev.filter((n: string) => n !== l.nume) : [...prev, l.nume])}
                />
                <span>{l.nume}</span>
              </label>
            )) || <div className="text-sm text-muted-foreground">Clientul nu are locații definite</div>}
          </div>
          <UiDialogFooter>
            <Button variant="outline" onClick={() => setLocationDialogOpen(false)}>Anulează</Button>
            <Button onClick={addClientAccessEntry} disabled={!pendingClientId}>Salvează setul</Button>
          </UiDialogFooter>
        </UiDialogContent>
      </UiDialog>

      {/* Dialog listă clienți selectați */}
      <UiDialog open={selectedClientsDialogOpen} onOpenChange={setSelectedClientsDialogOpen}>
        <UiDialogContent className="w-[calc(100%-2rem)] max-w-[600px]">
          <UiDialogHeader>
            <UiDialogTitle>Clienți selectați</UiDialogTitle>
          </UiDialogHeader>
          <div className="space-y-2 max-h-[60vh] overflow-auto">
            {clientAccess.length === 0 ? (
              <div className="text-sm text-muted-foreground">Nu există clienți adăugați.</div>
            ) : (
              clientAccess.map((entry) => {
                const c = clientsForSelect.find((x) => x.id === entry.clientId)
                return (
                  <div key={entry.clientId} className="flex items-center justify-between rounded border p-2">
                    <div className="text-sm">
                      <div className="font-medium">{c?.nume || entry.clientId}</div>
                      <div className="text-muted-foreground">{entry.locationNames.join(", ") || "—"}</div>
                    </div>
                    <Button type="button" variant="ghost" size="sm" onClick={() => removeClientAccessEntry(entry.clientId)}>Elimină</Button>
                  </div>
                )
              })
            )}
          </div>
          <UiDialogFooter>
            <Button variant="outline" onClick={() => setSelectedClientsDialogOpen(false)}>Închide</Button>
          </UiDialogFooter>
        </UiDialogContent>
      </UiDialog>

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

        {/* Adăugăm câmpul de căutare universal și butoanele de filtrare și selecție coloane */}
        <div className="flex flex-col sm:flex-row gap-2">
          <UniversalSearch onSearch={handleSearchChange} initialValue={searchText} className="flex-1" />
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
          title="Filtrare utilizatori"
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
            <span className="ml-2 text-gray-600">Se încarcă utilizatorii...</span>
          </div>
        ) : error ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : activeTab === "tabel" ? (
          <DataTable
            columns={columns}
            data={filteredData}
            defaultSort={{ id: "displayName", desc: false }}
            setTable={setTable}
            showFilters={false}
            onRowClick={(row) => handleEdit(row)}
            persistenceKey="utilizatori"
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
            <div className="grid gap-4 px-4 sm:px-0 sm:grid-cols-2 lg:grid-cols-3 w-full overflow-auto">
              {paginatedCardsData.map((user) => (
              <Card key={user.uid} className="overflow-hidden">
                <CardContent className="p-0">
                  <div className="flex items-center justify-between border-b p-4">
                    <div>
                      <h3 className="font-medium">{user.displayName}</h3>
                      <p className="text-sm text-muted-foreground">{user.email}</p>
                    </div>
                    <Badge className={getRolColor(user.role)}>
                      {user.role === "admin" ? "Administrator" : user.role === "dispecer" ? "Dispecer" : "Tehnician"}
                    </Badge>
                  </div>
                  <div className="p-4">
                    <div className="mb-4 space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm font-medium text-muted-foreground">Telefon:</span>
                        <span className="text-sm">{(user as any).phoneNumber || (user as any).telefon || "N/A"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm font-medium text-muted-foreground">Status:</span>
                        <Badge className={getStatusColor("Activ")}>Activ</Badge>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm font-medium text-muted-foreground">Ultima autentificare:</span>
                        <span className="text-sm">{formatDate(user.lastLogin)}</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-end">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="gap-1">
                            Acțiuni
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEdit(user)}>
                            <Pencil className="mr-2 h-4 w-4" /> Editează
                          </DropdownMenuItem>
                          {user.uid !== currentUser?.uid && (
                            <DropdownMenuItem className="text-red-600" onClick={() => handleDeleteClick(user)}>
                              <Trash2 className="mr-2 h-4 w-4" /> Șterge
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
              {paginatedCardsData.length === 0 && filteredData.length === 0 && (
                <div className="col-span-full text-center py-10">
                  <p className="text-muted-foreground">
                    Nu există utilizatori care să corespundă criteriilor de căutare.
                  </p>
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
    </TooltipProvider>
  )
}
;<style jsx global>{`
  .data-table tbody tr {
    cursor: pointer;
  }
  .data-table tbody tr:hover {
    background-color: rgba(0, 0, 0, 0.04);
  }
  .data-table tbody tr:nth-child(even) {
    background-color: #f2f2f2;
  }
  .data-table tbody tr:nth-child(odd) {
    background-color: #ffffff;
  }
`}</style>
