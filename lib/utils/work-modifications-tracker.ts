import { collection, addDoc, serverTimestamp } from "firebase/firestore"
import { db } from "@/lib/firebase/config"
import type { WorkModification } from "@/components/work-modifications-dialog"

export interface WorkModificationData {
  lucrareId: string
  lucrareTitle: string // client + locatie pentru identificare ușoară
  modificationType: WorkModification['modificationType']
  modifiedBy: string
  modifiedByName: string
  oldValue?: string
  newValue?: string
  description: string
  priority: WorkModification['priority']
  targetUsers?: string[] // Lista utilizatorilor care trebuie notificați (opțional)
  // Detalii suplimentare pentru afișarea îmbunătățită
  tipLucrare?: string
  statusLucrare?: string
  tehnicieni?: string[]
  dataInterventie?: string
}

/**
 * Salvează o modificare în colecția work_modifications din Firestore
 */
export async function trackWorkModification(data: WorkModificationData): Promise<void> {
  try {
    const modificationDoc = {
      ...data,
      modifiedAt: serverTimestamp(),
      read: false, // Implicit, toate modificările sunt necitite
      createdAt: serverTimestamp()
    }

    await addDoc(collection(db, "work_modifications"), modificationDoc)
    console.log("✅ Modificare salvată:", data.description)
  } catch (error) {
    console.error("❌ Eroare la salvarea modificării:", error)
    // Nu aruncăm eroarea pentru a nu bloca operațiunea principală
  }
}

/**
 * Helper function pentru a crea o descriere automată bazată pe tipul modificării
 */
export function generateModificationDescription(
  type: WorkModification['modificationType'],
  oldValue?: string,
  newValue?: string,
  extraInfo?: string
): string {
  switch (type) {
    case 'status':
      if (oldValue && newValue) {
        return `Statusul lucrării a fost schimbat din "${oldValue}" în "${newValue}"`
      }
      return "Statusul lucrării a fost modificat"
      
    case 'assignment':
      if (oldValue && newValue) {
        return `Atribuirea a fost schimbată din "${oldValue}" în "${newValue}"`
      } else if (newValue) {
        return `Lucrarea a fost atribuită: ${newValue}`
      }
      return "Atribuirea lucrării a fost modificată"
      
    case 'details':
      return extraInfo || "Detaliile lucrării au fost actualizate"
      
    case 'schedule':
      if (oldValue && newValue) {
        return `Data intervenției a fost reprogramată din ${oldValue} în ${newValue}`
      }
      return "Programarea lucrării a fost modificată"
      
    case 'completion':
      return extraInfo || "Lucrarea a fost finalizată"
      
    default:
      return "Lucrarea a fost modificată"
  }
}

/**
 * Helper function pentru determinarea priorității bazată pe tipul modificării
 */
export function getModificationPriority(
  type: WorkModification['modificationType'],
  oldValue?: string,
  newValue?: string
): WorkModification['priority'] {
  switch (type) {
    case 'status':
      // Prioritate mare pentru statusuri importante
      if (newValue === 'Finalizat' || newValue === 'Anulat' || newValue === 'Amânată') {
        return 'high'
      }
      return 'medium'
      
    case 'assignment':
      // Prioritate mare dacă se atribuie unei lucrări neatribuite
      if (oldValue === 'Neatribuit' || !oldValue) {
        return 'high'
      }
      return 'medium'
      
    case 'completion':
      return 'high'
      
    case 'schedule':
      return 'medium'
      
    case 'details':
      return 'low'
      
    default:
      return 'medium'
  }
}

/**
 * Funcție helper pentru a obține titlul lucrării (client + locație)
 */
export function getLucrareTitle(lucrare: any): string {
  if (lucrare.client && lucrare.locatie) {
    return `${lucrare.client} - ${lucrare.locatie}`
  } else if (lucrare.client) {
    return lucrare.client
  } else if (lucrare.locatie) {
    return lucrare.locatie
  }
  return "Lucrare necunoscută"
}

/**
 * Funcție principală pentru tracking modificări cu detectare automată
 */
export async function trackLucrareUpdate(
  lucrareId: string,
  oldLucrare: any,
  newLucrare: any,
  modifiedBy: string,
  modifiedByName: string
): Promise<void> {
  const modifications: WorkModificationData[] = []
  const lucrareTitle = getLucrareTitle(newLucrare)

  // Verificăm modificarea statusului
  if (oldLucrare.statusLucrare !== newLucrare.statusLucrare) {
    modifications.push({
      lucrareId,
      lucrareTitle,
      modificationType: 'status',
      modifiedBy,
      modifiedByName,
      oldValue: oldLucrare.statusLucrare,
      newValue: newLucrare.statusLucrare,
      description: generateModificationDescription('status', oldLucrare.statusLucrare, newLucrare.statusLucrare),
      priority: getModificationPriority('status', oldLucrare.statusLucrare, newLucrare.statusLucrare),
      // Detalii suplimentare pentru card-uri îmbunătățite
      tipLucrare: newLucrare.tipLucrare,
      statusLucrare: newLucrare.statusLucrare,
      tehnicieni: Array.isArray(newLucrare.tehnicieni) ? newLucrare.tehnicieni : [],
      dataInterventie: newLucrare.dataInterventie
    })
  }

  // Verificăm modificarea atribuirii
  const oldTehnicieni = Array.isArray(oldLucrare.tehnicieni) ? oldLucrare.tehnicieni.join(', ') : 'Neatribuit'
  const newTehnicieni = Array.isArray(newLucrare.tehnicieni) ? newLucrare.tehnicieni.join(', ') : 'Neatribuit'
  
  if (oldTehnicieni !== newTehnicieni) {
    modifications.push({
      lucrareId,
      lucrareTitle,
      modificationType: 'assignment',
      modifiedBy,
      modifiedByName,
      oldValue: oldTehnicieni,
      newValue: newTehnicieni,
      description: generateModificationDescription('assignment', oldTehnicieni, newTehnicieni),
      priority: getModificationPriority('assignment', oldTehnicieni, newTehnicieni),
      // Detalii suplimentare pentru card-uri îmbunătățite
      tipLucrare: newLucrare.tipLucrare,
      statusLucrare: newLucrare.statusLucrare,
      tehnicieni: Array.isArray(newLucrare.tehnicieni) ? newLucrare.tehnicieni : [],
      dataInterventie: newLucrare.dataInterventie
    })
  }

  // Verificăm modificarea datei intervenției
  if (oldLucrare.dataInterventie !== newLucrare.dataInterventie) {
    modifications.push({
      lucrareId,
      lucrareTitle,
      modificationType: 'schedule',
      modifiedBy,
      modifiedByName,
      oldValue: oldLucrare.dataInterventie,
      newValue: newLucrare.dataInterventie,
      description: generateModificationDescription('schedule', oldLucrare.dataInterventie, newLucrare.dataInterventie),
      priority: getModificationPriority('schedule'),
      // Detalii suplimentare pentru card-uri îmbunătățite
      tipLucrare: newLucrare.tipLucrare,
      statusLucrare: newLucrare.statusLucrare,
      tehnicieni: Array.isArray(newLucrare.tehnicieni) ? newLucrare.tehnicieni : [],
      dataInterventie: newLucrare.dataInterventie
    })
  }

  // Salvăm toate modificările
  for (const modification of modifications) {
    await trackWorkModification(modification)
  }
} 