# Retrimiterea raportului din detaliile tichetului

Implementare locală, 5 octombrie 2026.

Administratorul și dispecerul au butonul **Retrimite raportul** lângă descărcarea raportului existent. Fereastra afișează lista editabilă de destinatari, cu maximum 20 de adrese. Sunt acceptate și o singură adresă, eliminarea celor precompletate, virgule/punct și virgulă sau câte o adresă pe rând. Serverul trimite exact această listă normalizată, separat către fiecare destinatar.

## Destinatari

`GET /api/lucrari/[id]/report-recipients` verifică identitatea Firebase și rolul admin/dispecer. Returnează `emails`, `source` (`current`, `historical`, `none`) și eventual `warning`.

- Preferă adresele locației și emailul principal din fișa actuală a clientului, prin ID-uri stabile.
- Pentru tichetele fără ID-uri încearcă nume exacte și asocieri unice.
- Fallbackul istoric folosește contactul din snapshotul raportului, apoi contactul salvat pe tichet, și este etichetat pentru verificare manuală.
- ID-urile invalide nu sunt înlocuite prin potrivire de nume și nu precompletează adrese istorice. Lista rămâne goală, pentru completare manuală.
- Nu reutilizează destinatarii manuali vechi sau lista ultimei trimiteri.

## Trimitere și document

`POST /api/send-email`, cu `recipientMode=report-resend`, cere identitate verificată admin/dispecer, `lucrareId`, lista JSON `recipients` și `pdfFile`. Raportul trebuie să fie deja generat. Pentru revizii este obligatoriu și `opsPdfFile`. Fișierele sunt verificate ca PDF, maximum 10 MB fiecare.

Generatorul are opțiunea `readOnly` și callbackul `onError`. Modul de retrimitere nu scrie snapshotul, numărul, statusul ori timpii și nu alocă numere noi. Folosește datele înghețate existente; pentru rapoarte legacy fără snapshot păstrează datele salvate, fără inventarea unei plecări la data retrimiterii. Numărul existent poate proveni din `nrLucrare`, `numarRaport` sau snapshot.

Rezultatul include `sent` și `failed`. La eșec parțial fereastra păstrează doar adresele eșuate pentru o reluare explicită. Dublul click este blocat sincron; nu există reluare automată după o eroare de rețea. `emailEvents` și `lastReportEmail` înregistrează operatorul, acțiunea și rezultatul. Documentele instalării 1A sunt excluse.

## Verificare locală

```sh
npm run test:report-resend
firebase emulators:exec --only auth,firestore --project demo-fom-resend 'npm run test:report-resend:browser'
```

- 12 teste unitare trecute: date actualizate, ID-uri și nume legacy, asocieri ambigue, fallback istoric, adrese invalide/duplicate/limite, eligibilitate și trimiteri separate.
- Browser + API + Auth/Firestore Emulator + SMTP simulat pe loopback: rolurile permise/interzise, lista actuală, un singur destinatar, atașamentele de revizie, dublul click, succes parțial și reluarea doar către eșuați. Raportul rămâne identic în baza de date, exceptând metadatele ultimei trimiteri; nu se creează numere de raport.
- PDF-ul capturat din SMTP a fost verificat vizual și textual: conținutul înghețat și numărul existent, fără folosirea constatării modificate ulterior.
- Verificarea TypeScript nu raportează erori în fișierele noi sau în generatorul/API-ul modificat. Proiectul are în continuare erori TypeScript preexistente.

Testul de browser refuză rularea fără emulator local, folosește proiectul `demo-fom-resend`, credențiale fictive, un SMTP care nu transmite extern și un director separat de compilare. Nu s-au trimis emailuri reale și nu s-a publicat implementarea.
