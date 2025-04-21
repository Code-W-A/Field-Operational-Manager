"use client"

import { DialogTrigger } from "@/components/ui/dialog"
import type React from "react"
import { useState, useEffect, useMemo } from "react"
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
import { format, parse } from "date-fns"
import { Plus, MoreHorizontal, FileText, Eye, Pencil, Trash2, Loader2, AlertCircle } from "lucide-react"
import { useMediaQuery } from "@/hooks/use-media-query"
import { useFirebaseCollection } from "@/hooks/use-firebase-collection"
import { type Lucrare, addLucrare, deleteLucrare, updateLucrare, getLucrareById } from "@/lib/firebase/firestore"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { orderBy } from "firebase/firestore"
import { useAuth } from "@/contexts/AuthContext"
import { LucrareForm } from "@/components/lucrare-form"
import { DataTable } from "@/components/data-table/data-table"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { doc, getDoc } from "firebase/firestore"
import { db } from "@/lib/firebase/config"

const ContractDisplay: React.FC<{ contractId: string | undefined }> = ({ contractId }) => {
  const [contractNumber, setContractNumber] = useState<string | null>(null)
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
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [dataEmiterii, setDataEmiterii] = useState<Date | undefined>(new Date())
  const [dataInterventie, setDataInterventie] = useState<Date | undefined>(new Date())
  const [activeTab, setActiveTab] = useState("tabel")
  const [selectedLucrare, setSelectedLucrare] = useState<Lucrare | null>(null)
  const [formData, setFormData] = useState({
    tipLucrare: "",
    tehnicieni: [] as string[],
    client: "",
    locatie: "",
    descriere: "",
    persoanaContact: "",
    telefon: "",
    statusLucrare: "În așteptare",
    statusFacturare: "Nefacturat",
    contract: "",
    defectReclamat: "",
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<string[]>([])
  const [tableInstance, setTableInstance] = useState<any>(null)

  // Obținem lucrările din Firebase
  const {
    data: lucrari,
    loading,
    error: fetchError,
  } = useFirebaseCollection<Lucrare>("lucrari", [orderBy("dataEmiterii", "desc")])

  // Filtrăm lucrările pentru tehnicieni
  const filteredLucrari = useMemo(() => {
    if (userData?.role === "tehnician" && userData?.displayName) {
      return lucrari.filter((lucrare) => lucrare.tehnicieni.includes(userData.displayName!))
    }
    return lucrari
  }, [lucrari, userData?.role, userData?.displayName])

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
  }, [editId])

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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { id, value } = e.target
    setFormData((prev) => ({ ...prev, [id]: value }))
  }

  const handleSelectChange = (id: string, value: string) => {
    setFormData((prev) => ({ ...prev, [id]: value }))
  }

  const handleTehnicieniChange = (value: string) => {
    // Verificăm dacă tehnicianul este deja selectat
    if (formData.tehnicieni.includes(value)) {
      // Dacă da, îl eliminăm
      setFormData((prev) => ({
        ...prev,
        tehnicieni: prev.tehnicieni.filter((tech) => tech !== value),
      }))
    } else {
      // Dacă nu, îl adăugăm
      setFormData((prev) => ({
        ...prev,
        tehnicieni: [...prev.tehnicieni, value],
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
      statusLucrare: "În așteptare",
      statusFacturare: "Nefacturat",
      contract: "",
      defectReclamat: "",
    })
    setError(null)
    setFieldErrors([])
  }

  const validateForm = () => {
    const errors: string[] = []

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

      const newLucrare: Omit<Lucrare, "id"> = {
        dataEmiterii: format(dataEmiterii!, "dd.MM.yyyy HH:mm"),
        dataInterventie: format(dataInterventie!, "dd.MM.yyyy HH:mm"),
        ...formData,
      }

      await addLucrare(newLucrare)
      setIsAddDialogOpen(false)
      resetForm()
    } catch (err) {
      console.error("Eroare la adăugarea lucrării:", err)
      setError("A apărut o eroare la adăugarea lucrării. Încercați din nou.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleEdit = (lucrare: Lucrare) => {
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

      const updatedLucrare: Partial<Lucrare> = {
        dataEmiterii: format(dataEmiterii!, "dd.MM.yyyy HH:mm"),
        dataInterventie: format(dataInterventie!, "dd.MM.yyyy HH:mm"),
        ...formData,
      }

      await updateLucrare(selectedLucrare.id, updatedLucrare)
      setIsEditDialogOpen(false)
      resetForm()

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

  const handleDelete = async (id: string) => {
    if (window.confirm("Sunteți sigur că doriți să ștergeți această lucrare?")) {
      try {
        await deleteLucrare(id)
      } catch (err) {
        console.error("Eroare la ștergerea lucrării:", err)
        alert("A apărut o eroare la ștergerea lucrării.")
      }
    }
  }

  const handleViewDetails = (id: string) => {
    router.push(`/dashboard/lucrari/${id}`)
  }

  const handleGenerateReport = (id: string) => {
    router.push(`/raport/${id}`)
  }

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "în așteptare":
        return "bg-yellow-100 text-yellow-800 hover:bg-yellow-200"
      case "în curs":
        return "bg-blue-100 text-blue-800 hover:bg-blue-200"
      case "finalizat":
        return "bg-green-100 text-green-800 hover:bg-green-200"
      default:
        return "bg-gray-100 text-gray-800 hover:bg-gray-200"
    }
  }

  const getFacturaColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "facturat":
        return "bg-green-100 text-green-800 hover:bg-green-200"
      case "nefacturat":
        return "bg-red-100 text-red-800 hover:bg-red-200"
      case "nu se facturează":
        return "bg-orange-100 text-orange-800 hover:bg-orange-200"
      default:
        return "bg-gray-100 text-gray-800 hover:bg-gray-200"
    }
  }

  const getTipLucrareColor = (tip: string) => {
    switch (tip.toLowerCase()) {
      case "contra cost":
        return "bg-red-50 text-red-700 border-red-200"
      case "în garanție":
        return "bg-yellow-50 text-yellow-700 border-yellow-200"
      case "pregătire instalare":
        return "bg-blue-50 text-blue-700 border-blue-200"
      case "instalare":
        return "bg-green-50 text-green-700 border-green-200"
      default:
        return "bg-gray-50 text-gray-700 border-gray-200"
    }
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
      cell: ({ row }: any) => (
        <Badge variant="outline" className={getTipLucrareColor(row.original.tipLucrare)}>
          {row.original.tipLucrare}
        </Badge>
      ),
    },
    {
      accessorKey: "defectReclamat",
      header: "Defect reclamat",
      enableHiding: true,
      enableFiltering: true,
      cell: ({ row }: any) => (
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
      cell: ({ row }: any) => {
        if (row.original.tipLucrare !== "Intervenție în contract") return null
        return <ContractDisplay contractId={row.original.contract} />
      },
    },
    {
      accessorKey: "tehnicieni",
      header: "Tehnicieni",
      enableHiding: true,
      enableFiltering: true,
      cell: ({ row }: any) => (
        <div className="flex flex-wrap gap-1">
          {row.original.tehnicieni.map((tehnician: string, index: number) => (
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
      header: "Echipament",
      enableHiding: true,
      enableFiltering: true,
    },
    {
      accessorKey: "descriere",
      header: "Descriere",
      enableHiding: true,
      enableFiltering: true,
      cell: ({ row }: any) => (
        <div className="max-w-[200px] truncate" title={row.original.descriere}>
          {row.original.descriere}
        </div>
      ),
    },
    {
      accessorKey: "persoanaContact",
      header: "Persoană Contact",
      enableHiding: true,
      enableFiltering: true,
    },
    {
      accessorKey: "telefon",
      header: "Telefon",
      enableHiding: true,
      enableFiltering: true,
    },
    {
      accessorKey: "statusLucrare",
      header: "Status Lucrare",
      enableHiding: true,
      enableFiltering: true,
      cell: ({ row }: any) => (
        <Badge className={getStatusColor(row.original.statusLucrare)}>{row.original.statusLucrare}</Badge>
      ),
    },
    {
      accessorKey: "statusFacturare",
      header: "Status Facturare",
      enableHiding: true,
      enableFiltering: true,
      cell: ({ row }: any) => (
        <Badge className={getFacturaColor(row.original.statusFacturare)}>{row.original.statusFacturare}</Badge>
      ),
    },
    {
      id: "actions",
      enableHiding: false,
      enableFiltering: false,
      cell: ({ row }: any) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleViewDetails(row.original.id!)}>
              <Eye className="mr-2 h-4 w-4" /> Vizualizează
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleEdit(row.original)}>
              <Pencil className="mr-2 h-4 w-4" /> Editează
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleGenerateReport(row.original.id!)}>
              <FileText className="mr-2 h-4 w-4" /> Generează Raport
            </DropdownMenuItem>
            {userData?.role === "admin" && (
              <DropdownMenuItem className="text-red-600" onClick={() => handleDelete(row.original.id!)}>
                <Trash2 className="mr-2 h-4 w-4" /> Șterge
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ]

  return (
    <DashboardShell>
      <DashboardHeader heading="Lucrări" text="Gestionați toate lucrările și intervențiile">
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
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
              dataEmiterii={dataEmiterii}
              setDataEmiterii={setDataEmiterii}
              dataInterventie={dataInterventie}
              setDataInterventie={setDataInterventie}
              formData={formData}
              handleInputChange={handleInputChange}
              handleSelectChange={handleSelectChange}
              handleTehnicieniChange={handleTehnicieniChange}
              fieldErrors={fieldErrors}
            />
            <DialogFooter className="flex-col gap-2 sm:flex-row">
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
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

        {/* Dialog pentru editarea lucrării */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
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
            />
            <DialogFooter className="flex-col gap-2 sm:flex-row">
              <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
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
            data={filteredLucrari}
            defaultSort={{ id: "dataEmiterii", desc: true }}
            onRowClick={handleViewDetails}
            table={tableInstance}
            setTable={setTableInstance}
          />
        ) : (
          <div className="grid gap-4 px-4 sm:px-0 sm:grid-cols-2 lg:grid-cols-3">
            {filteredLucrari.map((lucrare) => (
              <Card
                key={lucrare.id}
                className="overflow-hidden cursor-pointer hover:shadow-md"
                onClick={() => handleViewDetails(lucrare.id!)}
              >
                <CardContent className="p-0">
                  <div className="flex items-center justify-between border-b p-4">
                    <div>
                      <h3 className="font-medium">{lucrare.client}</h3>
                      <p className="text-sm text-muted-foreground">{lucrare.locatie}</p>
                    </div>
                    <Badge className={getStatusColor(lucrare.statusLucrare)}>{lucrare.statusLucrare}</Badge>
                  </div>
                  <div className="p-4">
                    <div className="mb-4 space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm font-medium text-muted-foreground">Tip:</span>
                        <Badge variant="outline" className={getTipLucrareColor(lucrare.tipLucrare)}>
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
                    <div className="mb-4">
                      <p className="text-sm font-medium text-muted-foreground">Descriere:</p>
                      <p className="text-sm line-clamp-2" title={lucrare.descriere}>
                        {lucrare.descriere}
                      </p>
                    </div>
                    <div className="flex items-center justify-between">
                      {userData?.role !== "tehnician" && (
                        <Badge className={getFacturaColor(lucrare.statusFacturare)}>{lucrare.statusFacturare}</Badge>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="sm" className="gap-1">
                            Acțiuni
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation()
                              handleViewDetails(lucrare.id!)
                            }}
                          >
                            <Eye className="mr-2 h-4 w-4" /> Vizualizează
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation()
                              handleEdit(lucrare)
                            }}
                          >
                            <Pencil className="mr-2 h-4 w-4" /> Editează
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation()
                              handleGenerateReport(lucrare.id!)
                            }}
                          >
                            <FileText className="mr-2 h-4 w-4" /> Generează Raport
                          </DropdownMenuItem>
                          {userData?.role === "admin" && (
                            <DropdownMenuItem
                              className="text-red-600"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDelete(lucrare.id!)
                              }}
                            >
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
            {filteredLucrari.length === 0 && (
              <div className="col-span-full text-center py-10">
                <p className="text-muted-foreground">Nu există lucrări care să corespundă criteriilor de căutare.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardShell>
  )
}
