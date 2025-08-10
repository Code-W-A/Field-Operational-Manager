"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { DashboardHeader } from "@/components/dashboard-header"
import { DashboardShell } from "@/components/dashboard-shell"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Label } from "@/components/ui/label"
import { toast } from "@/components/ui/use-toast"
import { useAuth } from "@/contexts/AuthContext"
import { 
  Plus, 
  Edit3, 
  Trash2, 
  MoreVertical, 
  Search, 
  Calendar, 
  User,
  StickyNote,
  Clock,
  AlertCircle,
  Filter,
  Loader2
} from "lucide-react"
import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  query, 
  orderBy, 
  onSnapshot,
  serverTimestamp,
  where,
  Timestamp
} from "firebase/firestore"
import { db } from "@/lib/firebase/config"
import { addUserLogEntry } from "@/lib/firebase/firestore"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog"

interface Note {
  id: string
  title: string
  content: string
  priority: "low" | "medium" | "high"
  category: "general" | "urgent" | "info" | "task"
  createdAt: Timestamp
  updatedAt: Timestamp
  authorId: string
  authorName: string
}

const priorityColors = {
  low: "bg-green-100 text-green-800 border-green-200",
  medium: "bg-yellow-100 text-yellow-800 border-yellow-200", 
  high: "bg-red-100 text-red-800 border-red-200"
}

const categoryColors = {
  general: "bg-blue-100 text-blue-800 border-blue-200",
  urgent: "bg-red-100 text-red-800 border-red-200",
  info: "bg-cyan-100 text-cyan-800 border-cyan-200",
  task: "bg-purple-100 text-purple-800 border-purple-200"
}

const priorityLabels = {
  low: "Scăzută",
  medium: "Medie",
  high: "Înaltă"
}

const categoryLabels = {
  general: "General",
  urgent: "Urgent",
  info: "Informație",
  task: "Sarcină"
}

export default function NoteInternePage() {
  const { userData } = useAuth()
  
  // Restricționez accesul doar pentru dispeceri și administratori
  if (userData?.role === "tehnician") {
    return (
      <DashboardShell>
        <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
          <AlertCircle className="h-16 w-16 text-red-500 mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Acces restricționat</h2>
          <p className="text-gray-600 mb-6 max-w-md">
            Nu aveți permisiunea de a accesa secțiunea "Note interne". 
            Această funcționalitate este disponibilă doar pentru dispeceri și administratori.
          </p>
          <Button onClick={() => window.history.back()} variant="outline">
            Înapoi
          </Button>
        </div>
      </DashboardShell>
    )
  }

  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const [editingNote, setEditingNote] = useState<Note | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedPriority, setSelectedPriority] = useState<string>("all")
  const [selectedCategory, setSelectedCategory] = useState<string>("all")
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10

  // Form state
  const [title, setTitle] = useState("")
  const [content, setContent] = useState("")
  const [priority, setPriority] = useState<"low" | "medium" | "high">("medium")
  const [category, setCategory] = useState<"general" | "urgent" | "info" | "task">("general")

  // Add close confirmation states
  const [showCloseAlert, setShowCloseAlert] = useState(false)
  const [initialFormState, setInitialFormState] = useState({
    title: "",
    content: "",
    priority: "medium" as "low" | "medium" | "high",
    category: "general" as "general" | "urgent" | "info" | "task"
  })

  // Load notes from Firestore
  useEffect(() => {
    const notesRef = collection(db, "note-interne")

    const unsubscribe = onSnapshot(notesRef, (snapshot) => {
      const notesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Note[]
      
      setNotes(notesData)
      setLoading(false)
    }, (error) => {
      console.error("Eroare la încărcarea notelor:", error)
      toast({
        title: "Eroare",
        description: "Nu s-au putut încărca notele.",
        variant: "destructive"
      })
      setLoading(false)
    })

    return () => unsubscribe()
  }, [])

  // Reset form function with initial state tracking
  const resetForm = () => {
    const defaultState = {
      title: "",
      content: "",
      priority: "medium" as "low" | "medium" | "high",
      category: "general" as "general" | "urgent" | "info" | "task"
    }
    
    setTitle(defaultState.title)
    setContent(defaultState.content)
    setPriority(defaultState.priority)
    setCategory(defaultState.category)
    setEditingNote(null)
    
    // Set initial state for comparison
    setInitialFormState(defaultState)
  }

  // Function to check if form has unsaved changes
  const hasUnsavedChanges = () => {
    const currentState = { title, content, priority, category }
    
    // For new notes, check if any field has content
    if (!editingNote) {
      return title.trim() !== "" || content.trim() !== "" || 
             priority !== "medium" || category !== "general"
    }
    
    // For existing notes, compare with initial state
    return currentState.title !== initialFormState.title ||
           currentState.content !== initialFormState.content ||
           currentState.priority !== initialFormState.priority ||
           currentState.category !== initialFormState.category
  }

  // Handle dialog close attempt
  const handleCloseAttempt = () => {
    if (hasUnsavedChanges()) {
      setShowCloseAlert(true)
    } else {
      handleDialogClose()
    }
  }

  // Actually close the dialog
  const handleDialogClose = () => {
    setIsDialogOpen(false)
    resetForm()
  }

  // Confirm close with unsaved changes
  const confirmClose = () => {
    setShowCloseAlert(false)
    handleDialogClose()
  }

  // Cancel close
  const cancelClose = () => {
    setShowCloseAlert(false)
  }

  // Handle create note
  const handleCreateNote = async () => {
    if (!userData || !title.trim() || !content.trim()) {
      toast({
        title: "Eroare",
        description: "Vă rugăm să completați toate câmpurile obligatorii.",
        variant: "destructive"
      })
      return
    }

    setIsCreating(true)
    try {
      const docRef = await addDoc(collection(db, "note-interne"), {
        title: title.trim(),
        content: content.trim(),
        priority,
        category,
        authorId: userData.uid,
        authorName: userData.displayName || "Utilizator necunoscut",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      })

      // Log non-blocking
      void addUserLogEntry({
        actiune: "Creare notă internă",
        detalii: `ID: ${docRef.id}; titlu: ${title.trim()}; prioritate: ${priority}; categorie: ${category}`,
        categorie: "Note interne",
      })

      toast({
        title: "Succes",
        description: "Nota a fost creată cu succes."
      })

      resetForm()
      setIsDialogOpen(false)
    } catch (error) {
      console.error("Eroare la crearea notei:", error)
      toast({
        title: "Eroare", 
        description: "Nu s-a putut crea nota.",
        variant: "destructive"
      })
    } finally {
      setIsCreating(false)
    }
  }

  // Handle edit note
  const handleEditNote = async () => {
    if (!editingNote || !title.trim() || !content.trim()) {
      toast({
        title: "Eroare",
        description: "Vă rugăm să completați toate câmpurile obligatorii.",
        variant: "destructive"
      })
      return
    }

    setIsCreating(true)
    try {
      await updateDoc(doc(db, "note-interne", editingNote.id), {
        title: title.trim(),
        content: content.trim(),
        priority,
        category,
        updatedAt: serverTimestamp()
      })

      // Log dif non-blocking
      const changes: string[] = []
      if (editingNote.title !== title.trim()) changes.push(`title: "${editingNote.title}" → "${title.trim()}"`)
      if (editingNote.content !== content.trim()) changes.push(`content: [text actualizat]`)
      if (editingNote.priority !== priority) changes.push(`priority: "${editingNote.priority}" → "${priority}"`)
      if (editingNote.category !== category) changes.push(`category: "${editingNote.category}" → "${category}"`)
      const detalii = changes.length ? changes.join("; ") : "Actualizare fără câmpuri esențiale modificate"
      void addUserLogEntry({
        actiune: "Actualizare notă internă",
        detalii: `ID: ${editingNote.id}; ${detalii}`,
        categorie: "Note interne",
      })

      toast({
        title: "Succes",
        description: "Nota a fost actualizată cu succes."
      })

      // Keep dialog open after save to show updated content

      resetForm()
      setIsDialogOpen(false)
    } catch (error) {
      console.error("Eroare la actualizarea notei:", error)
      toast({
        title: "Eroare",
        description: "Nu s-a putut actualiza nota.",
        variant: "destructive"
      })
    } finally {
      setIsCreating(false)
    }
  }

  // Handle delete note
  const handleDeleteNote = async (noteId: string) => {
    const confirmed = window.confirm("Sunteți sigur că doriți să ștergeți această notă?")
    if (!confirmed) return

    try {
      // Log non-blocking înainte de ștergere
      void addUserLogEntry({
        actiune: "Ștergere notă internă",
        detalii: `ID: ${noteId}`,
        categorie: "Note interne",
      })
      await deleteDoc(doc(db, "note-interne", noteId))
      toast({
        title: "Succes",
        description: "Nota a fost ștearsă cu succes."
      })
    } catch (error) {
      console.error("Eroare la ștergerea notei:", error)
      toast({
        title: "Eroare",
        description: "Nu s-a putut șterge nota.",
        variant: "destructive"
      })
    }
  }

  // Open edit dialog (for edit button in dropdown)
  const openEditDialog = (note: Note) => {
    setEditingNote(note)
    setTitle(note.title)
    setContent(note.content)
    setPriority(note.priority)
    setCategory(note.category)
    
    // Set initial state for comparison
    setInitialFormState({
      title: note.title,
      content: note.content,
      priority: note.priority,
      category: note.category
    })
    
    setIsDialogOpen(true)
  }

  // Open create dialog
  const openCreateDialog = () => {
    resetForm()
    setIsDialogOpen(true)
  }

  // Open unified dialog (now used when clicking on card)
  const openViewDialog = (note: Note) => {
    setEditingNote(note)
    setTitle(note.title)
    setContent(note.content)
    setPriority(note.priority)
    setCategory(note.category)
    setIsDialogOpen(true)
  }

  // Calculate optimal width for a card based on content line lengths
  const getCardWidth = (note: Note) => {
    // Analyze title line length
    const titleLines = note.title.split('\n').filter(line => line.trim().length > 0)
    const maxTitleLineLength = titleLines.length > 0 ? Math.max(...titleLines.map(line => line.length)) : 0
    
    // Analyze content line lengths
    const contentLines = note.content.split('\n').filter(line => line.trim().length > 0)
    const maxContentLineLength = contentLines.length > 0 ? Math.max(...contentLines.map(line => line.length)) : 0
    
    // Take the longest line from either title or content
    const maxLineLength = Math.max(maxTitleLineLength, maxContentLineLength)
    
    // Calculate width based on longest line (considering font size and padding)
    if (maxLineLength <= 15) return "min-w-60 max-w-72"      // Very short lines
    if (maxLineLength <= 25) return "min-w-72 max-w-80"      // Short lines  
    if (maxLineLength <= 40) return "min-w-80 max-w-96"      // Medium lines
    if (maxLineLength <= 60) return "min-w-96 max-w-lg"      // Long lines
    if (maxLineLength <= 80) return "min-w-lg max-w-xl"      // Very long lines
    return "min-w-xl max-w-2xl"                              // Extremely long lines
  }

  // Filter and sort notes (newest first)
  const filteredNotes = notes
    .filter(note => {
      const matchesSearch = note.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           note.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           note.authorName.toLowerCase().includes(searchTerm.toLowerCase())
      
      const matchesPriority = selectedPriority === "all" || note.priority === selectedPriority
      const matchesCategory = selectedCategory === "all" || note.category === selectedCategory

      return matchesSearch && matchesPriority && matchesCategory
    })
    .sort((a, b) => {
      // Ensure newest notes appear first (descending order)
      if (!a.createdAt || !b.createdAt) return 0
      return b.createdAt.toMillis() - a.createdAt.toMillis()
    })

  // Pagination
  const totalPages = Math.ceil(filteredNotes.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedNotes = filteredNotes.slice(startIndex, endIndex)

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, selectedPriority, selectedCategory])

  // Format date
  const formatDate = (timestamp: Timestamp) => {
    if (!timestamp) return "Data necunoscută"
    try {
      const date = timestamp.toDate()
      const now = new Date()
      const diffInMs = now.getTime() - date.getTime()
      const diffInMinutes = Math.floor(diffInMs / (1000 * 60))
      const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60))
      const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24))

      if (diffInMinutes < 1) return "acum"
      if (diffInMinutes < 60) return `acum ${diffInMinutes} min`
      if (diffInHours < 24) return `acum ${diffInHours}h`
      if (diffInDays < 7) return `acum ${diffInDays} zile`
      
      const day = date.getDate().toString().padStart(2, "0")
      const month = (date.getMonth() + 1).toString().padStart(2, "0")
      const year = date.getFullYear()
      return `${day}.${month}.${year}`
    } catch {
      return "Data necunoscută"
    }
  }

  if (loading) {
    return (
      <DashboardShell>
        <div className="flex justify-center items-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <span className="ml-2 text-gray-600">Se încarcă notele...</span>
        </div>
      </DashboardShell>
    )
  }

  return (
    <DashboardShell>
      <DashboardHeader heading="Note Interne" text="Gestionați notele interne ale echipei">
        <Button onClick={openCreateDialog}>
          <Plus className="mr-2 h-4 w-4" />
          Notă nouă
        </Button>
      </DashboardHeader>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Căutați note..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        <Select value={selectedPriority} onValueChange={setSelectedPriority}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Prioritate" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toate prioritățile</SelectItem>
            <SelectItem value="high">Înaltă</SelectItem>
            <SelectItem value="medium">Medie</SelectItem>
            <SelectItem value="low">Scăzută</SelectItem>
          </SelectContent>
        </Select>

        <Select value={selectedCategory} onValueChange={setSelectedCategory}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Categorie" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toate categoriile</SelectItem>
            <SelectItem value="urgent">Urgent</SelectItem>
            <SelectItem value="task">Sarcină</SelectItem>
            <SelectItem value="info">Informație</SelectItem>
            <SelectItem value="general">General</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Notes Grid */}
      {filteredNotes.length === 0 ? (
        <Card className="p-8 text-center">
          <StickyNote className="mx-auto h-12 w-12 text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Nu există note</h3>
          <p className="text-gray-500 mb-4">
            {notes.length === 0 
              ? "Creați prima notă pentru a începe." 
              : "Nu s-au găsit note care să corespundă criteriilor de filtrare."
            }
          </p>
          {notes.length === 0 && (
            <Button onClick={openCreateDialog}>
              <Plus className="mr-2 h-4 w-4" />
              Creați prima notă
            </Button>
          )}
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap gap-4 items-start justify-start max-w-full overflow-hidden">
            {paginatedNotes.map((note) => (
            <Card key={note.id} className={`group hover:shadow-md transition-shadow cursor-pointer h-auto flex-shrink-0 w-fit ${getCardWidth(note)}`} onClick={() => openViewDialog(note)}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0 mr-2">
                    <CardTitle className="text-base group-hover:text-blue-600 transition-colors leading-relaxed whitespace-pre-wrap break-words">
                      {note.title}
                    </CardTitle>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem 
                        onClick={(e) => {
                          e.stopPropagation()
                          openEditDialog(note)
                        }}
                      >
                        <Edit3 className="mr-2 h-4 w-4" />
                        Editează
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDeleteNote(note.id)
                        }}
                        className="text-red-600"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Șterge
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                
                <div className="flex gap-2 mt-2">
                  <Badge className={`text-xs ${priorityColors[note.priority]}`}>
                    {priorityLabels[note.priority]}
                  </Badge>
                  <Badge className={`text-xs ${categoryColors[note.category]}`}>
                    {categoryLabels[note.category]}
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="pt-0">
                <p className="text-sm text-gray-600 mb-4 whitespace-pre-wrap leading-relaxed break-words">
                  {note.content}
                </p>
                
                <div className="flex items-center justify-between text-xs text-gray-500 gap-2">
                  <div className="flex items-center min-w-0 flex-1">
                    <User className="mr-1 h-3 w-3 flex-shrink-0" />
                    <span className="truncate">{note.authorName}</span>
                  </div>
                  <div className="flex items-center flex-shrink-0">
                    <Clock className="mr-1 h-3 w-3" />
                    <span>{formatDate(note.createdAt)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-6">
              <div className="text-sm text-gray-500">
                Afișare {startIndex + 1}-{Math.min(endIndex, filteredNotes.length)} din {filteredNotes.length} note
              </div>
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                >
                  Anterior
                </Button>
                
                <div className="flex items-center space-x-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                    <Button
                      key={page}
                      variant={currentPage === page ? "default" : "outline"}
                      size="sm"
                      onClick={() => setCurrentPage(page)}
                      className="w-8 h-8 p-0"
                    >
                      {page}
                    </Button>
                  ))}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
                >
                  Următor
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Unified View/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={(open) => {
        if (!open) {
          handleCloseAttempt()
        } else {
          setIsDialogOpen(open)
        }
      }}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
          <DialogHeader className="space-y-3">
            <DialogTitle className="text-xl">
              {editingNote ? "Editează nota" : "Notă nouă"}
            </DialogTitle>
            <DialogDescription>
              {editingNote 
                ? "Modificați detaliile notei și vizualizați informațiile." 
                : "Creați o notă nouă pentru echipa dumneavoastră."
              }
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Edit Fields */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Titlu *</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Introduceți titlul notei"
                  maxLength={100}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="content">Conținut *</Label>
                <Textarea
                  id="content"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Introduceți conținutul notei"
                  rows={6}
                  maxLength={1000}
                />
                <p className="text-xs text-gray-500">
                  {content.length}/1000 caractere
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="priority">Prioritate</Label>
                  <Select value={priority} onValueChange={(value: "low" | "medium" | "high") => setPriority(value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Scăzută</SelectItem>
                      <SelectItem value="medium">Medie</SelectItem>
                      <SelectItem value="high">Înaltă</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="category">Categorie</Label>
                  <Select value={category} onValueChange={(value: "general" | "urgent" | "info" | "task") => setCategory(value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="general">General</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                      <SelectItem value="info">Informație</SelectItem>
                      <SelectItem value="task">Sarcină</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Information Display (only for existing notes) */}
            {editingNote && (
              <>
                <div className="border-t pt-4">
                  <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
                    <StickyNote className="h-5 w-5" />
                    Informații nota
                  </h3>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-gray-700">Autor</Label>
                      <div className="flex items-center text-sm text-gray-600">
                        <User className="mr-2 h-4 w-4" />
                        {editingNote.authorName}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-gray-700">Data creării</Label>
                      <div className="flex items-center text-sm text-gray-600">
                        <Clock className="mr-2 h-4 w-4" />
                        {formatDate(editingNote.createdAt)}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-gray-700">Prioritate curentă</Label>
                      <div className="flex items-center">
                        <Badge className={`text-xs ${priorityColors[editingNote.priority]}`}>
                          {priorityLabels[editingNote.priority]}
                        </Badge>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-gray-700">Categorie curentă</Label>
                      <div className="flex items-center">
                        <Badge className={`text-xs ${categoryColors[editingNote.category]}`}>
                          {categoryLabels[editingNote.category]}
                        </Badge>
                      </div>
                    </div>

                    {editingNote.updatedAt && editingNote.updatedAt !== editingNote.createdAt && (
                      <div className="space-y-2 sm:col-span-2">
                        <Label className="text-sm font-medium text-gray-700">Ultima modificare</Label>
                        <div className="flex items-center text-sm text-gray-600">
                          <Clock className="mr-2 h-4 w-4" />
                          {formatDate(editingNote.updatedAt)}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          <DialogFooter className="flex flex-col sm:flex-row gap-2">
            <div className="flex flex-1 justify-start">
              {editingNote && (
                <Button 
                  variant="destructive"
                  onClick={() => {
                    handleDeleteNote(editingNote.id)
                    setIsDialogOpen(false)
                  }}
                  className="w-full sm:w-auto"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Șterge nota
                </Button>
              )}
            </div>
            
            <div className="flex gap-2 flex-1 sm:flex-none justify-end">
              <Button 
                variant="outline" 
                onClick={handleCloseAttempt}
                className="w-full sm:w-auto"
              >
                Anulează
              </Button>
              
              <Button 
                onClick={editingNote ? handleEditNote : handleCreateNote}
                disabled={isCreating || !title.trim() || !content.trim()}
                className="w-full sm:w-auto"
              >
                {isCreating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {editingNote ? "Se salvează..." : "Se creează..."}
                  </>
                ) : (
                  editingNote ? "Salvează modificările" : "Creează nota"
                )}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Close confirmation alert */}
      <AlertDialog open={showCloseAlert} onOpenChange={setShowCloseAlert}>
        <AlertDialogContent className="w-[calc(100%-2rem)] max-w-[400px]">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmați închiderea</AlertDialogTitle>
            <AlertDialogDescription>
              Aveți modificări nesalvate. Sunteți sigur că doriți să închideți formularul? Toate modificările vor fi pierdute.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
            <AlertDialogCancel onClick={cancelClose} className="w-full sm:w-auto">
              Nu, rămân în formular
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmClose} 
              className="bg-red-600 hover:bg-red-700 w-full sm:w-auto"
            >
              Da, închide formularul
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </DashboardShell>
  )
} 