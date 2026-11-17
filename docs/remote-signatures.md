# Semnare prin email — Expo și Next.js

Implementare locală pentru raportul de intervenție, raportul reviziei, fișa de instalare și procesul-verbal final. Nu modifică pontajul. Fișa semnată nu finalizează singură întregul tichet de instalare.

## Flux

1. Tehnicianul oprește lucrul, salvează conținutul și propria semnătură, apoi alege semnarea prin email. Solicitarea necesită internet.
2. Serverul verifică drepturile și eligibilitatea, salvează o copie fixă a documentului și trimite linkul inițial, valabil șapte zile.
3. Beneficiarul vede PDF-ul, completează numele, confirmă adresa de email, desenează și verifică semnătura, apoi acceptă declarația.
4. Un al doilea email conține linkul final, valabil cel mult 24 de ore și niciodată peste expirarea solicitării inițiale. Deschiderea lui nu semnează. Beneficiarul trebuie să confirme explicit.
5. Confirmarea verifică din nou documentul și atribuirea și finalizează tranzacțional, o singură dată. PDF-ul semnat este trimis prin infrastructura email existentă. Un eșec de email nu anulează semnătura; trimiterea poate fi reîncercată separat.

Din tichet se poate copia linkul inițial, retrimite solicitarea și anula solicitarea. Linkul de confirmare nu este expus tehnicianului. Modificarea conținutului invalidează solicitarea; comparația documentului și revizia suplimentară acoperă și editarea urmată de restaurare prin fluxurile curente ale aplicației. Semnarea în persoană rămâne disponibilă.

## Configurare și activare separată

- `REMOTE_SIGNATURE_SECRET`: secret aleatoriu, minimum 32 octeți. Se configurează exclusiv pe server și se păstrează stabil între publicări; rotirea invalidează linkurile existente.
- `REMOTE_SIGNATURE_ORIGIN`: originea HTTPS publică, fără slash final, de exemplu `https://fom-nrg.vercel.app`. Nu se derivă din antetele cererii.
- Configurația email existentă trebuie să fie funcțională. Starea `sent` înseamnă acceptare SMTP, nu confirmare de livrare în inbox.
- Publicați întâi regulile Firestore: `remoteSignatures` și `remoteSignatureTargets`, inclusiv subcolecțiile, sunt exclusiv pentru server și excluse din regulile generale permisive. Abia apoi activați backendul și pagina publică prin configurarea secretului și originii.
- Expo folosește doar module deja existente; distribuirea JS poate fi OTA dacă runtime-ul instalat este compatibil. OTA singur nu publică backendul sau regulile.
- Nu au fost publicate backendul, regulile sau OTA în această implementare locală.

Tokenurile sunt în fragmentul URL și în corpul POST, nu în query-string. Pagina publică are no-referrer/noindex și exclude telemetria care ar putea captura tokenul. Semnăturile PNG sunt verificate fără rescriere. Dovezile, versiunile și conținutul fix sunt păstrate pe server. Fluxul confirmă accesul la email și declarația persoanei; nu certifică separat identitatea acesteia.

## Verificări locale

- 25 de teste ale serviciului pe Firestore emulator: patru documente, două etape, concurență, răspuns pierdut, editare, reatribuire, expirare, anulare, retrimitere, izolare și protejarea documentului semnat.
- 58 de teste existente ale instalărilor și 4 ale PDF-urilor au trecut.
- Browser: componenta publică reală + ruta API reală + Firestore emulator + email simulat; 320/390 px, previzualizare, aceeași imagine în formular/copia oficială, PDF generat, confirmare explicită, redeschidere.
- Expo: componenta de solicitare testată în browser cu limitele native simulate, toate cele trei valori de document (raport/fișă/proces-verbal), 320/390 px, lipsă internet, răspuns pierdut, identificator stabil, copiere eșuată și anulare. Aceasta nu înlocuiește proba pe dispozitiv.
- TypeScript Expo verificat separat. Verificarea globală Next.js rămâne blocată de erori din alte zone ale proiectului; nu constituie un build de producție validat.
- Nu s-au trimis emailuri reale, nu s-au modificat tichete reale. Proba fizică Android/iOS și livrarea în inbox rămân de efectuat înainte de activare pentru utilizatori.

Comenzi de bază, din `next-js`:

```sh
FIRESTORE_EMULATOR_HOST=127.0.0.1:8088 npx tsx --test lib/remote-signatures/service.test.ts lib/installations/service.test.ts
npx tsx --test lib/remote-signatures/core.test.ts lib/pdf/installation-render.test.ts
```

`scripts/test-remote-signatures-browser.ts` refuză rularea fără proiectul izolat `demo-fom-remote-browser`, emulator și `MAIL_TRANSPORT_MODE=sink`. În Expo, `node scripts/verify-remote-signature.cjs` verifică componenta fără acces la date reale.
