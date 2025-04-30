import { db } from "./config"
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  getDoc,
  getDocs,
  query,
  orderBy,
  serverTimestamp,
  deleteDoc,
} from "firebase/firestore"
import type { Client, ClientLocation, ContactPerson } from "@/types/client"
import { addLog } from "./firestore"

// Obține toți clienții
export const getAllClients = async (): Promise<Client[]> => {
  try {
    const q = query(collection(db, "clients"), orderBy("name", "asc"))
    const querySnapshot = await getDocs(q)

    return querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Client[]
  } catch (error) {
    console.error("Error getting clients:", error)
    throw error
  }
}

// Obține un client după ID
export const getClientById = async (id: string): Promise<Client | null> => {
  try {
    const docRef = doc(db, "clients", id)
    const docSnap = await getDoc(docRef)

    if (docSnap.exists()) {
      return {
        id: docSnap.id,
        ...docSnap.data(),
      } as Client
    }

    return null
  } catch (error) {
    console.error(`Error getting client with ID ${id}:`, error)
    throw error
  }
}

// Adaugă un client nou
export const addClient = async (client: Omit<Client, "id">): Promise<string> => {
  try {
    // Asigură-te că fiecare locație și persoană de contact are un ID
    const clientWithIds = {
      ...client,
      locations: client.locations.map((location) => ({
        ...location,
        id: location.id || crypto.randomUUID(),
        contactPersons: location.contactPersons.map((person) => ({
          ...person,
          id: person.id || crypto.randomUUID(),
        })),
      })),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }

    const docRef = await addDoc(collection(db, "clients"), clientWithIds)

    // Adaugă log
    await addLog("Adăugare", `Client nou adăugat: ${client.name} (CIF: ${client.cif})`, "Informație", "Clienți")

    return docRef.id
  } catch (error) {
    console.error("Error adding client:", error)
    throw error
  }
}

// Actualizează un client existent
export const updateClient = async (id: string, client: Partial<Client>): Promise<void> => {
  try {
    const docRef = doc(db, "clients", id)

    // Asigură-te că fiecare locație și persoană de contact are un ID
    const clientData = { ...client }

    if (client.locations) {
      clientData.locations = client.locations.map((location) => ({
        ...location,
        id: location.id || crypto.randomUUID(),
        contactPersons: location.contactPersons.map((person) => ({
          ...person,
          id: person.id || crypto.randomUUID(),
        })),
      }))
    }

    await updateDoc(docRef, {
      ...clientData,
      updatedAt: serverTimestamp(),
    })

    // Adaugă log
    await addLog("Actualizare", `Client actualizat: ${client.name || ""}`, "Informație", "Clienți")
  } catch (error) {
    console.error(`Error updating client with ID ${id}:`, error)
    throw error
  }
}

// Șterge un client
export const deleteClient = async (id: string): Promise<void> => {
  try {
    const clientDoc = await getClientById(id)
    const docRef = doc(db, "clients", id)
    await deleteDoc(docRef)

    // Adaugă log
    if (clientDoc) {
      await addLog("Ștergere", `Client șters: ${clientDoc.name} (CIF: ${clientDoc.cif})`, "Avertisment", "Clienți")
    }
  } catch (error) {
    console.error(`Error deleting client with ID ${id}:`, error)
    throw error
  }
}

// Obține locațiile unui client
export const getClientLocations = async (clientId: string): Promise<ClientLocation[]> => {
  try {
    const client = await getClientById(clientId)
    return client?.locations || []
  } catch (error) {
    console.error(`Error getting locations for client ${clientId}:`, error)
    throw error
  }
}

// Obține persoanele de contact pentru o locație
export const getLocationContactPersons = async (clientId: string, locationId: string): Promise<ContactPerson[]> => {
  try {
    const client = await getClientById(clientId)
    if (!client) return []

    const location = client.locations.find((loc) => loc.id === locationId)
    return location?.contactPersons || []
  } catch (error) {
    console.error(`Error getting contact persons for location ${locationId}:`, error)
    throw error
  }
}
