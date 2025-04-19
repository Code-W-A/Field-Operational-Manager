"use client"

import type React from "react"

import { useState, useEffect } from "react"
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
import { Plus, Pencil, Trash2, Loader2, AlertCircle } from "lucide-react"
import { collection, query, orderBy, getDocs } from "firebase/firestore"
import { db } from "@/lib/firebase/config"
import { registerUser, deleteUserAccount, type UserData, type UserRole } from "@/lib/firebase/auth"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useAuth } from "@/contexts/AuthContext"
import { UserEditForm } from "@/components/user-edit-form"
import { DataTable } from "@/components/data-table/data-table"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useMediaQuery } from "@/hooks/use-media-query"

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
    telefon: "",
    role: "" as UserRole,
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [userToDelete, setUserToDelete] = useState<UserData | null>(null)
  const [table, setTable] = useState<any>(null)

  // Adăugăm state pentru activeTab
  const [activeTab, setActiveTab] = useState("tabel")

  // Detectăm dacă suntem pe un dispozitiv mobil
  const isMobile = useMediaQuery("(max-width: 768px)")

  // Încărcăm utilizatorii din Firebase
  const fetchUtilizatori = async () => {
    try {
      setLoading(true)
      const q = query(collection(db, "users"), orderBy("displayName"))
      const querySnapshot = await getDocs(q)

      const users: UserData[] = []
      querySnapshot.forEach((doc) => {
        users.push({ id: doc.id, ...doc.data() } as UserData)
      })

      setUtilizatori(users)
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

  // Setăm automat vizualizarea cu carduri pe mobil
  useEffect(() => {
    if (isMobile) {
      setActiveTab("carduri")
    } else {
      setActiveTab("tabel")
    }
  }, [isMobile])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { id, value } = e.target
    setFormData((prev) => ({ ...prev, [id]: value }))
  }

  const handleSelectChange = (value: string) => {
    setFormData((prev) => ({ ...prev, role: value as UserRole }))
  }

  const handleSubmit = async () => {
    try {
      setIsSubmitting(true)
      setFormError(null)

      // Validare
      if (!formData.email || !formData.password || !formData.displayName || !formData.role) {
        setFormError("Vă rugăm să completați toate câmpurile obligatorii")
        setIsSubmitting(false)
        return
      }

      if (formData.password !== formData.confirmPassword) {
        setFormError("Parolele nu coincid")
        setIsSubmitting(false)
        return
      }

      if (formData.password.length < 6) {
        setFormError("Parola trebuie să aibă cel puțin 6 caractere")
        setIsSubmitting(false)
        return
      }

      // Înregistrăm utilizatorul
      await registerUser(formData.email, formData.password, formData.displayName, formData.role, formData.telefon)

      // Reîncărcăm lista de utilizatori
      await fetchUtilizatori()

      // Închidem dialogul și resetăm formularul
      setIsAddDialogOpen(false)
      setFormData({
        email: "",
        password: "",
        confirmPassword: "",
        displayName: "",
        telefon: "",
        role: "" as UserRole,
      })
    } catch (err: any) {
      console.error("Eroare la înregistrarea utilizatorului:", err)

      if (err.code === "auth/email-already-in-use") {
        setFormError("Adresa de email este deja utilizată")
      } else {
        setFormError("A apărut o eroare la înregistrarea utilizatorului. Încercați din nou.")
      }
    } finally {
      setIsSubmitting(false)
    }
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
      return date.toLocaleDateString("ro-RO", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    } catch (err) {
      console.error("Eroare la formatarea datei:", err)
      return "N/A"
    }
  }

  // Definim coloanele pentru DataTable
  const columns = [
    {
      accessorKey: "displayName",
      header: "Nume",
      cell: ({ row }: any) => <span className="font-medium">{row.original.displayName}</span>,
    },
    {
      accessorKey: "email",
      header: "Email",
    },
    {
      accessorKey: "telefon",
      header: "Telefon",
      cell: ({ row }: any) => <span>{row.original.telefon || "N/A"}</span>,
    },
    {
      accessorKey: "role",
      header: "Rol",
      cell: ({ row }: any) => (
        <Badge className={getRolColor(row.original.role)}>
          {row.original.role === "admin"
            ? "Administrator"
            : row.original.role === "dispecer"
              ? "Dispecer"
              : "Tehnician"}
        </Badge>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: () => <Badge className={getStatusColor("Activ")}>Activ</Badge>,
    },
    {
      accessorKey: "lastLogin",
      header: "Ultima Autentificare",
      cell: ({ row }: any) => <span>{formatDate(row.original.lastLogin)}</span>,
    },
    {
      id: "actions",
      cell: ({ row }: any) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4"
              >
                <circle cx="12" cy="12" r="1" />
                <circle cx="19" cy="12" r="1" />
                <circle cx="5" cy="12" r="1" />
              </svg>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleEdit(row.original)}>
              <Pencil className="mr-2 h-4 w-4" /> Editează
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-red-600"
              onClick={() => handleDeleteClick(row.original)}
              disabled={row.original.uid === currentUser?.uid}
            >
              <Trash2 className="mr-2 h-4 w-4" /> Șterge
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ]

  // Definim opțiunile de filtrare pentru DataTable
  const filterableColumns = [
    {
      id: "role",
      title: "Rol",
      options: [
        { label: "Administrator", value: "admin" },
        { label: "Dispecer", value: "dispecer" },
        { label: "Tehnician", value: "tehnician" },
      ],
    },
  ]

  // Adăugăm filtre avansate
  const advancedFilters = [
    {
      id: "displayName",
      title: "Nume",
      type: "text",
    },
    {
      id: "email",
      title: "Email",
      type: "text",
    },
    {
      id: "telefon",
      title: "Telefon",
      type: "text",
    },
  ]

  return (
    <DashboardShell>
      <DashboardHeader heading="Management Utilizatori" text="Gestionați utilizatorii și drepturile de acces">
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-blue-600 hover:bg-blue-700">
              <Plus className="mr-2 h-4 w-4" /> <span className="hidden sm:inline">Adaugă</span> Utilizator
            </Button>
          </DialogTrigger>
          <DialogContent className="w-[calc(100%-2rem)] max-w-[500px]">
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
            <div className="grid gap-4 py-4">
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
                <label htmlFor="telefon" className="text-sm font-medium">
                  Telefon
                </label>
                <Input
                  id="telefon"
                  placeholder="Număr de telefon"
                  value={formData.telefon}
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
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label htmlFor="password" className="text-sm font-medium">
                  Parolă
                </label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Introduceți parola"
                  value={formData.password}
                  onChange={handleInputChange}
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="confirmPassword" className="text-sm font-medium">
                  Confirmă Parola
                </label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="Confirmați parola"
                  value={formData.confirmPassword}
                  onChange={handleInputChange}
                />
              </div>
            </div>
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
      </DashboardHeader>

      {/* Dialog pentru editarea utilizatorului */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Editează Utilizator</DialogTitle>
            <DialogDescription>Modificați detaliile utilizatorului</DialogDescription>
          </DialogHeader>
          {selectedUser && (
            <UserEditForm
              user={selectedUser}
              onSuccess={handleEditSuccess}
              onCancel={() => setIsEditDialogOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog pentru confirmarea ștergerii */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
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

          {!loading && !error && (
            <div className="flex flex-wrap gap-2">
              <DataTable.Filters
                columns={columns}
                data={utilizatori}
                searchColumn="displayName"
                searchPlaceholder="Caută utilizator..."
                filterableColumns={filterableColumns}
                advancedFilters={advancedFilters}
              />
            </div>
          )}
        </div>

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
            data={utilizatori}
            searchColumn="displayName"
            searchPlaceholder="Caută utilizator..."
            filterableColumns={filterableColumns}
            advancedFilters={advancedFilters}
            showFilters={false}
            table={table}
            setTable={setTable}
          />
        ) : (
          <div className="grid gap-4 px-4 sm:px-0 sm:grid-cols-2 lg:grid-cols-3">
            {utilizatori.map((user) => (
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
                        <span className="text-sm">{user.telefon || "N/A"}</span>
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
          </div>
        )}
      </div>
    </DashboardShell>
  )
}
