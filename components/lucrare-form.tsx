"use client"

import type React from "react"
import { useState, useEffect, useCallback, useImperativeHandle, forwardRef, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { format } from "date-fns"
import { ro } from "date-fns/locale"
import { CalendarIcon, Loader2, Plus, Phone, Mail, Users, LightbulbIcon } from "lucide-react"
import { useFirebaseCollection } from "@/hooks/use-firebase-collection"
import { orderBy, where, query, collection, onSnapshot } from "firebase/firestore"
import type { Client, PersoanaContact, Locatie, Echipament } from "@/lib/firebase/firestore"
import { db } from "@/lib/firebase/config"
// Importăm componenta ContractSelect
import { ContractSelect } from "./contract-select"
// Importăm componenta ClientForm
import { ClientForm } from "./client-form"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { formatDateTime24, formatTime24 } from "@/lib/utils/time-format"
// Import the TimeSelector component
import { TimeSelector } from "./time-selector"
// Import our new CustomDatePicker component
import { CustomDatePicker } from "./custom-date-picker"
import { Card } from "@/components/ui/card"
// Înlocuim importul pentru componenta EquipmentSelect cu CustomEquipmentSelect
import { CustomEquipmentSelect } from "@/components/custom-equipment-select"
import { Input } from "@/components/ui/input"
import { toast } from "@/components/ui/use-toast"
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes"
import { UnsavedChangesDialog } from "@/components/unsaved-changes-dialog"
// Adăugați aceste importuri la începutul fișierului
import { useNavigationPrompt } from "@/hooks/use-navigation-prompt"
import { NavigationPromptDialog } from "@/components/navigation-prompt-dialog"
import { useAuth } from "@/contexts/AuthContext"
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

// Define the Lucrare type
interface Lucrare {
  dataEmiterii: string
  dataInterventie: string
  tipLucrare: string
  tehnicieni: string[]
  client: string
  locatie: string
  echipament: string
  descriere: string
  persoanaContact: string
  telefon: string
  statusLucrare: string
  statusFacturare: string
  contract?: string
  contractNumber?: string
  defectReclamat?: string
  persoaneContact?: PersoanaContact[]
  echipamentId?: string
  echipamentCod?: string
}

// În componenta LucrareForm, actualizăm interfața LucrareFormProps pentru a include contractType
interface LucrareFormProps {
  isEdit?: boolean
  dataEmiterii: Date | undefined
  setDataEmiterii: (date: Date | undefined) => void
  dataInterventie: Date | undefined
  setDataInterventie: (date: Date | undefined) => void
  formData: {
    tipLucrare: string
    tehnicieni: string[]
    client: string
    locatie: string
    echipament: string
    descriere: string
    persoanaContact: string
    telefon: string
    statusLucrare: string
    statusFacturare: string
    contract?: string
    contractNumber?: string
    contractType?: string // Adăugăm tipul contractului
    defectReclamat?: string
    persoaneContact?: PersoanaContact[]
    echipamentId?: string
    echipamentCod?: string
  }
  handleInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void
  handleSelectChange: (id: string, value: string) => void
  handleTehnicieniChange: (value: string) => void
  handleCustomChange?: (field: string, value: any) => void
  fieldErrors?: string[]
  onSubmit?: (data: Partial<Lucrare>) => Promise<void>
  onCancel?: () => void
  initialData?: Lucrare | null
}

// Define a ref type for the form
export interface LucrareFormRef {
  hasUnsavedChanges: () => boolean
  confirmClose: () => void
}

// Add the following to the LucrareForm component
export const LucrareForm = forwardRef<LucrareFormRef, LucrareFormProps>(
  (
    {
      isEdit = false,
      dataEmiterii,
      setDataEmiterii,
      dataInterventie,
      setDataInterventie,
      formData,
      handleInputChange,
      handleSelectChange,
      handleTehnicieniChange,
      handleCustomChange,
      fieldErrors = [],
      onSubmit,
      onCancel,
      initialData,
    },
    ref,
  ) => {
    const { userData } = useAuth()
    const userRole = userData?.role
    const isAdminOrDispatcher = userRole === "admin" || userRole === "dispecer"

    const [isAddClientDialogOpen, setIsAddClientDialogOpen] = useState(false)
    const [tehnicieni, setTehnicieni] = useState<any[]>([])
    const [loadingTehnicieni, setLoadingTehnicieni] = useState(true)
    const [timeEmiterii, setTimeEmiterii] = useState<string>(
      dataEmiterii ? formatTime24(dataEmiterii) : formatTime24(new Date()),
    )
    const [timeInterventie, setTimeInterventie] = useState<string>(
      dataInterventie ? formatTime24(dataInterventie) : formatTime24(new Date()),
    )
    const [error, setError] = useState<string | null>(null)
    const [clientSearchTerm, setClientSearchTerm] = useState("")
    const [filteredClients, setFilteredClients] = useState<Client[]>([])
    const [isClientDropdownOpen, setIsClientDropdownOpen] = useState(false)
    const [formModified, setFormModified] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [showCloseAlert, setShowCloseAlert] = useState(false)
    const equipmentSelectRef = useRef<any>(null)

    // Track initial form state
    const [initialFormState, setInitialFormState] = useState({
      dataEmiterii,
      dataInterventie,
      formData: JSON.stringify(formData),
    })

    // Use the unsaved changes hook
    const { showDialog, handleNavigation, confirmNavigation, cancelNavigation, pendingUrl } =
      useUnsavedChanges(formModified)

    // Add state for controlling the popovers
    const [dateEmiteriiOpen, setDateEmiteriiOpen] = useState(false)
    const [dateInterventieOpen, setDateInterventieOpen] = useState(false)

    // Adăugăm state pentru clientul selectat
    const [selectedClient, setSelectedClient] = useState<Client | null>(null)

    // Adăugăm state pentru locația selectată
    const [selectedLocatie, setSelectedLocatie] = useState<Locatie | null>(null)
    const [locatii, setLocatii] = useState<Locatie[]>([])

    // Adăugăm state pentru persoanele de contact ale locației selectate
    const [persoaneContact, setPersoaneContact] = useState<PersoanaContact[]>([])

    // Adăugăm state pentru a controla vizibilitatea acordeonului
    const [showContactAccordion, setShowContactAccordion] = useState(false)

    // Adăugăm state pentru a stoca echipamentele disponibile pentru locația selectată
    const [availableEquipments, setAvailableEquipments] = useState<Echipament[]>([])

    // Adăugăm state pentru a urmări dacă echipamentele au fost încărcate
    const [equipmentsLoaded, setEquipmentsLoaded] = useState(false)

    // Adăugăm state pentru a urmări dacă am încercat să găsim echipamentul după nume
    const [triedFindByName, setTriedFindByName] = useState(false)

    // Adăugăm state pentru a urmări dacă am încercat să selectăm echipamentul
    const [triedSelectEquipment, setTriedSelectEquipment] = useState(false)

    // Expose methods to parent component via ref
    useImperativeHandle(ref, () => ({
      hasUnsavedChanges: () => formModified,
      confirmClose: () => {
        if (onCancel) {
          onCancel()
        }
      },
    }))

    // Check if form has been modified
    useEffect(() => {
      const currentState = {
        dataEmiterii,
        dataInterventie,
        formData: JSON.stringify(formData),
      }

      const hasChanged =
        currentState.dataEmiterii !== initialFormState.dataEmiterii ||
        currentState.dataInterventie !== initialFormState.dataInterventie ||
        currentState.formData !== initialFormState.formData

      setFormModified(hasChanged)
    }, [dataEmiterii, dataInterventie, formData, initialFormState])

    // Reset form modified state after successful submission
    useEffect(() => {
      if (onSubmit && !isSubmitting) {
        // Update the initial state to match current state after successful save
        setInitialFormState({
          dataEmiterii,
          dataInterventie,
          formData: JSON.stringify(formData),
        })
        setFormModified(false)
      }
    }, [onSubmit, isSubmitting, dataEmiterii, dataInterventie, formData])

    // În componenta LucrareForm, adăugați:
    const { showPrompt, handleConfirm, handleCancel, handleCancel2 } = useNavigationPrompt(formModified)

    // Handle cancel with confirmation if form is modified
    const handleCancelWithConfirmation = () => {
      if (formModified && onCancel) {
        // Show confirmation dialog
        handleNavigation("#cancel")
      } else if (onCancel) {
        onCancel()
      }
    }

    // Confirm cancel action
    const confirmCancelAction = () => {
      if (onCancel) {
        onCancel()
      }
    }

    // Handle date selection with proper time preservation
    const handleDateEmiteriiSelect = useCallback(
      (date: Date | undefined) => {
        if (!date) {
          setDataEmiterii(undefined)
          return
        }

        // Create a new date to avoid mutation
        const newDate = new Date(date)

        // If we already have a date, preserve the time
        if (dataEmiterii) {
          newDate.setHours(dataEmiterii.getHours(), dataEmiterii.getMinutes(), dataEmiterii.getSeconds())
        }

        setDataEmiterii(newDate)
      },
      [dataEmiterii, setDataEmiterii],
    )

    const handleDateInterventieSelect = useCallback(
      (date: Date | undefined) => {
        if (!date) {
          setDataInterventie(undefined)
          return
        }

        // Create a new date to avoid mutation
        const newDate = new Date(date)

        // If we already have a date, preserve the time
        if (dataInterventie) {
          newDate.setHours(dataInterventie.getHours(), dataInterventie.getMinutes(), dataInterventie.getSeconds())
        }

        setDataInterventie(newDate)
      },
      [dataInterventie, setDataInterventie],
    )

    // Actualizăm funcția handleTimeEmiteriiChange pentru a folosi formatul de 24 de ore
    const handleTimeEmiteriiChange = useCallback(
      (newTime: string) => {
        setTimeEmiterii(newTime)

        if (dataEmiterii) {
          // Creăm o nouă dată cu ora actualizată
          const [hours, minutes] = newTime.split(":").map(Number)
          const newDate = new Date(dataEmiterii)
          newDate.setHours(hours, minutes)
          setDataEmiterii(newDate)
        }
      },
      [dataEmiterii, setDataEmiterii],
    )

    // Actualizăm funcția handleTimeInterventieChange pentru a folosi formatul de 24 de ore
    const handleTimeInterventieChange = useCallback(
      (newTime: string) => {
        setTimeInterventie(newTime)

        if (dataInterventie) {
          // Creăm o nouă dată cu ora actualizată
          const [hours, minutes] = newTime.split(":").map(Number)
          const newDate = new Date(dataInterventie)
          newDate.setHours(hours, minutes)
          setDataInterventie(newDate)
        }
      },
      [dataInterventie, setDataInterventie],
    )

    // Actualizăm efectul pentru a folosi formatul de 24 de ore
    useEffect(() => {
      if (dataEmiterii) {
        // Păstrăm ora curentă dacă data se schimbă
        const currentTime = timeEmiterii || formatTime24(new Date())
        setTimeEmiterii(currentTime)
      }
    }, [dataEmiterii, timeEmiterii])

    // Actualizăm efectul pentru a folosi formatul de 24 de ore
    useEffect(() => {
      if (dataInterventie) {
        // Păstrăm ora curentă dacă data se schimbă
        const currentTime = timeInterventie || formatTime24(new Date())
        setTimeInterventie(currentTime)
      }
    }, [dataInterventie, timeInterventie])

    // Obținem clienții din Firestore
    const {
      data: clienti,
      loading: loadingClienti,
      error: clientiError,
    } = useFirebaseCollection<Client>("clienti", [orderBy("nume", "asc")])

    // Actualizăm lista filtrată de clienți când se schimbă termenul de căutare sau lista de clienți
    useEffect(() => {
      if (clienti && clienti.length > 0) {
        if (clientSearchTerm.trim() === "") {
          setFilteredClients(clienti)
        } else {
          const searchTermLower = clientSearchTerm.toLowerCase()
          const filtered = clienti.filter((client) => client.nume.toLowerCase().includes(searchTermLower))
          setFilteredClients(filtered)
        }
      } else {
        setFilteredClients([])
      }
    }, [clientSearchTerm, clienti])

    // Încărcăm tehnicienii direct din Firestore
    useEffect(() => {
      const fetchTehnicieni = async () => {
        try {
          setLoadingTehnicieni(true)
          const tehnicieniQuery = query(collection(db, "users"), where("role", "==", "tehnician"))

          const unsubscribe = onSnapshot(
            tehnicieniQuery,
            (snapshot) => {
              const tehnicieniData = snapshot.docs.map((doc) => ({
                id: doc.id,
                ...doc.data(),
              }))
              setTehnicieni(tehnicieniData)
              setLoadingTehnicieni(false)
            },
            (error) => {
              console.error("Eroare la încărcarea tehnicienilor:", error)
              setLoadingTehnicieni(false)
            },
          )

          return () => unsubscribe()
        } catch (error) {
          console.error("Eroare la încărcarea tehnicienilor:", error)
          setLoadingTehnicieni(false)
        }
      }

      fetchTehnicieni()
    }, [])

    // Modificăm funcția handleClientChange pentru a reseta echipamentul când se schimbă clientul
    const handleClientChange = async (value: string) => {
      // Găsim clientul selectat
      const client = clienti.find((c) => c.nume === value)

      if (!client) {
        console.error("Clientul selectat nu a fost găsit în lista de clienți")
        toast({
          title: "Eroare",
          description: "Clientul selectat nu a fost găsit. Vă rugăm să încercați din nou.",
          variant: "destructive",
        })
        return
      }

      // Actualizăm formData cu noul client
      handleSelectChange("client", value)

      // Resetăm câmpurile dependente doar dacă clientul s-a schimbă
      if (selectedClient?.id !== client.id) {
        handleSelectChange("locatie", "")
        handleSelectChange("echipament", "")
        handleSelectChange("persoanaContact", "")
        handleSelectChange("telefon", "")

        // Resetăm echipamentul selectat
        if (handleCustomChange) {
          handleCustomChange("echipamentId", "")
          handleCustomChange("echipamentCod", "")
        }

        // Resetăm echipamentele disponibile
        setAvailableEquipments([])
        setEquipmentsLoaded(false)

        // Resetăm acordeonul doar dacă clientul s-a schimbat
        setShowContactAccordion(false)
      }

      // Actualizăm starea pentru clientul selectat
      setSelectedClient(client)

      console.log("Client selectat:", client)
    }

    // Modificăm funcția handleLocationChange pentru a încărca echipamentele disponibile pentru locația selectată
    const handleLocationChange = (value: string) => {
      if (!selectedClient) {
        console.error("Nu există un client selectat")
        return
      }

      const selectedLocation = selectedClient.locatii?.find((loc) => loc.nume === value)

      // Actualizăm datele formularului
      handleSelectChange("locatie", value)

      // Resetăm echipamentul selectat doar dacă locația s-a schimbat
      if (selectedLocatie?.nume !== value) {
        handleSelectChange("echipament", "")

        // Resetăm echipamentul selectat
        if (handleCustomChange) {
          handleCustomChange("echipamentId", "")
          handleCustomChange("echipamentCod", "")
        }
      }

      // Actualizăm echipamentele disponibile
      if (selectedLocation && selectedLocation.echipamente) {
        console.log("Setăm echipamentele disponibile:", selectedLocation.echipamente)
        setAvailableEquipments(selectedLocation.echipamente)
        setEquipmentsLoaded(true)
      } else {
        console.log("Nu există echipamente pentru locația selectată")
        setAvailableEquipments([])
        setEquipmentsLoaded(true)
      }

      // Actualizăm locația selectată
      setSelectedLocatie(selectedLocation || null)
    }

    // Adăugăm funcție pentru selectarea echipamentului
    const handleEquipmentSelect = (equipmentId: string, equipment: Echipament) => {
      console.log("Echipament selectat în LucrareForm:", equipment)

      // Actualizăm toate câmpurile relevante
      handleSelectChange("echipament", equipment.nume)

      if (handleCustomChange) {
        handleCustomChange("echipamentId", equipmentId)
        handleCustomChange("echipamentCod", equipment.cod)
      }

      // Afișăm un toast pentru feedback
      toast({
        title: "Echipament selectat",
        description: `Ați selectat echipamentul ${equipment.nume} (cod: ${equipment.cod})`,
        variant: "default",
      })
    }

    // Actualizăm clientul selectat și locațiile când se schimbă clientul
    useEffect(() => {
      if (formData && formData.client && clienti && clienti.length > 0) {
        const client = clienti.find((c) => c.nume === formData.client)
        if (client) {
          setSelectedClient(client)

          // Actualizăm locațiile
          if (client.locatii && client.locatii.length > 0) {
            setLocatii(client.locatii)
          } else {
            // Dacă clientul nu are locații, creăm una implicită cu persoanele de contact existente
            const defaultLocatie: Locatie = {
              nume: "Sediu principal",
              adresa: client.adresa || "",
              persoaneContact:
                client.persoaneContact && client.persoaneContact.length > 0
                  ? client.persoaneContact
                  : [{ nume: client.persoanaContact || "", telefon: client.telefon || "", email: "", functie: "" }],
              echipamente: [],
            }
            setLocatii([defaultLocatie])
          }

          // Nu resetăm locația selectată dacă avem deja o locație selectată
          if (!selectedLocatie) {
            setSelectedLocatie(null)
            setPersoaneContact([])
            setShowContactAccordion(false)
            setAvailableEquipments([])
            setEquipmentsLoaded(false)
          }
        }
      }
    }, [formData, formData?.client, clienti, selectedLocatie])

    // Adăugăm un efect special pentru a gestiona încărcarea inițială a locației și echipamentelor
    useEffect(() => {
      // Verificăm dacă avem date inițiale și client selectat
      if (initialData && selectedClient && formData.locatie) {
        console.log("Încărcare inițială a locației și echipamentelor", {
          initialData,
          selectedClient,
          formDataLocatie: formData.locatie,
          formDataEchipamentId: formData.echipamentId,
          formDataEchipament: formData.echipament,
        })

        // Găsim locația selectată în client
        const locatie = selectedClient.locatii?.find((loc) => loc.nume === formData.locatie)

        if (locatie) {
          console.log("Locație găsită în client:", locatie)
          setSelectedLocatie(locatie)

          // Setăm persoanele de contact
          if (locatie.persoaneContact) {
            setPersoaneContact(locatie.persoaneContact)

            // Actualizăm persoanele de contact în formData dacă nu există deja
            if (handleCustomChange && (!formData.persoaneContact || formData.persoaneContact.length === 0)) {
              handleCustomChange("persoaneContact", locatie.persoaneContact)
            }
          }

          // Activăm afișarea acordeonului
          setShowContactAccordion(true)

          // Încărcăm echipamentele pentru locația selectată
          if (locatie.echipamente && locatie.echipamente.length > 0) {
            console.log("Echipamente găsite pentru locație:", locatie.echipamente)
            setAvailableEquipments(locatie.echipamente)
            setEquipmentsLoaded(true)

            // Verificăm dacă există un echipament selectat în datele inițiale
            if (formData.echipamentId) {
              console.log("Căutăm echipamentul cu ID:", formData.echipamentId)
              const selectedEquipment = locatie.echipamente.find((e) => e.id === formData.echipamentId)

              if (selectedEquipment) {
                console.log("Echipament găsit în locație după ID:", selectedEquipment)
              } else {
                console.log("Echipamentul cu ID", formData.echipamentId, "nu a fost găsit în locația", formData.locatie)

                // Dacă nu am găsit echipamentul după ID, dar avem numele echipamentului, încercăm să-l găsim după nume
                if (formData.echipament && !triedFindByName) {
                  console.log("Încercăm să găsim echipamentul după nume:", formData.echipament)
                  const equipmentByName = locatie.echipamente.find((e) => e.nume === formData.echipament)

                  if (equipmentByName) {
                    console.log("Echipament găsit în locație după nume:", equipmentByName)

                    // Actualizăm ID-ul echipamentului în formData
                    if (handleCustomChange) {
                      handleCustomChange("echipamentId", equipmentByName.id)
                      handleCustomChange("echipamentCod", equipmentByName.cod)
                    }

                    setTriedFindByName(true)
                  } else {
                    console.log(
                      "Echipamentul cu numele",
                      formData.echipament,
                      "nu a fost găsit în locația",
                      formData.locatie,
                    )
                  }
                }
              }
            } else if (formData.echipament && !triedFindByName) {
              // Dacă nu avem ID, dar avem numele echipamentului, încercăm să-l găsim după nume
              console.log("Nu avem ID, încercăm să găsim echipamentul după nume:", formData.echipament)
              const equipmentByName = locatie.echipamente.find((e) => e.nume === formData.echipament)

              if (equipmentByName) {
                console.log("Echipament găsit în locație după nume:", equipmentByName)

                // Actualizăm ID-ul echipamentului în formData
                if (handleCustomChange) {
                  handleCustomChange("echipamentId", equipmentByName.id)
                  handleCustomChange("echipamentCod", equipmentByName.cod)
                }

                setTriedFindByName(true)
              } else {
                console.log(
                  "Echipamentul cu numele",
                  formData.echipament,
                  "nu a fost găsit în locația",
                  formData.locatie,
                )
              }
            }
          } else {
            console.log("Nu există echipamente pentru locația", formData.locatie)
            setAvailableEquipments([])
            setEquipmentsLoaded(true)
          }
        } else {
          console.log("Locația", formData.locatie, "nu a fost găsită în clientul", selectedClient.nume)
        }
      }
    }, [
      initialData,
      selectedClient,
      formData.locatie,
      formData.echipamentId,
      formData.echipament,
      handleCustomChange,
      triedFindByName,
    ])

    // Adăugăm un efect special pentru a încerca să găsim echipamentul după nume când se încarcă datele inițiale
    useEffect(() => {
      // Verificăm dacă avem un nume de echipament, dar nu avem ID
      if (formData.echipament && !formData.echipamentId && availableEquipments.length > 0 && !triedFindByName) {
        console.log("Încercăm să găsim echipamentul după nume la încărcarea inițială:", formData.echipament)

        const equipmentByName = availableEquipments.find((e) => e.nume === formData.echipament)

        if (equipmentByName) {
          console.log("Echipament găsit după nume la încărcarea inițială:", equipmentByName)

          // Actualizăm ID-ul echipamentului în formData
          if (handleCustomChange) {
            handleCustomChange("echipamentId", equipmentByName.id)
            handleCustomChange("echipamentCod", equipmentByName.cod)

            // Afișăm un toast pentru feedback
            toast({
              title: "Echipament identificat",
              description: `Am identificat echipamentul "${equipmentByName.nume}" după nume`,
              variant: "default",
            })

            setTriedFindByName(true)
          }
        } else {
          console.log("Echipamentul cu numele", formData.echipament, "nu a fost găsit în lista disponibilă")
          setTriedFindByName(true)
        }
      }
    }, [formData.echipament, formData.echipamentId, availableEquipments, triedFindByName, handleCustomChange])

    // Adăugăm un nou efect pentru a forța selecția echipamentului după nume
    // Adăugăm acest efect după efectul care încarcă echipamentele:

    // Efect special pentru a forța selecția echipamentului după nume
    useEffect(() => {
      // Verificăm dacă avem echipamente disponibile și un nume de echipament
      if (availableEquipments.length > 0 && formData.echipament && isEdit) {
        console.log("Încercăm să forțăm selecția echipamentului după nume:", formData.echipament)

        // Căutăm echipamentul după nume exact
        let selectedEquipment = availableEquipments.find((e) => e.nume === formData.echipament)

        // Dacă nu găsim o potrivire exactă, încercăm o potrivire parțială (case insensitive)
        if (!selectedEquipment) {
          const equipmentNameLower = formData.echipament.toLowerCase()
          selectedEquipment = availableEquipments.find(
            (e) =>
              e.nume.toLowerCase().includes(equipmentNameLower) || equipmentNameLower.includes(e.nume.toLowerCase()),
          )
        }

        if (selectedEquipment) {
          console.log("Echipament găsit după nume pentru selecție forțată:", selectedEquipment)

          // Actualizăm ID-ul echipamentului în formData
          if (handleCustomChange) {
            handleCustomChange("echipamentId", selectedEquipment.id)
            handleCustomChange("echipamentCod", selectedEquipment.cod)

            // Afișăm un toast pentru feedback
            toast({
              title: "Echipament identificat",
              description: `Am identificat echipamentul "${selectedEquipment.nume}" după nume`,
              variant: "default",
            })
          }
        } else {
          console.log("Nu am putut găsi echipamentul după nume:", formData.echipament)

          // Dacă nu găsim echipamentul, dar avem un nume, îl păstrăm în formData
          // pentru a-l afișa în dropdown ca text
          if (formData.echipament && !formData.echipamentId && handleCustomChange) {
            console.log("Păstrăm numele echipamentului pentru afișare:", formData.echipament)
          }
        }
      }
    }, [availableEquipments, formData.echipament, isEdit, handleCustomChange])

    // Adăugăm un nou efect pentru a forța selecția echipamentului în dropdown
    useEffect(() => {
      // Verificăm dacă avem echipamente disponibile și un echipament selectat
      if (
        availableEquipments.length > 0 &&
        formData.echipament &&
        isEdit &&
        !triedSelectEquipment &&
        equipmentsLoaded
      ) {
        console.log("Încercăm să selectăm echipamentul în dropdown:", formData.echipament)

        // Căutăm echipamentul după ID sau nume
        let selectedEquipment: Echipament | undefined

        if (formData.echipamentId) {
          selectedEquipment = availableEquipments.find((e) => e.id === formData.echipamentId)
          if (selectedEquipment) {
            console.log("Echipament găsit după ID pentru selecție:", selectedEquipment)
          }
        }

        if (!selectedEquipment && formData.echipament) {
          selectedEquipment = availableEquipments.find((e) => e.nume === formData.echipament)
          if (selectedEquipment) {
            console.log("Echipament găsit după nume pentru selecție:", selectedEquipment)
          }
        }

        if (selectedEquipment) {
          // Actualizăm ID-ul echipamentului în formData dacă nu există deja
          if (!formData.echipamentId && handleCustomChange) {
            handleCustomChange("echipamentId", selectedEquipment.id)
            handleCustomChange("echipamentCod", selectedEquipment.cod)
          }

          // Afișăm un toast pentru feedback
          toast({
            title: "Echipament selectat automat",
            description: `Am selectat automat echipamentul "${selectedEquipment.nume}"`,
            variant: "default",
          })
        } else {
          console.log("Nu am putut găsi echipamentul pentru selecție automată")
        }

        // Marcăm că am încercat să selectăm echipamentul
        setTriedSelectEquipment(true)
      }
    }, [
      availableEquipments,
      formData.echipament,
      formData.echipamentId,
      isEdit,
      triedSelectEquipment,
      equipmentsLoaded,
      handleCustomChange,
    ])

    // Adăugăm funcție pentru gestionarea selecției locației
    const handleLocatieSelect = (locatieNume: string) => {
      console.log("Locație selectată:", locatieNume)
      const locatie = locatii.find((loc) => loc.nume === locatieNume)
      if (locatie) {
        console.log("Locație găsită:", locatie)
        setSelectedLocatie(locatie)

        // Actualizăm persoanele de contact disponibile pentru această locație
        if (locatie.persoaneContact && locatie.persoaneContact.length > 0) {
          console.log("Persoane de contact găsite:", locatie.persoaneContact)
          setPersoaneContact(locatie.persoaneContact)

          // Automatically associate all contacts with the work entry
          if (handleCustomChange) {
            handleCustomChange("persoaneContact", locatie.persoaneContact)
          }

          // If there's at least one contact, set the first one as the primary contact
          // for backward compatibility
          if (locatie.persoaneContact.length > 0) {
            const primaryContact = locatie.persoaneContact[0]
            handleSelectChange("persoanaContact", primaryContact.nume || "")
            handleSelectChange("telefon", primaryContact.telefon || "")
          }
        } else {
          console.log("Nu există persoane de contact pentru această locație")
          setPersoaneContact([])

          // Clear the contacts array
          if (handleCustomChange) {
            handleCustomChange("persoaneContact", [])
          }

          // Clear the primary contact fields
          handleSelectChange("persoanaContact", "")
          handleSelectChange("telefon", "")
        }

        // Actualizăm echipamentele disponibile pentru această locație
        if (locatie.echipamente && locatie.echipamente.length > 0) {
          console.log("Echipamente găsite pentru locație:", locatie.echipamente)
          setAvailableEquipments(locatie.echipamente)
          setEquipmentsLoaded(true)

          // Resetăm flag-ul pentru a permite o nouă încercare de selecție a echipamentului
          setTriedSelectEquipment(false)
        } else {
          console.log("Nu există echipamente pentru această locație")
          setAvailableEquipments([])
          setEquipmentsLoaded(true)
        }

        // Activăm afișarea acordeonului și nu-l dezactivăm
        setShowContactAccordion(true)

        // Actualizăm câmpul locație în formData
        handleSelectChange("locatie", locatieNume)
      }
    }

    // Adăugăm o funcție pentru a forța încărcarea echipamentelor pentru o locație
    // Adăugați această funcție după handleLocatieSelect (în jurul liniei 350):

    // Funcție pentru a forța încărcarea echipamentelor pentru o locație
    const forceLoadEquipments = useCallback(
      (locatieNume: string) => {
        if (!selectedClient) return

        const locatie = selectedClient.locatii?.find((loc) => loc.nume === locatieNume)
        if (locatie) {
          console.log("Forțăm încărcarea echipamentelor pentru locația:", locatieNume)

          if (locatie.echipamente && locatie.echipamente.length > 0) {
            console.log("Echipamente găsite pentru locație:", locatie.echipamente)
            setAvailableEquipments(locatie.echipamente)
            setEquipmentsLoaded(true)

            // Resetăm flag-ul pentru a permite o nouă încercare de selecție a echipamentului
            setTriedSelectEquipment(false)

            // Prioritizăm selecția după nume dacă avem un nume de echipament
            if (formData.echipament) {
              console.log("Prioritizăm selecția după nume:", formData.echipament)

              // Căutăm echipamentul după nume exact
              let selectedEquipment = locatie.echipamente.find((e) => e.nume === formData.echipament)

              // Dacă nu găsim o potrivire exactă, încercăm o potrivire parțială (case insensitive)
              if (!selectedEquipment) {
                const equipmentNameLower = formData.echipament.toLowerCase()
                selectedEquipment = locatie.echipamente.find(
                  (e) =>
                    e.nume.toLowerCase().includes(equipmentNameLower) ||
                    equipmentNameLower.includes(e.nume.toLowerCase()),
                )
              }

              if (selectedEquipment) {
                console.log("Echipament găsit după nume:", selectedEquipment)

                // Actualizăm ID-ul echipamentului în formData
                if (handleCustomChange) {
                  handleCustomChange("echipamentId", selectedEquipment.id)
                  handleCustomChange("echipamentCod", selectedEquipment.cod)

                  // Afișăm un toast pentru feedback
                  toast({
                    title: "Echipament identificat",
                    description: `Am identificat echipamentul "${selectedEquipment.nume}" după nume`,
                    variant: "default",
                  })
                }
              } else {
                console.log("Nu am putut găsi echipamentul după nume:", formData.echipament)
              }
            }

            // Verificăm dacă există un echipament selectat în formData după ID
            // Acest cod rămâne pentru compatibilitate cu selecția după ID
            if (formData.echipamentId) {
              const selectedEquipment = locatie.echipamente.find((e) => e.id === formData.echipamentId)
              if (selectedEquipment) {
                console.log("Echipament găsit în locație după ID:", selectedEquipment)
              } else {
                console.log("Echipamentul cu ID", formData.echipamentId, "nu a fost găsit în locația", locatieNume)
              }
            }
          } else {
            console.log("Nu există echipamente pentru locația", locatieNume)
            setAvailableEquipments([])
            setEquipmentsLoaded(true)
          }
        }
      },
      [selectedClient, formData.echipamentId, formData.echipament, handleCustomChange],
    )

    // Adăugăm un efect pentru a forța încărcarea echipamentelor când se schimbă locația
    // Adăugați acest efect după efectul care actualizează clientul selectat:

    // Efect pentru a forța încărcarea echipamentelor când se schimbă locația
    useEffect(() => {
      if (formData.locatie && selectedClient) {
        console.log("Locația s-a schimbat, forțăm încărcarea echipamentelor:", formData.locatie)
        forceLoadEquipments(formData.locatie)
      }
    }, [formData.locatie, selectedClient, forceLoadEquipments])

    // Adăugăm un efect pentru a actualiza echipamentele când se schimbă locația selectată
    // fără a reseta selecția existentă
    useEffect(() => {
      if (selectedLocatie && selectedLocatie.echipamente) {
        console.log("Actualizare echipamente pentru locația selectată:", selectedLocatie.echipamente)
        setAvailableEquipments(selectedLocatie.echipamente || [])
        setEquipmentsLoaded(true)

        // Resetăm flag-ul pentru a permite o nouă încercare de selecție a echipamentului
        setTriedSelectEquipment(false)

        // Verificăm dacă echipamentul selectat există în noua listă
        if (formData.echipamentId) {
          const echipamentExista = selectedLocatie.echipamente?.some((e) => e.id === formData.echipamentId)
          if (!echipamentExista) {
            console.log("Echipamentul selectat anterior nu există în noua locație")
            // Opțional: putem reseta selecția aici dacă dorim
            // handleSelectChange("echipament", "");
            // if (handleCustomChange) {
            //   handleCustomChange("echipamentId", "");
            //   handleCustomChange("echipamentCod", "");
            // }
          }
        }
      }
    }, [selectedLocatie, formData.echipamentId])

    // Adăugăm un efect pentru a menține starea echipamentului selectat
    useEffect(() => {
      if (formData.echipamentId && availableEquipments.length > 0) {
        const selectedEquipment = availableEquipments.find((e) => e.id === formData.echipamentId)
        if (selectedEquipment) {
          console.log("Echipament găsit și setat în formular:", selectedEquipment)
          // Nu este nevoie să actualizăm formData aici, doar ne asigurăm că echipamentul este găsit
        } else {
          console.log("Echipamentul cu ID-ul", formData.echipamentId, "nu a fost găsit în lista disponibilă")
        }
      }
    }, [formData.echipamentId, availableEquipments])

    // Adaugă acest efect pentru debugging
    useEffect(() => {
      console.log("Stare availableEquipments:", availableEquipments)
      console.log("Stare formData.locatie:", formData.locatie)
      console.log("Stare formData.echipamentId:", formData.echipamentId)
      console.log("Stare formData.echipament:", formData.echipament)
      console.log("Condiție disabled:", !formData.locatie)
    }, [availableEquipments, formData.locatie, formData.echipamentId, formData.echipament])

    // Modificăm funcția handleClientAdded pentru a gestiona corect adăugarea clientului
    const handleClientAdded = (clientName: string) => {
      handleSelectChange("client", clientName)
      setIsAddClientDialogOpen(false)
    }

    // Verificăm dacă un câmp are eroare
    const hasError = (fieldName: string) => fieldErrors.includes(fieldName)

    // Stilul pentru câmpurile cu eroare
    const errorStyle = "border-red-500 focus-visible:ring-red-500"

    const validateForm = () => {
      let isValid = true
      const errors: string[] = []

      if (!dataEmiterii) {
        errors.push("dataEmiterii")
        isValid = false
      }

      if (!dataInterventie) {
        errors.push("dataInterventie")
        isValid = false
      }

      if (!formData.tipLucrare) {
        errors.push("tipLucrare")
        isValid = false
      }

      if (
        (formData.tipLucrare === "Intervenție în contract" || formData.tipLucrare === "Contractare") &&
        !formData.contract
      ) {
        errors.push("contract")
        isValid = false
      }

      return isValid
    }

    // Add a submit handler if onSubmit is provided
    const handleSubmit = async () => {
      if (!onSubmit) return

      if (!validateForm()) {
        setError("Vă rugăm să completați toate câmpurile obligatorii")
        return
      }

      setIsSubmitting(true)

      try {
        const updatedData: Partial<Lucrare> = {
          dataEmiterii: dataEmiterii ? formatDateTime24(dataEmiterii) : "",
          dataInterventie: dataInterventie ? formatDateTime24(dataInterventie) : "",
          tipLucrare: formData.tipLucrare,
          tehnicieni: formData.tehnicieni,
          client: formData.client,
          locatie: formData.locatie,
          echipament: formData.echipament,
          descriere: formData.descriere,
          persoanaContact: formData.persoanaContact,
          telefon: formData.telefon,
          statusLucrare: formData.statusLucrare,
          statusFacturare: formData.statusFacturare,
          contract: formData.contract,
          contractNumber: formData.contractNumber,
          defectReclamat: formData.defectReclamat,
          // Include all contact persons from the selected location
          persoaneContact: formData.persoaneContact || persoaneContact,
          echipamentId: formData.echipamentId,
          echipamentCod: formData.echipamentCod,
        }

        await onSubmit(updatedData)
      } finally {
        setIsSubmitting(false)
      }
    }

    // Add buttons at the end if onSubmit and onCancel are provided
    // Adăugăm un efect pentru a actualiza persoanele de contact când se schimbă locația selectată
    // și pentru a menține starea când se schimbă alte câmpuri
    useEffect(() => {
      if (selectedLocatie) {
        console.log("Locație selectată (effect):", selectedLocatie)
        if (selectedLocatie.persoaneContact) {
          console.log("Persoane de contact (effect):", selectedLocatie.persoaneContact)
          setPersoaneContact(selectedLocatie.persoaneContact)

          // Automatically associate all contacts with the work entry
          if (handleCustomChange) {
            handleCustomChange("persoaneContact", selectedLocatie.persoaneContact)
          }
        }
        // Activăm afișarea acordeonului și nu-l dezactivăm niciodată după ce a fost activat
        setShowContactAccordion(true)
      }
    }, [selectedLocatie, handleCustomChange])

    // Modificăm efectul pentru a încărca persoanele de contact când se încarcă datele inițiale
    // Înlocuim efectul existent de la linia ~700 cu această versiune îmbunătățită:

    // Adăugăm un efect pentru a actualiza starea când se încarcă datele inițiale
    useEffect(() => {
      if (initialData) {
        console.log("Încărcare date inițiale pentru persoanele de contact:", initialData)

        // Verificăm dacă avem persoane de contact în datele inițiale
        if (initialData.persoaneContact && initialData.persoaneContact.length > 0) {
          console.log("Persoane de contact găsite în datele inițiale:", initialData.persoaneContact)
          setPersoaneContact(initialData.persoaneContact)
          setShowContactAccordion(true)
        } else {
          // Dacă nu avem persoane de contact în datele inițiale, dar avem persoanaContact și telefon,
          // creăm o persoană de contact implicită
          if (initialData.persoanaContact && initialData.telefon) {
            console.log("Creăm persoană de contact implicită din datele inițiale")
            const defaultContact: PersoanaContact = {
              nume: initialData.persoanaContact,
              telefon: initialData.telefon,
              email: "",
              functie: "",
            }
            setPersoaneContact([defaultContact])

            // Actualizăm și formData dacă este necesar
            if (handleCustomChange && (!formData.persoaneContact || formData.persoaneContact.length === 0)) {
              handleCustomChange("persoaneContact", [defaultContact])
            }

            setShowContactAccordion(true)
          }
        }

        // Forțăm afișarea acordeonului în modul de editare
        if (isEdit) {
          setShowContactAccordion(true)
        }
      }
    }, [initialData, handleCustomChange, formData.persoaneContact, isEdit])

    // Adăugăm un nou efect pentru a forța încărcarea persoanelor de contact când se încarcă locația
    // Adăugați acest efect după efectul de mai sus:

    // Efect pentru a forța încărcarea persoanelor de contact când se încarcă locația
    useEffect(() => {
      if (selectedClient && formData.locatie && isEdit) {
        console.log("Forțăm încărcarea persoanelor de contact pentru locația:", formData.locatie)

        const locatie = selectedClient.locatii?.find((loc) => loc.nume === formData.locatie)

        if (locatie) {
          console.log("Locație găsită pentru încărcarea persoanelor de contact:", locatie)

          if (locatie.persoaneContact && locatie.persoaneContact.length > 0) {
            console.log("Persoane de contact găsite în locație:", locatie.persoaneContact)
            setPersoaneContact(locatie.persoaneContact)

            // Actualizăm și formData dacă este necesar
            if (handleCustomChange && (!formData.persoaneContact || formData.persoaneContact.length === 0)) {
              handleCustomChange("persoaneContact", locatie.persoaneContact)
            }

            // Dacă nu avem persoanaContact și telefon setate, le setăm cu prima persoană de contact
            if ((!formData.persoanaContact || !formData.telefon) && locatie.persoaneContact.length > 0) {
              const primaryContact = locatie.persoaneContact[0]
              handleSelectChange("persoanaContact", primaryContact.nume || "")
              handleSelectChange("telefon", primaryContact.telefon || "")
            }
          } else if (formData.persoanaContact && formData.telefon) {
            // Dacă nu avem persoane de contact în locație, dar avem persoanaContact și telefon în formData,
            // creăm o persoană de contact implicită
            console.log("Creăm persoană de contact implicită din formData")
            const defaultContact: PersoanaContact = {
              nume: formData.persoanaContact,
              telefon: formData.telefon,
              email: "",
              functie: "",
            }
            setPersoaneContact([defaultContact])

            // Actualizăm și formData dacă este necesar
            if (handleCustomChange && (!formData.persoaneContact || formData.persoaneContact.length === 0)) {
              handleCustomChange("persoaneContact", [defaultContact])
            }
          }

          // Forțăm afișarea acordeonului
          setShowContactAccordion(true)
        }
      }
    }, [
      selectedClient,
      formData.locatie,
      isEdit,
      formData.persoanaContact,
      formData.telefon,
      handleCustomChange,
      handleSelectChange,
    ])

    // Adăugăm un efect pentru a afișa erori de încărcare a clienților
    useEffect(() => {
      if (clientiError) {
        console.error("Eroare la încărcarea clienților:", clientiError)
        toast({
          title: "Eroare",
          description: "A apărut o eroare la încărcarea listei de clienți. Vă rugăm să reîncărcați pagina.",
          variant: "destructive",
        })
      }
    }, [clientiError])

    // Înlocuiți funcția handleCancel cu:
    const handleFormCancel = () => {
      handleCancel2(onCancel)
    }

    // Function to handle close attempt
    const handleCloseAttempt = () => {
      if (formModified) {
        setShowCloseAlert(true)
      } else if (onCancel) {
        onCancel()
      }
    }

    // Function to confirm close
    const confirmClose = () => {
      setShowCloseAlert(false)
      if (onCancel) {
        onCancel()
      }
    }

    // Function to cancel close
    const cancelClose = () => {
      setShowCloseAlert(false)
    }

    return (
      <div className="modal-calendar-container">
        {error && <div className="text-red-500 mb-4">{error}</div>}
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-1 gap-6">
            {/* Data Emiterii - Setată automat și nemodificabilă */}
            <div className="space-y-2">
              <label htmlFor="dataEmiterii" className="text-sm font-medium flex items-center">
                Data Emiterii
                <span className="ml-2 text-xs text-muted-foreground bg-gray-100 px-2 py-0.5 rounded">Automată</span>
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="sm:w-2/3">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-start text-left font-normal opacity-90 cursor-not-allowed"
                    disabled
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dataEmiterii ? format(dataEmiterii, "dd.MM.yyyy", { locale: ro }) : "Data curentă"}
                  </Button>
                </div>
                <div className="relative sm:w-1/3">
                  <Input
                    type="text"
                    value={formatTime24(dataEmiterii || new Date())}
                    className="cursor-not-allowed opacity-90"
                    disabled
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Data și ora emiterii sunt setate automat cu data curentă</p>
            </div>

            {/* Data Solicitată Intervenție - Updated with new date picker */}
            <div className="space-y-2">
              <label htmlFor="dataInterventie" className="text-sm font-medium">
                Data solicitată intervenție *
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="sm:w-2/3">
                  <Popover open={dateInterventieOpen} onOpenChange={setDateInterventieOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className={`w-full justify-start text-left font-normal ${hasError("dataInterventie") ? errorStyle : ""}`}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {dataInterventie ? (
                          format(dataInterventie, "dd.MM.yyyy", { locale: ro })
                        ) : (
                          <span>Selectați data</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start" sideOffset={4}>
                      <CustomDatePicker
                        selectedDate={dataInterventie}
                        onDateChange={handleDateInterventieSelect}
                        onClose={() => setDateInterventieOpen(false)}
                        hasError={hasError("dataInterventie")}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="relative sm:w-1/3">
                  <TimeSelector
                    value={timeInterventie}
                    onChange={handleTimeInterventieChange}
                    label="Ora intervenției"
                    id="timeInterventie"
                    hasError={hasError("dataInterventie")}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Data și ora solicitată pentru intervenție</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="tipLucrare" className="text-sm font-medium">
                Tip Lucrare *
              </label>
              <Select value={formData.tipLucrare} onValueChange={(value) => handleSelectChange("tipLucrare", value)}>
                <SelectTrigger id="tipLucrare" className={hasError("tipLucrare") ? errorStyle : ""}>
                  <SelectValue placeholder="Selectați tipul" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Ofertare">Ofertare</SelectItem>
                  <SelectItem value="Contractare">Contractare</SelectItem>
                  <SelectItem value="Pregătire în atelier">Pregătire în atelier</SelectItem>
                  <SelectItem value="Instalare">Instalare</SelectItem>
                  <SelectItem value="Predare">Predare</SelectItem>
                  <SelectItem value="Intervenție în garanție">Intervenție în garanție</SelectItem>
                  <SelectItem value="Intervenție contra cost">Intervenție contra cost</SelectItem>
                  <SelectItem value="Intervenție în contract">Intervenție în contract</SelectItem>
                  <SelectItem value="Re-Intervenție">Re-Intervenție</SelectItem>
                  <SelectItem value="Revizie">Revizie</SelectItem>
                </SelectContent>
              </Select>
              {formData.tipLucrare === "Intervenție în garanție" && (
                <p className="text-xs text-amber-600 mt-1">
                  Notă: Garanția nu poate depăși 24 de luni de la instalare. Există cazuri cu 12 luni și cazuri cu 24
                  luni de la predare.
                </p>
              )}
            </div>
            {(formData.tipLucrare === "Intervenție în contract" || formData.tipLucrare === "Contractare") && (
              <div className="space-y-2">
                <label htmlFor="contract" className="text-sm font-medium">
                  Contract *
                </label>
                <ContractSelect
                  value={formData.contract || ""}
                  onChange={(value, contractNumber, contractType) => {
                    handleSelectChange("contract", value)
                    handleSelectChange("contractNumber", contractNumber || "")
                    handleSelectChange("contractType", contractType || "") // Adăugăm tipul contractului
                  }}
                  hasError={hasError("contract")}
                  errorStyle={errorStyle}
                />
                {formData.contractType && (
                  <p className="text-xs text-blue-600">
                    Tip contract: <span className="font-medium">{formData.contractType}</span>
                  </p>
                )}
                <p className="text-xs text-muted-foreground">Selectați contractul asociat intervenției</p>
              </div>
            )}
            <div className="space-y-2">
              <label htmlFor="tehnicieni" className="text-sm font-medium">
                Tehnicieni
              </label>
              <div className="flex flex-wrap gap-2 mb-2">
                {formData.tehnicieni.map((tech) => (
                  <Badge key={tech} variant="secondary" className="bg-blue-100 text-blue-800">
                    {tech}{" "}
                    <span className="ml-1 cursor-pointer" onClick={() => handleTehnicieniChange(tech)}>
                      ×
                    </span>
                  </Badge>
                ))}
              </div>
              <Select onValueChange={handleTehnicieniChange}>
                <SelectTrigger id="tehnicieni">
                  <SelectValue placeholder="Selectați tehnicienii" />
                </SelectTrigger>
                <SelectContent>
                  {loadingTehnicieni ? (
                    <div className="flex items-center justify-center p-2">
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      <span>Se încarcă...</span>
                    </div>
                  ) : tehnicieni.length > 0 ? (
                    tehnicieni.map((tehnician) => (
                      <SelectItem key={tehnician.id} value={tehnician.displayName || ""}>
                        {tehnician.displayName}
                      </SelectItem>
                    ))
                  ) : (
                    <div className="p-2 text-center text-sm text-muted-foreground">
                      Nu există tehnicieni disponibili
                    </div>
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Puteți selecta mai mulți tehnicieni</p>
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="client" className="text-sm font-medium">
              Client *
            </label>
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <Popover open={isClientDropdownOpen} onOpenChange={setIsClientDropdownOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={isClientDropdownOpen}
                      className={`w-full justify-between ${hasError("client") ? errorStyle : ""}`}
                    >
                      {formData.client || "Selectați clientul"}
                      <span className="ml-2 opacity-50">▼</span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-full p-0" align="start">
                    <div className="p-2">
                      <Input
                        placeholder="Căutare client..."
                        value={clientSearchTerm}
                        onChange={(e) => setClientSearchTerm(e.target.value)}
                        className="mb-2"
                      />
                      <div className="max-h-[200px] overflow-y-auto">
                        {loadingClienti ? (
                          <div className="flex items-center justify-center p-4">
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            <span>Se încarcă clienții...</span>
                          </div>
                        ) : filteredClients.length > 0 ? (
                          filteredClients.map((client) => (
                            <div
                              key={client.id}
                              className={`px-2 py-1 cursor-pointer hover:bg-gray-100 rounded ${
                                formData.client === client.nume ? "bg-blue-50 text-blue-600" : ""
                              }`}
                              onClick={() => {
                                handleClientChange(client.nume)
                                setIsClientDropdownOpen(false)
                                setClientSearchTerm("")
                              }}
                            >
                              {client.nume}
                            </div>
                          ))
                        ) : (
                          <div className="p-2 text-center text-sm text-muted-foreground">
                            {clientSearchTerm ? "Nu s-au găsit clienți" : "Nu există clienți disponibili"}
                          </div>
                        )}
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
                <Button variant="outline" size="icon" onClick={() => setIsAddClientDialogOpen(true)}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {selectedClient && (
                <div className="text-xs text-muted-foreground">
                  Client selectat: <span className="font-medium">{selectedClient.nume}</span>
                  {selectedClient.cif && <span> (CIF: {selectedClient.cif})</span>}
                </div>
              )}
            </div>
          </div>

          {/* Dialog pentru adăugarea unui client nou */}
          <Dialog open={isAddClientDialogOpen} onOpenChange={setIsAddClientDialogOpen}>
            <DialogContent className="w-[calc(100%-2rem)] max-w-[600px] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Adaugă Client Nou</DialogTitle>
              </DialogHeader>
              <ClientForm onSuccess={handleClientAdded} onCancel={() => setIsAddClientDialogOpen(false)} />
            </DialogContent>
          </Dialog>

          {/* Adăugăm secțiunea de locație */}
          {locatii.length > 0 && (
            <div className="space-y-2">
              <label htmlFor="locatie" className="text-sm font-medium">
                Locație *
              </label>
              <Select value={formData.locatie} onValueChange={handleLocatieSelect}>
                <SelectTrigger id="locatie" className={hasError("locatie") ? errorStyle : ""}>
                  <SelectValue placeholder="Selectați locația" />
                </SelectTrigger>
                <SelectContent>
                  {locatii.map((loc, index) => (
                    <SelectItem key={index} value={loc.nume}>
                      {loc.nume}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Selectați locația clientului pentru această lucrare. Toate persoanele de contact vor fi asociate
                automat.
              </p>
            </div>
          )}

          {/* Înlocuim componenta EquipmentSelect cu CustomEquipmentSelect */}
          <div className="space-y-2">
            <label htmlFor="echipament" className="text-sm font-medium">
              Echipament
            </label>
            <CustomEquipmentSelect
              equipments={availableEquipments}
              value={formData.echipamentId}
              onSelect={handleEquipmentSelect}
              disabled={!formData.locatie}
              placeholder={formData.locatie ? "Selectați echipamentul" : "Selectați mai întâi o locație"}
              emptyMessage={
                formData.locatie ? "Nu există echipamente pentru această locație" : "Selectați mai întâi o locație"
              }
              fallbackName={formData.echipament} // Adăugăm numele echipamentului pentru fallback
            />
            {availableEquipments.length === 0 && formData.locatie && equipmentsLoaded && (
              <div>
                <p className="text-xs text-amber-600">
                  Nu există echipamente definite pentru această locație. Puteți adăuga echipamente din secțiunea de
                  gestionare a clientului.
                </p>
                <p className="text-xs text-gray-500 mt-1">Locație selectată: {formData.locatie}</p>
              </div>
            )}
            {availableEquipments.length > 0 && (
              <p className="text-xs text-green-600">
                {availableEquipments.length} echipamente disponibile pentru această locație
              </p>
            )}
          </div>

          {/* Secțiunea de persoane de contact - afișată ca card informativ */}
          {showContactAccordion && (
            <Card className="p-4 border rounded-md">
              <div className="flex items-center gap-2 mb-3">
                <Users className="h-5 w-5 text-blue-600" />
                <h3 className="text-md font-medium">Persoane de Contact Asociate</h3>
                <Badge variant="outline" className="ml-2">
                  {persoaneContact.length}
                </Badge>
              </div>

              {persoaneContact.length > 0 ? (
                <div className="space-y-4">
                  {persoaneContact.map((contact, index) => (
                    <div key={index} className="p-3 border rounded-md space-y-2 bg-gray-50">
                      <div className="flex justify-between items-center">
                        <h5 className="text-sm font-medium">{contact.nume}</h5>
                        {contact.functie && (
                          <Badge variant="secondary" className="text-xs">
                            {contact.functie}
                          </Badge>
                        )}
                      </div>

                      <div className="grid grid-cols-1 gap-2">
                        <div className="flex items-center text-sm">
                          <Phone className="h-4 w-4 mr-2 text-muted-foreground" />
                          <span>{contact.telefon || "Fără telefon"}</span>
                        </div>

                        {contact.email && (
                          <div className="flex items-center text-sm">
                            <Mail className="h-4 w-4 mr-2 text-muted-foreground" />
                            <span>{contact.email}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-4 text-muted-foreground">
                  Nu există persoane de contact pentru această locație
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-3">
                Toate persoanele de contact vor fi asociate automat cu această lucrare
              </p>
            </Card>
          )}

          {/* Add the defectReclamat field to the form, after the equipment field */}
          <div className="space-y-2">
            <label htmlFor="defectReclamat" className="text-sm font-medium">
              Defect reclamat
            </label>
            <Textarea
              id="defectReclamat"
              placeholder="Introduceți defectul reclamat de client"
              value={formData.defectReclamat || ""}
              onChange={handleInputChange}
              className="min-h-[80px] resize-y"
            />
          </div>

          {/* Modificăm câmpul "Descriere Intervenție" în "Sfaturi pt tehnician" */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <label htmlFor="descriere" className="text-sm font-medium">
                Sfaturi pt tehnician
              </label>
              {isAdminOrDispatcher && (
                <Badge variant="outline" className="bg-blue-50 text-blue-700">
                  Doar uz intern
                </Badge>
              )}
            </div>
            <Textarea
              id="descriere"
              placeholder="Adăugați sfaturi sau instrucțiuni pentru tehnician (nu vor apărea în raportul final)"
              value={formData.descriere}
              onChange={handleInputChange}
              className="min-h-[100px] resize-y"
              disabled={!isAdminOrDispatcher}
            />
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <LightbulbIcon className="h-3 w-3 text-amber-500" />
              Acest câmp este vizibil doar pentru uz intern și nu va apărea în raportul generat pentru client
            </p>
          </div>

          {isEdit && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="statusLucrare" className="text-sm font-medium">
                  Status Lucrare
                </label>
                <Select
                  value={formData.statusLucrare}
                  onValueChange={(value) => handleSelectChange("statusLucrare", value)}
                >
                  <SelectTrigger id="statusLucrare">
                    <SelectValue placeholder="Selectați statusul" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Listată">Listată</SelectItem>
                    <SelectItem value="Atribuită">Atribuită</SelectItem>
                    <SelectItem value="În lucru">În lucru</SelectItem>
                    <SelectItem value="Finalizată">Finalizată</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label htmlFor="statusFacturare" className="text-sm font-medium">
                  Status Facturare
                </label>
                <Select
                  value={formData.statusFacturare}
                  onValueChange={(value) => handleSelectChange("statusFacturare", value)}
                >
                  <SelectTrigger id="statusFacturare">
                    <SelectValue placeholder="Selectați statusul" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Nefacturat">Nefacturat</SelectItem>
                    <SelectItem value="Facturat">Facturat</SelectItem>
                    <SelectItem value="Nu se facturează">Nu se facturează</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </div>

        {/*{(onSubmit || onCancel) && (
          <div className="flex justify-end space-x-2 mt-6">
            {onCancel && (
              <Button variant="outline" onClick={handleCloseAttempt}>
                Anulează
              </Button>
            )}
            {onSubmit && <Button onClick={handleSubmit}>Salvează</Button>}
          </div>
        )}*/}

        {/* Unsaved changes dialog */}
        <UnsavedChangesDialog
          open={showDialog}
          onConfirm={pendingUrl === "#cancel" ? confirmCancelAction : confirmNavigation}
          onCancel={cancelNavigation}
        />
        {/* Adăugați dialogul la sfârșitul componentei, înainte de ultimul </div>: */}
        <NavigationPromptDialog open={showPrompt} onConfirm={handleConfirm} onCancel={handleCancel} />
        {/* Close confirmation alert */}
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
              <AlertDialogCancel onClick={cancelClose}>Anulează</AlertDialogCancel>
              <AlertDialogAction onClick={confirmClose}>Închide</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    )
  },
)

// Add display name for the component
LucrareForm.displayName = "LucrareForm"
