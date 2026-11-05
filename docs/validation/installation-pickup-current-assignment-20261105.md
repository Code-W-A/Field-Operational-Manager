# Preluare instalare după semnarea atribuirii curente

Implementare locală, fără deploy și fără modificarea tichetelor reale.

## Comportament

- Butonul „Preia tichetul” este absent până când răspunsul serverului confirmă eligibilitatea. Nu apare în timpul încărcării inițiale sau reîncărcării după reatribuire.
- Cel puțin o fișă trebuie să fie semnată pentru versiunea curentă a atribuirii; toate fișele trebuie să fie închise cu ambele semnături. Fișele vechii echipe nu deblochează o nouă atribuire.
- Semnarea înregistrează server-side `signedAssignmentVersion` atât prin semnarea separată, cât și prin închiderea cu semnături. Valoarea -1 indică un semnatar participant care nu mai este atribuit; dreptul său existent de a semna se păstrează, dar nu certifică noua echipă.
- Retry-ul unei semnări vechi nu actualizează versiunea semnării. Preluarea păstrează verificările tranzacționale ale atribuirii și idempotentei.
- Instalările terminate păstrează regula distinctă pentru PV. Preluarea intermediară nu cere PV final și păstrează fișele/documentele existente.

## Contract și compatibilitate

`InstallationListResponse.managementActions.pickup` conține `{ eligible, reason }`, numai pentru admin/dispecer. Calculul folosește întreaga colecție de fișe, inclusiv la o cerere pentru o singură fișă sau o pagină de istoric. UI afișează motivul blocării pentru o instalare activă atribuită. Un răspuns fără eligibilitate nu afișează butonul.

Fișele vechi fără `signedAssignmentVersion` sunt acceptate doar dacă auditul `sign`/`close` al semnatarului dovedește semnarea după ultima limită de atribuire (`create`, `pickup`, schimbare de echipă). Un `edit` vechi fără informații despre echipă este tratat conservator ca posibilă reatribuire; un `edit` nou cu `teamChanged: false` nu invalidează semnarea. Semnatarul istoric trebuie să aparțină echipei curente. Lipsa auditului sau timestampurile neconcludente blochează preluarea cu explicație.

Nu există migrare și nu se rescriu documente semnate. Contractul canonic a fost sincronizat în Expo.

## Verificare

- **57/57 teste backend** pe emulatorul `demo-fom-installation`, inclusiv cinci scenarii noi: semnare curentă/reîncercare/re-atribuire, semnatar mutat, compatibilitate legacy cu audit, audit lipsă/ambiguu și fișă nesemnată din afara primei pagini.
- **14/14 teste focalizate** de preluare/legacy rerulate după ultima ajustare a citirilor de audit.
- **21/21 scenarii browser** pentru management, inclusiv preluare repetată, eroare/retry, semnături incomplete, lipsa butonului în timpul încărcării și lățimi de 360/1440px pentru regula nouă. Restul scenariilor existente verifică și 390px.
- TypeScript comparat cu versiunea anterioară a fișierelor modificate: **213 diagnostice existente înainte, 213 după, zero diagnostice noi**. Typecheck-ul global nu este curat.
- Verificarea whitespace trece pentru fișierele implementării. Logul generat de emulator nu este inclus în această verificare.
- Revizuire React: eligibilitate din răspuns server, fără hookuri noi, explicație accesibilă cu `role="status"`, citiri independente în paralel și protecție împotriva afișării unui răspuns pentru o versiune veche a atribuirii.

Testele backend au scris doar în emulator. Browserul a folosit componentele reale cu dependențe Firebase/storage/editor simulate. Nu reprezintă acceptare pe un tichet real în producție sau pe telefonul fizic.
