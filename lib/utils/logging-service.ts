/**
 * Logging service for the application
 * Provides standardized logging functions with consistent formatting
 */

import { addLog } from "@/lib/firebase/firestore"

// Define log levels
export type LogLevel = "debug" | "info" | "warning" | "error"

// Define log options
export interface LogOptions {
  category?: string
  context?: Record<string, any>
  addToFirestore?: boolean
}

// Default options
const defaultOptions: LogOptions = {
  category: "system",
  context: {},
  addToFirestore: false,
}

/**
 * Sanitizes sensitive data from objects before logging
 * @param data The data to sanitize
 * @returns Sanitized data safe for logging
 */
function sanitizeData(data: any): any {
  if (!data) return data

  // If it's a string, check if it's JSON
  if (typeof data === "string") {
    try {
      const parsed = JSON.parse(data)
      return sanitizeData(parsed)
    } catch (e) {
      // Not JSON, return as is
      return data
    }
  }

  // If it's an array, sanitize each element
  if (Array.isArray(data)) {
    return data.map((item) => sanitizeData(item))
  }

  // If it's an object, sanitize each property
  if (typeof data === "object") {
    const sanitized: Record<string, any> = {}
    for (const [key, value] of Object.entries(data)) {
      // Mask sensitive fields
      if (
        key.toLowerCase().includes("password") ||
        key.toLowerCase().includes("token") ||
        key.toLowerCase().includes("secret") ||
        key.toLowerCase().includes("key")
      ) {
        sanitized[key] = "[REDACTED]"
      } else {
        sanitized[key] = sanitizeData(value)
      }
    }
    return sanitized
  }

  // Otherwise, return as is
  return data
}

/**
 * Formats a log message with consistent structure
 * @param level Log level
 * @param message Log message
 * @param data Additional data to log
 * @param options Logging options
 * @returns Formatted log object
 */
function formatLog(level: LogLevel, message: string, data: any, options: LogOptions): Record<string, any> {
  const timestamp = new Date().toISOString()
  const sanitizedData = sanitizeData(data)

  return {
    timestamp,
    level,
    message,
    data: sanitizedData,
    category: options.category,
    context: options.context,
  }
}

/**
 * Logs a message at the specified level
 * @param level Log level
 * @param message Log message
 * @param data Additional data to log
 * @param options Logging options
 */
async function log(level: LogLevel, message: string, data: any, options: LogOptions = defaultOptions): Promise<void> {
  const mergedOptions = { ...defaultOptions, ...options }
  const formattedLog = formatLog(level, message, data, mergedOptions)
  const sanitizedData = sanitizeData(data)

  // Log to console with appropriate level
  switch (level) {
    case "debug":
      console.debug(JSON.stringify(formattedLog))
      break
    case "info":
      console.info(JSON.stringify(formattedLog))
      break
    case "warning":
      console.warn(JSON.stringify(formattedLog))
      break
    case "error":
      console.error(JSON.stringify(formattedLog))
      break
  }

  // Add to Firestore if specified
  if (mergedOptions.addToFirestore) {
    try {
      let logType = "Informație"
      if (level === "warning") logType = "Avertisment"
      if (level === "error") logType = "Eroare"

      await addLog(
        `Log ${level}`,
        `${message}: ${typeof data === "string" ? data : JSON.stringify(sanitizedData)}`,
        logType,
        mergedOptions.category || "Sistem",
      )
    } catch (error) {
      console.error("Failed to add log to Firestore:", error)
    }
  }
}

/**
 * Logs a debug message
 * @param message Log message
 * @param data Additional data to log
 * @param options Logging options
 */
export function logDebug(message: string, data: any = null, options: LogOptions = defaultOptions): void {
  log("debug", message, data, options)
}

/**
 * Logs an info message
 * @param message Log message
 * @param data Additional data to log
 * @param options Logging options
 */
export function logInfo(message: string, data: any = null, options: LogOptions = defaultOptions): void {
  log("info", message, data, options)
}

/**
 * Logs a warning message
 * @param message Log message
 * @param data Additional data to log
 * @param options Logging options
 */
export function logWarning(message: string, data: any = null, options: LogOptions = defaultOptions): void {
  log("warning", message, data, { ...options, addToFirestore: true })
}

/**
 * Logs an error message
 * @param message Log message
 * @param error Error object or message
 * @param options Logging options
 */
export function logError(message: string, error: any = null, options: LogOptions = defaultOptions): void {
  let errorData: any = {}

  if (error instanceof Error) {
    errorData = {
      message: error.message,
      stack: error.stack,
      name: error.name,
    }
  } else if (error) {
    errorData = error
  }

  log("error", message, errorData, { ...options, addToFirestore: true })
}
