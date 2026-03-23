import * as tls from "node:tls"

export type CrmInboxImapSyncState = {
  uidValidity: number | null
  lastUid: number
}

export type CrmInboxMailboxStatus = {
  uidValidity: number | null
  uidNext: number | null
  messages: number | null
}

export type CrmInboxFetchPlan = {
  searchStartUid: number
  bootstrap: boolean
  reset: boolean
}

export type CrmInboxSyncMessage = {
  uid: number
  messageId?: string
  providerMessageId: string
  threadId?: string
  from: string
  to: string[]
  cc: string[]
  subject: string
  bodySnippet: string
  receivedAt: string
}

type ImapChunk =
  | { kind: "line"; value: string }
  | { kind: "literal"; value: Buffer }

type ParsedMimePart = {
  mimeType: string
  contentDisposition: string
  text?: string
  html?: string
}

function normalizePositiveInteger(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : null
}

export function resolveCrmInboxFetchPlan(
  status: CrmInboxMailboxStatus,
  state: CrmInboxImapSyncState | null | undefined,
  bootstrapMaxMessages: number,
): CrmInboxFetchPlan {
  const uidNext = normalizePositiveInteger(status.uidNext) ?? 1
  const bootstrapWindow = Math.max(1, Math.floor(bootstrapMaxMessages))
  const stateUidValidity = normalizePositiveInteger(state?.uidValidity)
  const mailboxUidValidity = normalizePositiveInteger(status.uidValidity)
  const lastUid = normalizePositiveInteger(state?.lastUid) ?? 0

  if (!stateUidValidity || !mailboxUidValidity || stateUidValidity !== mailboxUidValidity) {
    return {
      searchStartUid: Math.max(1, uidNext - bootstrapWindow),
      bootstrap: true,
      reset: Boolean(stateUidValidity && mailboxUidValidity && stateUidValidity !== mailboxUidValidity),
    }
  }

  return {
    searchStartUid: Math.max(1, lastUid + 1),
    bootstrap: false,
    reset: false,
  }
}

function quoteImapString(value: string) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
}

function findHeaderBodySeparator(source: Buffer) {
  const crlfIdx = source.indexOf(Buffer.from("\r\n\r\n"))
  if (crlfIdx >= 0) {
    return { headerEnd: crlfIdx, separatorLength: 4 }
  }

  const lfIdx = source.indexOf(Buffer.from("\n\n"))
  if (lfIdx >= 0) {
    return { headerEnd: lfIdx, separatorLength: 2 }
  }

  return { headerEnd: source.length, separatorLength: 0 }
}

function parseHeaderMap(rawHeaders: string) {
  const lines = rawHeaders.split(/\r?\n/)
  const unfolded: string[] = []

  for (const line of lines) {
    if (!line) continue
    if (/^[ \t]/.test(line) && unfolded.length > 0) {
      unfolded[unfolded.length - 1] += ` ${line.trim()}`
      continue
    }
    unfolded.push(line)
  }

  const headers = new Map<string, string>()
  for (const line of unfolded) {
    const idx = line.indexOf(":")
    if (idx <= 0) continue
    const key = line.slice(0, idx).trim().toLowerCase()
    const value = line.slice(idx + 1).trim()
    const previous = headers.get(key)
    headers.set(key, previous ? `${previous}, ${value}` : value)
  }

  return headers
}

function decodeMimeWords(value: string) {
  return value.replace(/=\?([^?]+)\?([bqBQ])\?([^?]*)\?=/g, (_match, charset, encoding, encodedText) => {
    try {
      const normalizedCharset = String(charset || "utf-8").trim().toLowerCase()
      const normalizedEncoding = String(encoding || "").trim().toUpperCase()
      const source =
        normalizedEncoding === "B"
          ? Buffer.from(String(encodedText || "").replace(/\s+/g, ""), "base64")
          : decodeQuotedPrintableToBuffer(String(encodedText || "").replace(/_/g, " "))

      return decodeBufferWithCharset(source, normalizedCharset)
    } catch {
      return String(encodedText || "")
    }
  })
}

function decodeHtmlEntities(value: string) {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
    const normalized = String(entity || "").toLowerCase()
    if (normalized === "amp") return "&"
    if (normalized === "lt") return "<"
    if (normalized === "gt") return ">"
    if (normalized === "quot") return "\""
    if (normalized === "apos") return "'"
    if (normalized === "nbsp") return " "
    if (normalized.startsWith("#x")) {
      const value = Number.parseInt(normalized.slice(2), 16)
      return Number.isFinite(value) ? String.fromCodePoint(value) : match
    }
    if (normalized.startsWith("#")) {
      const value = Number.parseInt(normalized.slice(1), 10)
      return Number.isFinite(value) ? String.fromCodePoint(value) : match
    }
    return match
  })
}

export function stripHtmlToText(value: string) {
  return decodeHtmlEntities(
    value
      .replace(/<(br|\/p|\/div|\/li|\/tr|\/h[1-6])\b[^>]*>/gi, "\n")
      .replace(/<li\b[^>]*>/gi, "- ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim()
}

function normalizeSnippet(value: string) {
  return value
    .replace(/\r/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500)
}

function decodeQuotedPrintableToBuffer(value: string) {
  const normalized = value.replace(/=\r?\n/g, "")
  const bytes: number[] = []

  for (let idx = 0; idx < normalized.length; idx += 1) {
    const char = normalized[idx]
    if (char === "=" && /^[0-9A-Fa-f]{2}$/.test(normalized.slice(idx + 1, idx + 3))) {
      bytes.push(Number.parseInt(normalized.slice(idx + 1, idx + 3), 16))
      idx += 2
      continue
    }
    bytes.push(char.charCodeAt(0))
  }

  return Buffer.from(bytes)
}

function decodeTransferEncoding(body: Buffer, transferEncoding: string) {
  const normalized = transferEncoding.trim().toLowerCase()
  if (normalized === "base64") {
    return Buffer.from(body.toString("ascii").replace(/\s+/g, ""), "base64")
  }
  if (normalized === "quoted-printable") {
    return decodeQuotedPrintableToBuffer(body.toString("latin1"))
  }
  return body
}

function decodeBufferWithCharset(buffer: Buffer, charset: string) {
  const normalized = charset.trim().toLowerCase()
  const candidates = normalized
    ? [normalized, normalized.replace(/^utf8$/, "utf-8"), normalized === "latin1" ? "iso-8859-1" : normalized]
    : ["utf-8", "iso-8859-1"]

  for (const candidate of candidates) {
    try {
      return new TextDecoder(candidate as string).decode(buffer)
    } catch {}
  }

  return buffer.toString("utf8")
}

function parseContentType(value: string | undefined) {
  const raw = String(value || "").trim()
  const [mimeTypePart, ...params] = raw.split(";")
  const mimeType = mimeTypePart.trim().toLowerCase() || "text/plain"
  const parameters = new Map<string, string>()

  params.forEach((part) => {
    const idx = part.indexOf("=")
    if (idx <= 0) return
    const key = part.slice(0, idx).trim().toLowerCase()
    let paramValue = part.slice(idx + 1).trim()
    if (paramValue.startsWith("\"") && paramValue.endsWith("\"")) {
      paramValue = paramValue.slice(1, -1)
    }
    parameters.set(key, paramValue)
  })

  return {
    mimeType,
    charset: parameters.get("charset") || "utf-8",
    boundary: parameters.get("boundary") || undefined,
  }
}

function splitMultipartBody(body: Buffer, boundary: string) {
  const boundaryMarker = `--${boundary}`
  const source = body.toString("latin1")
  const parts: Buffer[] = []
  let searchIndex = 0

  while (true) {
    const markerIndex = source.indexOf(boundaryMarker, searchIndex)
    if (markerIndex < 0) break

    const markerEnd = markerIndex + boundaryMarker.length
    if (source.startsWith("--", markerEnd)) {
      break
    }

    let partStart = markerEnd
    if (source.startsWith("\r\n", partStart)) {
      partStart += 2
    } else if (source.startsWith("\n", partStart)) {
      partStart += 1
    }

    let nextMarkerIndex = source.indexOf(boundaryMarker, partStart)
    if (nextMarkerIndex < 0) {
      nextMarkerIndex = source.length
    }

    let partEnd = nextMarkerIndex
    while (partEnd > partStart && (source[partEnd - 1] === "\n" || source[partEnd - 1] === "\r")) {
      partEnd -= 1
    }

    if (partEnd > partStart) {
      parts.push(Buffer.from(source.slice(partStart, partEnd), "latin1"))
    }

    searchIndex = nextMarkerIndex
  }

  return parts
}

function extractMimeParts(rawPart: Buffer): ParsedMimePart[] {
  const separator = findHeaderBodySeparator(rawPart)
  const headers = parseHeaderMap(rawPart.slice(0, separator.headerEnd).toString("utf8"))
  const body = rawPart.slice(separator.headerEnd + separator.separatorLength)
  const contentType = parseContentType(headers.get("content-type"))
  const contentDisposition = String(headers.get("content-disposition") || "").trim().toLowerCase()

  if (contentType.mimeType.startsWith("multipart/") && contentType.boundary) {
    return splitMultipartBody(body, contentType.boundary).flatMap((part) => extractMimeParts(part))
  }

  if (contentType.mimeType === "message/rfc822") {
    return extractMimeParts(body)
  }

  if (contentDisposition.includes("attachment")) {
    return []
  }

  const decodedBuffer = decodeTransferEncoding(body, headers.get("content-transfer-encoding") || "")
  const decodedText = decodeBufferWithCharset(decodedBuffer, contentType.charset)

  if (contentType.mimeType === "text/html") {
    return [{ mimeType: contentType.mimeType, contentDisposition, html: decodedText }]
  }

  if (contentType.mimeType === "text/plain" || !contentType.mimeType) {
    return [{ mimeType: contentType.mimeType || "text/plain", contentDisposition, text: decodedText }]
  }

  return []
}

function parseAddressHeader(headerValue: string | undefined) {
  return Array.from(
    new Set(
      (String(headerValue || "").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []).map((entry) =>
        entry.trim().toLowerCase(),
      ),
    ),
  )
}

function extractThreadId(headers: Map<string, string>) {
  const inReplyTo = decodeMimeWords(String(headers.get("in-reply-to") || "").trim())
  if (inReplyTo) return inReplyTo

  const references = decodeMimeWords(String(headers.get("references") || "").trim())
  if (!references) return undefined

  const ids = references.match(/<[^>]+>/g)
  return ids?.[ids.length - 1]
}

function parseReceivedAt(dateHeader: string | undefined, internalDate: string | undefined) {
  const dateCandidates = [dateHeader, internalDate]

  for (const candidate of dateCandidates) {
    const value = String(candidate || "").trim()
    if (!value) continue
    const date = new Date(value)
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString()
    }
  }

  return new Date().toISOString()
}

export function parseRawInboxMessage(params: {
  uid: number
  uidValidity: number | null
  raw: Buffer
  internalDate?: string
}) {
  const separator = findHeaderBodySeparator(params.raw)
  const headers = parseHeaderMap(params.raw.slice(0, separator.headerEnd).toString("utf8"))
  const parts = extractMimeParts(params.raw)
  const plainText = parts.find((part) => part.text)?.text || ""
  const htmlText = parts.find((part) => part.html)?.html || ""
  const bodySnippetSource = plainText || (htmlText ? stripHtmlToText(htmlText) : "")
  const fromHeader = decodeMimeWords(String(headers.get("from") || "").trim())
  const subject = decodeMimeWords(String(headers.get("subject") || "").trim())
  const messageId = decodeMimeWords(String(headers.get("message-id") || "").trim()) || undefined

  return {
    uid: params.uid,
    messageId,
    providerMessageId: `imap:${params.uidValidity || 0}:${params.uid}`,
    threadId: extractThreadId(headers),
    from: fromHeader,
    to: parseAddressHeader(headers.get("to")),
    cc: parseAddressHeader(headers.get("cc")),
    subject,
    bodySnippet: normalizeSnippet(bodySnippetSource),
    receivedAt: parseReceivedAt(headers.get("date"), params.internalDate),
  } satisfies CrmInboxSyncMessage
}

export class MinimalImapClient {
  private socket: tls.TLSSocket

  private buffer = Buffer.alloc(0)

  private queue: Array<{
    tag: string
    resolve: (value: ImapChunk[]) => void
    reject: (error: Error) => void
    chunks: ImapChunk[]
  }> = []

  private literalRemaining = 0

  constructor(socket: tls.TLSSocket) {
    this.socket = socket
    socket.on("data", (chunk: Buffer | string) => {
      const next = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, "utf8")
      this.buffer = Buffer.concat([this.buffer, next])
      this.processBuffer()
    })
    socket.on("error", (error) => {
      const pending = [...this.queue]
      this.queue = []
      pending.forEach((entry) => entry.reject(error instanceof Error ? error : new Error(String(error))))
    })
  }

  private processBuffer() {
    while (true) {
      if (this.literalRemaining > 0) {
        if (this.buffer.length < this.literalRemaining) return
        const literal = this.buffer.subarray(0, this.literalRemaining)
        this.buffer = this.buffer.subarray(this.literalRemaining)
        this.literalRemaining = 0
        this.queue[0]?.chunks.push({ kind: "literal", value: Buffer.from(literal) })
        continue
      }

      const lineEnd = this.buffer.indexOf("\r\n")
      if (lineEnd < 0) return
      const line = this.buffer.subarray(0, lineEnd).toString("utf8")
      this.buffer = this.buffer.subarray(lineEnd + 2)

      if (this.queue.length === 0) {
        continue
      }

      const current = this.queue[0]
      current.chunks.push({ kind: "line", value: line })

      const literalMatch = line.match(/\{(\d+)\}$/)
      if (literalMatch) {
        this.literalRemaining = Number.parseInt(literalMatch[1] || "0", 10)
        continue
      }

      if (line.startsWith(`${current.tag} `)) {
        this.queue.shift()
        if (/\bOK\b/i.test(line)) {
          current.resolve(current.chunks)
        } else {
          current.reject(new Error(`IMAP command failed: ${line}`))
        }
      }
    }
  }

  command(commandText: string) {
    const tag = `A${String(this.queue.length + 1 + Date.now()).slice(-8)}`
    return new Promise<ImapChunk[]>((resolve, reject) => {
      this.queue.push({ tag, resolve, reject, chunks: [] })
      this.socket.write(`${tag} ${commandText}\r\n`)
    })
  }
}

export async function connectImapClient(params: {
  host: string
  port: number
  user: string
  pass: string
  rejectUnauthorized: boolean
}) {
  const socket = await new Promise<tls.TLSSocket>((resolve, reject) => {
    const connection = tls.connect(
      {
        host: params.host,
        port: params.port,
        servername: params.host,
        rejectUnauthorized: params.rejectUnauthorized,
      },
      () => resolve(connection),
    )
    connection.once("error", reject)
  })

  const greeting = await new Promise<string>((resolve, reject) => {
    let buffer = ""
    const onData = (chunk: Buffer | string) => {
      buffer += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : chunk
      const idx = buffer.indexOf("\r\n")
      if (idx < 0) return
      socket.off("data", onData)
      resolve(buffer.slice(0, idx))
    }
    socket.on("data", onData)
    socket.once("error", reject)
  })

  if (!greeting.startsWith("*")) {
    throw new Error(`IMAP greeting invalid: ${greeting}`)
  }

  const client = new MinimalImapClient(socket)
  await client.command(`LOGIN ${quoteImapString(params.user)} ${quoteImapString(params.pass)}`)
  return { client, socket }
}

export function parseExamineStatus(chunks: ImapChunk[]) {
  const status: CrmInboxMailboxStatus = {
    uidValidity: null,
    uidNext: null,
    messages: null,
  }

  chunks.forEach((chunk) => {
    if (chunk.kind !== "line") return
    const line = chunk.value
    const existsMatch = /^\*\s+(\d+)\s+EXISTS$/i.exec(line)
    if (existsMatch) {
      status.messages = Number.parseInt(existsMatch[1] || "0", 10)
    }

    const uidValidityMatch = /\[UIDVALIDITY\s+(\d+)\]/i.exec(line)
    if (uidValidityMatch) {
      status.uidValidity = Number.parseInt(uidValidityMatch[1] || "0", 10)
    }

    const uidNextMatch = /\[UIDNEXT\s+(\d+)\]/i.exec(line)
    if (uidNextMatch) {
      status.uidNext = Number.parseInt(uidNextMatch[1] || "0", 10)
    }
  })

  return status
}

export function parseSearchUids(chunks: ImapChunk[]) {
  for (const chunk of chunks) {
    if (chunk.kind !== "line") continue
    const match = /^\*\s+SEARCH\s*(.*)$/i.exec(chunk.value)
    if (!match) continue
    const values = String(match[1] || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((entry) => Number.parseInt(entry, 10))
      .filter((entry) => Number.isFinite(entry) && entry > 0)
      .sort((left, right) => left - right)
    return values
  }

  return [] as number[]
}

export function parseFetchMessages(chunks: ImapChunk[], uidValidity: number | null) {
  const messages: Array<{ uid: number; internalDate?: string; raw: Buffer }> = []
  let currentUid: number | null = null
  let currentInternalDate: string | undefined

  for (const chunk of chunks) {
    if (chunk.kind === "line") {
      const fetchMatch = /^\*\s+\d+\s+FETCH\s+\((.*)$/i.exec(chunk.value)
      if (fetchMatch) {
        const uidMatch = /\bUID\s+(\d+)/i.exec(chunk.value)
        currentUid = uidMatch ? Number.parseInt(uidMatch[1] || "0", 10) : null

        const internalDateMatch = /\bINTERNALDATE\s+"([^"]+)"/i.exec(chunk.value)
        currentInternalDate = internalDateMatch?.[1]
      }

      continue
    }

    if (chunk.kind === "literal" && currentUid) {
      messages.push({
        uid: currentUid,
        internalDate: currentInternalDate,
        raw: chunk.value,
      })
      currentUid = null
      currentInternalDate = undefined
    }
  }

  return messages.map((entry) =>
    parseRawInboxMessage({
      uid: entry.uid,
      uidValidity,
      raw: entry.raw,
      internalDate: entry.internalDate,
    }),
  )
}
