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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

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
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const [editingNote, setEditingNote] = useState<Note | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedPriority, setSelectedPriority] = useState<string>("all")
  const [selectedCategory, setSelectedCategory] = useState<string>("all")

  // Form state
  const [title, setTitle] = useState("")
  const [content, setContent] = useState("")
  const [priority, setPriority] = useState<"low" | "medium" | "high">("medium")
  const [category, setCategory] = useState<"general" | "urgent" | "info" | "task">("general")

  // Load notes from Firestore
  useEffect(() => {
    const notesRef = collection(db, "note-interne")
    const q = query(notesRef, orderBy("createdAt", "desc"))

    const unsubscribe = onSnapshot(q, (snapshot) => {
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

  // Reset form
  const resetForm = () => {
    setTitle("")
    setContent("")
    setPriority("medium")
    setCategory("general")
    setEditingNote(null)
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
      await addDoc(collection(db, "note-interne"), {
        title: title.trim(),
        content: content.trim(),
        priority,
        category,
        authorId: userData.uid,
        authorName: userData.displayName || "Utilizator necunoscut",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
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

      toast({
        title: "Succes",
        description: "Nota a fost actualizată cu succes."
      })

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

  // Open edit dialog
  const openEditDialog = (note: Note) => {
    setEditingNote(note)
    setTitle(note.title)
    setContent(note.content)
    setPriority(note.priority)
    setCategory(note.category)
    setIsDialogOpen(true)
  }

  // Open create dialog
  const openCreateDialog = () => {
    resetForm()
    setIsDialogOpen(true)
  }

  // Filter notes
  const filteredNotes = notes.filter(note => {
    const matchesSearch = note.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         note.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         note.authorName.toLowerCase().includes(searchTerm.toLowerCase())
    
    const matchesPriority = selectedPriority === "all" || note.priority === selectedPriority
    const matchesCategory = selectedCategory === "all" || note.category === selectedCategory

    return matchesSearch && matchesPriority && matchesCategory
  })

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
      
      return date.toLocaleDateString('ro-RO', { 
        day: '2-digit', 
        month: '2-digit', 
        year: 'numeric' 
      })
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
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredNotes.map((note) => (
            <Card key={note.id} className="group hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base group-hover:text-blue-600 transition-colors" style={{
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden'
                    }}>
                      {note.title}
                    </CardTitle>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openEditDialog(note)}>
                        <Edit3 className="mr-2 h-4 w-4" />
                        Editează
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={() => handleDeleteNote(note.id)}
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
                <p className="text-sm text-gray-600 mb-4" style={{
                  display: '-webkit-box',
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden'
                }}>
                  {note.content}
                </p>
                
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <div className="flex items-center">
                    <User className="mr-1 h-3 w-3" />
                    {note.authorName}
                  </div>
                  <div className="flex items-center">
                    <Clock className="mr-1 h-3 w-3" />
                    {formatDate(note.createdAt)}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {editingNote ? "Editează nota" : "Notă nouă"}
            </DialogTitle>
            <DialogDescription>
              {editingNote 
                ? "Modificați detaliile notei și salvați modificările." 
                : "Creați o notă nouă pentru echipa dumneavoastră."
              }
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
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
                rows={4}
                maxLength={1000}
              />
              <p className="text-xs text-gray-500">
                {content.length}/1000 caractere
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
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

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Anulează
            </Button>
            <Button 
              onClick={editingNote ? handleEditNote : handleCreateNote}
              disabled={isCreating || !title.trim() || !content.trim()}
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
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardShell>
  )
} 