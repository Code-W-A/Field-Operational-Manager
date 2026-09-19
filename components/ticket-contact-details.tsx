"use client"
import { Mail, MapPin, Phone } from "lucide-react"
import { ticketContactDisplay, type SyncRecord } from "@/firebase-functions/src/client-ticket-sync"
const formatPhoneForCall = (phone: string) => phone.replace(/\D/g, "")

export function TicketContactDetails({ work, client }: { work: SyncRecord; client?: SyncRecord | null }) {
  const contact = ticketContactDisplay(work, client)
  return <>
                  {/* Locație */}
                  <div>
                    <p className="text-base font-semibold mb-2">Locație:</p>
                    <p className="text-base mb-1">{contact.location}</p>
                    {(() => {
                      const addr = contact.address
                      if (!addr) return null
                      return (
                      <div className="mt-2">
                        <p className="text-sm text-gray-600 flex items-center gap-1 mb-2">
                          <MapPin className="h-4 w-4" />
                          {addr}
                        </p>
                        <div className="flex gap-2">
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-medium bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                          >
                            <MapPin className="h-3 w-3" />
                            Google Maps
                          </a>
                          <a
                            href={`https://waze.com/ul?q=${encodeURIComponent(addr)}&navigate=yes`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-medium bg-green-500 text-white rounded hover:bg-green-600 transition-colors"
                          >
                            <MapPin className="h-3 w-3" />
                            Waze
                          </a>
                        </div>
                      </div>
                      )
                    })()}
                  </div>

                  {/* Persoană contact */}
                  <div>
                    <p className="text-base font-semibold mb-2">Persoană contact (locație):</p>
                    <p className="text-sm mb-2">{contact.name}</p>
                    {(() => {
                      const email = contact.email
                      if (!email) return null
                      return (
                          <div className="text-sm mb-2">
                            <div className="flex flex-wrap items-center gap-2">
                            <span className="break-all">{email}</span>
                              <a
                              href={`mailto:${email}`}
                                className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-gray-600 text-white hover:bg-gray-700 transition-colors flex-shrink-0"
                              aria-label={`Scrie email către ${email}`}
                              title={`Scrie email către ${email}`}
                              >
                                <Mail className="h-3 w-3" />
                              </a>
                            </div>
                          </div>
                      )
                    })()}
                    <div className="text-sm flex items-center gap-2">
                      <span>{contact.phone}</span>
                      {contact.phone && <a
                        href={`tel:${formatPhoneForCall(contact.phone)}`}
                        className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-green-500 text-white hover:bg-green-600 transition-colors"
                        aria-label={`Apelează ${contact.name}`}
                        title={`Apelează ${contact.name}`}
                      >
                        <Phone className="h-3 w-3" />
                      </a>}
                    </div>
                  </div>

  </>
}
