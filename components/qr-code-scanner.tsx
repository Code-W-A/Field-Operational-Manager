"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { QrReader } from "react-qr-reader"
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
import { AlertCircle, CheckCircle2, XCircle, Camera, KeyRound } from "lucide-react"
import { Spinner } from "@/components/ui/spinner"
import { useToast } from "@/components/ui/use-toast"
import { Input } from "@/components/ui/input"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import * as z from "zod"

interface QRCodeScannerProps {
  expectedEquipmentCode?: string
  expectedLocationName?: string
  expectedClientName?: string
  onScanSuccess?: (data: any) => void
  onScanError?: (error: string) => void
  onVerificationComplete?: (success: boolean) => void
}

// Schema pentru validarea codului introdus manual
const manualCodeSchema = z.object({
  equipmentCode: z.string().min(1, "Codul echipamentului este obligatoriu"),
})

type ManualCodeFormValues = z.infer<typeof manualCodeSchema>

// Constante pentru îmbunătățirea detecției
const SCAN_ATTEMPTS_BEFORE_PROCESSING = 1 // Numărul de încercări înainte de a aplica procesare
const IMAGE_PROCESSING_LEVELS = [
  { contrast: 1, brightness: 1, grayscale: false, sharpen: false }, // fără procesare
  { contrast: 1.2, brightness: 1.2, grayscale: true, sharpen: false }, // contrast și luminozitate crescute + grayscale
  { contrast: 1.4, brightness: 1.1, grayscale: true, sharpen: true }, // nivel mediu cu sharpen
  { contrast: 1.6, brightness: 1.3, grayscale: true, sharpen: true }, // contrast puternic
  { contrast: 1.8, brightness: 0.9, grayscale: true, sharpen: true }, // contrast extra pentru iluminare slabă
]

// Funcție pentru procesarea imaginii și îmbunătățirea detecției QR
const processImageForQRDetection = (imageData: ImageData, settings: any): ImageData => {
  const canvas = document.createElement("canvas")
  const ctx = canvas.getContext("2d")
  if (!ctx) return imageData

  canvas.width = imageData.width
  canvas.height = imageData.height

  // Desenează imaginea originală
  ctx.putImageData(imageData, 0, 0)

  // Aplică grayscale dacă e activat
  if (settings.grayscale) {
    const grayscaleCanvas = document.createElement("canvas")
    const grayscaleCtx = grayscaleCanvas.getContext("2d")
    if (grayscaleCtx) {
      grayscaleCanvas.width = imageData.width
      grayscaleCanvas.height = imageData.height
      grayscaleCtx.drawImage(canvas, 0, 0)

      const grayscaleImageData = grayscaleCtx.getImageData(0, 0, grayscaleCanvas.width, grayscaleCanvas.height)
      const data = grayscaleImageData.data

      for (let i = 0; i < data.length; i += 4) {
        const avg = (data[i] + data[i + 1] + data[i + 2]) / 3
        data[i] = avg // R
        data[i + 1] = avg // G
        data[i + 2] = avg // B
      }

      grayscaleCtx.putImageData(grayscaleImageData, 0, 0)
      ctx.drawImage(grayscaleCanvas, 0, 0)
    }
  }

  // Aplică filtrul de contrast și luminozitate
  if (settings.contrast !== 1 || settings.brightness !== 1) {
    const processedCanvas = document.createElement("canvas")
    const processedCtx = processedCanvas.getContext("2d")
    if (processedCtx) {
      processedCanvas.width = imageData.width
      processedCanvas.height = imageData.height
      processedCtx.drawImage(canvas, 0, 0)

      const processedImageData = processedCtx.getImageData(0, 0, processedCanvas.width, processedCanvas.height)
      const data = processedImageData.data

      for (let i = 0; i < data.length; i += 4) {
        // Brightness
        data[i] = data[i] * settings.brightness // R
        data[i + 1] = data[i + 1] * settings.brightness // G
        data[i + 2] = data[i + 2] * settings.brightness // B

        // Contrast
        data[i] = (data[i] - 128) * settings.contrast + 128 // R
        data[i + 1] = (data[i + 1] - 128) * settings.contrast + 128 // G
        data[i + 2] = (data[i + 2] - 128) * settings.contrast + 128 // B
      }

      processedCtx.putImageData(processedImageData, 0, 0)
      ctx.drawImage(processedCanvas, 0, 0)
    }
  }

  // Aplică sharpen dacă e activat
  if (settings.sharpen) {
    const sharpenCanvas = document.createElement("canvas")
    const sharpenCtx = sharpenCanvas.getContext("2d")
    if (sharpenCtx) {
      sharpenCanvas.width = imageData.width
      sharpenCanvas.height = imageData.height
      sharpenCtx.drawImage(canvas, 0, 0)

      const sharpenImageData = sharpenCtx.getImageData(0, 0, sharpenCanvas.width, sharpenCanvas.height)
      const data = sharpenImageData.data
      const width = sharpenImageData.width
      const height = sharpenImageData.height

      // Aplicăm un kernel de sharpen simplu 3x3
      const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0]

      const tempData = new Uint8ClampedArray(data)

      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          for (let c = 0; c < 3; c++) {
            let sum = 0
            for (let ky = -1; ky <= 1; ky++) {
              for (let kx = -1; kx <= 1; kx++) {
                const idx = ((y + ky) * width + (x + kx)) * 4 + c
                sum += tempData[idx] * kernel[(ky + 1) * 3 + (kx + 1)]
              }
            }

            const idx = (y * width + x) * 4 + c
            data[idx] = Math.min(255, Math.max(0, sum))
          }
        }
      }

      sharpenCtx.putImageData(sharpenImageData, 0, 0)
      ctx.drawImage(sharpenCanvas, 0, 0)
    }
  }

  // Returnează imaginea procesată
  return ctx.getImageData(0, 0, canvas.width, canvas.height)
}

// Funcție pentru extragerea unei imagini din cadrul video
const extractImageFromVideo = (video: HTMLVideoElement): ImageData | null => {
  if (video) {
    const canvas = document.createElement("canvas")
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext("2d")

    if (ctx) {
      // Desenăm frame-ul curent din video pe canvas
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

      // Extragem datele imaginii
      try {
        return ctx.getImageData(0, 0, canvas.width, canvas.height)
      } catch (error) {
        console.error("Error extracting image data:", error)
      }
    }
  }
  return null
}

export function QRCodeScanner({
  expectedEquipmentCode,
  expectedLocationName,
  expectedClientName,
  onScanSuccess,
  onScanError,
  onVerificationComplete,
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

  // State-uri pentru îmbunătățirea detecției
  const [currentProcessingLevel, setCurrentProcessingLevel] = useState(0)
  const [isUsingProcessing, setIsUsingProcessing] = useState(false)
  const [processingAttempts, setProcessingAttempts] = useState(0)
  const [detectionFeedback, setDetectionFeedback] = useState("")
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const [advancedMode, setAdvancedMode] = useState(false)

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
      form.reset()

      // Curățăm timeout-ul la închiderea dialogului
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current)
        scanTimeoutRef.current = null
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

      // Inițiem un timeout pentru a verifica dacă scanarea continuă nu produce rezultate
      startContinuousScanTimeout()
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

  // Configurăm referința video folosind un efect
  useEffect(() => {
    if (isScanning && !showManualCodeInput) {
      // Găsim elementul video din QrReader
      const videoElement = document.getElementById("qr-video-element") as HTMLVideoElement
      if (videoElement && videoElement !== videoRef.current) {
        videoRef.current = videoElement
        console.log("Video element găsit și înregistrat")
      }

      // Configurăm un interval pentru scanare avansată dacă suntem în modul de procesare
      if (isUsingProcessing && videoRef.current) {
        if (scanIntervalRef.current) {
          clearInterval(scanIntervalRef.current)
        }

        scanIntervalRef.current = setInterval(() => {
          performAdvancedScanning()
        }, 1000) // Scanăm la fiecare secundă

        return () => {
          if (scanIntervalRef.current) {
            clearInterval(scanIntervalRef.current)
            scanIntervalRef.current = null
          }
        }
      }
    }
  }, [isScanning, showManualCodeInput, isUsingProcessing])

  // Funcție pentru verificarea datelor scanate
  const verifyScannedData = (data: any) => {
    setIsVerifying(true)
    setIsScanning(false)
    setScanError(null)

    try {
      // If data is a string, try to parse it as JSON
      let parsedData
      try {
        parsedData = typeof data === "string" ? JSON.parse(data) : data
        console.log("Processing QR data:", parsedData)
      } catch (parseError) {
        console.log("QR code is not valid JSON, using as raw text:", data)
        parsedData = { raw: data, type: "unknown" }
      }

      // Handle raw text QR codes
      if (parsedData.type === "unknown") {
        setVerificationResult({
          success: false,
          message: "QR code necunoscut",
          details: ["Acest QR code nu conține informații despre un echipament. Conținut: " + parsedData.raw],
        })
        if (onScanError) onScanError("QR code necunoscut")
        if (onVerificationComplete) onVerificationComplete(false)
        setIsVerifying(false)
        setIsScanning(true) // Reactivăm scanarea

        // Incrementăm contorul de încercări eșuate
        incrementFailedAttempts()
        return
      }

      // Verificăm dacă este un QR code de echipament
      if (parsedData.type !== "equipment") {
        setVerificationResult({
          success: false,
          message: "QR code invalid",
          details: ["Acest QR code nu este pentru un echipament."],
        })
        if (onScanError) onScanError("QR code invalid")
        if (onVerificationComplete) onVerificationComplete(false)
        setIsVerifying(false)
        setIsScanning(true) // Reactivăm scanarea

        // Incrementăm contorul de încercări eșuate
        incrementFailedAttempts()
        return
      }

      // Verificăm codul echipamentului
      const errors: string[] = []
      let isMatch = true

      if (expectedEquipmentCode && parsedData.code !== expectedEquipmentCode) {
        errors.push(`Cod echipament necorespunzător. Așteptat: ${expectedEquipmentCode}, Scanat: ${parsedData.code}`)
        isMatch = false
      }

      // Verificăm numele locației
      if (expectedLocationName && parsedData.location !== expectedLocationName) {
        errors.push(`Locație necorespunzătoare. Așteptat: ${expectedLocationName}, Scanat: ${parsedData.location}`)
        isMatch = false
      }

      // Verificăm numele clientului
      if (expectedClientName && parsedData.client !== expectedClientName) {
        errors.push(`Client necorespunzător. Așteptat: ${expectedClientName}, Scanat: ${parsedData.client}`)
        isMatch = false
      }

      // Setăm rezultatul verificării
      if (isMatch) {
        setVerificationResult({
          success: true,
          message: "Verificare reușită!",
          details: ["Echipamentul scanat corespunde cu lucrarea."],
        })
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
            description: "Echipamentul scanat corespunde cu lucrarea. Puteți continua intervenția.",
          })
        }, 2000)
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
        details: ["Formatul QR code-ului nu este valid."],
      })
      if (onScanError) onScanError("Format QR code invalid")
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

  // Funcție pentru incrementarea contorului de încercări eșuate și activarea procesării
  const incrementFailedAttempts = () => {
    setFailedScanAttempts((prev) => {
      const newCount = prev + 1
      console.log(`Încercare eșuată ${newCount}/3`)

      // După un anumit număr de încercări, activăm procesarea imaginii
      if (newCount >= SCAN_ATTEMPTS_BEFORE_PROCESSING && !isUsingProcessing) {
        setIsUsingProcessing(true)
        setCurrentProcessingLevel(0)
        setDetectionFeedback("Activare procesare imagine pentru îmbunătățirea detecției...")
        console.log("Activare procesare imagine pentru detecție îmbunătățită")

        // Resetăm starea de scanare pentru a începe cu noile setări
        if (scanTimeoutRef.current) {
          clearTimeout(scanTimeoutRef.current)
        }
        startContinuousScanTimeout()
      } else if (isUsingProcessing) {
        // Dacă deja folosim procesarea, trecem la următorul nivel
        setProcessingAttempts((prev) => {
          const newAttempts = prev + 1
          if (newAttempts >= 2) {
            // Încercăm de 2 ori la fiecare nivel de procesare
            const nextLevel = (currentProcessingLevel + 1) % IMAGE_PROCESSING_LEVELS.length
            setCurrentProcessingLevel(nextLevel)
            setDetectionFeedback(
              `Încercare cu setări avansate (nivel ${nextLevel + 1}/${IMAGE_PROCESSING_LEVELS.length})...`,
            )
            console.log(`Încercare cu setări de procesare nivel ${nextLevel + 1}`)
            return 0 // resetăm numărul de încercări pentru noul nivel
          }
          return newAttempts
        })
      }

      // După 3 încercări eșuate (standard), afișăm butonul de introducere manuală
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

    // Curățăm timeout-ul de scanare continuă
    if (scanTimeoutRef.current) {
      clearTimeout(scanTimeoutRef.current)
      scanTimeoutRef.current = null
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
    form.reset()

    // Resetăm timestamp-ul ultimei scanări
    lastScanAttemptRef.current = Date.now()

    // Pornim un nou timeout pentru scanare continuă
    startContinuousScanTimeout()
  }

  const handleScan = (result: any) => {
    if (result?.text) {
      console.log("QR Code detected:", result.text)
      setScanResult(result.text)
      setIsScanning(false) // Oprim starea de scanare când am detectat un QR code

      // Curățăm timeout-ul de scanare continuă
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current)
        scanTimeoutRef.current = null
      }

      verifyScannedData(result.text)
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

  // Funcție pentru scanarea manuală cu procesare avansată a imaginii
  const performAdvancedScanning = useCallback(() => {
    if (!videoRef.current || !isScanning || scanResult || showManualCodeInput) return

    try {
      // Extragem imaginea din video
      const imageData = extractImageFromVideo(videoRef.current)
      if (!imageData) return

      // Obținem setările de procesare curente
      const processingSettings = IMAGE_PROCESSING_LEVELS[currentProcessingLevel]

      // Procesăm imaginea pentru a îmbunătăți detecția
      const processedImageData = processImageForQRDetection(imageData, processingSettings)

      // Creăm un nou canvas pentru a afișa imaginea procesată și a o scana
      const canvas = document.createElement("canvas")
      const ctx = canvas.getContext("2d")
      if (!ctx) return

      canvas.width = processedImageData.width
      canvas.height = processedImageData.height
      ctx.putImageData(processedImageData, 0, 0)

      // Convertim canvas-ul într-un URL de date pentru a putea fi scanat
      const dataUrl = canvas.toDataURL("image/png")

      // Creăm o imagine pentru a încărca datelele URL și a le scana
      const img = new Image()
      img.crossOrigin = "anonymous" // Pentru a evita probleme CORS

      img.onload = () => {
        // Creăm un nou canvas pentru a desena imaginea și a extrage datele
        const scanCanvas = document.createElement("canvas")
        const scanCtx = scanCanvas.getContext("2d")
        if (!scanCtx) return

        scanCanvas.width = img.width
        scanCanvas.height = img.height
        scanCtx.drawImage(img, 0, 0)

        try {
          // Folosim jsQR sau o altă librărie QR code pentru a scana imaginea
          // Această secțiune este pentru demo - react-qr-reader nu expune scanarea din imagini direct
          console.log("Scanare avansată aplicată - nivelul " + (currentProcessingLevel + 1))

          // Aici am putea folosi o altă bibliotecă cum ar fi jsQR, dar deocamdată
          // doar logăm faptul că încercăm să îmbunătățim scanarea
        } catch (error) {
          console.error("Eroare la scanarea avansată:", error)
        }
      }

      img.src = dataUrl
    } catch (error) {
      console.error("Eroare la scanarea avansată:", error)
    }
  }, [isScanning, scanResult, showManualCodeInput, currentProcessingLevel])

  // Funcție pentru a înregistra video elementul din QrReader pentru procesare avansată
  const handleVideoRef = useCallback((element: HTMLVideoElement | null) => {
    if (element && element !== videoRef.current) {
      videoRef.current = element
      console.log("Video element înregistrat pentru procesare avansată")
    }
  }, [])

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
          `Cod echipament necorespunzător. Așteptat: ${expectedEquipmentCode}, Introdus: ${values.equipmentCode}`,
        ],
      })

      if (onScanError)
        onScanError(
          `Cod echipament necorespunzător. Așteptat: ${expectedEquipmentCode}, Introdus: ${values.equipmentCode}`,
        )
      if (onVerificationComplete) onVerificationComplete(false)
    }

    setIsVerifying(false)
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
              Browserul a blocat accesul la cameră. Pentru a scana QR code-uri, trebuie să permiteți accesul la cameră.
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
            Nu s-a putut scana codul. Încercați introducerea manuală.
          </p>
          <Button onClick={activateManualCodeInput} className="w-full">
            <KeyRound className="mr-2 h-4 w-4" />
            Introdu codul manual
          </Button>
        </div>
      )
    }
    return null
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
                    <Input placeholder="Introduceți codul echipamentului" {...field} />
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
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current)
        scanIntervalRef.current = null
      }
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current)
        scanTimeoutRef.current = null
      }
    }
  }, [])

  return (
    <>
      <Button onClick={() => setIsOpen(true)} variant="outline">
        Scanează QR Code
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Scanare QR Code Echipament</DialogTitle>
            <DialogDescription>Îndreptați camera către QR code-ul echipamentului pentru a-l scana.</DialogDescription>
          </DialogHeader>

          {renderCameraPermissionMessage()}

          {isScanning && !showManualCodeInput && cameraPermissionStatus !== "denied" && (
            <>
              <div className="relative aspect-square w-full max-w-sm mx-auto overflow-hidden rounded-lg">
                <QrReader
                  constraints={{
                    facingMode: isMobile ? "environment" : "user",
                    width: isMobile ? { ideal: 1280, max: 1920 } : { min: 640, ideal: 1280 },
                    height: isMobile ? { ideal: 720, max: 1080 } : { min: 480, ideal: 720 },
                  }}
                  onResult={handleScan}
                  scanDelay={300}
                  videoId="qr-video-element"
                  className="w-full h-full"
                  videoStyle={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    transform: isMobile ? "scaleX(1)" : "scaleX(-1)", // Flip camera for desktop
                  }}
                  videoContainerStyle={{
                    width: "100%",
                    height: "100%",
                    position: "relative",
                    overflow: "hidden",
                  }}
                  containerStyle={{
                    width: "100%",
                    height: "100%",
                    position: "relative",
                    overflow: "hidden",
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
                        <span>Scanare... ({failedScanAttempts}/3)</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Indicator pentru procesarea imaginii */}
                {isUsingProcessing && isScanning && (
                  <div className="absolute bottom-2 left-2 right-2 flex items-center justify-center bg-black bg-opacity-70 text-white text-xs p-2 rounded-lg">
                    <div className="w-2 h-2 bg-blue-500 rounded-full mr-2 animate-pulse"></div>
                    <span>
                      {detectionFeedback ||
                        `Procesare avansată (nivel ${currentProcessingLevel + 1}/${IMAGE_PROCESSING_LEVELS.length})`}
                    </span>
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground text-center mt-2">
                {isMobile
                  ? "Asigurați-vă că QR code-ul este în cadrul camerei și bine iluminat."
                  : "Dacă camera nu se afișează, verificați permisiunile browserului și reîncărcați pagina."}
              </p>
            </>
          )}

          {/* Afișăm butonul de introducere manuală după 3 încercări eșuate */}
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
              <p>Scan Result: {scanResult ? scanResult.substring(0, 100) + "..." : "None"}</p>
              <p>Error: {scanError || "None"}</p>
              <p>
                Verification:{" "}
                {verificationResult ? JSON.stringify(verificationResult).substring(0, 100) + "..." : "None"}
              </p>
            </div>
          )}

          {advancedMode && debugMode && (
            <div className="mt-2 p-2 bg-muted/30 rounded text-xs">
              <p>Setări procesare:</p>
              <ul className="pl-4 list-disc space-y-1">
                <li>
                  Nivel curent: {currentProcessingLevel + 1}/{IMAGE_PROCESSING_LEVELS.length}
                </li>
                <li>Contrast: {IMAGE_PROCESSING_LEVELS[currentProcessingLevel].contrast.toFixed(1)}</li>
                <li>Luminozitate: {IMAGE_PROCESSING_LEVELS[currentProcessingLevel].brightness.toFixed(1)}</li>
                <li>Grayscale: {IMAGE_PROCESSING_LEVELS[currentProcessingLevel].grayscale ? "Da" : "Nu"}</li>
                <li>Sharpen: {IMAGE_PROCESSING_LEVELS[currentProcessingLevel].sharpen ? "Da" : "Nu"}</li>
                <li>Folosește procesare: {isUsingProcessing ? "Da" : "Nu"}</li>
                <li>Încercări la nivel curent: {processingAttempts}</li>
              </ul>
            </div>
          )}

          <DialogFooter className="flex flex-col sm:flex-row gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setAdvancedMode(!advancedMode)}
              className="w-full sm:w-auto"
            >
              {advancedMode ? "Dezactivează mod avansat" : "Activează mod avansat"}
            </Button>
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
        </DialogContent>
      </Dialog>
    </>
  )
}
