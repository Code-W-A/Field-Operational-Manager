import { getFirestore } from "firebase/firestore"
import { app } from "./config"

// Exportăm serviciile Firebase
export const db = getFirestore(app)
