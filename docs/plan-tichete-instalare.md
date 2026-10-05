# Plan: tichete de instalare și fișe zilnice de montaj

Data: 03.10.2026. Status: livrarea 1A implementată local; verificările și limitele sunt consemnate la final.

## 1. Obiectiv și împărțirea lucrării

Tichetul de tip `Instalare` devine un flux cu mai multe echipamente, fișe de montaj repetitive și proces-verbal de terminare. Prima livrare trebuie să poată fi folosită de la crearea tichetului până la documentul final.

Păstrăm două etape comerciale, cu etapa generală împărțită în două livrări:

| Livrare | Conținut | Rezultat |
| --- | --- | --- |
| 1A — Varianta de bază | Mai multe echipamente, QR, principal, fișe zilnice, semnături, PDF, continuare și document final | Flux complet cu operare simplă |
| 1B — Echipa și excepțiile | Secundari, alocare automată, mutări între fișe, semnare ulterioară și reguli speciale | Fluxul general complet discutat cu beneficiarul |
| 2 — Cronometrare | Intervalele fiecărui tehnician, transferul timpului, totaluri și afișare în PDF | Evidența timpului pe persoană și fișă |

**Simplificare acceptată pentru 1A:** fiecare fișă are un principal, fără alocare automată a secundarilor. Mai mulți tehnicieni atribuiți tichetului pot lucra pe echipamente diferite, fiecare cu propria fișă. Secundarii urmează în 1B.

## 2. Cerințe extrase din discuție

### Cerințe generale confirmate în notițe

- Tipul tichetului rămâne `Instalare`; crearea seamănă cu revizia și permite mai multe echipamente.
- Se dorește și adăugarea de echipamente pe parcurs.
- Scanarea QR este obligatorie; o pornire nouă validă creează o fișă nouă.
- Cel care scanează devine principalul fișei și poate completa datele acesteia.
- Un principal nu poate deschide altă fișă până când o închide pe cea activă.
- La pornirea inițială se alocă și ceilalți tehnicieni eligibili ca secundari.
- Un secundar poate scana alt echipament și deveni principal; se mută doar el, fără să mute restul echipei.
- Închiderea unei fișe eliberează participanții rămași pe acea fișă, fără să afecteze tehnicienii mutați pe alte fișe.
- Fișele sunt zilnice; fișa zilei următoare începe cu date goale.
- Un echipament poate avea un număr nelimitat de fișe, cu istoric și PDF separat pentru fiecare.
- Fișa conține constatare, operațiuni, status `În lucru` / `Blocat` / `Finalizat`, explicație pentru blocaj, până la 4 poze și notă internă exclusă din documentul clientului.
- Fiecare fișă trebuie semnată de principal și de persoana de la locație.
- Instalarea echipamentului este terminată când fișa are status `Finalizat` și semnăturile necesare.
- Ce rămâne neterminat revine în listă printr-un tichet de continuare, după modelul reviziei, fără tehnicieni atribuiți.
- După terminarea tuturor echipamentelor se emite procesul-verbal de terminare a lucrării, semnat de un tehnician și persoana de la locație.
- Pentru instalare se elimină cerința și afișarea câmpului „Cauza defect”.

### Cerințe păstrate pentru etapa de timp

- Se păstrează intervalele de lucru separat pentru fiecare tehnician.
- Când un secundar scanează alt echipament, se încheie intervalul său pe prima fișă și se deschide pe a doua. Timpul celorlalți continuă pe prima.
- PDF-ul va afișa data, intervalele de la–până la și durata fiecărui tehnician.
- Cererea inițială prevede suma timpilor plus 1,5 ore; baza exactă a acestui supliment trebuie clarificată.
- Formularea din notițe „pentru el nu îl mai cuantifică” este interpretată ca oprirea contabilizării pe prima fișă, nu eliminarea timpului deja lucrat. De confirmat înainte de etapa 2.

## 3. Ce există în cod și ce putem reutiliza

Inspecție locală a proiectului `next-js`; nu reprezintă verificarea versiunii din producție.

| Zonă existentă | Utilizare în plan |
| --- | --- |
| `lib/utils/constants.ts` | Există deja tipul `Instalare` și statusul `Listată` |
| `components/lucrare-form.tsx` | Selecția multiplă este condiționată în prezent de `Revizie`; extindem UI-ul pentru instalare |
| `lib/utils/work-equipment-validation.ts` | Validarea multiplă se aplică acum doar reviziei; adăugăm contractul pentru instalare |
| `app/dashboard/lucrari/new/page.tsx`, `app/dashboard/lucrari/page.tsx`, `app/dashboard/lucrari/[id]/edit/page.tsx` | Puncte de creare/editare care trebuie armonizate, inclusiv inițializarea progresului |
| `app/dashboard/lucrari/[id]/page.tsx` | Listă de echipamente, acces la fișele reviziei și finalizare parțială existente |
| `components/qr-code-scanner.tsx` | Reutilizăm scanarea și verificarea asocierii echipamentului |
| `components/revision-operations-sheet.tsx`, `lib/firebase/revisions.ts` | Exemple pentru formular și persistență; revizia folosește document pe echipament, nepotrivit pentru fișe zilnice multiple |
| `components/signature-pad.tsx` | Reutilizăm capturarea semnăturilor |
| `components/image-defect-upload.tsx` | Referință pentru compresie și limita de 4 poze; componenta actuală scrie la nivel de tichet, deci necesită adaptare pentru fișă |
| `lib/pdf/common.ts`, `lib/pdf/font-loader.ts`, `lib/pdf/revision-operations.ts` | Reutilizăm antetul, fonturile și convențiile PDF |
| `app/raport/[id]/page.tsx`, `components/report-generator.tsx` | Referință pentru semnare și raport final; instalarea primește ramură/document dedicat |
| `lib/work-documents/document-client-snapshot.ts`, `lib/auth/require-role.ts`, `lib/firebase/admin.ts` | Reutilizăm identitatea înghețată a documentelor, autentificarea și accesul server la Firebase |

Finalizarea parțială existentă la revizie folosește operații succesive și creează tichetul rămas ca `Amânată`. Pentru instalare păstrăm experiența familiară, dar implementăm tranziția atomic/idempotent și folosim `Listată`, conform discuției.

## 4. Livrarea 1A: varianta simplă, cap-coadă

### 4.1 Crearea și modificarea tichetului

1. Dispecerul selectează clientul, locația, tipul `Instalare` și unul sau mai multe echipamente din locația respectivă.
2. Tichetul salvează ID-urile stabile și progresul separat al echipamentelor.
3. Dispecerul atribuie tehnicienii prin fluxul existent al tichetului.
4. Pe parcurs poate adăuga echipamente din aceeași locație, până la închiderea tichetului.
5. Propunere: echipamentele cu fișe începute nu pot fi eliminate; echipamentele fără fișe pot fi eliminate de dispecer. Modificarea clientului/locației se blochează după prima fișă.
6. Validările de creare, editare și persistență trebuie să trateze instalarea ca multi-echipament, în toate punctele de intrare.

### 4.2 Pornirea fișei

1. În detaliul tichetului apare lista echipamentelor și acțiunea „Începe instalarea”.
2. Scanarea trebuie să corespundă exact echipamentului, locației și tichetului selectat.
3. O pornire reușită creează un document nou de fișă și setează principalul din identitatea autentificată.
4. Principalul poate avea maximum o fișă activă de instalare în sistem, inclusiv între tichete.
5. Propunere de bază: maximum o fișă activă pe același echipament în același tichet. Alt tehnician vede fișa existentă și nu creează o fișă concurentă.
6. Reîncărcarea paginii sau repetarea aceleiași cereri redeschide fișa existentă; nu creează duplicate. După închiderea fișei, o scanare nouă poate crea alta dacă echipamentul nu este terminat.

### 4.3 Completare, salvare și închiderea zilei

- Formular unic pentru toate tipurile de echipament.
- Constatare la locație și descrierea operațiunilor executate.
- Statusul instalării: `În lucru`, `Blocat`, `Finalizat`.
- Explicație obligatorie la `Blocat`.
- Maximum 4 fotografii cumulate, inclusiv cele deja salvate.
- Notă internă vizibilă în aplicație pentru utilizatorii autorizați, exclusă din PDF.
- Salvare explicită a ciornei și redeschidere după refresh.
- „Închide fișa zilei” solicită numele și semnăturile principalului și beneficiarului.
- Propunere 1A: constatarea și operațiunile sunt obligatorii la închidere; fotografiile sunt opționale. De confirmat.
- Fișa semnată devine nemodificabilă; datele clientului și echipamentului folosite în document sunt înghețate.
- Închiderea este o acțiune explicită, fără închidere automată la miezul nopții. Data de lucru se interpretează în `Europe/Bucharest`.

**Distincție esențială:** o fișă zilnică poate fi închisă și semnată cu instalarea `În lucru` sau `Blocat`. În acest caz echipamentul rămâne neterminat și poate primi alte fișe. Numai închiderea semnată cu `Finalizat` marchează echipamentul terminat.

În 1A semnăturile se colectează la închiderea zilei. Semnarea ulterioară din cererea inițială este păstrată pentru 1B; nu marcăm automat drept semnată o fișă incompletă. Dacă o fișă rămâne deschisă peste noapte, se redeschide aceeași fișă și trebuie închisă explicit înaintea unei porniri noi. Tratamentul datei și al semnării întârziate rămâne de confirmat.

### 4.4 Fișe repetitive și PDF

- Fișa următoare este goală: nu copiem constatarea, operațiunile, pozele sau semnăturile din precedenta.
- Identitatea tichetului/echipamentului este precompletată, fără copierea conținutului lucrat.
- Fiecare fișă are un ID propriu, data lucrării și un PDF separat, descărcabil repetat de dispecer.
- PDF-ul include clientul, locația, echipamentul, principalul, data, conținutul, statusul, pozele și semnăturile.
- Nota internă și cauza defectului nu se trimit în datele PDF destinate clientului.
- În 1A PDF-ul este descărcabil pentru trimitere manuală clientului. Trimiterea directă prin email din aplicație poate fi adăugată în 1B.
- Ciorna se salvează în aplicație; documentul oficial descărcabil este fișa închisă și semnată.
- Istoricul se încarcă ordonat și paginat, fără un plafon de business al numărului de fișe.

### 4.5 Continuare și revenire în listă

1. Fișele zilei trebuie închise înainte de trimiterea restului lucrării spre replanificare.
2. Acțiunea „Trimite restul spre replanificare” calculează pe server echipamentele neterminate.
3. Se creează un singur tichet nou de tip `Instalare`, status `Listată`, cu echipamentele rămase și fără tehnicieni atribuiți.
4. Se păstrează ID-urile clientului, locației și contactului, legătura cu tichetul precedent și identificatorul lucrării inițiale.
5. Fișele și PDF-urile deja emise rămân pe tichetul unde au fost create; istoricul permite urmărirea întregului lanț.
6. Tichetul anterior păstrează echipamentele selectate inițial și rezultatul continuării; nu ștergem istoricul echipamentelor neterminate.
7. Propunere: replanificarea este posibilă și dacă niciun echipament nu a fost terminat, dar există cel puțin o fișă zilnică închisă. Revizia actuală impune cel puțin un echipament terminat; aici regula trebuie confirmată.
8. Nu folosim tipul generic `Re-Intervenție`, deoarece continuarea trebuie să păstreze comportamentul de instalare.

Închiderea pentru continuare nu este echivalentă cu terminarea întregii lucrări. În model păstrăm motivul închiderii `continuation` și ID-ul tichetului nou, chiar dacă folosim un status existent pentru listarea tichetului anterior.

### 4.6 Proces-verbal de terminare

1. Document disponibil după terminarea tuturor echipamentelor din lucrare, inclusiv a celor din tichetele de continuare.
2. Nu există fișe active sau fișe obligatorii nesemnate.
3. Procesul-verbal însumează echipamentele și referințele fișelor emise; conținutul descriptiv exact se stabilește înainte de implementarea documentului.
4. Este semnat de un tehnician autorizat al lucrării și persoana de la locație; aceste semnături sunt distincte de semnăturile zilnice.
5. Emiterea creează un snapshot final nemodificabil și un PDF descărcabil.
6. Tichetul terminal/lucrarea este marcată finalizată după emiterea semnată, fără a genera automat un raport standard de intervenție suplimentar.

## 5. Model de date propus

Schema este o propunere tehnică; denumirile finale se aliniază cu convențiile proiectului în implementare.

### Tichet: `lucrari/{workId}`

- `tipLucrare: "Instalare"`, `equipmentIds: string[]`.
- `installation.schemaVersion: 1` — activează explicit noul flux.
- `installation.rootWorkId` — identificator comun pentru lanțul lucrării.
- `installation.equipmentStatus` — sumar per echipament: `pending`, `in_progress`, `blocked`, `done`.
- `installation.activeSheetByEquipment` — referința fișei active per echipament.
- `installation.continuationWorkId`, `installation.closedReason` — continuarea creată și motivul închiderii.
- Echipamentele terminate în tichetele precedente se identifică din lanț, fără a reseta rezultatele lor.

### Fișă: `lucrari/{workId}/installationSheets/{sheetId}`

- `schemaVersion`, `equipmentId`, `principalUid`, `workDate`.
- `state: draft | closed`; separat `installationStatus: in_progress | blocked | completed`.
- `finding`, `operations`, `blockReason`, `internalNote`.
- `photos[]` cu path, URL/metadate și autor, maximum 4.
- `qrVerifiedAt`, `qrVerifiedBy`, `createdAt`, `updatedAt`, `closedAt`.
- Semnăturile și numele semnatarilor, cu data colectării.
- `documentSnapshot` la închidere: identitate client, locație, echipament, autor și conținut destinat documentului.
- Rezervăm extensia pentru participanți și intervale; fără calcul de timp în 1A.

Nu salvăm toate fișele într-un array al tichetului și nu folosim `equipmentId` drept ID unic de fișă. Subcolecția permite fișe repetitive fără suprascriere.

### Blocarea fișei active

- Index server de forma `installationTechnicianSessions/{uid}` pentru fișa în care tehnicianul este principal.
- Indexul pe tehnician și fișa activă pe echipament se verifică și se actualizează în aceeași tranzacție.
- Eliberarea verifică referința exactă a fișei; o operație veche nu trebuie să elibereze o sesiune nouă.
- ID stabil/idempotency key pentru pornire, închidere, continuare și document final.

### Proces-verbal final

- Document versionat sub lucrarea inițială, de exemplu `lucrari/{rootWorkId}/installationCompletion/{documentId}`.
- Snapshot al echipamentelor, referințelor fișelor și semnăturilor; referință pe tichetul terminal.
- Fișierele foto/semnături folosesc directoare specifice fișei, de exemplu `installations/{workId}/{sheetId}/...`.

## 6. Persistență și autorizare

- Mutările importante trec prin operații server autentificate: pornire, salvare, închidere, continuare și proces-verbal.
- Reutilizăm infrastructura `require-role` și Firebase Admin; UID-ul principalului provine din autentificare, nu din câmpuri trimise liber de client.
- Serverul verifică tipul/schema tichetului, echipamentul selectat, locația, atribuirea tehnicianului și starea curentă.
- Principalul editează propria fișă activă; dispecerul/adminul consultă istoricul și descarcă documentele. Modificările administrative ale fișelor emise necesită regulă separată.
- Finalizarea cu `completed` actualizează progresul echipamentului numai împreună cu închiderea semnată.
- Crearea continuării și închiderea tichetului anterior sunt atomice sau au mecanism explicit de recuperare și deduplicare; nu reproducem succesiunea fragilă de două scrieri independente.
- PDF-urile emise folosesc snapshotul stocat, fără a se modifica ulterior dacă se schimbă numele clientului sau echipamentului.

**Constatare locală relevantă:** fișierele `firestore.rules` și `storage.rules` permit în prezent accesul general (`if true`). Rutele server singure nu pot garanta regula „doar principalul editează” dacă scrierea directă rămâne permisă. În implementare trebuie verificată configurația efectivă și proiectate protecțiile pentru noile colecții și fișiere, inclusiv eliminarea oricărei permisiuni generale care le-ar acoperi. O regulă restrictivă adăugată lângă wildcardul permisiv nu este suficientă. Schimbarea necesară se inventariază cu impactul asupra fluxurilor existente; planul nu presupune că securitatea este deja aplicată în producție.

## 7. Ordinea implementării pentru 1A

| Pas | Modificări principale | Criteriu de închidere |
| --- | --- | --- |
| 1. Contractul fluxului | Tipuri noi, stări, schema fișei, reguli de semnare/continuare și protecția datelor | Regulile din secțiunea 10 pentru MVP sunt decise |
| 2. Tichet multi-echipament | Formular, toate punctele de creare/editare, validări, progres și adăugare ulterioară | Dispecerul creează și modifică o instalare cu mai multe echipamente |
| 3. Fișă și QR | Serviciu server, index de sesiune, UI dedicat, ciornă și fotografii | Principalul pornește prin QR, completează și reia fără duplicate |
| 4. Închidere și PDF | Semnături per fișă, snapshot, PDF dedicat și istoric | Fișa zilnică se închide și PDF-ul poate fi descărcat |
| 5. Continuare | Restul echipamentelor, tichet `Listată`, legături și deduplicare | Lucrarea poate continua pe alt tichet fără pierderea istoricului |
| 6. Terminarea lucrării | Verificarea lanțului, proces-verbal, semnături și PDF final | O instalare poate fi parcursă cap-coadă |

Fișiere noi orientative: `types/installation.ts`, serviciu server dedicat instalărilor, `components/installation-sheet.tsx`, rută de fișă sub `app/dashboard/lucrari/[id]/instalare/`, generatoare PDF dedicate în `lib/pdf/` și rute API sub `app/api/lucrari/[id]/installation/`.

## 8. Livrarea 1B: alocarea echipei și excepții

1. Extindem sesiunea de tehnician cu rolul `principal` / `secondary` și fișa curentă; disponibilitatea rezultă din absența unei sesiuni active.
2. Prima scanare alocă principalul și tehnicienii eligibili nealocați ai tichetului. Propunerea de eligibilitate se confirmă cu beneficiarul.
3. Scanarea unui secundar mută doar acel tehnician, într-o tranzacție, și îl face principal pe noua fișă.
4. Nu se mută implicit niciun tehnician deja activ pe altă fișă; regulile pentru preluarea nealocaților la pornirile ulterioare se confirmă.
5. Închiderea eliberează numai participanții care încă aparțin fișei respective.
6. Adăugăm semnarea ulterioară, cu stare separată `awaiting_signature`, conținut înghețat și reguli explicite despre eliberarea echipei înainte de semnare.
7. Definim preluarea principalului absent și eventualele corecții administrative, cu istoric, fără modificarea tacită a documentelor emise.
8. Opțional: trimiterea fiecărei fișe prin email, cu destinatari verificați și status de expediere separat de închiderea fișei.

Livrarea 1B păstrează modelul de document și istoricul din 1A. Regulile privind participanții se adaugă fără a inventa retroactiv tehnicieni secundari pentru fișele deja emise.

## 9. Etapa 2: timpul fiecărui tehnician

- Evenimente de intrare/ieșire în fișă, cu timestamp server și UID, independente de durata deschiderii ecranului.
- Interval separat pentru fiecare participant, inclusiv mai multe intervale dacă revenirea pe o fișă va fi permisă.
- Transferul secundarului închide intervalul vechi și pornește intervalul nou în aceeași operație.
- Închiderea fișei oprește intervalele participanților rămași pe ea.
- Calcul în secunde/minute, rotunjire doar conform regulii de afișare convenite.
- PDF-ul afișează persoana, data, intervalele și durata totală; suplimentul de 1,5 ore este evidențiat separat conform formulei confirmate.
- Datele istorice din 1A/1B fără intervale apar fără pontaj calculat; nu deducem timpul din semnături sau din durata de existență a fișei.
- Clarificăm separat pauzele, lucrul peste miezul nopții, semnarea ulterioară, lipsa conexiunii și eventualele corecții de timp.

## 10. Decizii încă necesare

### Decizii închise pentru 1A

1. Varianta de bază lucrează cu principal; secundarii urmează în 1B.
2. Fișa zilnică poate fi închisă și semnată cu `În lucru` sau `Blocat`; echipamentul rămâne neterminat. Confirmat explicit de utilizator.
3. Ambele semnături sunt obligatorii la închidere; semnarea ulterioară urmează în 1B. Confirmat explicit de utilizator.
4. Maximum o fișă activă per echipament/tichet și una per principal în întregul sistem.
5. Constatarea, operațiunile și numele beneficiarului sunt obligatorii; motivul blocajului este obligatoriu la închidere cu `Blocat`. Maximum 4 fotografii, opționale. Nota internă este vizibilă principalului și dispecerului/adminului.
6. Dispecerul poate adăuga echipamente; nu poate elimina echipamente cu fișe începute, inclusiv pe tichete anterioare din lanț.
7. Dispecerul/adminul creează continuarea, inclusiv când niciun echipament nu este terminat, după închiderea fișelor active. Confirmat explicit de utilizator.
8. Procesul-verbal conține identitatea lucrării, echipamentele, referințele fișelor și observații opționale; semnează un tehnician atribuit tichetului terminal și beneficiarul.
9. Data fișei este data scanării în `Europe/Bucharest`; fișa rămasă deschisă peste noapte păstrează data inițială.

### Pentru 1B și etapa 2

1. Secundarii sunt exclusiv tehnicienii atribuiți tichetului? Cine este considerat eligibil/nealocat?
2. La scanarea unui secundar intră numai el, conform notițelor; la scanarea unui tehnician nealocat se preiau toți ceilalți nealocați, conform cererii inițiale?
3. Când se eliberează echipa dacă semnătura beneficiarului vine ulterior: la oprirea lucrului sau la semnare?
4. Cine poate prelua principalul absent și cine poate colecta semnăturile ulterior?
5. Cele 1,5 ore se adaugă o dată per zi, per fișă sau per tehnician? Cum evităm dublarea dacă există mai multe fișe în aceeași zi?
6. Cronometrul se oprește la terminarea lucrului sau la semnare? Cum tratăm `Blocat`, pauzele și intervalele pe mai multe zile?
7. Este necesară trimiterea directă prin email sau descărcarea și trimiterea manuală sunt suficiente?

Aceste puncte sunt diferențe de comportament încă neconfirmate, nu condiții prezentate drept cerințe deja aprobate.

## 11. Verificarea livrării 1A

Scenarii de acceptare pentru implementare, pe date de test:

- Creare din fiecare punct existent de intrare, editare și adăugare de echipamente din aceeași locație.
- QR corect acceptat; QR pentru alt echipament sau altă locație respins.
- Dublu click, refresh și cereri simultane fără fișe sau continuări duplicate.
- Un principal nu pornește o a doua fișă, inclusiv pe alt tichet; alt tehnician poate lucra pe alt echipament.
- Ciornă cu poze deja salvate plus poze noi, respectând limita cumulată de 4.
- Închidere semnată cu `În lucru`/`Blocat`, apoi fișă nouă goală și PDF-uri distincte.
- `Finalizat` fără semnături nu termină echipamentul; documentul semnat nu poate fi editat prin UI sau scriere neautorizată.
- Nota internă și cauza defectului lipsesc din PDF.
- Continuare cu restul echipamentelor, status `Listată`, fără atribuire și cu istoric accesibil.
- Proces-verbal imposibil înainte de terminarea întregului lanț; disponibil după terminare, cu semnături proprii.
- Reviziile și tichetele standard își păstrează comportamentul existent.

Testele vizează tranzițiile și concurența, autorizarea și un parcurs complet în browser, fără date sau servicii de producție.

## 12. Compatibilitate și livrare

- Noul flux se activează explicit prin `installation.schemaVersion`, pentru tichetele create în noul model.
- Instalările vechi nu sunt convertite automat. Conversia unui tichet vechi se analizează separat, în special dacă are deja raport sau semnături.
- Nu aplicăm instalărilor blocarea de revizie recentă ori checklisturile reviziei.
- Raportul standard rămâne folosit pentru tipurile existente; noua instalare are documentele proprii și eliminarea cauzei defectului doar în ramura sa.
- Prima implementare din acest plan este în `next-js`, inclusiv interfața web a tehnicianului. Integrarea în aplicația Expo este o livrare distinctă, care reutilizează contractele backend.
- Publicarea aplicației, regulilor și eventualelor indexuri se face într-un pas de livrare explicit, după verificarea variantei locale și validarea funcțională cu beneficiarul.
- Problemele cu emailurile pentru concediu și discuția despre mutarea infrastructurii nu fac parte din modulul de instalare.

## 13. Cum poate fi ofertată lucrarea

Ofertarea poate urmări separat cele trei livrări din secțiunea 1. Pentru 1A se includ pașii 1–6, PDF-urile, protecțiile necesare și verificarea parcursului complet. Pentru 1B se includ automatizarea echipei și excepțiile; pentru etapa 2, intervalele și formulele de timp.

1A este un modul funcțional complet chiar dacă echipa este gestionată simplificat. Prețul și durata ferme se stabilesc după deciziile din secțiunea 10; acest plan nu presupune că alocarea automată, semnarea ulterioară, emailul sau aplicația nativă sunt incluse deja în MVP.

## 14. Implementarea locală 1A — 3 octombrie 2026

Implementat în Next.js:

- Modelul `installation.schemaVersion = 1`, progresul per echipament, subcolecțiile `installationSheets`, `installationCompletion`, `installationAudit` și blocarea globală `installationTechnicianSessions`.
- Crearea din punctele existente este rutată prin `POST /api/installation`. Citirea și acțiunile edit/start/save/close/continue/complete folosesc `/api/lucrari/[id]/installation`, cu token Firebase verificat și rol recitit pe server.
- Pagina `/dashboard/lucrari/[id]/instalare`, integrarea în detaliul tichetului și pagina de raport, selecție multiplă la creare/editare, scanner QR, ciornă, maximum patru fotografii, semnături, istoric paginat și PDF-uri separate.
- API-ul de fotografii folosește Storage pe server, fără link public permanent. Salvarea verifică versiunea ciornei; închiderea și continuarea sunt tranzacționale și rezistă cererilor repetate.
- Asocierea client/locație și echipamentele începute rămân blocate inclusiv pe continuări. Fișa unei zile noi pornește goală.
- Regulile locale exclud datele și fișierele instalării din permisiunile generale. Crearea/ștergerea utilizatorilor și schimbarea rolului/identității tehnicianului cer admin, pentru a preveni falsificarea identității folosite de API. Accesul legacy pentru celelalte colecții este păstrat.

Verificări efectuate:

- **14/14 teste de integrare trecute** cu Auth/Firestore/Storage Emulator și proiect `demo-fom-installation`: QR greșit, concurență, blocări globale, versiuni, semnături obligatorii, fotografii cumulate, imutabilitate, continuare fără echipamente terminate, blocări moștenite, istoric și reguli de acces; verificări pentru compatibilitatea reviziilor și instalărilor legacy.
- **Parcurs browser trecut**, autentificare reală în emulator: ciornă → salvare → fotografie → refresh → două semnături → închidere → PDF fișă → proces-verbal → PDF final. Verificat și selectorul multiplu din formularul dispecerului. Fără erori JavaScript în parcursul tehnicianului.
- PDF-urile descărcate au fost randate și verificate vizual: diacritice, două semnături, fotografia, referința fișei, fără notă internă.
- `npm run build` trece. Configurația existentă a buildului omite verificarea TypeScript și lint; separat, `tsc --noEmit` raportează 217 erori existente, același număr ca la analiza inițială, fără erori în fișierele noi ale modulului.
- Suita existentă raport/client-consistency: 16 teste trecute, unul eșuat din cauza unui marker de comentariu dispărut deja din sursa inițială; nu reprezintă o regresie introdusă de instalare.

Comenzi pentru repetarea verificărilor (necesită emulatorii locali; scripturile refuză utilizarea mediului live):

```sh
firebase emulators:exec --only auth,firestore,storage --project demo-fom-installation 'npm run test:installation'
firebase emulators:exec --only auth,firestore,storage --project demo-fom-installation 'npm run test:installation:browser'
npm run build
```

Rămâne verificarea scanării cu camera pe un dispozitiv fizic. Codul și regulile sunt doar locale: nu s-au publicat și nu s-au migrat tichete existente. Expo, alocarea automată a secundarilor și cronometrarea rămân pentru livrările următoare.

## 15. Reorganizarea UI 1A — 5 octombrie 2026

- Interfața folosește cadrul existent de dashboard, header unic, sumarul progresului și contextul cu tehnicienii atribuiți și datele tichetului.
- Taburi `Echipamente`, `Fișe zilnice`, `Documente`; parametrul `tab` păstrează selecția. Parametrii existenți `equipmentId`, `sheetId` și `complete=1` sunt păstrați; procesul-verbal activează documentele.
- Echipamentele au model, cod, progres, pornire prin QR, reluarea fișei și consultarea istoricului. Scannerul are propriul panou pentru echipamentul selectat.
- Istoricul folosește tabel pe desktop și carduri pe telefon, cu paginare și fără un total dedus din fișele încărcate. Filtrul unui echipament operează pe paginile încărcate și permite încărcarea paginilor anterioare.
- Fișa zilnică are secțiuni distincte pentru lucrări, rezultat/blocaj, fotografii, nota internă și semnături. Acțiunile de salvare și închidere sunt separate, cu bară de acțiuni accesibilă pe telefon, stare de salvare și confirmarea părăsirii prin link atunci când există modificări nesalvate; refresh-ul folosește avertizarea browserului.
- Fișele semnate și fișele altui principal sunt numai pentru consultare. Nota internă este prezentată numai când API-ul o permite. Semnăturile documentului semnat sunt afișate în pagina fișei.
- Documentele grupează procesul-verbal, condițiile pentru emitere și legăturile dintre tichetele lucrării. Replanificarea cere confirmarea într-un dialog al aplicației.
- Răspunsul API de citire primește doar `tehnicieni`, `dataEmiterii`, `dataInterventie`; modelul TypeScript al răspunsului este explicit. Operațiile, autorizarea și regulile de lucru nu sunt extinse.
- Componentele sunt separate în orchestratorul `installation-workspace` și modulele `installation/overview`, `installation/forms`, `installation/shared`.

Integrarea este locală. Cronometrarea, alocarea secundarilor, Expo și publicarea rămân în afara acestei reorganizări.

Verificarea locală a reorganizării:

- **14/14 teste de integrare trecute**, fără schimbarea operațiilor existente.
- **Browser desktop (1440 px) și telefon (390 px): trecut**. QR cu cameră virtuală și respingerea codului greșit; ciornă, fotografii, semnături și PDF-uri; tab păstrat la refresh; 28 de fișe încărcate în două pagini; prezentare mobilă fără depășirea lățimii; avertizare pentru modificări nesalvate; consultare pentru alt tehnician fără nota internă; consultare pentru admin și acțiune de continuare pentru dispecer; confirmare/anulare replanificare, continuare fără echipamente finalizate și istoric gol; pagina raportului cu un singur cadru dashboard; încărcare, eroare API și reîncercare. Fără erori JavaScript în parcursul urmărit.
- **Build local trecut**. Configurația existentă omite TypeScript/lint în build. Verificarea separată TypeScript raportează 217 erori în proiect, fără erori în componentele instalării, tipul răspunsului, serviciul instalării sau scriptul de browser modificat.
- Capturi locale: `/private/tmp/fom-installation-overview-desktop.png`, `/private/tmp/fom-installation-overview-mobile.png`, `/private/tmp/fom-installation-sheet-mobile.png`, `/private/tmp/fom-installation-documents-desktop.png`.

Camera virtuală verifică integrarea scannerului cu fluxul aplicației; verificarea pe un telefon cu cameră fizică rămâne necesară. Nu s-a făcut publicare sau modificare de date live.
