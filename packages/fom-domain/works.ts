import type {
  DocumentClientSnapshot,
  OfferResponseCertifiedPdf,
} from "./documents";
import type { WorkRevisionMeta } from "./revision";
import type { InstallationMeta } from "./installation";
/** Existing Firestore schema, no mobile replacement schema or migration. Timestamp type is supplied by the adapter. */
export interface PersoanaContact {
  id?: string;
  nume: string;
  telefon: string;
  email?: string;
  functie?: string;
}

export interface Lucrare<TTimestamp = unknown> {
  id?: string;
  client: string;
  persoanaContact: string;
  // Backward-compatible IDs (optional): help resolve live client/location data even if names change
  clientId?: string;
  locationId?: string;
  contactId?: string;
  contactSync?: {
    clientId: string;
    locationId?: string;
    contactId?: string;
    values: Record<string, string>;
    conflicts: string[];
  };
  locationName?: string;
  persoanaContactEmail?: string;
  telefon: string;
  dataEmiterii: string;
  dataInterventie: string;
  tipLucrare: string;
  locatie: string;
  echipament?: string;
  echipamentCod?: string;
  echipamentModel?: string;
  descriere: string;
  // Notă internă introdusă la creare de către dispecer/admin
  statusLucrare: string;
  statusFacturare: string;
  tehnicieni: string[];
  technicianIds?: string[];
  equipmentId?: string;
  echipamentId?: string;
  revisionEquipmentTimes?: Record<
    string,
    {
      startIso: string;
      endIso?: string;
      durationMinutes?: number;
      durationText?: string;
    }
  >;
  descriereInterventie?: string;
  constatareLaLocatie?: string;
  contract?: string;
  contractNumber?: string;
  contractType?: string;
  defectReclamat?: string;
  cauzaPrincipalaDefectId?: string;
  cauzaPrincipalaDefect?: string;
  // Istoric defecte reclamate: [original, RE1, RE2, ...]
  defectReclamatHistory?: string[];
  // Text suplimentar specific reintervenției (doar pentru lucrări create ca reintervenție)
  textReinterventie?: string;
  // Câmpuri noi pentru verificarea echipamentului
  equipmentVerified?: boolean;
  equipmentVerifiedAt?: string;
  equipmentVerifiedBy?: string;
  createdAt?: TTimestamp;
  updatedAt?: TTimestamp;
  createdBy?: string;
  updatedBy?: string;
  createdByName?: string;
  updatedByName?: string;
  // Add new field for all contact persons
  persoaneContact?: PersoanaContact[];
  // Add new field for dispatcher pickup status
  preluatDispecer?: boolean;
  // Cine a preluat lucrarea (numele dispecerului/adminului)
  preluatDe?: string;
  raportGenerat?: boolean;
  // Adăugăm câmpul pentru statusul echipamentului
  statusEchipament?: string;
  // Adăugăm câmpul pentru necesitatea unei oferte
  necesitaOferta?: boolean;
  // Câmpuri pentru ofertă (conținut + istoric). Tipurile sunt relaxate pentru compatibilitate.
  products?: ProductItem[];
  offerTotal?: number;
  offerAdjustmentPercent?: number;
  offerSendCount?: number;
  offerPreparedBy?: string;
  offerPreparedAt?: any;
  offerVersions?: Array<{
    clientSnapshot?: DocumentClientSnapshot;
    savedAt: any;
    savedBy?: string;
    total: number;
    products: ProductItem[];
    vatPercent?: number;
    adjustmentPercent?: number;
    conditions?: string[];
  }>;
  // Răspuns ofertă (accept / reject) – backward compatible
  offerResponse?: {
    status: "accept" | "reject";
    reason?: string;
    at: any;
    by?: string;
    verifiedEmail?: string;
    versionSavedAt?: string | null;
  };
  // Istoric complet răspunsuri client la ofertă (append-only, backward compatible)
  offerResponsesHistory?: Array<{
    status: "accept" | "reject";
    reason?: string;
    at: any;
    by?: string;
    verifiedEmail?: string;
    versionSavedAt?: string | null;
    offerSendCountAtResponse?: number;
    tokenUsed?: string;
    responseProofHash?: string;
  }>;
  // Token de acțiune pentru ofertă (link din email)
  offerActionToken?: string;
  offerActionExpiresAt?: any;
  offerActionUsedAt?: any;
  // Adăugăm câmpul pentru comentarii legate de ofertă
  comentariiOferta?: string;
  // Câmpuri pentru deviz - separate complet de ofertă
  devizProducts?: ProductItem[];
  devizTotal?: number;
  devizVAT?: number;
  devizAdjustmentPercent?: number;
  devizSendCount?: number;
  devizPreparedBy?: string;
  devizPreparedAt?: any;
  devizClientSnapshot?: DocumentClientSnapshot | null;
  devizVersions?: Array<{
    clientSnapshot?: DocumentClientSnapshot;
    savedAt: any;
    savedBy?: string;
    total: number;
    products: ProductItem[];
  }>;
  devizConditions?: string[];
  // Câmpuri pentru timpul de sosire și plecare
  timpSosire?: string;
  dataSosire?: string;
  oraSosire?: string;
  timpPlecare?: string;
  dataPlecare?: string;
  oraPlecare?: string;
  durataInterventie?: string;
  // Câmpuri pentru semnături
  semnaturaTehnician?: string;
  semnaturaBeneficiar?: string;
  // Câmpuri pentru numele semnatarilor
  numeTehnician?: string;
  numeBeneficiar?: string;
  // Câmp pentru informații client
  clientInfo?: any;
  // CÂMPURI NOI PENTRU BLOCAREA DATELOR RAPORT - BACKWARD COMPATIBLE
  // Snapshot-ul datelor la prima generare a raportului
  raportSnapshot?: {
    clientSnapshot?: DocumentClientSnapshot;
    timpPlecare: string;
    dataPlecare: string;
    oraPlecare: string;
    durataInterventie: string;
    products: ProductItem[];
    constatareLaLocatie?: string;
    descriereInterventie?: string;
    cauzaPrincipalaDefectId?: string;
    cauzaPrincipalaDefect?: string;
    semnaturaTehnician?: string;
    semnaturaBeneficiar?: string;
    numeTehnician?: string;
    numeBeneficiar?: string;
    imaginiDefecte?: InterventionPhoto[];
    dataGenerare: string; // când a fost generat prima dată
    // Feedback client înghețat în snapshot
    clientRating?: number;
    clientReview?: string;
  };
  // Flag pentru a indica că datele sunt blocate
  raportDataLocked?: boolean;
  // CÂMPURI NOI PENTRU GARANȚIE - BACKWARD COMPATIBLE
  // Aplicabile doar pentru "Intervenție în garanție"
  garantieVerificata?: boolean; // Dacă tehnicianul a verificat garanția prin QR code
  esteInGarantie?: boolean; // Declarația tehnicianului dacă echipamentul e în garanție
  garantieExpira?: string; // Data când expiră garanția (calculată automat)
  garantieZileRamase?: number; // Câte zile mai are garanție (calculat automat)
  // CÂMP NOU PENTRU STATUS FINALIZARE INTERVENȚIE - BACKWARD COMPATIBLE
  statusFinalizareInterventie?: "FINALIZAT" | "NEFINALIZAT"; // Status-ul finalizării intervenției (independent de statusLucrare)
  // CÂMP NOU PENTRU REFERINȚĂ LA LUCRAREA ORIGINALĂ - BACKWARD COMPATIBLE
  lucrareOriginala?: string; // ID-ul lucrării originale în caz de reatribuire
  mesajReatribuire?: string; // Mesajul de reatribuire (ex: "reintervenită în urma lucrării x")
  // CÂMP NOU PENTRU CONFIRMAREA GARANȚIEI DE CĂTRE TEHNICIAN - BACKWARD COMPATIBLE
  /** Păstrat derivat: true când `tehnicianGarantieDecizie === "confirma"`. */
  tehnicianConfirmaGarantie?: boolean;
  /** Alegere explicită a tehnicianului (Intervenție în garanție). */
  tehnicianGarantieDecizie?: "confirma" | "nu_intra" | "dupa_atelier";
  /** Justificare obligatorie când `tehnicianGarantieDecizie === "nu_intra"`. */
  tehnicianGarantieNuIntraMotiv?: string;
  statusOferta?: "NU" | "DA" | "OFERTAT"; // Nou câmp pentru managementul statusului ofertei
  offerPipelineStage?:
    "OFERTA_TRANSMISA" | "OFERTA_ACCEPTATA" | "OFERTA_REFUZATA";
  // CÂMP NOU PENTRU NUMĂRUL FACTURII - BACKWARD COMPATIBLE
  numarFactura?: string; // Numărul facturii (opțional, pentru lucrările facturate)
  // CÂMP NOU PENTRU MOTIV NEFACTURARE - BACKWARD COMPATIBLE
  motivNefacturare?: string; // Motivul pentru care nu se facturează
  // CÂMP NOU PENTRU NUMĂRUL RAPORTULUI - BACKWARD COMPATIBLE
  numarRaport?: string; // Numărul raportului (format: #00001, generat automat la prima generare raport)
  // CÂMP NOU PENTRU NUMĂR LUCRARE - BACKWARD COMPATIBLE (egal cu numarRaport la generare)
  nrLucrare?: string;
  // CÂMPURI NOI PENTRU DOCUMENTE PDF - BACKWARD COMPATIBLE
  facturaDocument?: {
    url: string; // URL-ul documentului în Firebase Storage
    fileName: string; // Numele original al fișierului
    uploadedAt: string; // Data încărcării
    uploadedBy: string; // Cine a încărcat
    numarFactura: string; // Numărul facturii (editabil)
    dataFactura: string; // Data facturii (editabil)
  };
  ofertaDocument?: {
    url: string; // URL-ul documentului în Firebase Storage
    fileName: string; // Numele original al fișierului
    uploadedAt: string; // Data încărcării
    uploadedBy: string; // Cine a încărcat
    numarOferta: string; // Numărul ofertei (editabil)
    dataOferta: string; // Data ofertei (editabil)
  };
  responseCertifiedPdf?: OfferResponseCertifiedPdf;
  devizDocument?: {
    url?: string;
    fileName: string;
    uploadedAt: string;
    uploadedBy: string;
    numarDeviz: string;
    dataDeviz: string;
  };
  // CÂMPURI NOI PENTRU IMAGINI DEFECTE - BACKWARD COMPATIBLE
  imaginiDefecte?: InterventionPhoto[];
  // CÂMPURI NOI PENTRU AMÂNAREA LUCRĂRII - BACKWARD COMPATIBLE
  motivAmanare?: string; // Motivul pentru care lucrarea a fost amânată
  dataAmanare?: string; // Data când lucrarea a fost amânată
  amanataDe?: string; // Cine a amânat lucrarea (tehnicianul)
  // CÂMPURI NOI PENTRU ARHIVAREA LUCRĂRII - BACKWARD COMPATIBLE
  archivedAt?: TTimestamp; // Data și ora când lucrarea a fost arhivată
  archivedBy?: string; // Cine a arhivat lucrarea (admin/dispecer)
  // CÂMPURI PENTRU ANULAREA TICHETULUI - BACKWARD COMPATIBLE
  anulat?: boolean;
  motivAnulare?: string;
  anulatAt?: TTimestamp;
  anulatDe?: string;
  anulatDeId?: string;
  // CÂMPURI NOI PENTRU MOTIVELE REINTERVENȚIEI - BACKWARD COMPATIBLE
  reinterventieMotiv?: {
    remediereNeconforma?: boolean; // Remediere neconformă
    necesitaTimpSuplimentar?: boolean; // Necesită timp suplimentar
    necesitaPieseSuplimentare?: boolean; // Necesită piese suplimentare
    garantieInterventiei?: boolean; // Garanția intervenției (maxim 6 luni)
    motive?: string[]; // Motive dinamice din setări
    dataReinterventie?: string; // Data când s-a decis reintervenția
    decisaDe?: string; // Cine a decis reintervenția (admin/dispecer)
  };
  // CÂMP NOU: Blochează editarea unei lucrări după ce a generat reintervenții
  lockedAfterReintervention?: boolean;
  // CÂMPURI NOI: backfill/flag lansare reintervenție
  reinterventieLansata?: boolean;
  reinterventieLucrareId?: string;
  reinterventieLansataAt?: any;
  // CÂMPURI NOI PENTRU NOTIFICATION TRACKING - BACKWARD COMPATIBLE
  notificationRead?: boolean; // Backward compatibility: dacă notificarea a fost citită (general)
  notificationReadBy?: string[]; // Array cu ID-urile utilizatorilor care au citit notificarea
  // CÂMP NOU: Notă internă a tehnicianului (nu apare în raportul final)
  notaInternaTehnician?: string;
  // Feedback client – rating (1..5) și recenzie text
  clientRating?: number;
  clientReview?: string;
  // Email statuses (denormalized quick view)
  lastReportEmail?: {
    actorUid?: string;
    action?: "report-resend";
    sent?: string[];
    failed?: string[];
    sentAt?: any;
    to?: string[];
    status?: "queued" | "sent" | "failed" | "bounced" | "delivered";
    messageId?: string;
  };
  lastOfferEmail?: {
    sentAt?: any;
    to?: string[];
    status?: "queued" | "sent" | "failed" | "bounced" | "delivered";
    messageId?: string;
  };
  lastDevizEmail?: {
    sentAt?: any;
    to?: string[];
    status?: "queued" | "sent" | "failed" | "bounced" | "delivered";
    messageId?: string;
  };
  // Revizie (multi-echipament)
  equipmentIds?: string[]; // Lista echipamentelor pentru lucrarea de tip Revizie
  revision?: WorkRevisionMeta; // Metadate revizie (versiune checklist, progres)
  installation?: InstallationMeta;
}

export interface Client<TTimestamp = unknown> {
  id?: string;
  nume: string;
  adresa: string;
  email: string;
  telefon?: string; // OPȚIONAL pentru compatibilitate cu date existente
  reprezentantFirma?: string; // OPȚIONAL pentru compatibilitate cu date existente
  functieReprezentant?: string; // OPȚIONAL: funcția reprezentantului firmei
  /** Legacy fiscal alias already handled by the web document resolver. */
  cif?: string;
  persoanaContact?: string;
  cui: string;
  regCom: string;
  contBancar: string;
  banca: string;
  persoaneContact?: PersoanaContact[];
  echipamente?: Echipament[];
  contracte?: Contract[];
  locatii?: Locatie[];
  createdAt?: TTimestamp;
  updatedAt?: TTimestamp;
}

export interface Echipament {
  id?: string;
  nume: string;
  cod: string;
  model?: string;
  serie?: string;
  status?: string;
  clientId?: string;
  ultimaInterventie?: string;
  // Setări dinamice asociate echipamentului (populate automat din Setări → Formular Echipament)
  dynamicSettings?: Record<string, any>;
  // CÂMPURI NOI PENTRU GARANȚIE - BACKWARD COMPATIBLE
  dataInstalarii?: string; // Data instalării echipamentului (format DD.MM.YYYY)
  dataInstalare?: string; // Alias pentru backward compatibility
  garantieLuni?: number; // Numărul de luni de garanție (implicit 12)
  observatii?: string; // Observații despre echipament
  /** Fotografie opțională a echipamentului (Firebase Storage) */
  fotoUrl?: string;
  fotoPath?: string;
  // Documentație tehnică PDF atașată echipamentului (vizibilă pentru tehnicieni)
  documentatie?: Array<{
    url: string;
    fileName: string;
    uploadedAt: string;
    uploadedBy: string;
  }>;
  // Documentații (nou) - referință către biblioteca Documentații
  documentationFolderId?: string;
  documentationSubfolderId?: string;
  documentationFileIds?: string[];
  documentationLabel?: string;
  // Audit QR print
  lastQrPrintedAt?: string;
  lastQrPrintedBy?: string;
  lastQrPrintedById?: string;
}

export interface Contract {
  id?: string;
  name: string;
  number: string;
  clientId?: string;
  locationId?: string; // ID-ul locației selectate
  locationName?: string; // Numele locației (pentru compatibilitate)
  equipmentIds?: string[]; // Array de ID-uri echipamente selectate

  // Recurență revizii
  startDate?: string; // Data de început/referință pentru recurență (ISO string)
  recurrenceInterval?: number; // Valoarea intervalului (ex: 90)
  recurrenceUnit?: "zile" | "luni"; // Unitatea (zile sau luni)
  recurrenceDayOfMonth?: number; // Ziua din lună (1-31) - doar pentru recurență lunară
  daysBeforeWork?: number; // X zile înainte de data programată

  // Prețuri per tip serviciu
  pricing?: {
    [serviceType: string]: number; // ex: { "Revizie": 500, "Intervenție": 300 }
  };

  // Ultima dată când s-a generat o lucrare automată
  lastAutoWorkGenerated?: string;

  // Observații libere despre contract
  observatii?: string;

  // Câmpuri legacy pentru compatibilitate retroactivă
  numar?: string; // Alias pentru number
  tip?: string; // Păstrat pentru compatibilitate
  valoare?: number;
  moneda?: string;
  dataIncepere?: string;
  dataExpirare?: string;
  locatie?: string; // Alias pentru locationName

  createdAt?: any;
  updatedAt?: any;
}

export interface Locatie {
  // ID stabil pentru locație (stocat în array-ul client.locatii). Backward compatible.
  id?: string;
  nume: string;
  adresa: string;
  persoaneContact: PersoanaContact[];
  echipamente: Echipament[];
}

export interface ProductItem {
  name: string;
  quantity: number;
  price: number;
  um: string;
}

/** Existing intervention/report photo metadata, with additive Storage identity. */
export interface InterventionPhoto {
  url: string;
  fileName: string;
  uploadedAt: string;
  uploadedBy: string;
  compressed: boolean;
  id?: string;
  path?: string;
  contentType?: string;
  createdAt?: string;
}
