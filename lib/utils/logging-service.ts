/**
 * Serviciu pentru logging detaliat
 */

import { addLog } from "@/lib/firebase/firestore"

// Niveluri de logging
export type LogLevel = "debug" | "info" | "warning" | "error"

// Categorii de logging
export type LogCategory = "email" | "api" | "data" | "auth" | "system"

// Interfața pentru opțiunile de logging
interface LogOptions {
  category?: LogCategory
  includeTimestamp?: boolean
  saveToFirestore?: boolean
  context?: Record<string, any>
}

// Opțiuni implicite
const defaultOptions: LogOptions = {
  category: "system",
  includeTimestamp: true,
  saveToFirestore: true,
}

/**
 * Funcție pentru logging detaliat
 * @param level Nivelul de logging (debug, info, warning, error)
 * @param message Mesajul de logging
 * @param data Date suplimentare pentru logging
 * @param options Opțiuni de logging
 */
export async function logMessage(
  level: LogLevel,
  message: string,
  data?: any,
  options?: Partial<LogOptions>,
): Promise<void> {
  // Combinăm opțiunile implicite cu cele furnizate
  const opts = { ...defaultOptions, ...options }

  // Creăm obiectul de log
  const logEntry = {
    timestamp: opts.includeTimestamp ? new Date().toISOString() : undefined,
    level,
    category: opts.category,
    message,
    data: sanitizeData(data),
    context: sanitizeData(opts.context),
  }

  // Logăm în consolă
  const logMethod =
    level === "error"
      ? console.error
      : level === "warning"
        ? console.warn
        : level === "debug"
          ? console.debug
          : console.log

  logMethod(`[${opts.category?.toUpperCase()}][${level.toUpperCase()}] ${message}`, logEntry)

  // Salvăm în Firestore dacă este necesar
  if (opts.saveToFirestore) {
    try {
      // Mapăm nivelurile de log la tipurile de log din Firestore
      const logType = level === "error" ? "Eroare" : level === "warning" ? "Avertisment" : "Informație"

      // Convertim datele în format string pentru Firestore
      const detailsString = data ? (typeof data === "object" ? JSON.stringify(data, null, 2) : String(data)) : ""

      await addLog(
        `${opts.category?.charAt(0).toUpperCase()}${opts.category?.slice(1)} ${level}`,
        `${message}${detailsString ? `\n${detailsString}` : ""}`,
        logType,
        opts.category?.charAt(0).toUpperCase() + opts.category?.slice(1) || "Sistem",
      )
    } catch (error) {
      console.error("Eroare la salvarea logului în Firestore:", error)
    }
  }
}

/**
 * Funcție pentru sanitizarea datelor sensibile
 * @param data Datele care trebuie sanitizate
 * @returns Datele sanitizate
 */
function sanitizeData(data: any): any {
  if (!data) return data

  // Dacă este string, returnăm direct
  if (typeof data !== "object") return data

  // Dacă este array, sanitizăm fiecare element
  if (Array.isArray(data)) {
    return data.map((item) => sanitizeData(item))
  }

  // Dacă este obiect, sanitizăm fiecare proprietate
  const sanitized = { ...data }

  // Lista de chei sensibile care trebuie mascate
  const sensitiveKeys = ["password", "pass", "secret", "token", "key", "auth", "credential", "apiKey", "EMAIL_PASSWORD"]

  // Parcurgem toate cheile și mascăm valorile sensibile
  Object.keys(sanitized).forEach((key) => {
    // Verificăm dacă cheia este sensibilă
    const isSensitive = sensitiveKeys.some((sensitiveKey) => key.toLowerCase().includes(sensitiveKey.toLowerCase()))

    if (isSensitive && sanitized[key]) {
      // Mascăm valoarea sensibilă
      sanitized[key] = "[REDACTED]"
    } else if (typeof sanitized[key] === "object") {
      // Recursiv pentru obiecte imbricate
      sanitized[key] = sanitizeData(sanitized[key])
    }
  })

  return sanitized
}

// Funcții helper pentru diferite niveluri de logging
export const logDebug = (message: string, data?: any, options?: Partial<LogOptions>) =>
  logMessage("debug", message, data, options)

export const logInfo = (message: string, data?: any, options?: Partial<LogOptions>) =>
  logMessage("info", message, data, options)

export const logWarning = (message: string, data?: any, options?: Partial<LogOptions>) =>
  logMessage("warning", message, data, options)

export const logError = (message: string, data?: any, options?: Partial<LogOptions>) =>
  logMessage("error", message, data, options)
