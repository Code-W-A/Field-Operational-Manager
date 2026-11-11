"use client"

import { useState, useEffect, useMemo } from "react"
import dynamic from "next/dynamic"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { toast } from "@/hooks/use-toast"
import { useAuth } from "@/contexts/AuthContext"
import { 
  Plus, 
  Edit3, 
  Trash2, 
  ChevronRight,
  ChevronDown,
  FileText,
  Search, 
  User,
  StickyNote,
  Clock,
  AlertCircle,
  Loader2
} from "lucide-react"
import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  onSnapshot,
  serverTimestamp,
  deleteField,
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
import {
  isRichContentEmpty,
  plainTextLengthFromHtml,
  isProbablyRichHtml,
} from "@/lib/note-interne/procedure-content-html"

const ProcedureRichTextEditor = dynamic(
  () =>
    import("@/components/note-interne/procedure-rich-text-editor").then((m) => ({
      default: m.ProcedureRichTextEditor,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-[420px] w-full rounded-md border border-input bg-muted/30 animate-pulse" />
    ),
  }
)

const MAX_PROCEDURE_CONTENT_PLAIN_CHARS = 20000

const procedureRichHtmlViewClass =
  "text-sm text-gray-600 leading-relaxed break-words [&_p]:mb-1 last:[&_p]:mb-0 [&_strong]:font-semibold [&_b]:font-semibold [&_em]:italic [&_i]:italic [&_u]:underline [&_s]:line-through [&_strike]:line-through [&_ul]:my-2 [&_ul]:ml-6 [&_ul]:list-disc [&_ul]:pl-1 [&_ol]:my-2 [&_ol]:ml-6 [&_ol]:list-decimal [&_ol]:pl-1 [&_li]:my-0.5"

import { buildProcedureTree, procedureMatches } from "@/lib/note-interne/procedure-tree"

import type { ProcedureNote } from "@/packages/fom-domain/procedures";
type Note = ProcedureNote<Timestamp>;

const categoryColors = {
  general: "bg-blue-100 text-blue-800 border-blue-200",
  urgent: "bg-red-100 text-red-800 border-red-200",
  info: "bg-cyan-100 text-cyan-800 border-cyan-200",
  task: "bg-purple-100 text-purple-800 border-purple-200"
}

const categoryLabels = {
  general: "General",
  urgent: "Urgent",
  info: "Informație",
  task: "Sarcină"
}

export default function NoteInternePage() {
  const { userData } = useAuth()
  const canManageProcedures = userData?.role === "admin"
  const canViewProcedures = Boolean(userData && ["admin", "dispecer", "tehnician"].includes(userData.role))

  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const [editingNote, setEditingNote] = useState<Note | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedCategory, setSelectedCategory] = useState<string>("all")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [parentId, setParentId] = useState<string | null>(null)
  const tree = useMemo(() => buildProcedureTree(notes), [notes])
  const matches = useMemo(() => notes.filter(note => procedureMatches(note, searchTerm, selectedCategory)), [notes, searchTerm, selectedCategory])
  const filtering = searchTerm.trim() !== "" || selectedCategory !== "all"
  const visibleIds = new Set(matches.flatMap(note => [note.id, ...tree.ancestors(note.id)]))
  const selectedNote = notes.find(note => note.id === selectedId && visibleIds.has(note.id)) ?? matches[0] ?? null
  const excludedParents = editingNote ? new Set([editingNote.id, ...tree.descendants(editingNote.id)]) : new Set<string>()
  const parentOptions = notes.filter(note => !excludedParents.has(note.id))
  const validParent = !parentId || (tree.byId.has(parentId) && !excludedParents.has(parentId))

  const selectNote = (id: string) => {
    setSelectedId(id)
    setExpandedIds(previous => new Set([...previous, id, ...tree.ancestors(id)]))
  }

  // Form state
  const [title, setTitle] = useState("")
  const [content, setContent] = useState("")
  const [category, setCategory] = useState<"general" | "urgent" | "info" | "task">("general")

  // Add close confirmation states
  const [showCloseAlert, setShowCloseAlert] = useState(false)
  const [initialFormState, setInitialFormState] = useState({
    title: "",
    content: "",
    parentId: null as string | null,
    category: "general" as "general" | "urgent" | "info" | "task"
  })

  // Load notes from Firestore
  useEffect(() => {
    if (!canViewProcedures) {
      setNotes([])
      setLoading(false)
      return
    }
    setLoading(true)
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
  }, [userData?.uid, canViewProcedures])

  // Reset form function with initial state tracking
  const resetForm = () => {
    const defaultState = {
      title: "",
      content: "",
      parentId: null as string | null,
      category: "general" as "general" | "urgent" | "info" | "task"
    }
    
    setTitle(defaultState.title)
    setContent(defaultState.content)
    setCategory(defaultState.category)
    setParentId(null)
    setEditingNote(null)
    
    // Set initial state for comparison
    setInitialFormState(defaultState)
  }

  // Function to check if form has unsaved changes
  const hasUnsavedChanges = () => {
    const currentState = { title, content, category, parentId }
    
    // For new notes, check if any field has content
    if (!editingNote) {
      return title.trim() !== "" || !isRichContentEmpty(content) || category !== "general" || parentId !== initialFormState.parentId
    }
    
    // For existing notes, compare with initial state
    return currentState.title !== initialFormState.title ||
           currentState.content !== initialFormState.content ||
           currentState.category !== initialFormState.category || currentState.parentId !== initialFormState.parentId
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
    if (!canManageProcedures) {
      toast({ title: "Acces restricționat", description: "Doar administratorii pot adăuga proceduri.", variant: "destructive" })
      return
    }
    if (!validParent) {
      toast({ title: "Părinte invalid", description: "Selectați un element principal valid.", variant: "destructive" })
      return
    }
    const plainLen = plainTextLengthFromHtml(content)
    if (!userData || !title.trim() || isRichContentEmpty(content)) {
      toast({
        title: "Eroare",
        description: "Vă rugăm să completați toate câmpurile obligatorii.",
        variant: "destructive"
      })
      return
    }
    if (plainLen > MAX_PROCEDURE_CONTENT_PLAIN_CHARS) {
      toast({
        title: "Eroare",
        description: `Conținutul depășește ${MAX_PROCEDURE_CONTENT_PLAIN_CHARS} caractere (fără formatare).`,
        variant: "destructive"
      })
      return
    }

    setIsCreating(true)
    try {
      const docRef = await addDoc(collection(db, "note-interne"), {
        title: title.trim(),
        content: content.trim(),
        category,
        parentId,
        authorId: userData.uid,
        authorName: userData.displayName || "Utilizator necunoscut",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      })

      // Log non-blocking
      void addUserLogEntry({
        actiune: "Creare procedură",
        detalii: `ID: ${docRef.id}; titlu: ${title.trim()}; categorie: ${category}`,
        categorie: "Proceduri",
      })

      toast({
        title: "Succes",
        description: "Procedura a fost creată cu succes.",
      })

      selectNote(docRef.id)
      if (parentId) setExpandedIds(previous => new Set([...previous, parentId, ...tree.ancestors(parentId)]))
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
    if (!canManageProcedures) {
      toast({ title: "Acces restricționat", description: "Doar administratorii pot modifica proceduri.", variant: "destructive" })
      return
    }
    if (!validParent) {
      toast({ title: "Părinte invalid", description: "Selectați un element principal valid.", variant: "destructive" })
      return
    }
    const plainLen = plainTextLengthFromHtml(content)
    if (!editingNote || !title.trim() || isRichContentEmpty(content)) {
      toast({
        title: "Eroare",
        description: "Vă rugăm să completați toate câmpurile obligatorii.",
        variant: "destructive"
      })
      return
    }
    if (plainLen > MAX_PROCEDURE_CONTENT_PLAIN_CHARS) {
      toast({
        title: "Eroare",
        description: `Conținutul depășește ${MAX_PROCEDURE_CONTENT_PLAIN_CHARS} caractere (fără formatare).`,
        variant: "destructive"
      })
      return
    }

    setIsCreating(true)
    try {
      await updateDoc(doc(db, "note-interne", editingNote.id), {
        title: title.trim(),
        content: content.trim(),
        category,
        parentId,
        priority: deleteField(),
        updatedAt: serverTimestamp()
      })

      // Log dif non-blocking
      const changes: string[] = []
      if (editingNote.title !== title.trim()) changes.push(`title: "${editingNote.title}" → "${title.trim()}"`)
      if (editingNote.content !== content.trim()) changes.push(`content: [text actualizat]`)
      if (editingNote.category !== category) changes.push(`category: "${editingNote.category}" → "${category}"`)
      const detalii = changes.length ? changes.join("; ") : "Actualizare fără câmpuri esențiale modificate"
      void addUserLogEntry({
        actiune: "Actualizare procedură",
        detalii: `ID: ${editingNote.id}; ${detalii}`,
        categorie: "Proceduri",
      })

      toast({
        title: "Succes",
        description: "Procedura a fost actualizată cu succes.",
      })

      if (parentId) setExpandedIds(previous => new Set([...previous, parentId, ...tree.ancestors(parentId)]))

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
    if (!canManageProcedures) {
      toast({ title: "Acces restricționat", description: "Doar administratorii pot șterge proceduri.", variant: "destructive" })
      return
    }
    if (isCreating) return
    if (notes.some(note => note.parentId === noteId)) {
      toast({ title: "Procedura are subelemente", description: "Mutați sau ștergeți subelementele înainte de a șterge această procedură.", variant: "destructive" })
      return
    }
    const confirmed = window.confirm("Sunteți sigur că doriți să ștergeți această procedură?")
    if (!confirmed) return

    try {
      // Log non-blocking înainte de ștergere
      void addUserLogEntry({
        actiune: "Ștergere procedură",
        detalii: `ID: ${noteId}`,
        categorie: "Proceduri",
      })
      await deleteDoc(doc(db, "note-interne", noteId))
      handleDialogClose()
      toast({
        title: "Succes",
        description: "Procedura a fost ștearsă cu succes.",
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

  // Open the administrator editor
  const openEditDialog = (note: Note) => {
    if (!canManageProcedures) return
    setEditingNote(note)
    setTitle(note.title)
    setContent(note.content)
    setCategory(note.category)
    setParentId(note.parentId ?? null)
    
    // Set initial state for comparison
    setInitialFormState({
      title: note.title,
      content: note.content,
      parentId: note.parentId ?? null,
      category: note.category
    })
    
    setIsDialogOpen(true)
  }

  const openCreateDialog = (newParentId: string | null = null) => {
    if (!canManageProcedures) return
    resetForm()
    setParentId(newParentId)
    setInitialFormState(previous => ({ ...previous, parentId: newParentId }))
    setIsDialogOpen(true)
  }

  if (userData && !canViewProcedures) {
    return (
      <DashboardShell>
        <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
          <AlertCircle className="h-16 w-16 text-red-500 mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Acces restricționat</h2>
          <p className="text-gray-600 mb-6 max-w-md">
            Procedurile sunt disponibile doar pentru utilizatorii interni, nu pentru contul de client.
          </p>
          <Button onClick={() => window.history.back()} variant="outline">
            Înapoi
          </Button>
        </div>
      </DashboardShell>
    )
  }

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

  if (loading || !userData) {
    return (
      <DashboardShell>
        <div className="flex justify-center items-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <span className="ml-2 text-gray-600">Se încarcă procedurile...</span>
        </div>
      </DashboardShell>
    )
  }

  const dialogReadOnly = Boolean(editingNote) && !canManageProcedures

  return (
    <DashboardShell>
      <DashboardHeader
        heading="Proceduri"
        text={
          canManageProcedures
            ? "Texte de procedură vizibile pentru toți utilizatorii interni; doar administratorii pot edita."
            : "Consultați procedurile operaționale stabilite de administrator. Pentru modificări, contactați un admin."
        }
      >
        {canManageProcedures ? (
          <Button onClick={() => openCreateDialog()}>
            <Plus className="mr-2 h-4 w-4" />
            Procedură nouă
          </Button>
        ) : null}
      </DashboardHeader>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <Input
            aria-label="Caută în toate procedurile"
            placeholder="Caută în toate titlurile și în conținut..."
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setSelectedId(null) }}
            className="pl-10"
          />
        </div>

        <Select value={selectedCategory} onValueChange={value => { setSelectedCategory(value); setSelectedId(null) }}>
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

      <div className="grid min-h-[560px] grid-cols-1 rounded-lg border bg-background lg:grid-cols-[320px_minmax(0,1fr)]">
        <nav aria-label="Cuprins proceduri" className="min-w-0 border-b p-4 lg:border-b-0 lg:border-r">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="font-semibold">Cuprins</h2>
            <span className="text-xs text-muted-foreground" role="status">{matches.length} proceduri{filtering ? " găsite" : ""}</span>
          </div>
          <div className="max-h-[40vh] overflow-auto lg:max-h-[70vh]">
            {(() => {
              const renderBranch = (parent: string | null): React.ReactNode => (
                <ul className={parent ? "ml-3 border-l pl-2" : "space-y-1"}>
                  {(tree.children.get(parent) ?? []).filter(note => visibleIds.has(note.id)).map(note => {
                    const hasChildren = (tree.children.get(note.id) ?? []).some(child => visibleIds.has(child.id))
                    const expanded = filtering || expandedIds.has(note.id)
                    return <li key={note.id}>
                      <div className={`flex items-center rounded-md ${selectedNote?.id === note.id ? "bg-blue-50 text-blue-800" : "hover:bg-muted"}`}>
                        {hasChildren ? <button type="button" className="shrink-0 rounded p-1.5 focus-visible:ring-2 disabled:opacity-60" disabled={filtering} title={filtering ? "Rezultatele sunt extinse automat" : undefined} aria-label={`${expanded ? "Restrânge" : "Extinde"} ${note.title}`} aria-expanded={expanded}
                          onClick={() => setExpandedIds(previous => { const next = new Set(previous); if (next.has(note.id)) next.delete(note.id); else next.add(note.id); return next })}>
                          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </button> : <FileText className="mx-1.5 h-4 w-4 shrink-0 text-muted-foreground" />}
                        <button type="button" aria-current={selectedNote?.id === note.id ? "page" : undefined} className="min-w-0 flex-1 rounded px-1 py-2 text-left text-sm break-words focus-visible:ring-2" onClick={() => selectNote(note.id)}>{note.title}</button>
                      </div>
                      {hasChildren && expanded ? renderBranch(note.id) : null}
                    </li>
                  })}
                </ul>
              )
              return renderBranch(null)
            })()}
          </div>
          {matches.length === 0 && <p className="py-4 text-sm text-muted-foreground">{notes.length ? "Nicio procedură nu corespunde căutării." : "Nu au fost încă publicate proceduri."}</p>}
        </nav>
        <article aria-label="Conținut procedură" className="min-w-0 p-5 sm:p-8">
          {selectedNote ? <>
            <div className="mb-4 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
              {tree.ancestors(selectedNote.id).map(id => <span key={id} className="flex items-center gap-1"><button type="button" className="hover:underline" onClick={() => selectNote(id)}>{tree.byId.get(id)?.title}</button><ChevronRight className="h-3 w-3" /></span>)}
              <span>{selectedNote.title}</span>
            </div>
            <div className="mb-6 flex flex-col items-start justify-between gap-4 border-b pb-5 sm:flex-row sm:flex-wrap">
              <div className="w-full min-w-0 sm:w-auto sm:flex-1">
                <h1 className="mb-3 break-words text-2xl font-semibold">{selectedNote.title}</h1>
                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <Badge className={categoryColors[selectedNote.category]}>{categoryLabels[selectedNote.category]}</Badge>
                  <span>{selectedNote.authorName}</span>
                  <span>Actualizat: {formatDate(selectedNote.updatedAt ?? selectedNote.createdAt)}</span>
                </div>
              </div>
              {canManageProcedures && <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => openCreateDialog(selectedNote.id)}><Plus className="mr-2 h-4 w-4" />Subelement nou</Button>
                <Button size="sm" variant="outline" onClick={() => openEditDialog(selectedNote)}><Edit3 className="mr-2 h-4 w-4" />Editează</Button>
              </div>}
            </div>
            {isProbablyRichHtml(selectedNote.content) ? <div className={procedureRichHtmlViewClass} dangerouslySetInnerHTML={{ __html: selectedNote.content }} /> : <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{selectedNote.content}</p>}
          </> : <div className="py-16 text-center text-muted-foreground"><StickyNote className="mx-auto mb-4 h-10 w-10" /><h2 className="mb-2 text-lg font-medium">{notes.length ? "Niciun rezultat" : "Nu există proceduri"}</h2><p>{notes.length ? "Căutarea verifică toate procedurile, inclusiv conținutul subelementelor." : "Procedurile publicate vor apărea aici."}</p></div>}
        </article>
      </div>

      {/* Unified View/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={(open) => {
        if (!open) {
          handleCloseAttempt()
        } else {
          setIsDialogOpen(open)
        }
      }}>
        <DialogContent className="w-[calc(100vw-1.5rem)] sm:max-w-[min(96vw,1024px)] max-h-[90vh] overflow-y-auto">
          <DialogHeader className="space-y-3">
            <DialogTitle className="text-xl">
              {dialogReadOnly ? "Vizualizare procedură" : editingNote ? "Editează procedura" : "Procedură nouă"}
            </DialogTitle>
            <DialogDescription>
              {dialogReadOnly
                ? "Doar citire. Modificările pot fi făcute doar de un administrator."
                : editingNote
                  ? "Modificați detaliile procedurii sau consultați istoricul de mai jos."
                  : "Adăugați o procedură vizibilă pentru toți utilizatorii interni (exceptând clienții portal)."}
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
                  placeholder="Titlul procedurii"
                  maxLength={100}
                  readOnly={dialogReadOnly}
                  disabled={dialogReadOnly}
                />
              </div>

              <div className="space-y-2 w-full min-w-0">
                <Label htmlFor="content">Conținut *</Label>
                {dialogReadOnly ? (
                  isProbablyRichHtml(content) ? (
                    <div
                      className={`rounded-md border border-input bg-muted/30 px-3 py-2 min-h-[240px] max-h-[min(65vh,640px)] overflow-y-auto ${procedureRichHtmlViewClass}`}
                      dangerouslySetInnerHTML={{ __html: content }}
                    />
                  ) : (
                    <p className="text-sm text-gray-600 whitespace-pre-wrap rounded-md border border-input bg-muted/30 px-3 py-2 min-h-[240px] max-h-[min(65vh,640px)] overflow-y-auto">
                      {content}
                    </p>
                  )
                ) : (
                  <>
                    <ProcedureRichTextEditor
                      key={editingNote?.id ?? "new-procedure"}
                      value={content}
                      onChange={setContent}
                      className="w-full min-w-0"
                    />
                    <p className="text-xs text-gray-500">
                      {plainTextLengthFromHtml(content)}/{MAX_PROCEDURE_CONTENT_PLAIN_CHARS} caractere (text fără formatare)
                    </p>
                  </>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="procedure-parent">Element principal</Label>
                <select id="procedure-parent" className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={parentId ?? ""} onChange={event => setParentId(event.target.value || null)} disabled={isCreating}>
                  <option value="">La rădăcină (element principal)</option>
                  {parentOptions.map(note => <option key={note.id} value={note.id}>{[...tree.ancestors(note.id).map(id => tree.byId.get(id)?.title), note.title].join(" / ")}</option>)}
                </select>
                <p className="text-xs text-muted-foreground">Alegeți un părinte pentru un subelement sau rădăcina pentru un element principal.</p>
              </div>

              <div className="space-y-2 max-w-md">
                <Label htmlFor="category">Categorie</Label>
                <Select
                  value={category}
                  onValueChange={(value: "general" | "urgent" | "info" | "task") => setCategory(value)}
                  disabled={dialogReadOnly}
                >
                  <SelectTrigger id="category">
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

            {/* Information Display (only for existing notes) */}
            {editingNote && (
              <>
                <div className="border-t pt-4">
                  <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
                    <StickyNote className="h-5 w-5" />
                    Informații procedură
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
            {dialogReadOnly ? (
              <div className="flex w-full justify-end">
                <Button variant="outline" onClick={handleDialogClose} className="w-full sm:w-auto">
                  Închide
                </Button>
              </div>
            ) : (
              <>
                <div className="flex flex-1 justify-start">
                  {editingNote && canManageProcedures ? (
                    <Button
                      variant="destructive"
                      disabled={isCreating}
                      onClick={() => {
                        void handleDeleteNote(editingNote.id)
                      }}
                      className="w-full sm:w-auto"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Șterge procedura
                    </Button>
                  ) : null}
                </div>

                <div className="flex gap-2 flex-1 sm:flex-none justify-end">
                  <Button variant="outline" onClick={handleCloseAttempt} className="w-full sm:w-auto">
                    Anulează
                  </Button>

                  <Button
                    onClick={editingNote ? handleEditNote : handleCreateNote}
                    disabled={
                      isCreating ||
                      !validParent ||
                      !title.trim() ||
                      isRichContentEmpty(content) ||
                      plainTextLengthFromHtml(content) > MAX_PROCEDURE_CONTENT_PLAIN_CHARS
                    }
                    className="w-full sm:w-auto"
                  >
                    {isCreating ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {editingNote ? "Se salvează..." : "Se creează..."}
                      </>
                    ) : editingNote ? (
                      "Salvează modificările"
                    ) : (
                      "Creează procedura"
                    )}
                  </Button>
                </div>
              </>
            )}
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