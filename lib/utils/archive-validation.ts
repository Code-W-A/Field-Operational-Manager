/**
 * Utilități pentru validarea regulilor de arhivare
 */

export interface ArchiveValidationResult {
  canArchive: boolean
  reason?: string
}

/**
 * Verifică dacă o lucrare poate fi arhivată conform regulilor:
 * 
 * 1. Nu se poate arhiva dacă are bifat "Necesita oferta" și nu are o ofertă transmisă
 * 2. Nu se poate arhiva dacă are o ofertă transmisă și acceptată. 
 *    Următoarea acțiune trebuie să fie reintervenție și abia apoi se activează butonul de arhivare
 * 3. Se activează butonul de arhivare dacă refuză oferta
 * 4. Se activează butonul de arhivare la 30 de zile de la transmiterea ofertei care nu are un răspuns accept/refuz
 */
export function validateArchiveRules(lucrare: any): ArchiveValidationResult {
  // Regulă 1: Nu se poate arhiva dacă necesită ofertă și nu are ofertă transmisă
  if (lucrare.necesitaOferta === true) {
    const hasOfferSent = (lucrare.offerSendCount && lucrare.offerSendCount > 0) || 
                        (lucrare.offerVersions && lucrare.offerVersions.length > 0)
    
    if (!hasOfferSent) {
      return {
        canArchive: false,
        reason: "Lucrarea necesită ofertă, dar oferta nu a fost încă transmisă"
      }
    }
  }

  // Regulă 2: Nu se poate arhiva dacă are ofertă acceptată (trebuie să existe reintervenție)
  if (lucrare.offerResponse?.status === "accept") {
    // Când oferta este acceptată, workflow-ul normal este:
    // 1. Clientul acceptă oferta
    // 2. Se creează o reintervenție (lucrare nouă cu lucrareOriginala === lucrare.id)
    // 3. După finalizarea reintervenției, lucrarea originală poate fi arhivată
    // 
    // Nota: În viitor, putem adăuga verificare automată pentru existența reintervenției,
    // dar momentan blocăm simplu arhivarea până când dispecerul/adminul decide manual
    return {
      canArchive: false,
      reason: "Oferta a fost acceptată. Următoarea acțiune trebuie să fie reintervenție înainte de arhivare"
    }
  }

  // Regulă 3: Se poate arhiva dacă oferta este refuzată
  if (lucrare.offerResponse?.status === "reject") {
    return {
      canArchive: true
    }
  }

  // Regulă 4: Se poate arhiva după 30 de zile de la transmiterea ofertei fără răspuns
  const hasOfferSent = (lucrare.offerSendCount && lucrare.offerSendCount > 0) || 
                      (lucrare.offerVersions && lucrare.offerVersions.length > 0)
  
  if (hasOfferSent && !lucrare.offerResponse) {
    // Verificăm dacă au trecut 30 de zile de la expirarea tokenului
    // offerActionExpiresAt este deja setat la 30 de zile după trimitere
    if (lucrare.offerActionExpiresAt) {
      const expirationDate = lucrare.offerActionExpiresAt.toDate 
        ? lucrare.offerActionExpiresAt.toDate() 
        : new Date(lucrare.offerActionExpiresAt)
      
      const now = new Date()
      
      if (now >= expirationDate) {
        // Au trecut 30 de zile, se poate arhiva
        return {
          canArchive: true
        }
      } else {
        // Nu au trecut încă 30 de zile
        const daysRemaining = Math.ceil((expirationDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        return {
          canArchive: false,
          reason: `Oferta a fost transmisă fără răspuns. Se poate arhiva după expirarea perioadei de 30 de zile (mai rămân ${daysRemaining} zile)`
        }
      }
    }
  }

  // Dacă nu intră în niciuna din regulile de ofertă, verificăm regulile standard existente
  return {
    canArchive: true
  }
}

/**
 * Verifică toate regulile de arhivare, inclusiv cele standard (factură, preluare)
 */
export function canArchiveLucrare(lucrare: any): ArchiveValidationResult {
  // Verificăm regulile standard existente
  const hasInvoiceDoc = Boolean(lucrare?.facturaDocument)
  const noInvoicingSelected = (lucrare.statusFacturare === "Nu se facturează")
  const hasNoInvoiceReason = Boolean(lucrare?.motivNefacturare && String(lucrare?.motivNefacturare).trim().length > 0)
  const isPickedUp = lucrare.preluatDispecer === true

  // Regulă standard: trebuie preluat de dispecer
  if (!isPickedUp) {
    return {
      canArchive: false,
      reason: "Necesită preluare de dispecer înainte de arhivare"
    }
  }

  // Regulă standard: trebuie să aibă factură SAU să fie marcat "Nu se facturează" cu motiv
  if (!hasInvoiceDoc && !noInvoicingSelected) {
    return {
      canArchive: false,
      reason: "Încărcați factura sau marcați 'Nu se facturează' pentru a arhiva"
    }
  }

  if (noInvoicingSelected && !hasNoInvoiceReason) {
    return {
      canArchive: false,
      reason: "Completați motivul pentru 'Nu se facturează' pentru a arhiva"
    }
  }

  // Verificăm regulile specifice ofertelor
  return validateArchiveRules(lucrare)
}

