export type SettingsTarget = {
  id: string
  label: string
  kind: "list" | "value" | "flag"
}

export const SETTINGS_TARGETS: SettingsTarget[] = [
  // Lucrări
  {
    id: "works.create.reinterventionReasons",
    label: "Dialog: Reintervenție → Motive",
    kind: "list",
  },
  {
    id: "works.create.workTypes",
    label: "Formular Lucrare → Tipuri lucrare",
    kind: "list",
  },
  {
    id: "works.create.priorityLevels",
    label: "Formular Lucrare → Niveluri prioritate",
    kind: "list",
  },
  {
    id: "works.create.postponeReasons",
    label: "Formular Lucrare → Motive amânare",
    kind: "list",
  },
  {
    id: "works.create.cancelReasons",
    label: "Formular Lucrare → Motive anulare",
    kind: "list",
  },
  {
    id: "works.create.failureCauses",
    label: "Formular Lucrare → Cauze defect",
    kind: "list",
  },
  {
    id: "works.create.actionsPerformed",
    label: "Formular Lucrare → Acțiuni efectuate",
    kind: "list",
  },
  {
    id: "works.create.materials",
    label: "Formular Lucrare → Materiale propuse",
    kind: "list",
  },
  {
    id: "works.create.timeSlots",
    label: "Formular Lucrare → Interval orar",
    kind: "list",
  },

  // Clienți
  {
    id: "clients.create.clientCategories",
    label: "Formular Client → Categorii client",
    kind: "list",
  },
  {
    id: "clients.create.contactRoles",
    label: "Formular Client → Roluri persoană de contact",
    kind: "list",
  },
  {
    id: "clients.create.locationTypes",
    label: "Formular Client → Tipuri locație",
    kind: "list",
  },
  {
    id: "clients.create.defaultCurrency",
    label: "Formular Client → Monedă implicită",
    kind: "value",
  },
  {
    id: "clients.create.hasContractFlag",
    label: "Formular Client → Are contract (implic.)",
    kind: "flag",
  },

  // Echipamente
  {
    id: "equipment.create.types",
    label: "Formular Echipament → Tipuri echipament",
    kind: "list",
  },
  {
    id: "equipment.create.brands",
    label: "Formular Echipament → Branduri",
    kind: "list",
  },
  {
    id: "equipment.create.models",
    label: "Formular Echipament → Modele",
    kind: "list",
  },
  {
    id: "equipment.create.states",
    label: "Formular Echipament → Stări",
    kind: "list",
  },
  {
    id: "equipment.create.locationAreas",
    label: "Formular Echipament → Zone locație",
    kind: "list",
  },
  {
    id: "equipment.create.serialPrefix",
    label: "Formular Echipament → Prefix serie implicit",
    kind: "value",
  },
  {
    id: "equipment.create.requiresDocsFlag",
    label: "Formular Echipament → Necesită documentații",
    kind: "flag",
  },

  // Oferte
  {
    id: "offer.validityDays",
    label: "Ofertă → Zile valabilitate link",
    kind: "value",
  },
  {
    id: "offer.paymentTermsOptions",
    label: "Ofertă → Opțiuni termeni plată",
    kind: "list",
  },
  {
    id: "offer.deliveryTermsOptions",
    label: "Ofertă → Opțiuni termeni livrare",
    kind: "list",
  },
  {
    id: "offer.installationTermsOptions",
    label: "Ofertă → Opțiuni termeni instalare",
    kind: "list",
  },
  {
    id: "offer.defaultVatPercent",
    label: "Ofertă → TVA implicit (%)",
    kind: "value",
  },

  // Contracte
  {
    id: "contracts.create.types",
    label: "Formular Contract → Tipuri contract",
    kind: "list",
  },
  {
    id: "contracts.create.paymentModels",
    label: "Formular Contract → Modele plată",
    kind: "list",
  },

  // Utilizatori
  {
    id: "users.create.roles",
    label: "Formular Utilizator → Roluri disponibile",
    kind: "list",
  },
  {
    id: "users.create.defaultRole",
    label: "Formular Utilizator → Rol implicit",
    kind: "value",
  },

  // UI Flags
  {
    id: "ui.flags.scanQRCode",
    label: "UI → Activează scanare QR",
    kind: "flag",
  },
  {
    id: "ui.flags.enableAdvancedFiltering",
    label: "UI → Filtrare avansată",
    kind: "flag",
  },
  {
    id: "ui.flags.showBetaFeatures",
    label: "UI → Afișează funcții beta",
    kind: "flag",
  },
  
  // Dialog-level generic targets (bind any top-level setting to these to auto-render dropdowns)
  {
    id: "dialogs.equipment.new",
    label: "Dialog: Echipament Nou",
    kind: "list",
  },
  {
    id: "dialogs.work.new",
    label: "Dialog: Lucrare Nouă",
    kind: "list",
  },
  {
    id: "dialogs.client.new",
    label: "Dialog: Client Nou",
    kind: "list",
  },
  {
    id: "dialogs.user.new",
    label: "Dialog: Utilizator Nou",
    kind: "list",
  },
  {
    id: "dialogs.contract.new",
    label: "Dialog: Contract Nou",
    kind: "list",
  },
]


