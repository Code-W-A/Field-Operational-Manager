

High: “Traseu către casă” poate să nu ajungă în condică. Stop pontaj declanșează sync, dar traseul către casă se pornește după stop. endExtraTimeLog actualizează doar documentul de attendance în [storage.ts (line 737)](/Users/code-with-a/Dev/FOM/Field-Operational-Manager/lib/attendance/storage.ts:737), fără resync în condică. Rezultat: orele de drum spre casă pot lipsi din condică până la un sync manual.

High: opțiunea “include evenimente” din adăugare manuală pare ignorată. Dialogul trimite includeEvenimente, dar handlerul din [condica-page.tsx (line 1865)](/Users/code-with-a/Dev/FOM/Field-Operational-Manager/app/dashboard/resurse-umane/condica-prezenta/condica-page.tsx:1865) nu o citește. Zilele cu CFP/CM/IN/DEL pot fi suprascrise neintenționat.

Medium: statusul de sync poate da fals pozitiv. getAttendanceSyncStatus din [sync-timesheet.ts (line 403)](/Users/code-with-a/Dev/FOM/Field-Operational-Manager/lib/attendance/sync-timesheet.ts:403) marchează ziua ca sincronizată dacă există orice celulă în condică pentru ziua respectivă, nu dacă toate sesiunile relevante au fost sincronizate.

Medium: dashboard-ul pontaj poate rata sesiuni active începute ieri. În [dashboard/page.tsx (line 55)](/Users/code-with-a/Dev/FOM/Field-Operational-Manager/app/dashboard/resurse-umane/pontaj/dashboard/page.tsx:55), query-ul filtrează după sessionStart în ziua selectată. Dacă cineva a rămas activ de ieri, azi poate să nu apară ca activ.

Medium: timeout-ul kiosk poate reseta UI-ul în timpul procesării. În [kiosk-check-in.tsx (line 76)](/Users/code-with-a/Dev/FOM/Field-Operational-Manager/components/attendance/kiosk-check-in.tsx:76), flow-ul se resetează după 30s dacă nu e idle. Dacă upload selfie/geolocație/write Firestore întârzie, utilizatorul poate relua acțiunea, crescând riscul de duplicate.

Medium: selfie-ul de check-in are folder/sessionId diferit de documentul real. Kiosk-ul generează un sessionId pentru upload înainte ca createCheckIn să creeze id-ul real în [kiosk-check-in.tsx (line 298)](/Users/code-with-a/Dev/FOM/Field-Operational-Manager/components/attendance/kiosk-check-in.tsx:298). URL-ul rămâne salvat, dar structura fișierelor nu reflectă sesiunea reală.

Medium: orele salvate în celula de condică pot fi inconsistente cu entries. În [sync-timesheet.ts (line 610)](/Users/code-with-a/Dev/FOM/Field-Operational-Manager/lib/attendance/sync-timesheet.ts:610), sync-ul păstrează intrări non-pontaj, dar hours se calculează doar din intrările noi de pontaj. Unele rapoarte pot afișa total diferit față de detaliile din zi.



-----

Da, pot să fac și `Playwright` aproape de manual, dar trebuie spus exact ce înseamnă “complet”.

Acum, în repo, aveți deja `Playwright`, însă testul de pontaj existent este doar un harness de logică în [e2e/pontaj-auto-checkout.spec.ts](/Users/code-with-a/Dev/FOM/Field-Operational-Manager/e2e/pontaj-auto-checkout.spec.ts:1), nu un flux real UI cap-coadă. Configul actual pornește aplicația local și folosește auto-auth E2E, fără login UI real, în [playwright.config.ts](/Users/code-with-a/Dev/FOM/Field-Operational-Manager/playwright.config.ts:1) și [e2e/global-setup.ts](/Users/code-with-a/Dev/FOM/Field-Operational-Manager/e2e/global-setup.ts:1).

Ce pot testa eu realist, în ordine de valoare:

1. `Unit/integration` pe calcule și reguli.
Asta e deja zona cea mai robustă pentru:
- ore calculate în condică
- păstrare overtime/manual entries
- protecție CO/CFP/CM/IN
- clamp/auto-checkout
- reconciliere pontaj vs condică

2. `Playwright` local, foarte aproape de manual, dar în mod controlat.
Aici pot automatiza:
- intrare în `/dashboard/resurse-umane/pontaj`
- check-in / check-out din UI
- verificare stare activă/inactivă
- verificare apariție în condică
- rulare sync manual
- verificare că orele suplimentare/manuale nu dispar
- flux kiosk separat
- filtre și dashboard pontaj

Asta e varianta cea mai utilă pentru regresii reale.

3. `Playwright` full end-to-end “ca un om”, inclusiv browser permissions și cazuri speciale.
Se poate, dar cu limitări:
- camera/selfie/face recognition trebuie mock-uite sau bypass-uite controlat
- geolocația trebuie injectată din Playwright
- autentificarea reală Firebase e mai fragilă decât auto-auth E2E
- dacă vrei și backend real, trebuie date dedicate de test și cleanup clar

4. Smoke pe mediu live/staging.
Pot face și asta, dar doar ca smoke:
- pagina se încarcă
- fluxul principal merge
- condica se actualizează
Nu e locul bun pentru teste destructive sau multe variații de date.

Dacă vrei “cât mai aproape de manual”, eu aș construi o suită Playwright de nivel 2, cu mock auth + date controlate + UI real. Asta îți dă încredere mare fără fragilitatea unui test live complet.

Suitea bună pentru pontaj ar trebui să acopere:
- check-in field reușit
- check-out reușit
- sesiune activă vizibilă în UI
- sync în condică după stop
- sync manual care nu șterge overtime/manual entries
- zi protejată `CO/CFP/CM/IN` nu e rescrisă
- kiosk check-in/check-out
- traseu către client / traseu către casă
- overtime deja prezent rămâne în condică
- duplicate/double-click nu creează două sesiuni active
- dashboard și sync page afișează consistent

Concluzia scurtă: da, pot face un `Playwright` serios pentru pontaj, suficient de aproape de test manual încât să valideze UI + flux + calcule + condică. Nu aș numi “complet real” decât dacă includem și Firebase auth real, cameră reală și date reale, dar asta e mai fragil și mai scump de întreținut.

Dacă vrei, următorul pas util este să-ți construiesc eu o suită `e2e/pontaj-full.spec.ts` cu 4-6 scenarii cheie și eventual un `E2E test mode` pentru geolocație/selfie/kiosk.