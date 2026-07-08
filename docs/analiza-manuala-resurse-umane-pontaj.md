# Analiză manuală completă Resurse Umane / Pontaj

Document de audit manual pentru tot ce ține de `/dashboard/resurse-umane`, cu focus pe pontaj, condică, sync, rapoarte, salariați și fluxurile conectate direct.

Scopul documentului este să poată fi folosit ca checklist executabil. Completează `Status`, `Observații / Bug`, severitatea și linkurile către screenshot/log unde este cazul.

---

## Legendă

### Tip verificare

- **READ-ONLY**: verificare care nu modifică date.
- **MUTATING**: verificare care creează, modifică sau șterge date.
- **PRODUCȚIE CU ATENȚIE**: se poate face în producție doar cu date dedicate sau cu aprobare.

### Status

- `PASS`: rezultatul este conform.
- `FAIL`: există defect reproductibil.
- `BLOCKED`: nu se poate verifica din lipsă acces/date/config.
- `N/A`: scenariul nu se aplică mediului testat.

### Severitate bug

- `Critic`: blochează pontaj/plată/corectitudine date.
- `High`: poate produce date greșite sau pierderi de date.
- `Medium`: comportament greșit, dar cu workaround.
- `Low`: UI/copy/uzabilitate.

---

## 0. Pregătire test

### 0.1 Mediu și date de test

**Tip:** READ-ONLY înainte de test, MUTATING dacă se creează date.

**Scop:** auditul trebuie făcut pe date controlate, ca să nu se strice pontaj real.

**Precondiții:**

- Mediu test sau producție cu salariați dedicați de test.
- Browser Chrome/Edge cu permisiuni cameră și locație resetabile.
- Acces la conturi: `admin`, `dispecer`, `tehnician`, `kiosk`.
- Lună de test stabilită: `____-__`.
- Cel puțin 5 salariați de test:
  - salariat activ cu `userUid` asociat
  - salariat activ fără `userUid`
  - salariat inactiv
  - salariat cu program custom, ex. `09:00-17:00`
  - salariat cu cereri aprobate de CO/overtime

**Pași:**

1. Notează mediul: `local / preview / staging / production`.
2. Notează luna/anul de test.
3. Confirmă că există salariații de test enumerați mai sus.
4. Confirmă că există cel puțin o zi fără pontaj, o zi cu pontaj și o zi cu cerere aprobată.
5. Confirmă că poți reseta permisiunile browser pentru cameră/geolocație.

**Rezultat așteptat:**

- Datele sunt suficiente pentru toate scenariile.
- Pașii mutating se fac doar pe salariați de test.

**Date de verificat:**

- UI Resurse Umane.
- Colecții relevante dacă ai acces: `hrEmployees`, `hrTimesheets`, `hrRequests`, `attendance`, `attendanceActiveSessions`, `logs`.

**Status:** `____`

**Observații / Bug:** `____`

---

## 1. Navigare și acces

### 1.1 Acces la `/dashboard/resurse-umane`

**Tip:** READ-ONLY.

**Scop:** verifică protecția pe roluri și accesul corect la modulul HR.

**Precondiții:** conturi disponibile pentru rolurile `admin`, `dispecer`, `tehnician`, `kiosk`.

**Pași:**

1. Autentifică-te ca `admin`.
2. Accesează `/dashboard/resurse-umane/condica-prezenta`.
3. Repetă pentru `/salariati`, `/departamente`, `/rapoarte`, `/pontaj/dashboard`, `/pontaj/sync`.
4. Repetă pașii cu rol `dispecer`.
5. Repetă pașii cu rol `tehnician`.
6. Repetă pașii cu rol `kiosk`.

**Rezultat așteptat:**

- `admin` și `dispecer` au acces.
- `tehnician` și `kiosk` nu au acces la dashboard HR.
- Kiosk este redirecționat către `/kiosk`.
- Tehnicianul nu vede date HR administrative.

**Date de verificat:** UI, redirect URL, eventual cookie `userRole`.

**Status:** `____`

**Observații / Bug:** `____`

### 1.2 Redirect pontaj HR

**Tip:** READ-ONLY.

**Scop:** ruta veche de pontaj trebuie să ducă utilizatorul în condică.

**Pași:**

1. Autentifică-te ca `admin`.
2. Accesează `/dashboard/resurse-umane/pontaj`.
3. Accesează `/dashboard/resurse-umane/pontaj?month=2026-03`.

**Rezultat așteptat:**

- Utilizatorul ajunge în `/dashboard/resurse-umane/condica-prezenta`.
- Query string-ul relevant se păstrează.
- Nu apare pagină goală sau eroare Next.

**Date de verificat:** URL final, consola browser.

**Status:** `____`

**Observații / Bug:** `____`

---

## 2. Salariați

### 2.1 Listă salariați și căutare

**Tip:** READ-ONLY.

**Scop:** lista trebuie să afișeze coerent salariații și starea lor.

**Pași:**

1. Accesează `/dashboard/resurse-umane/salariati`.
2. Verifică încărcarea listei.
3. Caută salariat după nume.
4. Caută salariat după prenume.
5. Verifică afișarea salariaților activi/inactivi.
6. Verifică salariatul fără `userUid`.

**Rezultat așteptat:**

- Căutarea filtrează corect.
- Salariații inactivi sunt marcați clar sau excluși unde este cazul.
- Salariatul fără `userUid` este identificabil înainte de testele de pontaj.

**Date de verificat:** tabel salariați, detalii profil.

**Status:** `____`

**Observații / Bug:** `____`

### 2.2 Creare și editare salariat

**Tip:** MUTATING.

**Scop:** datele salariatului trebuie salvate corect și folosite în pontaj/condică.

**Precondiții:** folosește salariat de test.

**Pași:**

1. Creează sau editează un salariat de test.
2. Completează nume, prenume, email, telefon dacă există câmpuri.
3. Setează `active = true`.
4. Setează `userUid`.
5. Setează program `08:00-16:30`.
6. Salvează.
7. Redeschide salariatul.
8. Modifică programul la `09:00-17:00`.
9. Salvează și redeschide.

**Rezultat așteptat:**

- Datele persistă după refresh.
- Programul de lucru este folosit ulterior la reconciliere/overtime.
- `userUid` permite pontajul utilizatorului asociat.

**Date de verificat:** UI salariat, `hrEmployees`.

**Status:** `____`

**Observații / Bug:** `____`

### 2.3 Profil salariat `/salariati/[id]`

**Tip:** READ-ONLY.

**Scop:** profilul salariatului trebuie să centralizeze datele HR relevante.

**Pași:**

1. Deschide profilul unui salariat activ.
2. Verifică tabul de detalii.
3. Verifică tabul de pontaj.
4. Verifică tabul de concedii/cereri dacă există.
5. Schimbă luna/perioada dacă UI permite.

**Rezultat așteptat:**

- Profilul se încarcă fără erori.
- Pontajul și cererile salariatului corespund condicii.
- Lipsa datelor este afișată ca stare goală, nu ca eroare.

**Date de verificat:** profil salariat, condică, cereri.

**Status:** `____`

**Observații / Bug:** `____`

---

## 3. Departamente

### 3.1 Administrare departamente

**Tip:** MUTATING.

**Scop:** departamentele trebuie să poată fi administrate fără impact greșit asupra salariaților.

**Pași:**

1. Accesează `/dashboard/resurse-umane/departamente`.
2. Creează departament de test.
3. Editează numele departamentului.
4. Asociază un salariat dacă UI permite.
5. Șterge sau dezactivează departamentul de test.
6. Verifică dacă salariatul rămâne valid.

**Rezultat așteptat:**

- Operațiile se salvează.
- Nu dispar salariați din condică din cauza modificării departamentului.
- Filtrele care folosesc departamente se actualizează coerent.

**Date de verificat:** departamente, salariați, filtre.

**Status:** `____`

**Observații / Bug:** `____`

---

## 4. Condică Prezență

### 4.1 Navigare lună și filtre

**Tip:** READ-ONLY.

**Scop:** condica trebuie să afișeze corect luna și salariații filtrați.

**Pași:**

1. Accesează `/dashboard/resurse-umane/condica-prezenta`.
2. Selectează luna de test.
3. Filtrează după un salariat activ.
4. Revino la `Toți salariații`.
5. Verifică schimbarea lunii înainte/înapoi.
6. Comută între grid/list view dacă există ambele.

**Rezultat așteptat:**

- Luna selectată rămâne stabilă.
- Filtrul nu alterează datele.
- View-urile afișează aceleași totaluri.

**Date de verificat:** UI condică, `hrTimesheets`.

**Status:** `____`

**Observații / Bug:** `____`

### 4.2 Editare celulă condică

**Tip:** MUTATING.

**Scop:** editarea manuală a unei zile trebuie să fie predictibilă.

**Pași:**

1. Selectează salariat de test și o zi liberă.
2. Deschide celula.
3. Adaugă interval `08:00-16:30`, proiect `Pontaj manual` sau echivalent.
4. Salvează.
5. Redeschide celula.
6. Modifică intervalul la `08:30-16:30`.
7. Salvează și verifică totalul de ore.

**Rezultat așteptat:**

- Intervalul persistă.
- Totalul de ore se recalculează corect.
- Orele invalide sunt refuzate sau semnalate clar.

**Date de verificat:** celulă condică, total zi, total lună.

**Status:** `____`

**Observații / Bug:** `____`

### 4.3 Coduri speciale

**Tip:** MUTATING.

**Scop:** codurile HR trebuie să aibă comportament clar și să nu fie suprascrise accidental.

**Pași:**

1. Pentru salariat de test, setează o zi `CO`.
2. Repetă pentru `CFP`, `CM`, `IN`, `DEL`, `WE`, `SL`, dacă UI permite.
3. Verifică afișarea în grid/list.
4. Verifică totalurile și exportul CSV.
5. Rulează sync pontaj pe una dintre zilele protejate `CO/CFP/CM/IN`.

**Rezultat așteptat:**

- Codurile sunt vizibile și persistente.
- `CO/CFP/CM/IN` nu sunt suprascrise de sync pontaj.
- `DEL/WE/SL` sunt păstrate conform logicii existente.

**Date de verificat:** `hrTimesheets`, export CSV, toast sync.

**Status:** `____`

**Observații / Bug:** `____`

### 4.4 Export CSV condică

**Tip:** READ-ONLY.

**Scop:** exportul trebuie să reflecte datele vizibile.

**Pași:**

1. Selectează luna de test.
2. Aplică filtru salariat.
3. Apasă `Export CSV`.
4. Deschide fișierul.
5. Compară orele și codurile cu UI.

**Rezultat așteptat:**

- CSV-ul include salariații/filtrul așteptat.
- Orele și codurile corespund UI.
- Diacriticele se păstrează acceptabil.

**Date de verificat:** fișier CSV, UI condică.

**Status:** `____`

**Observații / Bug:** `____`

---

## 5. Pontaj Field

### 5.1 Check-in/check-out normal

**Tip:** MUTATING.

**Scop:** fluxul standard de pontaj trebuie să creeze sesiune și să sincronizeze condica la stop.

**Precondiții:** salariat activ asociat cu userul test prin `userUid`.

**Pași:**

1. Autentifică-te ca user asociat salariatului.
2. Permite geolocația.
3. Permite camera.
4. Apasă `Mă pontez acum`.
5. Verifică starea activă.
6. Așteaptă regula minimă de checkout dacă se aplică.
7. Apasă `Mă opresc acum`.
8. Revino în condică pe ziua curentă.

**Rezultat așteptat:**

- Se creează o sesiune activă la check-in.
- La check-out sesiunea devine completată.
- Condica primește interval `Pontaj`.
- Logurile conțin Play/Stop.

**Date de verificat:** `attendance`, `attendanceActiveSessions`, `hrTimesheets`, `logs`.

**Status:** `____`

**Observații / Bug:** `____`

### 5.2 Cameră refuzată în field

**Tip:** MUTATING.

**Scop:** selfie-ul în field este opțional/fallback și nu trebuie să blocheze pontajul.

**Pași:**

1. Resetează/refuză permisiunea de cameră.
2. Permite geolocația.
3. Apasă `Mă pontez acum`.
4. Continuă fără selfie dacă UI oferă opțiunea.
5. Verifică sesiunea creată.

**Rezultat așteptat:**

- Pontajul continuă fără selfie.
- Statusul selfie este `missing` sau echivalent.
- Utilizatorul primește mesaj clar.

**Date de verificat:** sesiune attendance, câmpuri selfie, toast.

**Status:** `____`

**Observații / Bug:** `____`

### 5.3 Geolocație refuzată în field

**Tip:** MUTATING.

**Scop:** fără locație, pontajul field trebuie să fie blocat sau să afișeze eroare explicită.

**Pași:**

1. Permite camera.
2. Refuză geolocația.
3. Apasă `Mă pontez acum`.
4. Observă mesajul.
5. Verifică dacă s-a creat sesiune.

**Rezultat așteptat:**

- Nu se creează sesiune fără locație.
- Eroarea este clară pentru utilizator.
- Nu rămâne UI în stare `processing`.

**Date de verificat:** UI, `attendance`, consolă browser.

**Status:** `____`

**Observații / Bug:** `____`

### 5.4 Dublu check-in

**Tip:** MUTATING.

**Scop:** nu trebuie să existe două sesiuni active pentru același user.

**Pași:**

1. Pornește pontajul pentru userul de test.
2. Încearcă imediat al doilea check-in din același browser.
3. Încearcă al doilea check-in din alt browser/device dacă este posibil.
4. Verifică sesiunile active.

**Rezultat așteptat:**

- A doua încercare este refuzată.
- Există maximum o sesiune activă.
- Lock-ul activ indică sesiunea corectă.

**Date de verificat:** `attendance`, `attendanceActiveSessions`.

**Status:** `____`

**Observații / Bug:** `____`

### 5.5 Salariat fără `userUid`

**Tip:** MUTATING.

**Scop:** pontajul trebuie blocat dacă userul nu este asociat cu salariat HR.

**Pași:**

1. Autentifică-te cu user fără salariat HR asociat.
2. Încearcă check-in.
3. Notează mesajul.

**Rezultat așteptat:**

- Check-in refuzat.
- Mesajul indică asocierea în `Resurse Umane -> Salariați`.
- Nu apare sesiune parțială.

**Date de verificat:** UI, `attendance`.

**Status:** `____`

**Observații / Bug:** `____`

---

## 6. Kiosk

### 6.1 Start/Stop kiosk normal

**Tip:** MUTATING.

**Scop:** kiosk-ul trebuie să permită pontajul salariaților eligibili.

**Precondiții:** cont kiosk autentificat, salariat eligibil cu user valid.

**Pași:**

1. Accesează `/kiosk`.
2. Apasă `Start`.
3. Selectează salariatul de test.
4. Permite camera.
5. Finalizează selfie.
6. Verifică starea de succes.
7. Apasă `Stop`.
8. Selectează același salariat.
9. Finalizează selfie.

**Rezultat așteptat:**

- Start creează sesiune activă cu `deviceInfo.type = kiosk`.
- Stop completează sesiunea.
- Condica se sincronizează după stop.

**Date de verificat:** `/kiosk`, `attendance`, `hrTimesheets`.

**Status:** `____`

**Observații / Bug:** `____`

### 6.2 Kiosk cu cameră refuzată

**Tip:** MUTATING.

**Scop:** în kiosk selfie-ul este obligatoriu.

**Pași:**

1. Refuză camera.
2. Accesează `/kiosk`.
3. Apasă `Start`.
4. Selectează salariat.
5. Observă comportamentul.

**Rezultat așteptat:**

- Start este blocat.
- Nu se creează sesiune.
- Mesajul cere selfie/cameră.

**Date de verificat:** UI kiosk, `attendance`.

**Status:** `____`

**Observații / Bug:** `____`

### 6.3 Utilizator deja pontat / fără tură activă

**Tip:** MUTATING.

**Scop:** kiosk-ul trebuie să trateze corect stările inverse.

**Pași:**

1. Pornește tură pentru salariat.
2. În kiosk, apasă din nou `Start` pentru același salariat.
3. Verifică dialogul `Pontaj deja pornit`.
4. Oprește tura.
5. Apasă `Stop` pentru un salariat fără tură activă.
6. Verifică dialogul `Nu există tură activă`.

**Rezultat așteptat:**

- Pentru salariat deja pontat, UI oferă opțiune de Stop.
- Pentru salariat fără tură, UI oferă opțiune de Start.
- Nu apar duplicate.

**Date de verificat:** UI kiosk, `attendanceActiveSessions`.

**Status:** `____`

**Observații / Bug:** `____`

### 6.4 Logout kiosk

**Tip:** MUTATING.

**Scop:** kiosk-ul trebuie să permită logout controlat.

**Pași:**

1. Accesează `/kiosk`.
2. Apasă butonul de logout.
3. Introdu parola contului kiosk.
4. Confirmă logout.

**Rezultat așteptat:**

- Parola greșită este refuzată.
- Parola corectă permite logout.
- Utilizatorul ajunge la `/login`.

**Date de verificat:** UI, sesiune auth.

**Status:** `____`

**Observații / Bug:** `____`

---

## 7. Sync Pontaj -> Condică

### 7.1 Sync manual pe zi

**Tip:** MUTATING.

**Scop:** sync-ul manual trebuie să fie non-destructiv.

**Pași:**

1. Creează în condică o zi cu:
   - `Pontaj 08:00-16:30`
   - `Ore suplimentare 16:30-18:30`
2. Asigură-te că există o sesiune attendance completată pentru aceeași zi.
3. Accesează `/dashboard/resurse-umane/pontaj/sync`.
4. Rulează sync pentru ziua respectivă.
5. Revino în condică.

**Rezultat așteptat:**

- Intrarea veche `Pontaj` este înlocuită cu pontajul calculat.
- `Ore suplimentare` rămâne.
- Intrările manuale non-pontaj rămân.
- Orele totale sunt calculate din intrările finale, fără dublă numărare.

**Date de verificat:** `hrTimesheets`, UI condică.

**Status:** `____`

**Observații / Bug:** `____`

### 7.2 Sync peste zi protejată

**Tip:** MUTATING.

**Scop:** sync-ul nu trebuie să suprascrie zile HR protejate.

**Pași:**

1. Setează o zi `CO`.
2. Rulează sync pontaj pentru aceeași zi.
3. Repetă pentru `CFP`, `CM`, `IN`.

**Rezultat așteptat:**

- Ziua protejată nu este suprascrisă.
- Utilizatorul primește mesaj/toast de skip/protecție.

**Date de verificat:** UI condică, rezultat sync.

**Status:** `____`

**Observații / Bug:** `____`

### 7.3 Sync range

**Tip:** MUTATING.

**Scop:** sync-ul pe interval trebuie să aplice aceleași reguli ca sync-ul pe zi.

**Pași:**

1. Pregătește un interval cu:
   - o zi normală cu pontaj
   - o zi cu overtime manual
   - o zi protejată `CO`
2. Rulează sync range.
3. Verifică fiecare zi.

**Rezultat așteptat:**

- Zilele normale se sincronizează.
- Overtime/manual entries nu dispar.
- Zilele protejate sunt sărite.

**Date de verificat:** UI sync, `hrTimesheets`.

**Status:** `____`

**Observații / Bug:** `____`

---

## 8. Dashboard Pontaj

### 8.1 Listă pontaje și filtre

**Tip:** READ-ONLY.

**Scop:** dashboard-ul pontaj trebuie să afișeze corect sesiunile.

**Pași:**

1. Accesează `/dashboard/resurse-umane/pontaj/dashboard`.
2. Selectează ziua de test.
3. Verifică sesiunile active.
4. Verifică sesiunile completate.
5. Filtrează după status/mod dacă UI permite.
6. Verifică fallback nume salariat pentru sesiuni vechi.

**Rezultat așteptat:**

- Sesiunile se afișează cu nume salariat corect.
- Active/completate sunt separate clar.
- Sesiunile fără employeeId încă au fallback lizibil.

**Date de verificat:** dashboard, `attendance`, `hrEmployees`.

**Status:** `____`

**Observații / Bug:** `____`

---

## 9. Rapoarte HR

### 9.1 KPIs lunare

**Tip:** READ-ONLY.

**Scop:** rapoartele HR trebuie să reflecte condica.

**Pași:**

1. Accesează `/dashboard/resurse-umane/rapoarte`.
2. Selectează luna de test.
3. Notează `Ore totale`.
4. Notează `Medie ore / salariat`.
5. Notează `CO / SL`.
6. Notează `WE`.
7. Compară cu condica.

**Rezultat așteptat:**

- Valorile corespund datelor din condică.
- Schimbarea lunii actualizează graficele și KPIs.
- Starea fără date este clară.

**Date de verificat:** UI rapoarte, condică.

**Status:** `____`

**Observații / Bug:** `____`

---

## 10. Rapoarte Ore Suplimentare

### 10.1 Sumar și per tehnician

**Tip:** READ-ONLY.

**Scop:** raportul de ore suplimentare trebuie să calculeze corect cererile.

**Pași:**

1. Accesează zona de rapoarte unde apare `Ore Suplimentare`.
2. Selectează anul de test.
3. Filtrează pe lună.
4. Filtrează pe salariat.
5. Verifică tab `Sumar`.
6. Verifică tab `Per Tehnician`.
7. Exportă CSV sumar și detaliat.

**Rezultat așteptat:**

- Totalurile corespund cererilor aprobate.
- Filtrele se aplică predictibil.
- CSV-ul conține aceleași valori ca UI.

**Date de verificat:** UI raport, CSV, `hrRequests`.

**Status:** `____`

**Observații / Bug:** `____`

### 10.2 Reconciliere condică

**Tip:** READ-ONLY.

**Scop:** verifică dacă orele cerute se regăsesc în condică după program.

**Pași:**

1. Deschide tab `Reconciliere condică`.
2. Selectează anul și luna de test.
3. Filtrează status cerere `Aprobate`.
4. Verifică o cerere cu pontaj real după program.
5. Verifică o cerere fără pontaj real după program.
6. Schimbă filtrul pe `Doar probleme`.
7. Exportă CSV reconciliere.

**Rezultat așteptat:**

- Cererea cu pontaj real suficient este `Confirmat`.
- Cererea parțială este `Parțial`.
- Cererea fără dovadă reală este `Lipsește pontaj` sau `Fără condică`.
- Intervalele `ADD_OVERTIME` generate din cerere nu sunt folosite ca dovadă.
- CSV-ul include statusul și diferența.

**Date de verificat:** `hrRequests`, `hrTimesheets`, CSV reconciliere.

**Status:** `____`

**Observații / Bug:** `____`

---

## 11. Audit / Logs

### 11.1 Loguri pontaj

**Tip:** READ-ONLY.

**Scop:** acțiunile importante de pontaj trebuie să lase urmă utilă pentru debugging.

**Pași:**

1. Accesează `/dashboard/loguri`.
2. Deschide tab/filtru `Pontaj`.
3. Caută salariatul/userul de test.
4. Verifică loguri pentru Play.
5. Verifică loguri pentru Stop.
6. Verifică loguri pentru sync condică.
7. Verifică loguri pentru erori, dacă au fost provocate.

**Rezultat așteptat:**

- Logurile conțin user, salariat, acțiune și detalii utile.
- Erorile de sync sunt vizibile.
- Nu apar date sensibile inutile.

**Date de verificat:** UI loguri, `logs`.

**Status:** `____`

**Observații / Bug:** `____`

---

## 12. Edge Cases Critice

### 12.1 Stop după sesiune pornită din kiosk

**Tip:** MUTATING.

**Scop:** o tură pornită în kiosk trebuie să poată fi oprită coerent din field sau kiosk, conform UI.

**Pași:**

1. Pornește tură din kiosk.
2. Autentifică-te cu userul salariatului în dashboard/lucrări.
3. Verifică dacă apare starea de pontaj activ pornit din kiosk.
4. Oprește tura din dashboard dacă UI permite.
5. Verifică condica.

**Rezultat așteptat:**

- UI explică faptul că tura a fost pornită din kiosk.
- Stop-ul nu creează sesiune nouă.
- Condica primește o singură intrare pontaj.

**Date de verificat:** `attendance`, `attendanceActiveSessions`, `hrTimesheets`.

**Status:** `____`

**Observații / Bug:** `____`

### 12.2 Sesiune uitată peste noapte

**Tip:** MUTATING / PRODUCȚIE CU ATENȚIE.

**Scop:** sesiunile uitate nu trebuie să producă ore absurde.

**Pași:**

1. Creează sau identifică sesiune pornită într-o zi anterioară.
2. Oprește sesiunea.
3. Verifică ora de final aplicată.
4. Verifică condica.

**Rezultat așteptat:**

- Stop-ul este limitat conform logicii de clamp.
- Condica nu primește interval peste mai multe zile.

**Date de verificat:** `attendance.sessionEnd`, `hrTimesheets`.

**Status:** `____`

**Observații / Bug:** `____`

### 12.3 Program invalid sau lipsă

**Tip:** MUTATING.

**Scop:** fallback-ul de program trebuie să fie predictibil.

**Pași:**

1. Folosește salariat fără `programLucruEnd`.
2. Rulează pontaj și reconciliere overtime.
3. Verifică fallback default HR.
4. Dacă lipsește default HR, verifică fallback `16:30`.

**Rezultat așteptat:**

- Reconcilierea folosește programul salariatului, apoi default HR, apoi `16:30`.
- UI nu afișează NaN sau valori invalide.

**Date de verificat:** salariat, default HR, raport reconciliere.

**Status:** `____`

**Observații / Bug:** `____`

### 12.4 Intervalele suprapuse

**Tip:** MUTATING.

**Scop:** orele nu trebuie dublate când există suprapuneri.

**Pași:**

1. Creează în condică interval `Pontaj 08:00-18:00`.
2. Adaugă `Ore suplimentare 16:30-18:30`.
3. Verifică totalul zilei.
4. Verifică reconcilierea overtime.

**Rezultat așteptat:**

- Totalul efectiv nu dublează suprapunerea.
- Reconcilierea consideră pontajul real după program.

**Date de verificat:** condică, raport reconciliere.

**Status:** `____`

**Observații / Bug:** `____`

### 12.5 Exporturi după filtre

**Tip:** READ-ONLY.

**Scop:** exporturile trebuie să respecte filtrele și să nu inducă salarizarea în eroare.

**Pași:**

1. Aplică filtru lună.
2. Aplică filtru salariat.
3. Exportă condică CSV.
4. Exportă overtime CSV.
5. Exportă reconciliere CSV.
6. Compară fiecare fișier cu UI.

**Rezultat așteptat:**

- Exporturile conțin doar datele filtrate.
- Valorile corespund UI.
- Statusurile de reconciliere sunt lizibile.

**Date de verificat:** fișiere CSV.

**Status:** `____`

**Observații / Bug:** `____`

---

## Tabel centralizare buguri

| ID | Data | Secțiune | Severitate | Titlu | Pași reproducere | Rezultat actual | Rezultat așteptat | Screenshot/Link | Status |
|----|------|----------|------------|-------|------------------|-----------------|-------------------|-----------------|--------|
| HR-PONT-001 | ____ | ____ | ____ | ____ | ____ | ____ | ____ | ____ | ____ |
| HR-PONT-002 | ____ | ____ | ____ | ____ | ____ | ____ | ____ | ____ | ____ |
| HR-PONT-003 | ____ | ____ | ____ | ____ | ____ | ____ | ____ | ____ | ____ |

---

## Checklist final înainte de închidere audit

- [ ] Toate secțiunile au `Status`.
- [ ] Toate scenariile mutating au fost făcute doar pe date de test.
- [ ] Toate bugurile au severitate.
- [ ] Pentru fiecare `FAIL` există pași de reproducere.
- [ ] Exporturile CSV au fost deschise și comparate cu UI.
- [ ] Condica a fost verificată după sync manual și după checkout.
- [ ] Reconcilierea overtime a fost verificată cu cazuri confirmate și cazuri problemă.
- [ ] Logurile Pontaj au fost verificate pentru Play/Stop/sync/error.
- [ ] Dacă auditul a fost făcut în producție, datele de test au fost curățate sau marcate.

