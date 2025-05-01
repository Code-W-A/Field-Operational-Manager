/**
 * Logging service that doesn't depend on Firestore
 * This provides a safe way to log without causing permission errors
 */

type LogLevel = "debug" | "info" | "warning" | "error"
type LogCategory = "system" | "api" | "email" | "data" | "auth" | string
type LogContext = Record<string, any>

interface LogOptions {
  category?: LogCategory
  context?: LogContext
}

/**
 * Log a debug message
 */
export function logDebug(message: string, data: any = null, options: LogOptions = {}) {
  logMessage("debug", message, data, options)
}

/**
 * Log an info message
 */
export function logInfo(message: string, data: any = null, options: LogOptions = {}) {
  logMessage("info", message, data, options)
}

/**
 * Log a warning message
 */
export function logWarning(message: string, data: any = null, options: LogOptions = {}) {
  logMessage("warning", message, data, options)
}

/**
 * Log an error message
 */
export function logError(message: string, data: any = null, options: LogOptions = {}) {
  logMessage("error", message, data, options)
}

/**
 * Internal function to log a message
 */
function logMessage(level: LogLevel, message: string, data: any = null, options: LogOptions = {}) {
  const timestamp = new Date().toISOString()
  const category = options.category || "system"
  const context = options.context || {}

  const logEntry = {
    timestamp,
    level,
    message,
    data,
    category,
    context,
  }

  // Log to console
  console.log(JSON.stringify(logEntry))

  // In a production environment, you might want to send this to a logging service
  // or store it in a database that doesn't have permission issues
}
