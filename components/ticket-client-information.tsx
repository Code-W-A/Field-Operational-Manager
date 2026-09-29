"use client"

import { Mail, Phone } from "lucide-react"
import type { resolveTicketLiveDisplay } from "@/lib/work-documents/ticket-live-display"

const formatPhoneForCall = (phone: string) => phone.replace(/\D/g, "")

export function TicketClientInformation({ identity, showRegistration }: {
  identity: ReturnType<typeof resolveTicketLiveDisplay>["identity"]
  showRegistration: boolean
}) {
  return (
    <div className="text-sm grid grid-cols-1 sm:grid-cols-4 gap-x-6 gap-y-2 w-full items-start">
      <div className="flex flex-col min-w-0">
        <div className="text-xs font-medium text-muted-foreground">Telefon Principal:</div>
        <div className="text-gray-900 whitespace-normal break-words flex items-center gap-2">
          {identity.phone || "N/A"}
          {identity.phone && (
            <a
              href={`tel:${formatPhoneForCall(identity.phone)}`}
              className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-blue-500 text-white hover:bg-blue-600 transition-colors"
              aria-label={`Apelează ${identity.phone}`}
              title={`Apelează ${identity.phone}`}
            >
              <Phone className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>
      <div className="flex flex-col min-w-0">
        <div className="text-xs font-medium text-muted-foreground">Email (client):</div>
        <div className="text-gray-900 whitespace-normal break-words flex flex-col gap-1">
          <span className="break-words" title={identity.email || "N/A"}>{identity.email || "N/A"}</span>
          {identity.email && (
            <a
              href={`mailto:${identity.email}`}
              className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-gray-600 text-white hover:bg-gray-700 transition-colors flex-shrink-0"
              aria-label={`Scrie email către ${identity.email}`}
              title={`Scrie email către ${identity.email}`}
            >
              <Mail className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>
      <div className="flex flex-col min-w-0">
        <div className="text-xs font-medium text-muted-foreground">Reprezentant Firmă:</div>
        <div className="text-gray-900 whitespace-normal break-words">{identity.representative || "N/A"}{identity.representativeRole ? `, ${identity.representativeRole}` : ""}</div>
      </div>
      <div className="flex flex-col min-w-0">
        <div className="text-xs font-medium text-muted-foreground">CUI/CIF:</div>
        <div className="text-gray-900 whitespace-normal break-words">{identity.cui || "N/A"}</div>
      </div>
      {showRegistration && (
        <div className="flex flex-col min-w-0">
          <div className="text-xs font-medium text-muted-foreground">Nr. ordine ONRC:</div>
          <div className="text-gray-900 whitespace-normal break-words">{identity.reg || "N/A"}</div>
        </div>
      )}
    </div>
  )
}

export function TicketClientReadStatus({ unavailable, issues }: { unavailable: boolean; issues: string[] }) {
  return <>
    {unavailable && <p role="status" className="text-sm text-muted-foreground">Datele actuale ale clientului nu sunt disponibile. Sunt afișate datele salvate în tichet.</p>}
    {issues.length > 0 && <div role="status" className="text-sm text-amber-700 mt-3">
      <p>Date păstrate pentru verificare:</p>
      <ul className="list-disc pl-5">{issues.map(issue => <li key={issue}>{issue}</li>)}</ul>
    </div>}
  </>
}
