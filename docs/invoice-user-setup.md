# Facturare SAGA configurată din utilizator și din factură

Implementare locală: **10 noiembrie 2026**. Testele acestei livrări folosesc proiecte Firebase demo, emulatoare și transport simulat. Nu au fost configurate seriile reale, nu au fost consumate numere reale și nu au fost efectuate apeluri sau importuri SAGA. Nu s-a publicat aplicația.

## Utilizare

1. Adminul deschide **Utilizatori → Editează utilizatorul → Facturare SAGA**, pentru un admin/dispecer activ.
2. Completează seria/prefixul și ultima valoare numerică verificată. Exemplu: `NRGV F26` + `0001` → `NRGV F260002`.
3. Alege agentul din referințele existente sau introduce codul și denumirea confirmate în SAGA. Dacă nu există referințe, introducerea manuală este propusă automat. Nu este obligatoriu un export/import de agenți.
4. Previzualizarea apare automat, după completarea datelor. Confirmă seria exclusivă, ultima valoare și, la introducere manuală, identitatea agentului.
5. **Salvează configurarea facturării** salvează și activează profilul într-o singură operațiune. Nu există al doilea pas de activare și nu se alocă număr.

Formularul are secțiuni separate **Date utilizator** și **Facturare SAGA**. Schimbarea secțiunii păstrează editările. Salvarea facturării nu salvează numele, emailul, rolul sau celelalte câmpuri generale ale contului. Dacă datele generale sunt salvate cât timp facturarea are editări nesalvate, dialogul rămâne deschis și acele editări sunt păstrate. Închiderea folosește protecția existentă pentru modificări nesalvate. Câmpurile facturării nu marchează artificial datele generale ca modificate.

Pentru profilurile active se afișează contorul curent și numărul următor; seria și valoarea inițială sunt blocate. Corecțiile numai înainte rămân administrative, auditate, în zona avansată. Un conflict păstrează câmpurile locale, reia previzualizarea și permite reîncărcarea datelor salvate numai după confirmarea înlocuirii.

## Numerotare și persistare

Se reutilizează `sagaCatalogs/{firma}/issuerProfiles`, `issuerSeries`, `referenceItems`, contoarele existente și modul de numerotare pe utilizator. Nu există migrare sau recalculare a documentelor istorice.

Serviciul nou `lib/invoicing/issuer-setup.server.ts` citește mai întâi toate sursele, apoi salvează atomic:

- Referința agentului nou confirmat manual, dacă este necesară; sursa este **Confirmat de admin**, cu autor și dată, fără pretinsă verificare online.
- Profilul, proprietarul unic al seriei și legătura profilului la contor.
- Contorul inițial, numai dacă nu există deja. Un contor existent trebuie să fie compatibil; nu este resetat sau micșorat.
- Activarea modului pe utilizator și auditul modificării.

Prima activare avertizează că utilizatorii fără profil configurat nu vor putea emite. Drepturile de facturare rămân exclusiv admin/dispecer; configurarea unui profil nu acordă alte drepturi.

Cererile de facturare aleg seria după identitatea Firebase a operatorului care confirmă emiterea. Nu după autorul tichetului și nu după un UID arbitrar din browser. Alocarea rămâne `ultimul număr + 1`, cu zerourile păstrate, în tranzacția existentă număr + XML + transfer. Salvarea ciornei și configurarea profilului nu consumă numere. Un profil lipsă indică în editor numele utilizatorului și locul de configurare, fără alegerea seriei altcuiva.

## Interfețe

- `GET /api/integrations/saga/issuers/[uid]/setup`: profilul, utilizatorul, contorul și starea firmei.
- `POST .../setup/preview`: datele formularului cu `expectedRevision`; întoarce numărul estimat, prima activare și amprenta surselor. Nu scrie și nu apelează SAGA.
- `POST .../setup`: aceleași date, confirmările și `confirmationHash`; salvează atomic. Conflictele întorc `409`.

Agentul se transmite fie prin `{id, revision}`, fie prin `{code, name, confirmed:true}`. O denumire contradictorie pentru un cod existent este refuzată. Codurile sunt text, inclusiv zerourile inițiale. Un import de referințe aflat în curs blochează configurarea, pentru a evita folosirea unor surse intermediare.

Toate operațiunile sunt rezervate adminului autentificat, verifică atât contul operatorului, cât și eligibilitatea contului configurat și firma serverului. Scrierea păstrează bariera existentă a integrării. Sunt folosite colecțiile private existente, fără reguli sau indexuri noi. API-urile anterioare de profil și activare rămân compatibile.

## Fără Setări în fluxul obișnuit

- **Firma emitentă**: dacă lipsește, adminul o completează și confirmă în editorul facturii, prin API-ul existent. După salvare formularul dispare. Dispecerul vede că este necesar un admin. Nu sunt inventate date fiscale sau bancare.
- **Gestiune lipsă**: în adăugarea directă a unui produs de tip marfă, adminul poate salva codul și denumirea gestiunii în același editor. Se reutilizează catalogul și permisiunile existente. Articolul este recitit după salvare; cantitatea locală se păstrează. O gestiune nouă nu extinde automat permisiunile unui produs deja configurat.
- **Setări → SAGA**: arată compact starea conexiunii. **Administrare avansată** este închisă implicit; modulele și cererile lor se pornesc doar la prima deschidere, apoi își păstrează starea la închidere/redeschidere. Acolo rămân importurile opționale, întreținerea cataloagelor, regulile comerciale, corecțiile contoarelor, profilul firmei și consultările tehnice. Formularele duplicate de pregătire/activare a profilurilor nu mai sunt afișate.

Asocierile clienților, adăugarea directă a produselor și [confirmarea unică a facturii](invoice-finalization.md) se păstrează.

## Verificări

Comandă dedicată: `npm run test:issuer-setup:integration`, proiect izolat `demo-fom-issuer-setup`, Auth/Firestore și Chrome.

- API/emulatoare: activare atomică fără import, coduri cu zerouri, contoare independente, revendicarea concurentă a aceleiași serii, modificarea surselor între preview și salvare, import în curs, agent contradictoriu, roluri și izolarea firmelor, bariera scrierilor, contoare active și corecție numai înainte, refuzul accesului Firestore direct.
- Rollback: o eroare injectată la crearea contorului anulează inclusiv agentul manual, profilul și revendicarea seriei. Normalizarea scrierii seriei unui profil vechi nu îi șterge propria revendicare.
- Browser: formularul real de editare a utilizatorului și componenta nouă, păstrarea editărilor între secțiuni, salvări separate, agent manual, previzualizare automată, blocarea seriei active, gestiune și firmă configurate în flux, emitere simulată cu seria utilizatorului, fără vizitarea Setărilor; afișare la 320/390 px și administrare avansată neinițializată înainte de deschidere.
- În proba formularului de utilizator, serviciile generale de cont/email/câmpuri dinamice sunt înlocuite cu fixture-uri; noile API-uri de facturare, autorizarea și Firestore folosesc implementările reale pe emulatoare. Nu s-au trimis emailuri și nu s-au modificat conturi reale.
- Regresii API/emulator/browser: numerotare pe utilizator, finalizare/XML, ciornă/editor flotant, reguli comerciale/articole directe și conector SAGA. Transportul upstream este simulat și traficul extern este blocat.
- **67/67 teste de domeniu** pentru facturare și SAGA au trecut. Typecheck-ul global păstrează **212 diagnostice, 122 distincte**, fără diagnostice noi față de baseline; nu reprezintă un build global curat.

Publicarea, configurarea datelor/seriilor clientului și orice import SAGA real rămân operațiuni ulterioare. Descărcarea efectivă a mărfii în SAGA nu este verificată de această livrare.
