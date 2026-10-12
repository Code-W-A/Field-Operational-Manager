export const MOBILE_TERMS_VERSION = "2026-10-12-draft-2";
export const MOBILE_TERMS_TITLE =
  "Termeni de utilizare și informare FOM — ciornă";
export const MOBILE_TERMS_SECTIONS = [
  {
    title: "Acces de serviciu",
    text: "FOM este destinat activității de serviciu. În aplicația mobilă, notificările operaționale sunt disponibile după autentificare, inclusiv înainte de pontaj. Detaliile tichetelor și celelalte informații ale firmei sunt disponibile numai în timpul unui pontaj activ. Pontează-te la începerea activității și depontează-te la încheiere.",
  },
  {
    title: "Pontaj și selfie",
    text: "La pontare și depontare, aplicația poate înregistra ora, localizarea, date despre dispozitiv și un selfie, potrivit regulilor de pontaj ale firmei. Datele sunt folosite pentru evidența activității și verificarea pontajului.",
  },
  {
    title: "Localizare",
    text: "În timpul pontajului activ, aplicația înregistrează traseul inclusiv în fundal și cu ecranul blocat. La depontare, înregistrarea traseului se oprește. Punctele colectate fără internet pot fi sincronizate ulterior.",
  },
  {
    title: "Cameră, fotografii și notificări",
    text: "Camera este folosită pentru pontaj, coduri QR și fotografii de lucru. Fotografiile sau videoclipurile selectate sunt accesate pentru funcțiile care le folosesc. Notificările și accesul la galerie pot fi refuzate; funcțiile care depind de ele pot deveni indisponibile.",
  },
  {
    title: "Informațiile firmei",
    text: "Folosește documentele, datele clienților și informațiile interne numai în scop de serviciu. Nu le distribui persoanelor neautorizate. După depontare, detaliile tichetelor și celelalte informații salvate în aplicație nu mai sunt disponibile pentru consultare. Istoricul notificărilor operaționale rămâne disponibil contului autentificat.",
  },
  {
    title: "Informarea finală a firmei",
    text: "Aceasta este o ciornă pentru revizuirea firmei. Înainte de lansare, firma trebuie să completeze identitatea operatorului, datele de contact, temeiurile prelucrării, destinatarii, perioadele de păstrare și modalitatea de exercitare a drepturilor persoanelor vizate.",
  },
] as const;
export type MobileAccess = {
  termsVersion: string;
  termsAccepted: boolean;
  activeSessionId: string | null;
};
export function mobileAccessAllowed(access: MobileAccess | undefined): boolean {
  return (
    !!access &&
    access.termsVersion === MOBILE_TERMS_VERSION &&
    access.termsAccepted === true &&
    !!access.activeSessionId
  );
}
export function attendanceAction(action: unknown): boolean {
  return (
    action === "attendance.start" ||
    action === "attendance.stop" ||
    action === "attendance.extra"
  );
}
