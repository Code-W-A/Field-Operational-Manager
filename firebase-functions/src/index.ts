import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'

admin.initializeApp()

// Scheduled function care rulează la fiecare 5 minute (Europe/Bucharest)
export const generateScheduledWorks = functions
  .region('europe-west1')
  .pubsub
  .schedule('*/5 * * * *')
  .timeZone('Europe/Bucharest')
  .onRun(async (_context: functions.EventContext) => {
    const db = admin.firestore()
    const now = new Date()
    
    console.log(`[${now.toISOString()}] Starting scheduled work generation`)
    
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
        
        contractsProcessed++
        
        // 2. Calculează data următoarei revizii
        let nextReviewDate: Date
        
        if (contract.lastAutoWorkGenerated) {
          // Avem o lucrare generată anterior, calculăm următoarea
          const lastGenerated = new Date(contract.lastAutoWorkGenerated)
          
          if (contract.recurrenceUnit === 'luni') {
            nextReviewDate = new Date(lastGenerated)
            nextReviewDate.setMonth(nextReviewDate.getMonth() + contract.recurrenceInterval)
            
            // Dacă există o zi specifică din lună setată, o aplicăm
            if (contract.recurrenceDayOfMonth && contract.recurrenceDayOfMonth >= 1 && contract.recurrenceDayOfMonth <= 31) {
              nextReviewDate.setDate(Math.min(contract.recurrenceDayOfMonth, new Date(nextReviewDate.getFullYear(), nextReviewDate.getMonth() + 1, 0).getDate()))
            }
          } else {
            // zile
            nextReviewDate = new Date(lastGenerated)
            nextReviewDate.setDate(nextReviewDate.getDate() + contract.recurrenceInterval)
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
            if (contract.recurrenceDayOfMonth && contract.recurrenceDayOfMonth >= 1 && contract.recurrenceDayOfMonth <= 31) {
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
        
        // 3. Verifică dacă trebuie să generăm lucrarea acum
        // Lucrarea se generează cu "daysBeforeWork" zile înainte de data reviziei
        const daysBeforeWork = contract.daysBeforeWork || 10
        const generateDate = new Date(nextReviewDate)
        generateDate.setDate(generateDate.getDate() - daysBeforeWork)
        
        // Verificăm dacă am depășit sau suntem exact în ziua de generare
        if (now >= generateDate && (!contract.lastAutoWorkGenerated || new Date(contract.lastAutoWorkGenerated) < generateDate)) {
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

          const startOfDay = new Date(nextReviewDate)
          startOfDay.setHours(0, 0, 0, 0)
          const endOfDay = new Date(startOfDay)
          endOfDay.setDate(endOfDay.getDate() + 1)

          for (const locName of targetLocations) {
            const location = findLocationByName(locName)
            if (!location) {
              console.log(`Location ${locName} not found for contract ${contractId}, skipping this location`)
              continue
            }

            // Echipamentele pentru această locație: dacă avem lista generală, o filtrăm după ce există în locație.
            const locationEquipmentCodes = new Set<string>((location.echipamente || []).map((e: any) => e.id || e.cod))
            const equipmentForLocation = allEquipments.filter((code) => locationEquipmentCodes.has(code))

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
              dataInterventie: admin.firestore.Timestamp.fromDate(nextReviewDate),
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
            await db.collection('lucrari').add(workData)
            worksCreated++
            console.log(`Created Revizie work for contract ${contractId} at location ${locName} with ${equipmentForLocation.length} equipments`)
          }
          
          // 4. Actualizează contract.lastAutoWorkGenerated
          await db.collection('contracts').doc(contractId).update({
            lastAutoWorkGenerated: now.toISOString(),
            updatedAt: admin.firestore.Timestamp.now(),
          })
          
          console.log(`Updated lastAutoWorkGenerated for contract ${contractId}`)
        } else {
          console.log(`Contract ${contractId}: not yet time to generate (generateDate: ${generateDate.toISOString()})`)
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

        // Calculează data următoarei revizii (identic cu scheduled)
        let nextReviewDate: Date
        if (contract.lastAutoWorkGenerated) {
          const lastGenerated = new Date(contract.lastAutoWorkGenerated)
          if (contract.recurrenceUnit === 'luni') {
            nextReviewDate = new Date(lastGenerated)
            nextReviewDate.setMonth(nextReviewDate.getMonth() + contract.recurrenceInterval)
            if (contract.recurrenceDayOfMonth && contract.recurrenceDayOfMonth >= 1 && contract.recurrenceDayOfMonth <= 31) {
              nextReviewDate.setDate(Math.min(contract.recurrenceDayOfMonth, new Date(nextReviewDate.getFullYear(), nextReviewDate.getMonth() + 1, 0).getDate()))
            }
          } else {
            nextReviewDate = new Date(lastGenerated)
            nextReviewDate.setDate(nextReviewDate.getDate() + contract.recurrenceInterval)
          }
        } else {
          const startDate = contract.startDate ? new Date(contract.startDate) : new Date(now)
          if (contract.recurrenceUnit === 'luni') {
            nextReviewDate = new Date(startDate)
            if (!contract.startDate) {
              nextReviewDate.setMonth(nextReviewDate.getMonth() + contract.recurrenceInterval)
            }
            if (contract.recurrenceDayOfMonth && contract.recurrenceDayOfMonth >= 1 && contract.recurrenceDayOfMonth <= 31) {
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
        const generateDate = new Date(nextReviewDate)
        generateDate.setDate(generateDate.getDate() - daysBeforeWork)

        if (now >= generateDate && (!contract.lastAutoWorkGenerated || new Date(contract.lastAutoWorkGenerated) < generateDate)) {
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
          const startOfDay = new Date(nextReviewDate)
          startOfDay.setHours(0, 0, 0, 0)
          const endOfDay = new Date(startOfDay)
          endOfDay.setDate(endOfDay.getDate() + 1)

          const allEquipments: string[] = Array.isArray(contract.equipmentIds) ? contract.equipmentIds : []

          for (const locName of targetLocations) {
            const location = allClientLocations.find((l: any) => String(l?.nume) === String(locName))
            if (!location) {
              console.log(`Location ${locName} not found for contract ${contractId}, skipping location`)
              continue
            }

            const locationEquipmentCodes = new Set<string>((location.echipamente || []).map((e: any) => e.id || e.cod))
            const equipmentForLocation = allEquipments.filter((code) => locationEquipmentCodes.has(code))

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
              dataInterventie: admin.firestore.Timestamp.fromDate(nextReviewDate),
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
            await db.collection('lucrari').add(workData)
            worksCreated++
          }
          await db.collection('contracts').doc(contractId).update({
            lastAutoWorkGenerated: now.toISOString(),
            updatedAt: admin.firestore.Timestamp.now(),
          })
        } else {
          console.log(`Contract ${contractId}: not yet time to generate (generateDate: ${generateDate.toISOString()})`)
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

