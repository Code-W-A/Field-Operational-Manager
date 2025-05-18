import { getFirestore } from "firebase/firestore"
import { getAuth } from "firebase/auth"
import { app } from "./config"

// Exportăm serviciile Firebase
export const db = getFirestore(app)
export const auth = getAuth(app)
