import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  orderBy,
  serverTimestamp,
} from "firebase/firestore"
import { db } from "./config"
import type { Client, ClientLocation, ContactPerson } from "@/types/client"
import { v4 as uuidv4 } from "uuid"

// Funcție pentru a obține toți clienții
export const getAllClients = async (): Promise<Client[]> => {
  try {
    const clientsRef = collection(db, "clients")
    const q = query(clientsRef, orderBy("name", "asc"))
    const querySnapshot = await getDocs(q)

    return querySnapshot.docs.map(
      (doc) =>
        ({
          id: doc.id,
          ...doc.data(),
        }) as Client,
    )
  } catch (error) {
    console.error("Error fetching clients:", error)
    throw error
  }
}

// Funcție pentru a obține un client după ID
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
    console.error(`Error fetching client with ID ${id}:`, error)
    throw error
  }
}

// Funcție pentru a adăuga un client nou
export const addClient = async (client: Omit<Client, "id">): Promise<string> => {
  try {
    // Asigurăm-ne că fiecare locație are un ID unic
    const clientWithIds = {
      ...client,
      locations: client.locations.map((location) => ({
        ...location,
        id: location.id || uuidv4(),
        contactPersons: location.contactPersons.map((person) => ({
          ...person,
          id: person.id || uuidv4(),
        })),
      })),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }

    const docRef = await addDoc(collection(db, "clients"), clientWithIds)
    return docRef.id
  } catch (error) {
    console.error("Error adding client:", error)
    throw error
  }
}

// Funcție pentru a actualiza un client existent
export const updateClient = async (id: string, client: Partial<Client>): Promise<void> => {
  try {
    // Asigurăm-ne că fiecare locație are un ID unic
    const clientData: Partial<Client> = { ...client }

    if (client.locations) {
      clientData.locations = client.locations.map((location) => ({
        ...location,
        id: location.id || uuidv4(),
        contactPersons: location.contactPersons.map((person) => ({
          ...person,
          id: person.id || uuidv4(),
        })),
      }))
    }

    clientData.updatedAt = serverTimestamp()

    await updateDoc(doc(db, "clients", id), clientData)
  } catch (error) {
    console.error(`Error updating client with ID ${id}:`, error)
    throw error
  }
}

// Funcție pentru a șterge un client
export const deleteClient = async (id: string): Promise<void> => {
  try {
    await deleteDoc(doc(db, "clients", id))
  } catch (error) {
    console.error(`Error deleting client with ID ${id}:`, error)
    throw error
  }
}

// Funcție pentru a obține locațiile unui client
export const getClientLocations = async (clientId: string): Promise<ClientLocation[]> => {
  try {
    const client = await getClientById(clientId)
    return client?.locations || []
  } catch (error) {
    console.error(`Error fetching locations for client ${clientId}:`, error)
    throw error
  }
}

// Funcție pentru a obține persoanele de contact pentru o locație
export const getLocationContactPersons = async (clientId: string, locationId: string): Promise<ContactPerson[]> => {
  try {
    const client = await getClientById(clientId)
    if (!client) return []

    const location = client.locations.find((loc) => loc.id === locationId)
    return location?.contactPersons || []
  } catch (error) {
    console.error(`Error fetching contact persons for location ${locationId}:`, error)
    throw error
  }
}

// Funcție pentru a adăuga o locație nouă pentru un client
export const addClientLocation = async (clientId: string, location: Omit<ClientLocation, "id">): Promise<string> => {
  try {
    const client = await getClientById(clientId)
    if (!client) throw new Error("Client not found")

    const locationId = uuidv4()
    const newLocation = {
      ...location,
      id: locationId,
      contactPersons: location.contactPersons.map((person) => ({
        ...person,
        id: uuidv4(),
      })),
    }

    const updatedLocations = [...client.locations, newLocation]

    await updateDoc(doc(db, "clients", clientId), {
      locations: updatedLocations,
      updatedAt: serverTimestamp(),
    })

    return locationId
  } catch (error) {
    console.error(`Error adding location for client ${clientId}:`, error)
    throw error
  }
}

// Funcție pentru a actualiza o locație existentă
export const updateClientLocation = async (
  clientId: string,
  locationId: string,
  locationData: Partial<ClientLocation>,
): Promise<void> => {
  try {
    const client = await getClientById(clientId)
    if (!client) throw new Error("Client not found")

    const locationIndex = client.locations.findIndex((loc) => loc.id === locationId)
    if (locationIndex === -1) throw new Error("Location not found")

    const updatedLocations = [...client.locations]
    updatedLocations[locationIndex] = {
      ...updatedLocations[locationIndex],
      ...locationData,
      id: locationId,
    }

    await updateDoc(doc(db, "clients", clientId), {
      locations: updatedLocations,
      updatedAt: serverTimestamp(),
    })
  } catch (error) {
    console.error(`Error updating location ${locationId} for client ${clientId}:`, error)
    throw error
  }
}

// Funcție pentru a șterge o locație
export const deleteClientLocation = async (clientId: string, locationId: string): Promise<void> => {
  try {
    const client = await getClientById(clientId)
    if (!client) throw new Error("Client not found")

    const updatedLocations = client.locations.filter((loc) => loc.id !== locationId)

    await updateDoc(doc(db, "clients", clientId), {
      locations: updatedLocations,
      updatedAt: serverTimestamp(),
    })
  } catch (error) {
    console.error(`Error deleting location ${locationId} for client ${clientId}:`, error)
    throw error
  }
}

// Funcție pentru a adăuga o persoană de contact la o locație
export const addContactPerson = async (
  clientId: string,
  locationId: string,
  person: Omit<ContactPerson, "id">,
): Promise<string> => {
  try {
    const client = await getClientById(clientId)
    if (!client) throw new Error("Client not found")

    const locationIndex = client.locations.findIndex((loc) => loc.id === locationId)
    if (locationIndex === -1) throw new Error("Location not found")

    const personId = uuidv4()
    const newPerson = { ...person, id: personId }

    const updatedLocations = [...client.locations]
    updatedLocations[locationIndex] = {
      ...updatedLocations[locationIndex],
      contactPersons: [...updatedLocations[locationIndex].contactPersons, newPerson],
    }

    await updateDoc(doc(db, "clients", clientId), {
      locations: updatedLocations,
      updatedAt: serverTimestamp(),
    })

    return personId
  } catch (error) {
    console.error(`Error adding contact person for location ${locationId}:`, error)
    throw error
  }
}

// Funcție pentru a actualiza o persoană de contact
export const updateContactPerson = async (
  clientId: string,
  locationId: string,
  personId: string,
  personData: Partial<ContactPerson>,
): Promise<void> => {
  try {
    const client = await getClientById(clientId)
    if (!client) throw new Error("Client not found")

    const locationIndex = client.locations.findIndex((loc) => loc.id === locationId)
    if (locationIndex === -1) throw new Error("Location not found")

    const personIndex = client.locations[locationIndex].contactPersons.findIndex((p) => p.id === personId)
    if (personIndex === -1) throw new Error("Contact person not found")

    const updatedLocations = [...client.locations]
    updatedLocations[locationIndex] = {
      ...updatedLocations[locationIndex],
      contactPersons: [...updatedLocations[locationIndex].contactPersons],
    }

    updatedLocations[locationIndex].contactPersons[personIndex] = {
      ...updatedLocations[locationIndex].contactPersons[personIndex],
      ...personData,
      id: personId,
    }

    await updateDoc(doc(db, "clients", clientId), {
      locations: updatedLocations,
      updatedAt: serverTimestamp(),
    })
  } catch (error) {
    console.error(`Error updating contact person ${personId}:`, error)
    throw error
  }
}

// Funcție pentru a șterge o persoană de contact
export const deleteContactPerson = async (clientId: string, locationId: string, personId: string): Promise<void> => {
  try {
    const client = await getClientById(clientId)
    if (!client) throw new Error("Client not found")

    const locationIndex = client.locations.findIndex((loc) => loc.id === locationId)
    if (locationIndex === -1) throw new Error("Location not found")

    const updatedLocations = [...client.locations]
    updatedLocations[locationIndex] = {
      ...updatedLocations[locationIndex],
      contactPersons: updatedLocations[locationIndex].contactPersons.filter((p) => p.id !== personId),
    }

    await updateDoc(doc(db, "clients", clientId), {
      locations: updatedLocations,
      updatedAt: serverTimestamp(),
    })
  } catch (error) {
    console.error(`Error deleting contact person ${personId}:`, error)
    throw error
  }
}
