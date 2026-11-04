# Instalări finalizate în dashboard — #002168

## Diagnostic confirmat, doar citire în producție

Document: `lucrari/795e0291-1736-403b-890e-9bf30c07b858`, număr `#002168`.

- `tipLucrare: Instalare`, `statusLucrare: Finalizat`, `tehnicieni: []`, `preluatDispecer: true`.
- `installation.schemaVersion: 1`, `closedReason: completed`, `completionDocumentId: final`.
- `statusFacturare: Nefacturat`, fără număr/document de factură și fără motiv de nefacturare.
- `raportGenerat` lipsește: instalările moderne au proces-verbal final, nu indicatorul raportului clasic.
- Dashboardul real permitea navigarea din Listate la acest document; înainte de corecție, predicatele produceau Listate=true / Nefacturate=false.

## Corecție

- Listate exclude documentele finale și stările Finalizat, inclusiv tichetele de instalare închise prin continuare.
- Nefacturate folosește `hasTicketCompletionDocument`, păstrând excluderile pentru factură sau motiv de nefacturare. Predicatul este comun cu exportul de tichete nefacturate.
- Instalările deschise sau continuate fără document final nu devin artificial facturabile. Fluxul raportului clasic rămâne compatibil.
- Pe datele reale ale #002168, predicatele corectate dau Listate=false / Nefacturate=true, fără nicio scriere în Firebase.

## Verificare

- 23 teste: predicate Listate/Nefacturate și contract de finalizare.
- 4 teste ale hookului real de dashboard, prin render React cu colecții simulate; include #002168 și verificarea că obiectele originale nu sunt mutate.
- 38 regresii suplimentare: stare echipamente, instalări, export.
- `npm run build`: trecut; proiectul dezactivează implicit verificarea tipurilor și lint în build.
- TypeScript global: 212 diagnostice existente în ieșirea CLI. Comparația programatică cu HEAD (incremental dezactivat, duplicate eliminate) are 123 diagnostice distincte înainte și după: zero diagnostice noi. Compilarea nu reprezintă rezolvarea acestor probleme istorice.
- Verificarea dashboardului online după corecție necesită publicare. Nu s-a publicat în acest pas.

Schimbarea preexistentă din `app/confidentialitate/page.tsx` aparține altei lucrări și nu face parte din această corecție.
