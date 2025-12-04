import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'

admin.initializeApp()

// Helpers for day-only calculations in Europe/Bucharest (ignore time-of-day)
function toDayKey(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const y = parts.find((p) => p.type === 'year')?.value || '1970'
  const m = parts.find((p) => p.type === 'month')?.value || '01'
  const d = parts.find((p) => p.type === 'day')?.value || '01'
  return `${y}-${m}-${d}` // lexicographically comparable
}

function shiftDayKey(dayKey: string, deltaDays: number): string {
  const [y, m, d] = dayKey.split('-').map(Number)
  const baseUtc = new Date(Date.UTC(y, (m || 1) - 1, d || 1))
  baseUtc.setUTCDate(baseUtc.getUTCDate() + deltaDays)
  const yy = baseUtc.getUTCFullYear()
  const mm = String(baseUtc.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(baseUtc.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

function dayKeyToUtcDate(dayKey: string): Date {
  const [y, m, d] = dayKey.split('-').map(Number)
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1))
}

// Small stable hash for composing deterministic doc IDs (avoids races)
function hashString(input: string): string {
  let hash = 5381
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash) ^ input.charCodeAt(i) // djb2 with xor
  }
  return (hash >>> 0).toString(36)
}

// Scheduled function care rulează la fiecare 5 minute (Europe/Bucharest)
export const generateScheduledWorks = functions
  .region('europe-west1')
  .pubsub
  .schedule('*/5 * * * *')
  .timeZone('Europe/Bucharest')
  .onRun(async (_context: functions.EventContext) => {
    const db = admin.firestore()
    const now = new Date()
    const tz = 'Europe/Bucharest'
    const todayKey = toDayKey(now, tz)
    
    console.log(`[${now.toISOString()}] Starting scheduled work generation (todayKey=${todayKey}, tz=${tz})`)
    
    try {
      // 1. Găsește toate contractele cu recurență setată
      const contractsSnapshot = await db.collection('contracts')
        .where('recurrenceInterval', '!=', null)
        .get()
      
      console.log(`Found ${contractsSnapshot.docs.length} contracts with recurrence`)
      
      let worksCreated = 0
      let contractsProcessed = 0
      
      for (const contractDoc of contractsSnapshot.docs) {
        const contract = contractDoc.data()
        const contractId = contractDoc.id
        
        // Verificăm dacă contractul are toate datele necesare
        if (!contract.recurrenceInterval || !contract.recurrenceUnit || !contract.equipmentIds || contract.equipmentIds.length === 0) {
          console.log(`Contract ${contractId} missing required data, skipping`)
          continue
        }
        
        // Log raw contract fields used in computation
        try {
          console.log(
            `Contract ${contractId} raw: ` +
            `number=${String(contract.number || '-')}, ` +
            `recurrenceUnit=${String(contract.recurrenceUnit)}, ` +
            `recurrenceInterval=${String(contract.recurrenceInterval)}, ` +
            `recurrenceDayOfMonth=${String(contract.recurrenceDayOfMonth ?? '-')}, ` +
            `daysBeforeWork=${String(contract.daysBeforeWork)}, ` +
            `startDate=${String(contract.startDate || '-')}, ` +
            `lastAutoWorkGenerated=${String(contract.lastAutoWorkGenerated || '-')}, ` +
            `locationNames=${JSON.stringify(Array.isArray(contract.locationNames) ? contract.locationNames : (contract.locationName ? [contract.locationName] : []))}, ` +
            `equipmentIdsCount=${Array.isArray(contract.equipmentIds) ? contract.equipmentIds.length : 0}`
          )
        } catch {}

        contractsProcessed++
        
        // 2. Calculează data următoarei revizii
        let nextReviewDate: Date
        
        if (contract.lastAutoWorkGenerated) {
          // Avem o lucrare generată anterior, calculăm următoarea
          const lastGenerated = new Date(contract.lastAutoWorkGenerated)
          const startDateRaw = contract.startDate ? new Date(contract.startDate) : null
          const shouldUseStart =
            !!startDateRaw && !isNaN(startDateRaw.getTime()) && lastGenerated < startDateRaw
          if (shouldUseStart) {
            console.log(`Contract ${contractId}: lastAutoWorkGenerated < startDate → using startDate as baseline`)
          }
          const baseline = shouldUseStart && startDateRaw ? startDateRaw : lastGenerated
          const useBaselineOnly = !!shouldUseStart
          
          if (contract.recurrenceUnit === 'luni') {
            nextReviewDate = new Date(baseline)
            if (!useBaselineOnly) {
              nextReviewDate.setMonth(nextReviewDate.getMonth() + contract.recurrenceInterval)
            } else {
              console.log(`Contract ${contractId}: baseline is startDate → NOT advancing months for first review`)
            }
            
            // Dacă există o zi specifică din lună setată, o aplicăm
            // IMPORTANT: pentru prima revizie (useBaselineOnly) ignorăm ziua din lună; folosim exact startDate
            if (!useBaselineOnly && contract.recurrenceDayOfMonth && contract.recurrenceDayOfMonth >= 1 && contract.recurrenceDayOfMonth <= 31) {
              nextReviewDate.setDate(Math.min(contract.recurrenceDayOfMonth, new Date(nextReviewDate.getFullYear(), nextReviewDate.getMonth() + 1, 0).getDate()))
            }
          } else {
            // zile
            nextReviewDate = new Date(baseline)
            if (!useBaselineOnly) {
              nextReviewDate.setDate(nextReviewDate.getDate() + contract.recurrenceInterval)
            } else {
              console.log(`Contract ${contractId}: baseline is startDate → NOT advancing days for first review`)
            }
          }
        } else {
          // Prima generare - folosim startDate dacă este setată, altfel data de azi
          const startDate = contract.startDate ? new Date(contract.startDate) : new Date(now)
          
          if (contract.recurrenceUnit === 'luni') {
            nextReviewDate = new Date(startDate)
            // Pentru prima generare, dacă avem startDate, o folosim direct
            // Altfel adăugăm intervalul
            if (!contract.startDate) {
              nextReviewDate.setMonth(nextReviewDate.getMonth() + contract.recurrenceInterval)
            }
            
            // Dacă există o zi specifică din lună setată, o aplicăm
            // IMPORTANT: pentru prima revizie când startDate este setat, folosim exact startDate; nu forțăm ziua din lună
            if (!contract.startDate && contract.recurrenceDayOfMonth && contract.recurrenceDayOfMonth >= 1 && contract.recurrenceDayOfMonth <= 31) {
              nextReviewDate.setDate(Math.min(contract.recurrenceDayOfMonth, new Date(nextReviewDate.getFullYear(), nextReviewDate.getMonth() + 1, 0).getDate()))
            }
          } else {
            // zile
            nextReviewDate = new Date(startDate)
            // Pentru prima generare, dacă avem startDate, o folosim direct
            // Altfel adăugăm intervalul
            if (!contract.startDate) {
              nextReviewDate.setDate(nextReviewDate.getDate() + contract.recurrenceInterval)
            }
          }
        }
        
        // 3. Verifică dacă trebuie să generăm lucrarea acum (day-only, fără oră)
        const daysBeforeWork = contract.daysBeforeWork || 10
        const reviewKey = toDayKey(nextReviewDate, tz)
        const generateKey = shiftDayKey(reviewKey, -daysBeforeWork)
        // Track the last generated REVIEW day (not the generation day) to allow correct progression
        const lastReviewKey = contract.lastAutoWorkGenerated ? toDayKey(new Date(contract.lastAutoWorkGenerated), tz) : ''
        
        console.log(`Contract ${contractId}: computed nextReviewDate=${nextReviewDate.toISOString()}, reviewKey=${reviewKey}, generateKey=${generateKey}, todayKey=${todayKey}, lastReviewKey=${lastReviewKey || 'none'}, daysBeforeWork=${daysBeforeWork}`)
        console.log(`(callable) Contract ${contractId}: computed nextReviewDate=${nextReviewDate.toISOString()}, reviewKey=${reviewKey}, generateKey=${generateKey}, todayKey=${todayKey}, lastReviewKey=${lastReviewKey || 'none'}, daysBeforeWork=${daysBeforeWork}`)
        // Decide ținta pentru generare:
        // - dacă azi am intrat în fereastra de generare a REVIEW-ului curent (reviewKey) -> generăm
        // - dacă deja avem lastReviewKey == reviewKey (ex. s-au adăugat locații noi ulterior),
        //   dar suntem încă în fereastra acelei revizii, generăm pentru lastReviewKey ca să completăm locațiile lipsă
        if (todayKey >= generateKey) {
          let targetReviewKey = reviewKey
          if (lastReviewKey && lastReviewKey >= reviewKey) {
            const lastGenerateKey = shiftDayKey(lastReviewKey, -daysBeforeWork)
            if (todayKey >= lastGenerateKey) {
              targetReviewKey = lastReviewKey
            }
          }
          const targetReviewDate = dayKeyToUtcDate(targetReviewKey)
          // Trebuie să generăm lucrări pentru fiecare echipament
          
          // Obținem datele clientului pentru a avea informații complete
          if (!contract.clientId) {
            console.log(`Contract ${contractId} has no client, skipping`)
            continue
          }
          
          const clientDoc = await db.collection('clienti').doc(contract.clientId).get()
          if (!clientDoc.exists) {
            console.log(`Client ${contract.clientId} not found for contract ${contractId}, skipping`)
            continue
          }
          
          const client = clientDoc.data()!
          
          // Suport multi-locații: dacă există contract.locationNames (array), generăm câte o lucrare per locație.
          // Altfel, folosim câmpul unic locationName (legacy).
          const locationNames: string[] = Array.isArray(contract.locationNames) ? contract.locationNames : (
            contract.locationName ? [contract.locationName] : []
          )

          const allClientLocations: any[] = Array.isArray((client as any).locatii) ? (client as any).locatii : []

          const findLocationByName = (name: string) => allClientLocations.find((l: any) => String(l?.nume) === String(name))
          const allEquipments: string[] = Array.isArray(contract.equipmentIds) ? contract.equipmentIds : []

          const targetLocations = locationNames.length > 0 ? locationNames : (
            contract.locationName ? [contract.locationName] : []
          )

          if (targetLocations.length === 0) {
            console.log(`No location specified for contract ${contractId}, skipping`)
            continue
          }

          const startOfDay = new Date(targetReviewDate)
          startOfDay.setHours(0, 0, 0, 0)
          const endOfDay = new Date(startOfDay)
          endOfDay.setDate(endOfDay.getDate() + 1)

          let createdForThisContract = 0
          for (const locName of targetLocations) {
            const location = findLocationByName(locName)
            if (!location) {
              console.log(`Location ${locName} not found for contract ${contractId}, skipping this location`)
              continue
            }

            // Echipamentele pentru această locație: dacă avem lista generală, o filtrăm după ce există în locație.
            const locationEquipmentCodes = new Set<string>((location.echipamente || []).map((e: any) => e.id || e.cod))
            const equipmentForLocation = allEquipments.filter((code) => locationEquipmentCodes.has(code))
            console.log(
              `Match for ${contractId} @ ${locName}: ` +
              `locEquipCount=${locationEquipmentCodes.size}, contractEquipCount=${allEquipments.length}, matched=${equipmentForLocation.length}`
            )

            if (equipmentForLocation.length === 0) {
              console.log(`No equipments for location ${locName} on contract ${contractId}, skipping this location`)
              continue
            }

            const primaryContact = location.persoaneContact && location.persoaneContact.length > 0
              ? location.persoaneContact[0]
              : { nume: '', telefon: '', email: '' }

            // Idempotency per contract + location + day
            const dupSnap = await db
              .collection('lucrari')
              .where('contractId', '==', contractId)
              .where('tipLucrare', '==', 'Revizie')
              .where('autoGenerated', '==', true)
              .where('locatie', '==', locName)
              .where('dataInterventie', '>=', admin.firestore.Timestamp.fromDate(startOfDay))
              .where('dataInterventie', '<', admin.firestore.Timestamp.fromDate(endOfDay))
              .get()

            console.log(`Idempotency check for ${contractId} @ ${locName}: existingToday=${dupSnap.size}`)
            if (!dupSnap.empty) {
              console.log(`Work already exists for contract ${contractId} at ${nextReviewDate.toISOString()} for location ${locName}, skipping`)
              continue
            }

            const workData = {
              client: client.nume,
              clientId: contract.clientId,
              persoanaContact: primaryContact.nume || '',
              telefon: primaryContact.telefon || client.telefon || '',
              dataEmiterii: admin.firestore.Timestamp.now(),
              dataInterventie: admin.firestore.Timestamp.fromDate(targetReviewDate),
              tipLucrare: 'Revizie',
              locatie: locName,
              descriere: 'Revizie programată automată conform contractului',
              statusLucrare: 'Listată',
              statusFacturare: 'Nefacturat',
              tehnicieni: [],
              contract: contract.number,
              contractNumber: contract.number,
              contractId: contractId,
              equipmentIds: equipmentForLocation,
              autoGenerated: true,
              createdAt: admin.firestore.Timestamp.now(),
              updatedAt: admin.firestore.Timestamp.now(),
              createdBy: 'system',
              createdByName: 'Generare Automată',
            }
            const workId = `auto_${contractId}_${hashString(String(locName))}_${targetReviewKey.replace(/-/g, '')}`
            try {
              await db.collection('lucrari').doc(workId).create(workData)
              worksCreated++
              createdForThisContract++
              console.log(`Created Revizie work for contract ${contractId} at location ${locName} with ${equipmentForLocation.length} equipments (id=${workId})`)
            } catch (err: any) {
              // If another instance created it in the meantime, skip gracefully
              if (err?.code === 6 || String(err?.message || '').includes('ALREADY_EXISTS')) {
                console.log(`Work already exists by id for contract ${contractId} at location ${locName} (id=${workId}), skipping`)
              } else {
                throw err
              }
            }
          }
          
          // 4. Actualizează contract.lastAutoWorkGenerated
          if (createdForThisContract > 0) {
            // Actualizăm doar dacă avansăm la o zi de revizie mai târzie
            if (!lastReviewKey || targetReviewKey > lastReviewKey) {
            await db.collection('contracts').doc(contractId).update({
                lastAutoWorkGenerated: dayKeyToUtcDate(targetReviewKey).toISOString(),
              updatedAt: admin.firestore.Timestamp.now(),
            })
            }
            console.log(`Updated lastAutoWorkGenerated for contract ${contractId} (created=${createdForThisContract})`)
          } else {
            console.log(`No works created for any location on contract ${contractId}; NOT updating lastAutoWorkGenerated`)
          }
        } else {
          const reason = todayKey < generateKey ? 'future_day' : 'already_generated_this_review_day'
          console.log(`Contract ${contractId}: not yet time to generate (reason=${reason}, todayKey=${todayKey}, generateKey=${generateKey}, reviewKey=${reviewKey}, lastReviewKey=${lastReviewKey || 'none'})`)
        }
      }
      
      console.log(`Finished: processed ${contractsProcessed} contracts, created ${worksCreated} works`)
      // Done
    } catch (error) {
      console.error('Error in generateScheduledWorks:', error)
      // Do not return payloads from scheduled functions
    }
  })

// HTTPS callable pentru a declanșa manual aceeași logică
export const runGenerateScheduledWorks = functions
  .region('europe-west1')
  .https.onCall(async (data, context) => {
    const db = admin.firestore()
    const now = new Date()
    const tz = 'Europe/Bucharest'
    const todayKey = toDayKey(now, tz)

    // Optional: permite doar utilizatori autentificați
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Necesită autentificare.')
    }

    try {
      const targetContractId: string | undefined = data?.contractId
      let contractsProcessed = 0
      let worksCreated = 0

      const processOne = async (contractId: string, contract: any) => {
        // Verificăm dacă are datele necesare
        if (!contract.recurrenceInterval || !contract.recurrenceUnit || !contract.equipmentIds || contract.equipmentIds.length === 0) {
          console.log(`Contract ${contractId} missing required data, skipping`)
          return
        }

        contractsProcessed++

        // Log raw contract fields used in computation (callable)
        try {
          console.log(
            `(callable) Contract ${contractId} raw: ` +
            `number=${String(contract.number || '-')}, ` +
            `recurrenceUnit=${String(contract.recurrenceUnit)}, ` +
            `recurrenceInterval=${String(contract.recurrenceInterval)}, ` +
            `recurrenceDayOfMonth=${String(contract.recurrenceDayOfMonth ?? '-')}, ` +
            `daysBeforeWork=${String(contract.daysBeforeWork)}, ` +
            `startDate=${String(contract.startDate || '-')}, ` +
            `lastAutoWorkGenerated=${String(contract.lastAutoWorkGenerated || '-')}, ` +
            `locationNames=${JSON.stringify(Array.isArray(contract.locationNames) ? contract.locationNames : (contract.locationName ? [contract.locationName] : []))}, ` +
            `equipmentIdsCount=${Array.isArray(contract.equipmentIds) ? contract.equipmentIds.length : 0}`
          )
        } catch {}

        // Calculează data următoarei revizii (identic cu scheduled)
        let nextReviewDate: Date
        if (contract.lastAutoWorkGenerated) {
          const lastGenerated = new Date(contract.lastAutoWorkGenerated)
          const startDateRaw = contract.startDate ? new Date(contract.startDate) : null
          const shouldUseStart =
            !!startDateRaw && !isNaN(startDateRaw.getTime()) && lastGenerated < startDateRaw
          if (shouldUseStart) {
            console.log(`(callable) Contract ${contractId}: lastAutoWorkGenerated < startDate → using startDate as baseline`)
          }
          const baseline = shouldUseStart && startDateRaw ? startDateRaw : lastGenerated
          const useBaselineOnly = !!shouldUseStart
          if (contract.recurrenceUnit === 'luni') {
            nextReviewDate = new Date(baseline)
            if (!useBaselineOnly) {
              nextReviewDate.setMonth(nextReviewDate.getMonth() + contract.recurrenceInterval)
            } else {
              console.log(`(callable) Contract ${contractId}: baseline is startDate → NOT advancing months for first review`)
            }
            if (!useBaselineOnly && contract.recurrenceDayOfMonth && contract.recurrenceDayOfMonth >= 1 && contract.recurrenceDayOfMonth <= 31) {
              nextReviewDate.setDate(Math.min(contract.recurrenceDayOfMonth, new Date(nextReviewDate.getFullYear(), nextReviewDate.getMonth() + 1, 0).getDate()))
            }
          } else {
            nextReviewDate = new Date(baseline)
            if (!useBaselineOnly) {
              nextReviewDate.setDate(nextReviewDate.getDate() + contract.recurrenceInterval)
            } else {
              console.log(`(callable) Contract ${contractId}: baseline is startDate → NOT advancing days for first review`)
            }
          }
        } else {
          const startDate = contract.startDate ? new Date(contract.startDate) : new Date(now)
          if (contract.recurrenceUnit === 'luni') {
            nextReviewDate = new Date(startDate)
            if (!contract.startDate) {
              nextReviewDate.setMonth(nextReviewDate.getMonth() + contract.recurrenceInterval)
            }
            if (!contract.startDate && contract.recurrenceDayOfMonth && contract.recurrenceDayOfMonth >= 1 && contract.recurrenceDayOfMonth <= 31) {
              nextReviewDate.setDate(Math.min(contract.recurrenceDayOfMonth, new Date(nextReviewDate.getFullYear(), nextReviewDate.getMonth() + 1, 0).getDate()))
            }
          } else {
            nextReviewDate = new Date(startDate)
            if (!contract.startDate) {
              nextReviewDate.setDate(nextReviewDate.getDate() + contract.recurrenceInterval)
            }
          }
        }

        const daysBeforeWork = contract.daysBeforeWork || 10
        const reviewKey = toDayKey(nextReviewDate, tz)
        const generateKey = shiftDayKey(reviewKey, -daysBeforeWork)
        const lastReviewKey = contract.lastAutoWorkGenerated ? toDayKey(new Date(contract.lastAutoWorkGenerated), tz) : ''

        console.log(`(callable) Contract ${contractId}: computed nextReviewDate=${nextReviewDate.toISOString()}, reviewKey=${reviewKey}, generateKey=${generateKey}, todayKey=${todayKey}, lastReviewKey=${lastReviewKey || 'none'}, daysBeforeWork=${daysBeforeWork}`)

        if (todayKey >= generateKey) {
          let targetReviewKey = reviewKey
          if (lastReviewKey && lastReviewKey >= reviewKey) {
            const lastGenerateKey = shiftDayKey(lastReviewKey, -daysBeforeWork)
            if (todayKey >= lastGenerateKey) {
              targetReviewKey = lastReviewKey
            }
          }
          const targetReviewDate = dayKeyToUtcDate(targetReviewKey)
          if (!contract.clientId) {
            console.log(`Contract ${contractId} has no client, skipping`)
            return
          }

          const clientDoc = await db.collection('clienti').doc(contract.clientId).get()
          if (!clientDoc.exists) {
            console.log(`Client ${contract.clientId} not found for contract ${contractId}, skipping`)
            return
          }
          const client = clientDoc.data()!

          const allClientLocations: any[] = Array.isArray((client as any).locatii) ? (client as any).locatii : []
          const locationNames: string[] = Array.isArray(contract.locationNames) ? contract.locationNames : (
            contract.locationName ? [contract.locationName] : []
          )
          const targetLocations = locationNames.length > 0 ? locationNames : (contract.locationName ? [contract.locationName] : [])
          if (targetLocations.length === 0) {
            console.log(`No location specified for contract ${contractId}, skipping`)
            return
          }

          // Idempotency: să nu creăm din nou în aceeași zi
          const startOfDay = new Date(targetReviewDate)
          startOfDay.setHours(0, 0, 0, 0)
          const endOfDay = new Date(startOfDay)
          endOfDay.setDate(endOfDay.getDate() + 1)

          const allEquipments: string[] = Array.isArray(contract.equipmentIds) ? contract.equipmentIds : []

          let createdForThisContract = 0
          for (const locName of targetLocations) {
            const location = allClientLocations.find((l: any) => String(l?.nume) === String(locName))
            if (!location) {
              console.log(`Location ${locName} not found for contract ${contractId}, skipping location`)
              continue
            }

            const locationEquipmentCodes = new Set<string>((location.echipamente || []).map((e: any) => e.id || e.cod))
            const equipmentForLocation = allEquipments.filter((code) => locationEquipmentCodes.has(code))
            console.log(
              `(callable) Match for ${contractId} @ ${locName}: ` +
              `locEquipCount=${locationEquipmentCodes.size}, contractEquipCount=${allEquipments.length}, matched=${equipmentForLocation.length}`
            )

            if (equipmentForLocation.length === 0) {
              console.log(`No equipments for location ${locName} on contract ${contractId}, skipping`)
              continue
            }

            const dupSnap = await db
              .collection('lucrari')
              .where('contractId', '==', contractId)
              .where('tipLucrare', '==', 'Revizie')
              .where('autoGenerated', '==', true)
              .where('locatie', '==', locName)
              .where('dataInterventie', '>=', admin.firestore.Timestamp.fromDate(startOfDay))
              .where('dataInterventie', '<', admin.firestore.Timestamp.fromDate(endOfDay))
              .get()

            console.log(`(callable) Idempotency check for ${contractId} @ ${locName}: existingToday=${dupSnap.size}`)
            if (!dupSnap.empty) {
              console.log(`Work already exists for contract ${contractId} at ${nextReviewDate.toISOString()} for location ${locName}, skipping`)
              continue
            }

            const primaryContact = location.persoaneContact && location.persoaneContact.length > 0
              ? location.persoaneContact[0]
              : { nume: '', telefon: '', email: '' }

            const workData = {
              client: client.nume,
              clientId: contract.clientId,
              persoanaContact: primaryContact.nume || '',
              telefon: primaryContact.telefon || client.telefon || '',
              dataEmiterii: admin.firestore.Timestamp.now(),
              dataInterventie: admin.firestore.Timestamp.fromDate(targetReviewDate),
              tipLucrare: 'Revizie',
              locatie: locName,
              descriere: 'Revizie programată automată conform contractului',
              statusLucrare: 'Listată',
              statusFacturare: 'Nefacturat',
              tehnicieni: [],
              contract: contract.number,
              contractNumber: contract.number,
              contractId: contractId,
              equipmentIds: equipmentForLocation,
              autoGenerated: true,
              createdAt: admin.firestore.Timestamp.now(),
              updatedAt: admin.firestore.Timestamp.now(),
              createdBy: 'system',
              createdByName: 'Generare Manuală',
            }
            const workId = `auto_${contractId}_${hashString(String(locName))}_${targetReviewKey.replace(/-/g, '')}`
            try {
              await db.collection('lucrari').doc(workId).create(workData)
              worksCreated++
              createdForThisContract++
            } catch (err: any) {
              if (err?.code === 6 || String(err?.message || '').includes('ALREADY_EXISTS')) {
                console.log(`(callable) Work already exists by id for contract ${contractId} at location ${locName} (id=${workId}), skipping`)
              } else {
                throw err
              }
            }
          }
          if (createdForThisContract > 0) {
            if (!lastReviewKey || targetReviewKey > lastReviewKey) {
            await db.collection('contracts').doc(contractId).update({
                lastAutoWorkGenerated: dayKeyToUtcDate(targetReviewKey).toISOString(),
              updatedAt: admin.firestore.Timestamp.now(),
            })
            }
          } else {
            console.log(`(callable) No works created for any location on contract ${contractId}; NOT updating lastAutoWorkGenerated`)
          }
        } else {
          const reason = todayKey < generateKey ? 'future_day' : 'already_generated_this_review_day'
          console.log(`(callable) Contract ${contractId}: not yet time to generate (reason=${reason}, todayKey=${todayKey}, generateKey=${generateKey}, reviewKey=${reviewKey}, lastReviewKey=${lastReviewKey || 'none'})`)
        }
      }

      if (targetContractId) {
        const doc = await db.collection('contracts').doc(targetContractId).get()
        if (!doc.exists) {
          throw new functions.https.HttpsError('not-found', 'Contractul nu există.')
        }
        await processOne(doc.id, doc.data())
      } else {
        const contractsSnapshot = await db.collection('contracts')
          .where('recurrenceInterval', '!=', null)
          .get()
        for (const contractDoc of contractsSnapshot.docs) {
          await processOne(contractDoc.id, contractDoc.data())
        }
      }

      return { ok: true, contractsProcessed, worksCreated }
    } catch (err: any) {
      console.error('Error in runGenerateScheduledWorks:', err)
      throw new functions.https.HttpsError('internal', err?.message || 'Eroare internă')
    }
  })




  