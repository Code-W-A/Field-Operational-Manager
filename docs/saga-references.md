# SAGA — cataloage de referință și profiluri de emitere

Implementare locală: **8 noiembrie 2026**, Planul 2, etapa 1. Nu s-au importat exporturi reale, nu s-au configurat conturile clientului și nu s-a publicat aplicația, regulile sau indecșii.

## Utilizare

În **Setări → SAGA → Cataloage de referință**, adminul alege articole, tipuri SAGA, gestiuni, agenți sau termene clienți. Încarcă CSV UTF-8/XLSX, alege foaia și coloanele, previzualizează, apoi validează și confirmă importul. Pentru un cod Excel numeric/ambiguu, îl corectează și confirmă explicit că a verificat inclusiv zerourile inițiale. Prețurile și celelalte date comerciale din previzualizare nu au editor manual.

Limite: 10 MB, 5.000 de rânduri și 100 de coloane per fișier, loturi de 200 de referințe. Fișiere succesive completează catalogul. Codurile identice cu aceleași date se deduplichează; datele contradictorii din același import se resping. Reluarea necesită același fișier, foaie, mapare și conținut validat; loturile confirmate se sar. Anularea eliberează importul, dar păstrează loturile deja salvate. Un singur import de referință poate fi activ pentru o firmă.

Căutarea este după **început de cod sau denumire**, cu ignorarea diacriticelor și a diferenței majuscule/minuscule. Paginarea se execută pe server, implicit 25, maximum 50 de rezultate. Cursorul aparține firmei, catalogului și căutării respective.

- Articole: cod, denumire, cod tip SAGA, UM, TVA, preț și monedă disponibile.
- Tipuri: cod, denumire, proprietăți aprovizionabil/consumabil/vandabil/produs/nestocat, fiecare cu da/nu/necunoscut. Acestea nu sunt reduse automat la marfă/serviciu.
- Gestiuni: cod, denumire și tipul gestiunii disponibil în export.
- Agenți: cod și denumire.
- Termene: codul unui client existent în lista SAGA importată și starea `unknown`, `none` sau `days`. Coloana `days` acceptă 0–3.650. Stare goală + zile goale înseamnă necunoscut; zile completate implică `days`; lipsa confirmată a termenului se alege explicit `none`. Clientul FOM și referința SAGA a clientului nu se modifică.

Pentru un articol importat, **„Verifică / actualizează din SAGA”** apelează explicit `GetArticol` prin conectorul existent. Interfața afișează separat exportul și ultima verificare API: denumire, UM, TVA, preț, momentul citirii. Un import ulterior păstrează verificarea API. Prețul și TVA zero rămân zero; o valoare absentă rămâne absentă. Această etapă nu decide încă eligibilitatea comercială a unei facturi. Adminul schimbă prețul sursă în SAGA și solicită recitirea; nu există scriere de preț în SAGA din FOM.

În **Profiluri de emitere**, adminul selectează un cont existent din lista paginată (UID vizibil), prefixul, ultima valoare numerică verificată și agentul implicit importat. Confirmă ultima valoare și utilizarea exclusivă prin FOM. Exemplu de format: prefix `NRGV F`, ultima valoare `260000` → exemplu următor `NRGV F260001`. Acestea sunt exemple, nu valori configurate sau verificate pentru client.

Un profil este **„Pregătit pentru etapa de numerotare”**. Salvarea nu modifică numerotarea activă pe firmă și nu creează, resetează sau incrementează contoare. O serie nu poate aparține simultan altor profiluri; tranzacțiile și `expectedRevision` protejează actualizările concurente. Schimbarea unui profil eliberează revendicarea vechii serii în acest registru pregătitor. Referința agentului modificată cere reconfirmarea reviziei. Rolul utilizatorului nu se schimbă.

## Persistență și API

Date separate sub `sagaCatalogs/{codFiscal}`:

- `referenceItems/{sha256([kind,code])}`: export, căutare, sursă, dată import, revizie, autor și snapshot API opțional.
- `referenceImports/{id}`: manifestul loturilor și progresul; `referenceControl/import`: importul activ pe firmă.
- `issuerProfiles/{uid}`: configurație pregătitoare; `issuerSeries/{hashPrefix}`: unicitatea seriei între profiluri.

Firma provine exclusiv din configurația backendului. Nu se acceptă o firmă furnizată de browser. Referințele nu înlocuiesc `products`, `warehouses`, `clients` sau `clientLinks` existente.

Baza API: `/api/integrations/saga`.

| Metodă / cale | Acces / rezultat |
| --- | --- |
| `GET references/{kind}?q=&field=code\|name&cursor=&limit=` | admin/dispecer; referințe și cursor |
| `POST references/{kind}/preview` | admin; array de rânduri, validare și normalizare fără salvare |
| `POST references/{kind}/imports` | admin; `{source,total,hashes}`; pornește/reia manifestul |
| `GET references/{kind}/imports?id=` | admin/dispecer; importul activ sau identificat |
| `POST references/{kind}/imports/{id}/batch` | admin; `{index,rows}`; salvare tranzacțională și idempotentă |
| `POST references/{kind}/imports/{id}/cancel` | admin; anulare fără ștergerea loturilor salvate |
| `POST references/articles/{id}/verify` | admin; `{expectedRevision}`; singura acțiune care consultă SAGA |
| `GET issuers/users?cursor=` | admin; conturi FOM existente, maximum 50/pagină |
| `GET issuers/{uid}` | admin; dispecer doar pentru propriul UID |
| `PUT issuers/{uid}` | admin; `expectedRevision`, `prefix`, `lastVerifiedNumber`, `agentId`, `agentRevision`, `exclusiveConfirmed`, `lastNumberConfirmed` |

API-urile folosesc identitatea Firebase verificată, apoi reverifică rolul și starea activă din `users`. Conflictele de revizie, import sau serie răspund cu `409`. Un conflict păstrează editările locale; reîncărcarea este explicită. Nu se returnează cheia sau răspunsul SAGA brut.

Bariera existentă `SAGA_READS_ENABLED` controlează scrierile și verificarea articolului. Deschiderea interfeței, citirea referințelor, previzualizarea și importul fișierului **nu apelează SAGA**. Verificarea explicită reutilizează lease-ul comun pe firmă, cheia criptată și persistența tokenului reînnoit din conector.

Întregul `sagaCatalogs`, inclusiv subcolecțiile noi, este deja exclus de regulile Firestore din accesul direct. Sunt adăugați doi indecși `referenceItems` pentru `kind + codeSearch + __name__` și `kind + nameSearch + __name__`. Publicarea regulilor de protecție existente și a indecșilor este necesară înaintea activării în cloud; **nu a fost executată**. Nu sunt necesare variabile noi față de conectorul existent.

## Fișiere

- `lib/saga/references.ts`: modele și validări comune.
- `lib/saga/references.server.ts`: importuri, paginare, verificare și profiluri.
- `lib/saga/references-http.ts`, `references-runtime.server.ts` și rutele `app/api/integrations/saga/{references,issuers}`: autentificare și contract HTTP.
- `components/settings/saga-references.tsx`, `saga-issuer-profiles.tsx`, integrarea în `saga-tab.tsx`.
- `firestore.indexes.json`: cei doi indecși de căutare.
- `lib/saga/references.test.ts`, `scripts/test-saga-references.ts`, comenzile npm și fixture-ul existent `scripts/test-saga.ts`.

## Dovezi de verificare

Executate local, cu date fictive și transport SAGA injectat; testele refuză traficul HTTP extern:

- `npm run test:saga:references`: **8 teste trecute**, inclusiv CSV/XLSX, foi, coduri numerice ambigue, duplicate, TVA/preț zero versus lipsă și cele trei stări ale termenului.
- `npm run test:saga:references:integration`: **trecut**, Auth/Firestore pe proiectul demo izolat `demo-fom-saga-references`; permisiuni, refuzul accesului Firestore direct, firme separate, paginare, importuri serializate, reluare/idempotentă/anulare, snapshot API păstrat după import, token reînnoit și conflict în timpul recitirii, profiluri/serii concurente. Sentinelurile din cataloagele vechi, asocieri, clienți, ciorne, facturi și contoare au rămas identice.
- Același script verifică în Chrome componentele reale → API → Auth/Firestore: CSV, XLSX cu alegerea foii și confirmarea codurilor, recitire explicită, profil salvat/redeschis, conflict cu păstrarea editării locale și lățimi 320/390 px. Capturi locale `/tmp/fom-saga-references-{mobile,desktop}.png`. Fixture-ul înlocuiește doar autentificarea din context și transportul SAGA; nu reprezintă o verificare pe telefon fizic sau pe o publicare Next.js.
- Regresii: `npm run test:saga` **8**, `npm run test:saga:clients` **5**, `npm run test:invoice-numbering` **4**; toate trecute. `npm run test:saga:integration`: **trecut**, inclusiv rotația tokenului la eroare, lease/concurență, timeout, pagină Setări și verificarea că deschiderea nu produce apeluri SAGA.
- `npx tsc --noEmit --pretty false`: proiectul are **212 diagnostice preexistente**, același număr ca înainte; compararea mesajelor fără poziții de linie nu găsește diagnostice noi.

## Limite și continuare

Nu s-au verificat date reale SAGA și nu s-au folosit exporturile clientului. Recitirea API a fost simulată, nu o dovadă a prețurilor existente în firma reală. Nu au fost configurate cele trei conturi reale și nu a fost publicat nimic.

Etapele 2 și 3 adaugă activarea explicită a numerotării pe utilizator și a regulilor de preț/TVA/scadență/agent, documentate mai jos. Salvarea/importarea referințelor nu activează automat aceste funcții. Comportamentul curent al ciornelor, XML-urilor istorice, importului facturilor și numerotării existente rămâne același în această livrare.

## Continuare implementată — etapa 2

Profilurile pot fi activate pentru numerotarea pe utilizator. Activarea este explicită și separată de salvarea profilului; după activare, prefixul și seed-ul sunt blocate. [Numerotare pe utilizator](invoice-user-numbering.md). Legăturile comerciale și conectarea la editor sunt descrise în actualizarea etapei 3 de mai jos.

## Continuare implementată — etapa 3

Referințele sunt conectate explicit de admin la asocierile FOM existente, prin legături comerciale separate. Activarea regulilor permite autocompletarea editorului din ultima verificare API și din termenele importate, fără scrieri SAGA. [Reguli comerciale](invoice-commercial-rules.md).
