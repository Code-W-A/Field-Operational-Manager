/**
 * Setări predefinite care se creează automat în sistem
 * Acestea sunt separate de setările dinamice create manual de utilizatori
 */

import { db } from "./config"
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore"

export interface PredefinedSetting {
  id: string
  name: string
  description: string
  defaultValue: any
  valueType: "string" | "number" | "boolean"
}

/**
 * Lista setărilor predefinite
 */
export const PREDEFINED_SETTINGS: PredefinedSetting[] = [
  {
    id: "contracts_default_days_before_work",
    name: "Zile înainte pentru revizii",
    description: "Numărul de zile înainte de data programată pentru revizie când se va genera lucrarea automată",
    defaultValue: 10,
    valueType: "number",
  },
  // Dashboard: toggle-uri pentru boxurile de status și sub-condițiile lor
  {
    id: "dashboard_programator_revizii_enabled",
    name: "Dashboard: Programator revizii (activ)",
    description: "Dacă este dezactivat, boxul Programator revizii rămâne vizibil dar nu va afișa revizii.",
    defaultValue: true,
    valueType: "boolean",
  },
  {
    id: "dashboard_intarziate_enabled",
    name: "Dashboard: Întârziate (activ)",
    description: "Dacă este dezactivat, boxul Întârziate rămâne vizibil dar nu va afișa lucrări.",
    defaultValue: true,
    valueType: "boolean",
  },
  {
    id: "dashboard_intarziate_require_exec_date",
    name: "Dashboard: Întârziate - necesită dată intervenție",
    description: "Dacă este activ, se consideră doar lucrările care au dataInterventie.",
    defaultValue: true,
    valueType: "boolean",
  },
  {
    id: "dashboard_intarziate_include_past_days",
    name: "Dashboard: Întârziate - include zile trecute",
    description: "Dacă este activ, lucrările cu dataInterventie înainte de azi pot intra la Întârziate.",
    defaultValue: true,
    valueType: "boolean",
  },
  {
    id: "dashboard_intarziate_include_today",
    name: "Dashboard: Întârziate - include azi",
    description: "Dacă este activ, lucrările cu dataInterventie azi pot intra la Întârziate (în funcție de regula de cutoff).",
    defaultValue: true,
    valueType: "boolean",
  },
  {
    id: "dashboard_intarziate_include_today_after_18",
    name: "Dashboard: Întârziate - include azi după 18:00",
    description: "Dacă este activ, lucrările de azi intră la Întârziate doar după ora 18:00.",
    defaultValue: true,
    valueType: "boolean",
  },
  {
    id: "dashboard_intarziate_require_assigned",
    name: "Dashboard: Întârziate - necesită atribuire",
    description: "Dacă este activ, doar lucrările atribuite (au tehnician sau status Atribuită) intră la Întârziate.",
    defaultValue: true,
    valueType: "boolean",
  },
  {
    id: "dashboard_intarziate_require_not_scanned",
    name: "Dashboard: Întârziate - necesită echipament nescanat",
    description: "Dacă este activ, doar lucrările cu equipmentVerified=false intră la Întârziate.",
    defaultValue: true,
    valueType: "boolean",
  },

  {
    id: "dashboard_amanate_enabled",
    name: "Dashboard: Amânate (activ)",
    description: "Dacă este dezactivat, boxul Amânate rămâne vizibil dar nu va afișa lucrări.",
    defaultValue: true,
    valueType: "boolean",
  },

  {
    id: "dashboard_listate_enabled",
    name: "Dashboard: Listate (activ)",
    description: "Dacă este dezactivat, boxul Listate rămâne vizibil dar nu va afișa lucrări.",
    defaultValue: true,
    valueType: "boolean",
  },
  {
    id: "dashboard_listate_require_no_technicians",
    name: "Dashboard: Listate - necesită fără tehnician",
    description: "Dacă este activ, doar lucrările fără tehnicieni intră la Listate.",
    defaultValue: true,
    valueType: "boolean",
  },

  {
    id: "dashboard_nepreluate_enabled",
    name: "Dashboard: Nepreluate (activ)",
    description: "Dacă este dezactivat, boxul Nepreluate rămâne vizibil dar nu va afișa lucrări.",
    defaultValue: true,
    valueType: "boolean",
  },
  {
    id: "dashboard_nepreluate_require_report_generated",
    name: "Dashboard: Nepreluate - necesită raport generat",
    description: "Dacă este activ, doar lucrările cu raportGenerat=true pot intra la Nepreluate.",
    defaultValue: true,
    valueType: "boolean",
  },
  {
    id: "dashboard_nepreluate_require_not_picked_up",
    name: "Dashboard: Nepreluate - necesită nepreluat dispecer",
    description: "Dacă este activ, doar lucrările cu preluatDispecer=false pot intra la Nepreluate.",
    defaultValue: true,
    valueType: "boolean",
  },

  {
    id: "dashboard_nefacturate_enabled",
    name: "Dashboard: Nefacturate (activ)",
    description: "Dacă este dezactivat, boxul Nefacturate rămâne vizibil dar nu va afișa lucrări.",
    defaultValue: true,
    valueType: "boolean",
  },
  {
    id: "dashboard_nefacturate_require_report_generated",
    name: "Dashboard: Nefacturate - necesită raport generat",
    description: "Dacă este activ, doar lucrările cu raportGenerat=true pot intra la Nefacturate.",
    defaultValue: true,
    valueType: "boolean",
  },
  {
    id: "dashboard_nefacturate_require_no_invoice",
    name: "Dashboard: Nefacturate - necesită fără factură",
    description: "Dacă este activ, doar lucrările fără numarFactura/facturaDocument pot intra la Nefacturate.",
    defaultValue: true,
    valueType: "boolean",
  },
  {
    id: "dashboard_nefacturate_require_no_reason",
    name: "Dashboard: Nefacturate - necesită fără motiv nefacturare",
    description: "Dacă este activ, doar lucrările fără motivNefacturare pot intra la Nefacturate.",
    defaultValue: true,
    valueType: "boolean",
  },

  {
    id: "dashboard_necesita_oferta_enabled",
    name: "Dashboard: Necesită ofertă (activ)",
    description: "Dacă este dezactivat, boxul Necesită ofertă rămâne vizibil dar nu va afișa lucrări.",
    defaultValue: true,
    valueType: "boolean",
  },
  {
    id: "dashboard_necesita_oferta_require_flag",
    name: "Dashboard: Necesită ofertă - necesită flag necesitaOferta",
    description: "Dacă este activ, doar lucrările cu necesitaOferta=true intră în acest box.",
    defaultValue: true,
    valueType: "boolean",
  },
  {
    id: "dashboard_necesita_oferta_require_no_response",
    name: "Dashboard: Necesită ofertă - necesită fără răspuns ofertă",
    description: "Dacă este activ, doar lucrările fără offerResponse intră în acest box.",
    defaultValue: true,
    valueType: "boolean",
  },

  {
    id: "dashboard_ofertate_enabled",
    name: "Dashboard: Ofertate (în așteptare) (activ)",
    description: "Dacă este dezactivat, boxul Ofertate rămâne vizibil dar nu va afișa lucrări.",
    defaultValue: true,
    valueType: "boolean",
  },
  {
    id: "dashboard_ofertate_require_has_offer",
    name: "Dashboard: Ofertate - necesită ofertă existentă",
    description: "Dacă este activ, doar lucrările care au ofertă (offerVersions/offerTotal) intră aici.",
    defaultValue: true,
    valueType: "boolean",
  },
  {
    id: "dashboard_ofertate_require_no_response",
    name: "Dashboard: Ofertate - necesită fără răspuns ofertă",
    description: "Dacă este activ, doar lucrările fără offerResponse intră aici.",
    defaultValue: true,
    valueType: "boolean",
  },

  {
    id: "dashboard_status_oferte_enabled",
    name: "Dashboard: Status oferte (activ)",
    description: "Dacă este dezactivat, boxul Status oferte rămâne vizibil dar nu va afișa lucrări.",
    defaultValue: true,
    valueType: "boolean",
  },
  {
    id: "dashboard_status_oferte_include_accept",
    name: "Dashboard: Status oferte - include accept",
    description: "Dacă este activ, lucrările cu offerResponse.status=accept intră în Status oferte.",
    defaultValue: true,
    valueType: "boolean",
  },
  {
    id: "dashboard_status_oferte_include_reject",
    name: "Dashboard: Status oferte - include reject",
    description: "Dacă este activ, lucrările cu offerResponse.status=reject intră în Status oferte.",
    defaultValue: true,
    valueType: "boolean",
  },

  {
    id: "dashboard_equipment_status_enabled",
    name: "Dashboard: Stare echipament (activ)",
    description: "Dacă este dezactivat, boxul Stare echipament rămâne vizibil dar nu va afișa lucrări.",
    defaultValue: true,
    valueType: "boolean",
  },
  {
    id: "dashboard_equipment_status_include_non_functional",
    name: "Dashboard: Stare echipament - include Nefuncțional",
    description: "Dacă este activ, include echipamente cu status Nefuncțional.",
    defaultValue: true,
    valueType: "boolean",
  },
  {
    id: "dashboard_equipment_status_include_partially_functional",
    name: "Dashboard: Stare echipament - include Parțial funcțional",
    description: "Dacă este activ, include echipamente cu status Parțial funcțional.",
    defaultValue: true,
    valueType: "boolean",
  },
  // Arhivare: toggle-uri pentru regulile care blochează butonul "Arhivează"
  {
    id: "archive_require_finalized_status",
    name: "Arhivare: necesită status Finalizat",
    description: "Dacă este activ, lucrarea trebuie să fie în status 'Finalizat' ca să poată fi arhivată.",
    defaultValue: true,
    valueType: "boolean",
  },
  {
    id: "archive_require_dispatcher_pickup",
    name: "Arhivare: necesită preluare dispecer",
    description: "Dacă este activ, lucrarea trebuie să fie preluată de dispecer înainte de arhivare.",
    defaultValue: true,
    valueType: "boolean",
  },
  {
    id: "archive_require_invoice_or_no_invoicing",
    name: "Arhivare: necesită factură sau 'Nu se facturează'",
    description: "Dacă este activ, trebuie încărcată factura sau selectat 'Nu se facturează'.",
    defaultValue: true,
    valueType: "boolean",
  },
  {
    id: "archive_require_no_invoicing_reason",
    name: "Arhivare: necesită motiv pentru 'Nu se facturează'",
    description: "Dacă este activ, când este selectat 'Nu se facturează' trebuie completat motivul.",
    defaultValue: true,
    valueType: "boolean",
  },
  {
    id: "archive_offer_require_offer_sent_when_needed",
    name: "Arhivare: necesită ofertă trimisă (dacă necesită ofertă)",
    description: "Dacă este activ, lucrările cu 'Necesită ofertă' nu pot fi arhivate până când oferta a fost trimisă.",
    defaultValue: true,
    valueType: "boolean",
  },
  {
    id: "archive_offer_block_when_accepted",
    name: "Arhivare: blochează când oferta e acceptată",
    description: "Dacă este activ, când oferta e acceptată nu se poate arhiva (trebuie reintervenție).",
    defaultValue: true,
    valueType: "boolean",
  },
  {
    id: "archive_offer_wait_30_days_when_no_response",
    name: "Arhivare: așteaptă 30 zile dacă nu există răspuns la ofertă",
    description: "Dacă este activ, după trimiterea ofertei fără răspuns, arhivarea e permisă doar după expirarea perioadei (30 zile). Dacă răspunsul vine mai devreme (accept/refuz), regula de 30 zile se anulează.",
    defaultValue: true,
    valueType: "boolean",
  },
  // Aici pot fi adăugate alte setări predefinite în viitor
  // {
  //   id: "invoices_default_payment_days",
  //   name: "Zile termen plată facturi",
  //   description: "Numărul implicit de zile pentru termenul de plată al facturilor",
  //   defaultValue: 30,
  //   valueType: "number",
  // },
]

/**
 * Verifică și creează setările predefinite dacă nu există
 */
export async function ensurePredefinedSettings() {
  const promises = PREDEFINED_SETTINGS.map(async (setting) => {
    try {
      const settingRef = doc(db, "predefinedSettings", setting.id)
      const settingDoc = await getDoc(settingRef)
      
      if (!settingDoc.exists()) {
        // Creează setarea cu valoarea default
        await setDoc(settingRef, {
          ...setting,
          value: setting.defaultValue,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
        console.log(`✅ Setare predefinită creată: ${setting.name}`)
      }
    } catch (error) {
      console.error(`❌ Eroare la crearea setării predefinite ${setting.id}:`, error)
    }
  })
  
  await Promise.all(promises)
}

/**
 * Obține valoarea unei setări predefinite
 */
export async function getPredefinedSettingValue(settingId: string): Promise<any> {
  try {
    const settingRef = doc(db, "predefinedSettings", settingId)
    const settingDoc = await getDoc(settingRef)
    
    if (settingDoc.exists()) {
      return settingDoc.data().value
    }
    
    // Dacă nu există, returnează valoarea default
    const predefinedSetting = PREDEFINED_SETTINGS.find((s) => s.id === settingId)
    return predefinedSetting?.defaultValue
  } catch (error) {
    console.error(`Eroare la citirea setării predefinite ${settingId}:`, error)
    // Returnează valoarea default în caz de eroare
    const predefinedSetting = PREDEFINED_SETTINGS.find((s) => s.id === settingId)
    return predefinedSetting?.defaultValue
  }
}

/**
 * Actualizează valoarea unei setări predefinite
 */
export async function updatePredefinedSettingValue(settingId: string, newValue: any): Promise<void> {
  try {
    const settingRef = doc(db, "predefinedSettings", settingId)
    await setDoc(
      settingRef,
      {
        value: newValue,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    )
    console.log(`✅ Setare predefinită actualizată: ${settingId} = ${newValue}`)
  } catch (error) {
    console.error(`❌ Eroare la actualizarea setării predefinite ${settingId}:`, error)
    throw error
  }
}

