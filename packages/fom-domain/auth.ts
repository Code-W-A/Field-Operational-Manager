// Tipuri pentru autentificare
export type UserRole = "admin" | "dispecer" | "tehnician" | "client" | "kiosk";

export interface OfficeLocation {
  lat: number;
  lng: number;
  address: string;
}

export interface UserData<TTimestamp = Date> {
  uid: string;
  email: string | null;
  displayName: string | null;
  role: UserRole;
  disabled?: boolean;
  phoneNumber?: string;
  telefon?: string;
  notes?: string;
  // Client access: multiple clients with multiple locations
  clientAccess?: Array<{ clientId: string; locationNames: string[] }>;
  // Kiosk mode - prevents auto-logout
  isKioskMode?: boolean;
  /** 4-digit PIN used at kiosk check-in/out identity verification */
  kioskPin?: string;
  // Office location for GPS verification
  officeLocation?: OfficeLocation;
  createdAt?: TTimestamp;
  lastLogin?: TTimestamp;
  updatedAt?: TTimestamp;
  /** ID-uri documente din colecția technician_groups (doar rol tehnician) */
  technicianGroupIds?: string[];
}
