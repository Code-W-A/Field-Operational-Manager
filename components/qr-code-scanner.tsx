"use client"

import { useState, useEffect, useRef } from "react"
import { Scanner } from "@yudiel/react-qr-scanner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertCircle, CheckCircle2, XCircle, Camera, KeyRound, Info } from "lucide-react"
import { Spinner } from "@/components/ui/spinner"
import { useToast } from "@/components/ui/use-toast"
import { Input } from "@/components/ui/input"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import * as z from "zod"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { calculateWarranty, getWarrantyDisplayInfo } from "@/lib/utils/warranty-calculator"
import type { Echipament } from "@/lib/firebase/firestore"

interface QRCodeScannerProps {
  expectedEquipmentCode?: string
  expectedLocationName?: string
  expectedClientName?: string
  workId?: string
  onScanSuccess?: (data: any) => void
  onScanError?: (error: string) => void
  onVerificationComplete?: (success: boolean) => void
  isWarrantyWork?: boolean
  onWarrantyVerification?: (isInWarranty: boolean) => void
  equipmentData?: Echipament
}

// Schema pentru validarea codului introdus manual
const manualCodeSchema = z.object({
  equipmentCode: z.string().min(1, "Codul echipamentului este obligatoriu").max(10, "Codul echipamentului poate avea maxim 10 caractere"),
})

type ManualCodeFormValues = z.infer<typeof manualCodeSchema>

// Constanta pentru durata timeout-ului global (în milisecunde)
const GLOBAL_SCAN_TIMEOUT = 15000 // 15 secunde

export function QRCodeScanner({
  expectedEquipmentCode,
  expectedLocationName,
  expectedClientName,
  workId,
  onScanSuccess,
  onScanError,
  onVerificationComplete,
  isWarrantyWork,
  onWarrantyVerification,
  equipmentData,
}: QRCodeScannerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [scanResult, setScanResult] = useState<any>(null)
  const [scanError, setScanError] = useState<string | null>(null)
  const [isVerifying, setIsVerifying] = useState(false)
  const [isScanning, setIsScanning] = useState(false)
  const [verificationResult, setVerificationResult] = useState<{
    success: boolean
    message: string
    details?: string[]
  } | null>(null)
  const { toast } = useToast()
  const [debugMode, setDebugMode] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [cameraPermissionStatus, setCameraPermissionStatus] = useState<"prompt" | "granted" | "denied" | "unknown">(
    "unknown",
  )

  // Adăugăm un contor pentru încercările de scanare eșuate
  const [failedScanAttempts, setFailedScanAttempts] = useState(0)
  // Adăugăm un state pentru a afișa butonul de introducere manuală
  const [showManualEntryButton, setShowManualEntryButton] = useState(false)
  // Adăugăm un state pentru a afișa formularul de introducere manuală
  const [showManualCodeInput, setShowManualCodeInput] = useState(false)
  // Timestamp pentru ultima scanare încercată
  const lastScanAttemptRef = useRef<number>(0)
  // Timeout pentru scanare continuă
  const scanTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  // Timeout global pentru scanare
  const globalTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  // Adăugăm un state pentru a urmări progresul timerului global
  const [globalTimeoutProgress, setGlobalTimeoutProgress] = useState(0)
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null)
  // Adăugăm un state pentru a urmări dacă timerul global a expirat
  const [globalTimeoutExpired, setGlobalTimeoutExpired] = useState(false)
  // Adăugăm un state pentru a afișa timpul rămas
  const [timeRemaining, setTimeRemaining] = useState(GLOBAL_SCAN_TIMEOUT / 1000)
  const [reporting, setReporting] = useState(false)
  const lastDetectedRawRef = useRef<string | null>(null)

  // State pentru funcționalitatea de garanție
  const [warrantyInfo, setWarrantyInfo] = useState<any>(null)
  const [showWarrantyVerification, setShowWarrantyVerification] = useState(false)
  const [technicianWarrantyDeclaration, setTechnicianWarrantyDeclaration] = useState<boolean | null>(null)

  // Inițializăm formularul pentru introducerea manuală a codului
  const form = useForm<ManualCodeFormValues>({
    resolver: zodResolver(manualCodeSchema),
    defaultValues: {
      equipmentCode: "",
    },
  })

  // Detectăm dacă suntem pe un dispozitiv mobil
  useEffect(() => {
    const checkMobile = () => {
      const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera
      const mobileRegex = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i
      setIsMobile(mobileRegex.test(userAgent.toLowerCase()))
    }

    checkMobile()
  }, [])

  // Efect pentru a afișa butonul de introducere manuală când timerul global expiră
  useEffect(() => {
    if (globalTimeoutExpired && isScanning && !showManualCodeInput && !showManualEntryButton) {
      console.log("Afișare buton introducere manuală după expirarea timerului global")
      setShowManualEntryButton(true)
    }
  }, [globalTimeoutExpired, isScanning, showManualCodeInput, showManualEntryButton])

  // Resetăm starea când se deschide/închide dialogul
  useEffect(() => {
    if (!isOpen) {
      setScanResult(null)
      setScanError(null)
      setVerificationResult(null)
      setIsVerifying(false)
      setIsScanning(false)
      setFailedScanAttempts(0)
      setShowManualEntryButton(false)
      setShowManualCodeInput(false)
      setGlobalTimeoutProgress(0)
      setGlobalTimeoutExpired(false)
      setTimeRemaining(GLOBAL_SCAN_TIMEOUT / 1000)
      setWarrantyInfo(null)
      setShowWarrantyVerification(false)
      setTechnicianWarrantyDeclaration(null)
      form.reset()

      // Curățăm timeout-urile la închiderea dialogului
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current)
        scanTimeoutRef.current = null
      }
      if (globalTimeoutRef.current) {
        clearTimeout(globalTimeoutRef.current)
        globalTimeoutRef.current = null
      }
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current)
        progressIntervalRef.current = null
      }
    } else {
      // Verificăm permisiunile camerei când se deschide dialogul
      checkCameraPermissions()
      // Activăm starea de scanare când se deschide dialogul
      setIsScanning(true)
      // Resetăm contorul de încercări eșuate
      setFailedScanAttempts(0)
      // Resetăm timestamp-ul ultimei scanări
      lastScanAttemptRef.current = Date.now()
      // Resetăm starea de expirare a timerului global
      setGlobalTimeoutExpired(false)
      // Resetăm timpul rămas
      setTimeRemaining(GLOBAL_SCAN_TIMEOUT / 1000)

      // Inițiem un timeout pentru a verifica dacă scanarea continuă nu produce rezultate
      startContinuousScanTimeout()

      // Pornim timerul global pentru timeout
      startGlobalScanTimeout()
    }
  }, [isOpen, form])

  // Funcție pentru a porni timeout-ul pentru scanare continuă
  const startContinuousScanTimeout = () => {
    // Curățăm timeout-ul existent dacă există
    if (scanTimeoutRef.current) {
      clearTimeout(scanTimeoutRef.current)
    }

    // Setăm un nou timeout pentru a verifica dacă scanarea continuă nu produce rezultate
    scanTimeoutRef.current = setTimeout(() => {
      // Dacă suntem încă în modul de scanare și nu am avut un rezultat valid
      if (isScanning && !scanResult && !showManualCodeInput) {
        console.log("Scanare continuă fără rezultat valid")
        incrementFailedAttempts()

        // Resetăm și pornim un nou timeout dacă încă nu am ajuns la 3 încercări
        if (failedScanAttempts < 2) {
          // < 2 pentru că incrementFailedAttempts va adăuga 1
          startContinuousScanTimeout()
        }
      }
    }, 5000) // Verificăm la fiecare 5 secunde
  }

  // Funcție simplificată pentru timerul global
  const startGlobalScanTimeout = () => {
    console.log("Pornire timer global de 15 secunde")

    // Resetăm starea
    setGlobalTimeoutProgress(0)
    setGlobalTimeoutExpired(false)
    setTimeRemaining(GLOBAL_SCAN_TIMEOUT / 1000)

    // Curățăm timeout-urile existente
    if (globalTimeoutRef.current) {
      clearTimeout(globalTimeoutRef.current)
    }
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current)
    }

    // Setăm un interval pentru actualizarea progresului (la fiecare secundă)
    const startTime = Date.now()
    const endTime = startTime + GLOBAL_SCAN_TIMEOUT

    progressIntervalRef.current = setInterval(() => {
      const now = Date.now()
      const elapsed = now - startTime
      const remaining = Math.max(0, GLOBAL_SCAN_TIMEOUT - elapsed)
      const progress = (elapsed / GLOBAL_SCAN_TIMEOUT) * 100

      setGlobalTimeoutProgress(Math.min(100, progress))
      setTimeRemaining(Math.ceil(remaining / 1000))

      // Verificăm dacă timpul a expirat
      if (now >= endTime) {
        if (progressIntervalRef.current) {
          clearInterval(progressIntervalRef.current)
          progressIntervalRef.current = null
        }

        // Marcăm timerul ca expirat și afișăm butonul de introducere manuală
        console.log("Timerul global a expirat")
        setGlobalTimeoutExpired(true)
        setGlobalTimeoutProgress(100)
        setTimeRemaining(0)

        // Afișăm butonul de introducere manuală direct
        if (isScanning && !showManualCodeInput && !showManualEntryButton) {
          console.log("Afișare buton introducere manuală după expirarea timerului global")
          setShowManualEntryButton(true)
        }
      }
    }, 100)

    // Setăm un timeout pentru a marca expirarea timerului global
    globalTimeoutRef.current = setTimeout(() => {
      console.log("Timeout global de 15 secunde atins")
      setGlobalTimeoutExpired(true)
      setGlobalTimeoutProgress(100)
      setTimeRemaining(0)

      // Afișăm butonul de introducere manuală direct
      if (isScanning && !showManualCodeInput && !showManualEntryButton) {
        console.log("Afișare buton introducere manuală după expirarea timerului global")
        setShowManualEntryButton(true)
      }
    }, GLOBAL_SCAN_TIMEOUT)
  }

  // Verificăm permisiunile camerei
  const checkCameraPermissions = async () => {
    try {
      // Verificăm dacă API-ul de permisiuni este disponibil
      if (navigator.permissions && navigator.permissions.query) {
        const permissionStatus = await navigator.permissions.query({ name: "camera" as PermissionName })
        setCameraPermissionStatus(permissionStatus.state as "prompt" | "granted" | "denied")

        permissionStatus.onchange = () => {
          setCameraPermissionStatus(permissionStatus.state as "prompt" | "granted" | "denied")
        }
      }

      // Încercăm să accesăm camera
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: isMobile ? "environment" : "user",
          width: isMobile ? { ideal: 1280, max: 1920 } : { min: 640, ideal: 1280 },
          height: isMobile ? { ideal: 720, max: 1080 } : { min: 480, ideal: 720 },
        },
      })

      // Eliberăm stream-ul după ce am verificat că avem acces
      stream.getTracks().forEach((track) => track.stop())

      setScanError(null)
    } catch (err) {
      console.error("Camera permission error:", err)
      setScanError("Nu s-a putut accesa camera. Verificați permisiunile browserului.")
      setCameraPermissionStatus("denied")
      setIsScanning(false)

      // Considerăm și aceasta o încercare eșuată
      incrementFailedAttempts()
    }
  }

  // Funcție pentru verificarea datelor scanate - îmbunătățită pentru compatibilitate retroactivă
  const verifyScannedData = (data: any) => {
    setIsVerifying(true)
    setIsScanning(false)
    setScanError(null)

    try {
      let parsedData
      let isSimpleFormat = false // Flag pentru formatul simplu

      // Încearcă să parseze ca JSON (format vechi)
      try {
        parsedData = typeof data === "string" ? JSON.parse(data) : data
        console.log("Processing QR data as JSON:", parsedData)
        
        // Verifică dacă este format JSON valid pentru echipament
        if (parsedData.type !== "equipment") {
          throw new Error("Nu este JSON pentru echipament")
        }
      } catch (parseError) {
        // Nu s-a putut parsa ca JSON sau nu e format equipment
        isSimpleFormat = true
        console.log("QR code is simple format (equipment code only):", data)
        
        // Tratează ca string simplu (format nou)
        const codeString = typeof data === "string" ? data.trim() : String(data).trim()
        
        // Validare minimă pentru codul echipamentului (max 10 caractere, conține litere și cifre)
        if (!codeString || codeString.length > 10 || !(/[a-zA-Z]/.test(codeString) && /[0-9]/.test(codeString))) {
          setVerificationResult({
            success: false,
            message: "QR code invalid",
            details: ["Codul scanat nu pare să fie un cod valid de echipament. Format așteptat: maxim 10 caractere cu litere și cifre."],
          })
          if (onScanError) onScanError("Cod echipament invalid")
          if (onVerificationComplete) onVerificationComplete(false)
          setIsVerifying(false)
          setIsScanning(true) // Reactivăm scanarea
          incrementFailedAttempts()
          return
        }
        
        // Creează obiect standardizat pentru formatul simplu
        parsedData = {
          type: "equipment",
          code: codeString,
          // Pentru formatul simplu, nu avem informații despre client/locație din QR
          client: expectedClientName || "",
          location: expectedLocationName || "",
          format: "simple" // Marcăm că este format simplu
        }
      }

      // Validare comună pentru ambele formate
      const errors: string[] = []
      let isMatch = true

      // Verificarea principală: codul echipamentului (obligatorie pentru ambele formate)
      if (expectedEquipmentCode && parsedData.code !== expectedEquipmentCode) {
        errors.push(`Cod echipament necorespunzător (scanat: ${parsedData.code})`)
        isMatch = false
      }

      // Pentru formatul JSON (vechi), verificăm și locația/clientul dacă sunt disponibile
      if (!isSimpleFormat) {
        if (expectedLocationName && parsedData.location && parsedData.location !== expectedLocationName) {
          errors.push(`Locație necorespunzătoare (așteptată: ${expectedLocationName}, scanată: ${parsedData.location})`)
          isMatch = false
        }

        if (expectedClientName && parsedData.client && parsedData.client !== expectedClientName) {
          errors.push(`Client necorespunzător (așteptat: ${expectedClientName}, scanat: ${parsedData.client})`)
          isMatch = false
        }
      }

      if (isMatch) {
        const formatInfo = isSimpleFormat ? "format simplu" : "format JSON"
        setVerificationResult({
          success: true,
          message: "Verificare reușită!",
          details: [`Echipamentul scanat corespunde cu lucrarea (${formatInfo}).`],
        })
        
        // Verificăm garanția pentru lucrări de tip "Intervenție în garanție"
        if (isWarrantyWork && equipmentData) {
          const warranty = getWarrantyDisplayInfo(equipmentData)
          setWarrantyInfo(warranty)
          setShowWarrantyVerification(true)
        } else {
          // Pentru alte tipuri de lucrări, chemăm callback-urile direct
          if (onScanSuccess) onScanSuccess(parsedData)
          if (onVerificationComplete) onVerificationComplete(true)

          // Resetăm contorul de încercări eșuate
          setFailedScanAttempts(0)
          setShowManualEntryButton(false)

          // Închide dialogul automat după o verificare reușită
          setTimeout(() => {
            setIsOpen(false)
            toast({
              title: "Verificare reușită",
              description: `Echipamentul scanat corespunde cu lucrarea (${formatInfo}). Puteți continua intervenția.`,
            })
          }, 2000)
        }
      } else {
        setVerificationResult({
          success: false,
          message: "Verificare eșuată!",
          details: errors,
        })
        if (onScanError) onScanError(errors.join(", "))
        if (onVerificationComplete) onVerificationComplete(false)
        setIsScanning(true) // Reactivăm scanarea pentru QR code-uri necorespunzătoare

        // Incrementăm contorul de încercări eșuate
        incrementFailedAttempts()
      }
    } catch (error) {
      console.error("Eroare la verificarea datelor scanate:", error)
      setVerificationResult({
        success: false,
        message: "Eroare la procesarea QR code-ului",
        details: ["A apărut o eroare neașteptată la procesarea QR code-ului."],
      })
      if (onScanError) onScanError("Eroare la procesare")
      if (onVerificationComplete) onVerificationComplete(false)
      setIsScanning(true) // Reactivăm scanarea după eroare

      // Incrementăm contorul de încercări eșuate
      incrementFailedAttempts()
    }

    setIsVerifying(false)

    // Resetăm și pornim un nou timeout pentru scanare continuă
    if (isScanning) {
      startContinuousScanTimeout()
    }
  }

  // Funcție pentru incrementarea contorului de încercări eșuate
  const incrementFailedAttempts = () => {
    setFailedScanAttempts((prev) => {
      const newCount = prev + 1
      console.log(`Încercare eșuată ${newCount}/3`)

      // După 3 încercări eșuate, afișăm butonul de introducere manuală
      if (newCount >= 3) {
        setShowManualEntryButton(true)
      }

      return newCount
    })
  }

  // Funcție pentru a activa formularul de introducere manuală
  const activateManualCodeInput = () => {
    setShowManualCodeInput(true)
    setIsScanning(false) // Oprim scanarea când se activează introducerea manuală
    setGlobalTimeoutProgress(0) // Resetăm progresul
    setGlobalTimeoutExpired(false) // Resetăm starea de expirare a timerului global
    setTimeRemaining(GLOBAL_SCAN_TIMEOUT / 1000) // Resetăm timpul rămas

    // Curățăm timeout-urile când se activează introducerea manuală
    if (scanTimeoutRef.current) {
      clearTimeout(scanTimeoutRef.current)
      scanTimeoutRef.current = null
    }
    if (globalTimeoutRef.current) {
      clearTimeout(globalTimeoutRef.current)
      globalTimeoutRef.current = null
    }
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current)
      progressIntervalRef.current = null
    }
  }

  // Funcție pentru a reveni la scanare
  const returnToScanning = () => {
    setShowManualCodeInput(false)
    setShowManualEntryButton(false)
    setFailedScanAttempts(0)
    setScanResult(null)
    setScanError(null)
    setVerificationResult(null)
    setIsScanning(true)
    setGlobalTimeoutProgress(0) // Resetăm progresul
    setGlobalTimeoutExpired(false) // Resetăm starea de expirare a timerului global
    setTimeRemaining(GLOBAL_SCAN_TIMEOUT / 1000) // Resetăm timpul rămas
    form.reset()

    // Resetăm timestamp-ul ultimei scanări
    lastScanAttemptRef.current = Date.now()

    // Pornim un nou timeout pentru scanare continuă
    startContinuousScanTimeout()

    // Pornim un nou timer global
    startGlobalScanTimeout()
  }

  const handleScan = (detectedCodes: any[]) => {
    if (detectedCodes && detectedCodes.length > 0 && detectedCodes[0].rawValue) {
      console.log("QR Code detected:", detectedCodes[0].rawValue)
      lastDetectedRawRef.current = String(detectedCodes[0].rawValue)
      setScanResult(detectedCodes[0].rawValue)
      setIsScanning(false) // Oprim starea de scanare când am detectat un QR code
      setGlobalTimeoutProgress(0) // Resetăm progresul
      setGlobalTimeoutExpired(false) // Resetăm starea de expirare a timerului global
      setTimeRemaining(GLOBAL_SCAN_TIMEOUT / 1000) // Resetăm timpul rămas

      // Curățăm timeout-urile când detectăm un cod QR
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current)
        scanTimeoutRef.current = null
      }
      if (globalTimeoutRef.current) {
        clearTimeout(globalTimeoutRef.current)
        globalTimeoutRef.current = null
      }
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current)
        progressIntervalRef.current = null
      }

      verifyScannedData(detectedCodes[0].rawValue)
    }
  }

  const handleError = (error: any) => {
    console.error("Eroare la scanarea QR code-ului:", error)
    setScanError("A apărut o eroare la scanarea QR code-ului. Verificați permisiunile camerei.")
    setIsScanning(false)
    if (onScanError) onScanError("Eroare la scanare")
    if (onVerificationComplete) onVerificationComplete(false)

    // Incrementăm contorul de încercări eșuate
    incrementFailedAttempts()
  }

  // Funcție pentru verificarea codului introdus manual
  const onSubmitManualCode = (values: ManualCodeFormValues) => {
    console.log("Verificare cod manual:", values.equipmentCode)
    setIsVerifying(true)

    // Simulăm un obiect de date similar cu cel obținut din scanarea QR
    const manualData = {
      type: "equipment",
      code: values.equipmentCode,
      client: expectedClientName || "",
      location: expectedLocationName || "",
    }

    // Verificăm dacă codul introdus manual corespunde cu cel așteptat
    if (expectedEquipmentCode && values.equipmentCode === expectedEquipmentCode) {
      setVerificationResult({
        success: true,
        message: "Verificare reușită!",
        details: ["Codul introdus manual corespunde cu echipamentul din lucrare."],
      })

      if (onScanSuccess) onScanSuccess(manualData)
      if (onVerificationComplete) onVerificationComplete(true)

      // Închide dialogul automat după o verificare reușită
      setTimeout(() => {
        setIsOpen(false)
        toast({
          title: "Verificare reușită",
          description: "Codul introdus manual corespunde cu echipamentul din lucrare. Puteți continua intervenția.",
        })
      }, 2000)
    } else {
      setVerificationResult({
        success: false,
        message: "Verificare eșuată!",
        details: [
          `Cod echipament necorespunzător (introdus: ${values.equipmentCode})`,
        ],
      })

      if (onScanError)
        onScanError(
          `Cod echipament necorespunzător (introdus: ${values.equipmentCode})`,
        )
      if (onVerificationComplete) onVerificationComplete(false)
    }

    setIsVerifying(false)
  }

  // Funcție pentru gestionarea declarației tehnicianului despre garanție
  const handleWarrantyDeclaration = (isInWarranty: boolean) => {
    setTechnicianWarrantyDeclaration(isInWarranty)
    
    if (onWarrantyVerification) {
      onWarrantyVerification(isInWarranty)
    }
    
    if (onScanSuccess && scanResult) {
      onScanSuccess(scanResult)
    }
    if (onVerificationComplete) {
      onVerificationComplete(true)
    }

    setFailedScanAttempts(0)
    setShowManualEntryButton(false)

    setTimeout(() => {
      setIsOpen(false)
      toast({
        title: "Verificare completă",
        description: `Echipamentul a fost verificat. Garanție: ${isInWarranty ? 'DA' : 'NU'}`,
      })
    }, 1500)
  }

  // Renderăm un mesaj de permisiuni pentru cameră
  const renderCameraPermissionMessage = () => {
    if (cameraPermissionStatus === "denied") {
      return (
        <Alert variant="destructive" className="mt-4">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Acces cameră blocat</AlertTitle>
          <AlertDescription>
            <p>
              Browserul a blocat accesul la cameră. Pentru a scana QR code-uri, trebuie să permiteți accesul la
              cameră.
            </p>
            <p className="mt-2">
              Pe dispozitive mobile, verificați setările browserului sau ale aplicației pentru a permite accesul la
              cameră.
            </p>
            <Button variant="outline" className="mt-2" onClick={checkCameraPermissions}>
              <Camera className="mr-2 h-4 w-4" />
              Solicită din nou acces la cameră
            </Button>
          </AlertDescription>
        </Alert>
      )
    }

    if (cameraPermissionStatus === "prompt") {
      return (
        <Alert className="mt-4">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Permisiune cameră necesară</AlertTitle>
          <AlertDescription>
            <p>
              Pentru a scana QR code-uri, trebuie să permiteți accesul la cameră când browserul vă solicită acest lucru.
            </p>
          </AlertDescription>
        </Alert>
      )
    }

    return null
  }

  // Renderăm butonul de introducere manuală a codului
  const renderManualEntryButton = () => {
    if (showManualEntryButton && !showManualCodeInput) {
      return (
        <div className="mt-4 p-4 border rounded-lg bg-muted/30">
          <p className="text-sm text-muted-foreground mb-3">
            Nu s-a putut scana codul după {failedScanAttempts} încercări. Încercați introducerea manuală sau reîncercați scanarea.
          </p>
          <div className="flex flex-col gap-2">
            <Button onClick={activateManualCodeInput} className="w-full">
              <KeyRound className="mr-2 h-4 w-4" />
              Introdu codul manual
            </Button>
            <Button onClick={returnToScanning} variant="outline" className="w-full">
              <Camera className="mr-2 h-4 w-4" />
              Încearcă scanarea din nou
            </Button>
            {failedScanAttempts >= 3 && (
              <Button onClick={handleReportScanIssue} variant="destructive" className="w-full" disabled={reporting}>
                {reporting ? (
                  <>
                    <Spinner className="mr-2 h-4 w-4" />
                    Se raportează problema...
                  </>
                ) : (
                  <>
                    <AlertCircle className="mr-2 h-4 w-4" />
                    Raportează problema scanare
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      )
    }
    return null
  }

  // Raportare problemă scanare pentru aprobare admin
  const handleReportScanIssue = async () => {
    try {
      if (!workId) {
        toast({ title: "Lipsă context lucrare", description: "ID-ul lucrării nu este disponibil.", variant: "destructive" })
        return
      }
      setReporting(true)
      const payload = {
        lucrareId: workId,
        expectedEquipmentCode: expectedEquipmentCode || null,
        expectedClientName: expectedClientName || null,
        expectedLocationName: expectedLocationName || null,
        latestDetectedCodeRaw: lastDetectedRawRef.current,
        failedScanAttempts,
        device: {
          isMobile,
          userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
          platform: typeof navigator !== "undefined" ? (navigator as any).platform : "",
        },
        cameraPermissionStatus,
        scanError,
        timeRemaining,
      }
      const res = await fetch("/api/scan-issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Eroare la trimiterea raportului")
      }
      toast({
        title: "Raport trimis",
        description: "Problema de scanare a fost raportată. Un administrator o poate aproba manual.",
      })
    } catch (e: any) {
      toast({ title: "Eroare", description: e?.message || String(e), variant: "destructive" })
    } finally {
      setReporting(false)
    }
  }

  // Renderăm formularul de introducere manuală a codului
  const renderManualCodeInput = () => {
    if (!showManualCodeInput) return null

    return (
      <div className="p-4 border rounded-lg mt-4">
        <h3 className="text-lg font-medium mb-2">Introducere manuală cod</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Introduceți codul unic al echipamentului pentru verificare.
        </p>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmitManualCode)} className="space-y-4">
            <FormField
              control={form.control}
              name="equipmentCode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cod echipament</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="Introduceți codul echipamentului" 
                      {...field}
                      onChange={(e) => {
                        const uppercaseValue = e.target.value.toUpperCase()
                        field.onChange(uppercaseValue)
                      }}
                      style={{ textTransform: 'uppercase' }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex flex-col sm:flex-row gap-2">
              <Button type="submit" className="flex-1" disabled={isVerifying}>
                {isVerifying ? (
                  <>
                    <Spinner className="mr-2 h-4 w-4" />
                    Se verifică...
                  </>
                ) : (
                  <>
                    <KeyRound className="mr-2 h-4 w-4" />
                    Verifică codul
                  </>
                )}
              </Button>
              <Button type="button" variant="outline" onClick={returnToScanning} className="flex-1">
                <Camera className="mr-2 h-4 w-4" />
                Reîncearcă scanarea
              </Button>
            </div>
          </form>
        </Form>
      </div>
    )
  }

  // Curățăm intervalele de scanare la dezmontarea componentei
  useEffect(() => {
    return () => {
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current)
        scanTimeoutRef.current = null
      }
      if (globalTimeoutRef.current) {
        clearTimeout(globalTimeoutRef.current)
        globalTimeoutRef.current = null
      }
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current)
        progressIntervalRef.current = null
      }
    }
  }, [])

  return (
    <>
      <Button onClick={() => setIsOpen(true)} variant="outline">
        Scanează QR Code
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <div className="dialog-content-scrollable">
            <DialogHeader>
              <DialogTitle>Scanare QR Code Echipament</DialogTitle>
              <DialogDescription>Îndreptați camera către QR code-ul echipamentului pentru a-l scana.</DialogDescription>
            </DialogHeader>

            {renderCameraPermissionMessage()}

            {isScanning && !showManualCodeInput && cameraPermissionStatus !== "denied" && (
              <>
                <div className="relative aspect-square w-full max-w-sm mx-auto overflow-hidden rounded-lg">
                  <Scanner
                    constraints={{
                      facingMode: isMobile ? "environment" : "user",
                      width: isMobile ? { ideal: 1280, max: 1920 } : { min: 640, ideal: 1280 },
                      height: isMobile ? { ideal: 720, max: 1080 } : { min: 480, ideal: 720 },
                    }}
                    onScan={handleScan}
                    onError={handleError}
                    paused={!isScanning}
                    styles={{
                      container: {
                        width: "100%",
                        height: "100%",
                        position: "relative",
                        overflow: "hidden",
                      },
                      video: {
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        transform: isMobile ? "scaleX(1)" : "scaleX(-1)", // Flip camera for desktop
                      },
                    }}
                  />
                  <div className="absolute inset-0 border-2 border-dashed border-white pointer-events-none"></div>

                  {/* Indicator de scanare animat */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    {isScanning && (
                      <div className="relative w-full h-full">
                        {/* Linie de scanare animată */}
                        <div className="absolute left-0 right-0 h-0.5 bg-green-500 opacity-70 animate-scan-line"></div>

                        {/* Indicator de scanare în colțul din dreapta sus */}
                        <div className="absolute top-2 right-2 flex items-center bg-black bg-opacity-50 text-white text-xs px-2 py-1 rounded-full">
                          <div className="w-2 h-2 bg-green-500 rounded-full mr-1 animate-pulse"></div>
                          <span>Scanare...</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground text-center mt-2">
                  {isMobile
                    ? "Asigurați-vă că QR code-ul este în cadrul camerei și bine iluminat."
                    : "Dacă camera nu se afișează, verificați permisiunile browserului și reîncărcați pagina."}
                </p>
                
            
              </>
            )}

            {/* Afișăm butonul de introducere manuală după 3 încercări eșuate sau după expirarea timerului global */}
            {renderManualEntryButton()}

            {/* Afișăm formularul de introducere manuală când utilizatorul apasă butonul */}
            {renderManualCodeInput()}

            {scanError && cameraPermissionStatus !== "denied" && !showManualCodeInput && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Eroare</AlertTitle>
                <AlertDescription>{scanError}</AlertDescription>
              </Alert>
            )}

            {isVerifying && !showManualCodeInput && (
              <div className="flex flex-col items-center justify-center p-4">
                <Spinner className="h-8 w-8" />
                <p className="mt-2">Se verifică echipamentul...</p>
              </div>
            )}

            {verificationResult && (
              <div className="space-y-3">
                <Alert variant={verificationResult.success ? "default" : "destructive"}>
                  {verificationResult.success ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                  <AlertTitle>{verificationResult.message}</AlertTitle>
                  <AlertDescription>
                    <ul className="list-disc pl-5 mt-2">
                      {verificationResult.details?.map((detail, index) => (
                        <li key={index}>{detail}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
                
                {/* Buton pentru reîncercarea scanării după eroare de verificare */}
                {!verificationResult.success && (
                  <div className="flex justify-center">
                    <Button onClick={returnToScanning} variant="outline" size="sm">
                      <Camera className="mr-2 h-4 w-4" />
                      Scanează din nou
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Secțiunea pentru verificarea garanției */}
            {showWarrantyVerification && verificationResult?.success && warrantyInfo && (
              <Card className="border-2 border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-blue-900">
                    <div className="h-5 w-5 rounded-full bg-blue-500 flex items-center justify-center">
                      <span className="text-white text-xs font-bold">G</span>
                    </div>
                    Verificare Garanție Echipament
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="p-3 bg-white rounded-md border">
                    <h4 className="font-medium text-sm mb-2">Calculul automat al garanției:</h4>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-gray-600">Status:</span>
                        <Badge className={warrantyInfo.statusBadgeClass + " ml-1"}>
                          {warrantyInfo.statusText}
                        </Badge>
                      </div>
                      <div>
                        <span className="text-gray-600">Zile rămase:</span>
                        <span className={`ml-1 font-medium ${warrantyInfo.isInWarranty ? 'text-green-600' : 'text-red-600'}`}>
                          {warrantyInfo.isInWarranty ? warrantyInfo.daysRemaining : 0} zile
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-600">Data instalării:</span>
                        <span className="ml-1">{warrantyInfo.installationDate || "Nedefinită"}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Expiră la:</span>
                        <span className="ml-1">{warrantyInfo.warrantyExpires || "Nedefinită"}</span>
                      </div>
                    </div>
                    <p className="text-xs text-gray-600 mt-2">{warrantyInfo.warrantyMessage}</p>
                  </div>

                  <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                    <h4 className="font-medium text-sm mb-3 text-yellow-800">
                      Declarație tehnician (după verificarea fizică):
                    </h4>
                    <p className="text-xs text-yellow-700 mb-3">
                      Pe baza verificării fizice a echipamentului, confirmați dacă acesta este sau nu în garanție:
                    </p>
                    
                    {technicianWarrantyDeclaration === null ? (
                      <div className="flex flex-col space-y-2">
                        <Button 
                          onClick={() => handleWarrantyDeclaration(true)}
                          className="bg-green-600 hover:bg-green-700 text-white"
                          size="sm"
                        >
                          ✓ DA - Echipamentul este în garanție
                        </Button>
                        <Button 
                          onClick={() => handleWarrantyDeclaration(false)}
                          variant="destructive"
                          size="sm"
                        >
                          ✗ NU - Echipamentul NU este în garanție
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center space-x-2">
                        <Badge 
                          className={technicianWarrantyDeclaration 
                            ? "bg-green-100 text-green-800 border-green-200" 
                            : "bg-red-100 text-red-800 border-red-200"
                          }
                        >
                          {technicianWarrantyDeclaration ? "✓ În garanție" : "✗ Nu este în garanție"}
                        </Badge>
                        <span className="text-xs text-gray-600">Declarție confirmată</span>
                      </div>
                    )}
                  </div>

                  {technicianWarrantyDeclaration !== null && 
                   technicianWarrantyDeclaration !== warrantyInfo.isInWarranty && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-md">
                      <div className="flex items-center space-x-2">
                        <AlertCircle className="h-4 w-4 text-amber-600" />
                        <span className="font-medium text-sm text-amber-800">Discrepanță detectată</span>
                      </div>
                      <p className="text-xs text-amber-700 mt-1">
                        Declarația tehnicianului ({technicianWarrantyDeclaration ? "în garanție" : "nu este în garanție"}) 
                        diferă de calculul automat ({warrantyInfo.isInWarranty ? "în garanție" : "nu este în garanție"}).
                        Declarația tehnicianului va fi folosită în raport.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {debugMode && (
              <div className="bg-muted p-2 rounded text-xs overflow-auto max-h-32">
                <p className="font-bold">Debug Info:</p>
                <p>Device: {isMobile ? "Mobile" : "Desktop"}</p>
                <p>Camera Permission: {cameraPermissionStatus}</p>
                <p>Scanning: {isScanning ? "Yes" : "No"}</p>
                <p>Verifying: {isVerifying ? "Yes" : "No"}</p>
                <p>Failed Attempts: {failedScanAttempts}</p>
                <p>Show Manual Entry Button: {showManualEntryButton ? "Yes" : "No"}</p>
                <p>Show Manual Input: {showManualCodeInput ? "Yes" : "No"}</p>
                <p>Global Timeout Progress: {globalTimeoutProgress.toFixed(1)}%</p>
                <p>Global Timeout Expired: {globalTimeoutExpired ? "Yes" : "No"}</p>
                <p>Time Remaining: {timeRemaining}s</p>
                <p>Scan Result: {scanResult ? scanResult.substring(0, 100) + "..." : "None"}</p>
                <p>Error: {scanError || "None"}</p>
                <p>
                  Verification:{" "}
                  {verificationResult ? JSON.stringify(verificationResult).substring(0, 100) + "..." : "None"}
                </p>
              </div>
            )}

            <DialogFooter className="flex flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={() => setIsOpen(false)} className="w-full sm:w-auto">
                Închide
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDebugMode(!debugMode)}
                className="text-xs w-full sm:w-auto"
              >
                {debugMode ? "Dezactivează Debug" : "Activează Debug"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
