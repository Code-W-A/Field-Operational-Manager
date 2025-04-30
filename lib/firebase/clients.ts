import { db } from "./firebase"
import { collection, addDoc, updateDoc, doc, getDoc, getDocs, serverTimestamp } from "firebase/firestore"
import type { Client, ClientLocation, ContactPerson } from "@/types/client"

// Colecția pentru clienți
const CLIENTS_COLLECTION = "clients"

// Adăugare client nou
export const addClient = async (
  clientData: Omit<Client, "id" | "locations" | "createdAt" | "updatedAt">,
): Promise<Client> => {
  try {
    const newClient = {
      ...clientData,
      locations: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }

    const docRef = await addDoc(collection(db, CLIENTS_COLLECTION), newClient)

    return {
      id: docRef.id,
      ...newClient,
      locations: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as Client
  } catch (error) {
    console.error("Error adding client:", error)
    throw error
  }
}

// Actualizare client
export const updateClient = async (id: string, clientData: Partial<Client>): Promise<void> => {
  try {
    const clientRef = doc(db, CLIENTS_COLLECTION, id)
    await updateDoc(clientRef, {
      ...clientData,
      updatedAt: serverTimestamp(),
    })
  } catch (error) {
    console.error("Error updating client:", error)
    throw error
  }
}

// Adăugare locație pentru client
export const addClientLocation = async (
  clientId: string,
  locationData: Omit<ClientLocation, "id" | "contactPersons" | "equipment">,
): Promise<ClientLocation> => {
  try {
    const clientRef = doc(db, CLIENTS_COLLECTION, clientId)
    const clientSnap = await getDoc(clientRef)

    if (!clientSnap.exists()) {
      throw new Error("Client not found")
    }

    const client = { id: clientSnap.id, ...clientSnap.data() } as Client

    const newLocation: ClientLocation = {
      id: Date.now().toString(), // Generăm un ID unic
      ...locationData,
      contactPersons: [],
      equipment: [],
    }

    const updatedLocations = [...client.locations, newLocation]

    await updateDoc(clientRef, {
      locations: updatedLocations,
      updatedAt: serverTimestamp(),
    })

    return newLocation
  } catch (error) {
    console.error("Error adding client location:", error)
    throw error
  }
}

// Actualizare locație pentru client
export const updateClientLocation = async (
  clientId: string,
  locationId: string,
  locationData: Partial<ClientLocation>,
): Promise<void> => {
  try {
    const clientRef = doc(db, CLIENTS_COLLECTION, clientId)
    const clientSnap = await getDoc(clientRef)

    if (!clientSnap.exists()) {
      throw new Error("Client not found")
    }

    const client = { id: clientSnap.id, ...clientSnap.data() } as Client

    const updatedLocations = client.locations.map((location) => {
      if (location.id === locationId) {
        return { ...location, ...locationData }
      }
      return location
    })

    await updateDoc(clientRef, {
      locations: updatedLocations,
      updatedAt: serverTimestamp(),
    })
  } catch (error) {
    console.error("Error updating client location:", error)
    throw error
  }
}

// Ștergere locație pentru client
export const deleteClientLocation = async (clientId: string, locationId: string): Promise<void> => {
  try {
    const clientRef = doc(db, CLIENTS_COLLECTION, clientId)
    const clientSnap = await getDoc(clientRef)

    if (!clientSnap.exists()) {
      throw new Error("Client not found")
    }

    const client = { id: clientSnap.id, ...clientSnap.data() } as Client

    const updatedLocations = client.locations.filter((location) => location.id !== locationId)

    await updateDoc(clientRef, {
      locations: updatedLocations,
      updatedAt: serverTimestamp(),
    })
  } catch (error) {
    console.error("Error deleting client location:", error)
    throw error
  }
}

// Adăugare persoană de contact pentru o locație
export const addContactPerson = async (
  clientId: string,
  locationId: string,
  personData: Omit<ContactPerson, "id">,
): Promise<ContactPerson> => {
  try {
    const clientRef = doc(db, CLIENTS_COLLECTION, clientId)
    const clientSnap = await getDoc(clientRef)

    if (!clientSnap.exists()) {
      throw new Error("Client not found")
    }

    const client = { id: clientSnap.id, ...clientSnap.data() } as Client

    const locationIndex = client.locations.findIndex((location) => location.id === locationId)

    if (locationIndex === -1) {
      throw new Error("Location not found")
    }

    const newPerson: ContactPerson = {
      id: Date.now().toString(), // Generăm un ID unic
      ...personData,
    }

    const updatedLocations = [...client.locations]
    updatedLocations[locationIndex] = {
      ...updatedLocations[locationIndex],
      contactPersons: [...updatedLocations[locationIndex].contactPersons, newPerson],
    }

    await updateDoc(clientRef, {
      locations: updatedLocations,
      updatedAt: serverTimestamp(),
    })

    return newPerson
  } catch (error) {
    console.error("Error adding contact person:", error)
    throw error
  }
}

// Actualizare persoană de contact
export const updateContactPerson = async (
  clientId: string,
  locationId: string,
  personId: string,
  personData: Partial<ContactPerson>,
): Promise<void> => {
  try {
    const clientRef = doc(db, CLIENTS_COLLECTION, clientId)
    const clientSnap = await getDoc(clientRef)

    if (!clientSnap.exists()) {
      throw new Error("Client not found")
    }

    const client = { id: clientSnap.id, ...clientSnap.data() } as Client

    const locationIndex = client.locations.findIndex((location) => location.id === locationId)

    if (locationIndex === -1) {
      throw new Error("Location not found")
    }

    const updatedLocations = [...client.locations]
    const updatedContactPersons = updatedLocations[locationIndex].contactPersons.map((person) => {
      if (person.id === personId) {
        return { ...person, ...personData }
      }
      return person
    })

    updatedLocations[locationIndex] = {
      ...updatedLocations[locationIndex],
      contactPersons: updatedContactPersons,
    }

    await updateDoc(clientRef, {
      locations: updatedLocations,
      updatedAt: serverTimestamp(),
    })
  } catch (error) {
    console.error("Error updating contact person:", error)
    throw error
  }
}

// Ștergere persoană de contact
export const deleteContactPerson = async (clientId: string, locationId: string, personId: string): Promise<void> => {
  try {
    const clientRef = doc(db, CLIENTS_COLLECTION, clientId)
    const clientSnap = await getDoc(clientRef)

    if (!clientSnap.exists()) {
      throw new Error("Client not found")
    }

    const client = { id: clientSnap.id, ...clientSnap.data() } as Client

    const locationIndex = client.locations.findIndex((location) => location.id === locationId)

    if (locationIndex === -1) {
      throw new Error("Location not found")
    }

    const updatedLocations = [...client.locations]
    const updatedContactPersons = updatedLocations[locationIndex].contactPersons.filter(
      (person) => person.id !== personId,
    )

    updatedLocations[locationIndex] = {
      ...updatedLocations[locationIndex],
      contactPersons: updatedContactPersons,
    }

    await updateDoc(clientRef, {
      locations: updatedLocations,
      updatedAt: serverTimestamp(),
    })
  } catch (error) {
    console.error("Error deleting contact person:", error)
    throw error
  }
}

// Obținere client după ID
export const getClientById = async (id: string): Promise<Client | null> => {
  try {
    const clientRef = doc(db, CLIENTS_COLLECTION, id)
    const clientSnap = await getDoc(clientRef)

    if (clientSnap.exists()) {
      return { id: clientSnap.id, ...clientSnap.data() } as Client
    }

    return null
  } catch (error) {
    console.error("Error getting client:", error)
    throw error
  }
}

// Obținere toți clienții
export const getAllClients = async (): Promise<Client[]> => {
  try {
    const querySnapshot = await getDocs(collection(db, CLIENTS_COLLECTION))
    return querySnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Client)
  } catch (error) {
    console.error("Error getting all clients:", error)
    throw error
  }
}
