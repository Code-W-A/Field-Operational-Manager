# Etapa 2 - Vectori numerici de test pentru pontaj

## 0. Conventii

Acesti vectori descriu rezultate asteptate din codul actual. Nu sunt teste Playwright si nu au fost executati contra bazei live.

Fixture comun, daca randul nu spune altceva:

```text
Timezone: Europe/Bucharest
user U1, employee E1, hrTimesheet E1_2026-07
program individual 08:00-16:30
pauza individuala 12:30-13:00
zi lucratoare, fara sarbatoare/cerere
sync: varianta client
o singura sesiune completed, mode=office, employeeId=E1
```

Fiecare rand mosteneste aceste documente initiale. Coloana „Intrare initiala si actiune” reprezinta delta fata de fixture; coloana `A` este rezultatul attendance/lock, `TS` include documentul lunar, orele si codul, iar coloana `D / C / R` este oracolul pentru dashboard, condica si profil/raport. `N/A` inseamna ca suprafata nu are o sursa de date aplicabila, nu un rezultat presupus.

Abrevieri coloane:

- `A`: document attendance asteptat.
- `TS`: `days.{day}` asteptat; `P` = entry Pontaj, `M` = manual, `T` = traseu.
- `D elapsed` = durata bruta afisata pe sesiune; `D KPI` foloseste acelasi calcul efectiv ca `C` pentru date exclusiv Pontaj.
- `C` = condica/grila; KPI condica citeste acelasi `hours` cand este prezent.
- `R` = profil si raport, suma `WORK.hours`.
- Pentru o singura zi WORK, banca = `C-8h`, daca nu este indicat altfel.

Reguli sursa: `TC`=`lib/hr/time-calc.ts`; `AS`=`lib/attendance/storage.ts`; `SYNC`=`lib/attendance/sync-timesheet*.ts`; `FNSYNC`=`firebase-functions/src/index.ts` sync admin; `SUM`=`lib/hr/timesheet-summary.ts`; `DASH`=dashboard pontaj; `KPI`=condica/profil/report; `AUTO`=`lib/attendance/auto-pontaj*.ts` si cronurile Functions.

## 1. Interval si pauza: V01-V20

| ID | Intrare initiala si actiune | A asteptat | TS / ore / cod | D / C / R | Certitudine si regula |
|---|---|---|---|---|---|
| V01 | START 08:00, STOP 16:30 | completed 08:00-16:30 | P 08:00-16:30, pauza implicita 30m, `8h WORK` | D 8.5h; C 8h; R 8h | `CONFIRMATĂ_PRIN_COD`, AS+TC+SYNC |
| V02 | 08:00-12:00 | completed | P, pauza fara intersectie, `4h WORK` | D/C/R 4h | `CONFIRMATĂ_PRIN_COD`, TC |
| V03 | 13:00-16:30 | completed | P, pauza atinge doar limita, `3.5h WORK` | D/C/R 3.5h | `CONFIRMATĂ_PRIN_COD`, TC |
| V04 | doua sesiuni 08:00-12:00 si 13:00-16:30 | doua completed | 2P, pauza nu intersecteaza, `7.5h WORK` | D 7.5h; C/R 7.5h | `CONFIRMATĂ_PRIN_COD`, SYNC+TC |
| V05 | 08:00-12:00 si 11:00-16:00 | doua completed | ambele dovezi pastrate; union 08:00-16:00 minus pauza=`7.5h WORK` | D elapsed9h/KPI7.5h; C/R7.5h | `CONFIRMATĂ_PRIN_COD`, SYNC+TC |
| V06 | doua sesiuni duplicate 08:00-16:00 | doua completed | ambele dovezi pastrate; union minus pauza=`7.5h WORK` | D elapsed16h/KPI7.5h; C/R7.5h | `CONFIRMATĂ_PRIN_COD`, SYNC+TC |
| V07 | celula manuala entries 08:00-12:00, 11:00-16:00, fara sync | neschimbat | union 08:00-16:00 minus 30m = `7.5h` | D N/A; grila 7.5h; R foloseste `cell.hours` existent | `CONFIRMATĂ_PRIN_COD`, TC |
| V08 | P 08:00-16:30, pauza manuala 10:00-10:15 | completed | pauza manuala suprima default; `8.25h WORK` | D 8.5h; C/R 8.25h | `CONFIRMATĂ_PRIN_COD`, TC |
| V09 | P 08:00-12:45, pauza manuala 12:30-13:00 | completed | intersectie 15m; `4.5h WORK` | D brut 4.75h/KPI 4.8h; C/R 4.5h | `CONFIRMATĂ_PRIN_COD`, TC |
| V10 | P 08:00-12:00, pauza manuala 14:00-14:30 | completed | pauza valida in afara, scade 0 si suprima default; `4h` | D/C/R 4h | `CONFIRMATĂ_PRIN_COD`, TC |
| V11 | P 08:00-16:30, pauze manuale 10:00-10:15 si 15:00-15:30 | completed | 45m pauza; `7.75h` | D 8.5h; C/R 7.75h | `CONFIRMATĂ_PRIN_COD`, TC |
| V12 | P 08:00-16:30, pauze 10:00-11:00 si 10:30-11:30 | completed | union pauze 90m; `7h` | D 8.5h; C/R 7h | `CONFIRMATĂ_PRIN_COD`, TC |
| V13 | P 08:00-16:30, pauza manuala invalida 13:00-12:00 | completed | manuala eliminata, revine default 30m; `8h` | D 8.5h; C/R 8h | `CONFIRMATĂ_PRIN_COD`, TC |
| V14 | P 08:00-16:30, pauza manuala 07:00-07:15 | completed | default suprimata, overlap 0; `8.5h` | D/C/R 8.5h | `CONFIRMATĂ_PRIN_COD`, TC |
| V15 | P 12:20-12:40, default 12:30-13:00 | completed | brut20-overlap10=`10m=0.1667h` | D 0.3h KPI; C/R 0.1667h | `CONFIRMATĂ_PRIN_COD`, TC+DASH |
| V16 | P 12:40-13:10, default 12:30-13:00 | completed | brut30-overlap20=`10m` | D 0.5h; C/R 0.1667h | `CONFIRMATĂ_PRIN_COD`, TC |
| V17 | P 12:30-13:00 exact pauza | completed | `0h WORK` | D 0.5h; C/R 0h; fara tichet | `CONFIRMATĂ_PRIN_COD`, TC+SUM |
| V18 | P 08:00-24:00 ca entry manual | N/A | `24:00` invalid, entry eliminata; `0m` calcul | grila 0h; stored poate ramane | `CONFIRMATĂ_PRIN_COD`, parseHM |
| V19 | P 22:00-02:00 ca entry | N/A | `end<=start`, interval invalid, `0m` | grila 0h | `CONFIRMATĂ_PRIN_COD`, TC |
| V20 | entries 08:00-12:00 si 12:00-16:00 | N/A | adiacente necomasate intern, suma 480 minus pauza30=`7.5h` | C 7.5h | `CONFIRMATĂ_PRIN_COD`, TC |

## 2. Program, intarziere si coduri: V21-V36

| ID | Intrare initiala si actiune | A asteptat | TS / ore / cod | D / C / R | Certitudine si regula |
|---|---|---|---|---|---|
| V21 | employee program 09:00-17:00, START 09:17:59 | active, `lateStartMinutes=17` | sync dupa STOP normal | intarziere UI 17m | `CONFIRMATĂ_PRIN_COD`, floor AS |
| V22 | employee fara program, defaults 07:30-16:00, START 07:45 | active, delay15 | dupa 16:00 si pauza default conform config | D brut; C net | `CONFIRMATĂ_PRIN_COD`, fallback AS |
| V23 | fara employee program si fara defaults, START 08:12 | active, program snapshot 08:00-16:30, delay12 | fallback hard-coded | conform intervalului final | `CONFIRMATĂ_PRIN_COD`, AS |
| V24 | program 08:00, START 07:30 | active, delay0 | dupa STOP 16:30: P 07:30-16:30 minus30=`8.5h` | D9h; C/R8.5h | `CONFIRMATĂ_PRIN_COD`, AS+TC |
| V25 | START 08:00, STOP 15:00 | completed | brut7h minus30=`6.5h` | D7h; C/R6.5h; banca -1.5h | `CONFIRMATĂ_PRIN_COD`; „plecare anticipata” ca statut este `NECONFIRMATĂ_BUSINESS` |
| V26 | employee pauza 13:00-13:30, defaults 12:30-13:00, P08-16:30 | completed | individuala castiga, tot `8h` | D8.5; C/R8 | `CONFIRMATĂ_PRIN_COD`, precedence |
| V27 | employee are numai pauzaStart=13:00, default end=13:15 | completed | pauza compusa 13:00-13:15; P08-16:30=`8.25h` | D8.5; C/R8.25 | `CONFIRMATĂ_PRIN_COD`, per-field fallback |
| V28 | zi initiala CO, exista P08-16:30 la resync | completed ramane | CO protejat, fara entries Pontaj adaugate | D8.5h; C/R WORK=0, cod CO | `CONFIRMATĂ_PRIN_COD`, SYNC protected |
| V29 | CFP + P08-16:30 | completed | CFP protejat | D8.5h; C/R0 WORK | `CONFIRMATĂ_PRIN_COD`, SYNC |
| V30 | CM + P08-16:30 | completed | CM protejat | D8.5h; C/R0 WORK | `CONFIRMATĂ_PRIN_COD`, SYNC |
| V31 | IN 10:00-12:00 + attendance | completed | IN protejat; cererea aprobata adauga `totalTimpIN=2h` | D attendance brut; C cod IN; sumar IN2h | `CONFIRMATĂ_PRIN_COD`, SYNC+SUM |
| V32 | DEL initial, P08-16:30 | completed | cod DEL pastrat, P adaugat, `hours=8` | D8.5; grila8; profil/raport WORK0 | `CONFIRMATĂ_PRIN_COD`, SYNC |
| V33 | WE initial, P08-12:00 sambata | completed | WE pastrat, `hours=4`; C6=4h | D4; profil/raport WORK0 | `CONFIRMATĂ_PRIN_COD`, SYNC+SUM |
| V34 | SL initial, P08-12:00 duminica | completed | SL pastrat, `hours=4`; `oreSarbatoriLegale=4`, C7=4 | D4; profil/raport WORK0 | `CONFIRMATĂ_PRIN_COD`, SUM |
| V35 | WORK fara entries si fara hours | N/A | celula ramane | condica/sumar/profil/raport 0h | `CONFIRMATĂ_PRIN_COD`, common cell calculator |
| V36 | WORK fara entries cu `hours=6` | N/A | celula ramane | toate suprafetele bazate pe TS=6h; banca -2h | `CONFIRMATĂ_PRIN_COD`, KPI+SUM |

## 3. Manual, Pontaj si re-sincronizare: V37-V47

| ID | Intrare initiala si actiune | A asteptat | TS / ore / cod | D / C / R | Certitudine si regula |
|---|---|---|---|---|---|
| V37 | zi goala, entry manual 08:00-10:00 salvat | fara attendance | M, `2h WORK` | D0; C/R2h | `CONFIRMATĂ_PRIN_COD`, dialog+TC |
| V38 | P10:00-16:00, fara manual | completed | P minus pauza30=`5.5h WORK` | D6; C/R5.5 | `CONFIRMATĂ_PRIN_COD`, SYNC |
| V39 | M08:00-10:00 existent + P10:00-16:00, sync client | completed | M+P, union08-16 minus30=`7.5h` | D6; C/R7.5 | `CONFIRMATĂ_PRIN_COD`, SYNC client |
| V40 | M08:00-12:00 + P10:00-16:00, sync client | completed | M+P pastrate, union08-16 minus30=`7.5h` | D6; C/R7.5 | `CONFIRMATĂ_PRIN_COD`, client merge |
| V41 | aceleasi date V40, sync Functions | completed | M+P pastrate; union minus pauza=`7.5h WORK` | D elapsed6h; C/R7.5h | `CONFIRMATĂ_PRIN_COD`, FNSYNC aligned |
| V42 | V39 resync client repetat de doua ori | neschimbat | vechiul P eliminat/regenerat; ramane M+un P, `7.5h` | neschimbat | `CONFIRMATĂ_PRIN_COD`, idempotenta continut |
| V43 | V38 resync client dupa edit sessionEnd 15:00 | completed 10-15 | vechi P eliminat, P10-15, pauza30=`4.5h` | D5; C/R4.5 | `CONFIRMATĂ_PRIN_COD`, regenerate |
| V44 | doua P08-12 si 11-16; resync repetat | doua completed | ambele dovezi raman o singura data; union minus pauza=`7.5h` | D elapsed9h/KPI7.5h; C/R7.5h | `CONFIRMATĂ_PRIN_COD`, idempotent union |
| V45 | M08-12 cu break10:00-10:15 + P13-16, client | completed | breaks pastrate; total7h-15m=`6.75h` | D3; C/R6.75 | `CONFIRMATĂ_PRIN_COD`, preserve |
| V46 | DEL cu metadata request + P, resync | completed | cod DEL pastrat; metadata whole-day poate fi omisa in celula reconstruita | ore din P, raport WORK0 | `DEDUSĂ_DIN_COD`, object reconstruction |
| V47 | CO cu metadata request + P, resync | completed | celula returnata protejata integral, metadata ramane | D brut; cod CO | `CONFIRMATĂ_PRIN_COD`, protected early return |

## 4. START/STOP, identitate, lock si automatizari: V48-V63

| ID | Documente initiale si actiune | Attendance/lock asteptat | Timesheet si afisari | Certitudine si regula |
|---|---|---|---|---|
| V48 | U1 legat de E1; START 08:00 | sesiune `att_U1_<ms>` active + lock/U1 | nimic pana la STOP/sync | `CONFIRMATĂ_PRIN_COD`, AS transaction |
| V49 | lipsa `employeeId` in request, `hrEmployees/E1.userUid=U1` | sesiune active cu `employeeId=E1` rezolvat | la STOP -> E1_luna | `CONFIRMATĂ_PRIN_COD`, UID resolution |
| V50 | lipsa userUid pe employee; `users/U1.displayName` egal exact `hrEmployees.fullName` | START rezolva E1 si incearca backfill `userUid=U1` | la STOP -> E1 | `CONFIRMATĂ_PRIN_COD`, legacy fallback; asocierea este `NECONFIRMATĂ_BUSINESS` |
| V51 | U1 tehnician, fara employee si fara match nume | attendance active fara employeeId | STOP completed; sync nu poate crea TS | `CONFIRMATĂ_PRIN_COD`, role exception |
| V52 | U1 admin/dispecer, fara employee | START refuzat; fara sesiune/lock | nimic | `CONFIRMATĂ_PRIN_COD`, AS role check |
| V53 | lock U1 -> sesiune active S1; doua START simultan | un singur active; al doilea eroare active | un singur viitor P | `DEDUSĂ_DIN_COD`, Firestore retry |
| V54 | sesiune S1 active fara lock; START nou | poate crea S2 active + lock S2 | ulterior doua sesiuni pot sincroniza | `DEDUSĂ_DIN_COD`, transaction checks lock only |
| V55 | lock -> document inexistent | START creeaza sesiune noua si suprascrie lock | normal dupa STOP | `CONFIRMATĂ_PRIN_COD`, stale lock semantics |
| V56 | S1 active de 30 secunde; STOP | refuz minimum, S1 ramane active si lock ramane | fara TS | `CONFIRMATĂ_PRIN_COD`, AS min60 |
| V57 | S1 active de exact 60 secunde; STOP | completed, lock sters | P de 1m, `0.0167h`; D KPI0h dupa round1? `round(0.0167*10)/10=0` | `CONFIRMATĂ_PRIN_COD`, AS+DASH |
| V58 | S1 active; doua STOP simultan | unul completed, unul „deja inchisa”; lock sters | sync poate fi invocat de castigator + trigger | `DEDUSĂ_DIN_COD`, transaction retry |
| V59 | primul QR la 09:00, nicio sesiune in zi | active field, `checkInAuto=true`, reason first_qr, lock | dupa STOP devine P | `CONFIRMATĂ_PRIN_COD`, AUTO |
| V60 | primul QR la 10:00, exista sesiune completed 08-09 | auto START skipped „attendance today” | TS existent neschimbat | `CONFIRMATĂ_PRIN_COD`, hasAttendanceToday |
| V61 | raport semnat, sesiune active | auto STOP skipped deoarece fanion false | attendance ramane active | `CONFIRMATĂ_PRIN_COD`; deploy live `NECONFIRMATĂ_DEPLOYMENT` |
| V62 | cron EOD pe S1 08:00 active, programEnd16:30 | completed cu end16:30, auto flags; lock-ul S1 sters tranzactional | trigger incearca P08-16:30=`8h` | `CONFIRMATĂ_PRIN_COD`, AUTO+TC |
| V63 | cron EOD pe S1 20:00 active, programEnd16:30 | end=23:59:59.999; lock-ul S1 sters tranzactional | P afisat20:00-23:59, durata absoluta aproape4h | `CONFIRMATĂ_PRIN_COD`, clamp+absolute timestamps |

## 5. Calendar, luna si DST: V64-V72

| ID | Instante/date si actiune | Attendance asteptat | TS / ore si suprafete | Certitudine si regula |
|---|---|---|---|---|
| V64 | sesiune 31 iul 23:00 -> STOP cerut 1 aug 00:30, programEnd16:30 | clamp la 31 iul 23:59:59.999 | P23:00-23:59=`59m`, luna iulie; D brut aproximativ1h | `CONFIRMATĂ_PRIN_COD`, clamp+formatter |
| V65 | sesiune legacy neclampuita 31 iul 23:00-1 aug00:30 | completed cross-day | bulk dupa start poate pune in iulie cu entry23:00-00:30 invalid=0; single sync pentru august filtreaza dupa end si poate atribui august | `CONTRADICTORIE`, two sync selectors |
| V66 | 29 mar 2026 `00:30Z-01:30Z` | durata absoluta1h | entry afisat02:30-04:30 cu timestamps; D KPI/C/R=`1h` | `CONFIRMATĂ_PRIN_COD`, DST-safe TC |
| V67 | 25 oct 2026 `00:30Z-01:30Z` | durata absoluta1h | entry afisat03:30-03:30 cu timestamps; D KPI/C/R=`1h` | `CONFIRMATĂ_PRIN_COD`, DST-safe TC |
| V68 | 28 feb 2026 day28 | normal | document `E1_2026-02`, day `"28"` | exact | `CONFIRMATĂ_PRIN_COD`, daysInMonth |
| V69 | 29 feb 2028 | normal | `E1_2028-02.days."29"` valid | exact | `CONFIRMATĂ_PRIN_COD`, Date leap |
| V70 | 31 dec 2026 23:30 -> STOP 1 ian | clamp in 31 dec conform V64 | document 2026-12, nu impartit in 2027 | `CONFIRMATĂ_PRIN_COD`, clamp |
| V71 | browser UTC selecteaza instant 31 iul21:30Z (=1 aug00:30 Bucharest) | attendance instant unic | client day bounds pot selecta 31 iul, formatter scrie 00:30 si Functions atribuie 1 aug | `DEDUSĂ_DIN_COD`, runtime TZ conflict |
| V72 | overtime ADD 7h30 de la 16:30 | fara attendance obligatoriu | final cap23:59: durata materializabila 449m=`7.4833h`, nu 7.5h | `CONFIRMATĂ_PRIN_COD`, request cap23:59 |

## 6. Sumar, C1-C7, tichete si raport: V73-V85

| ID | Celula/cereri | Rezultate numerice | Afisari | Certitudine si regula |
|---|---|---|---|---|
| V73 | WORK P07:30-17:00, pauza30, program08-16:30 | prezenta9h; C1=0.5, C2=0.5, O=60m, C3=1, C4=C5=0; tichet1 | dashboard brut9.5; C/R9 | `CONFIRMATĂ_PRIN_COD`, SUM |
| V74 | WORK P04:00-21:00, pauza30 | prezenta16.5h; O=510m; C3=2, C4=2, C5=4.5; C1=4, C2=4.5 | D17; C/R16.5 | `CONFIRMATĂ_PRIN_COD`, SUM |
| V75 | traseu client07:00-08:00 + P08-16:30 | traseu1h, C1=1h; prezenta8h | tichete1 | `CONFIRMATĂ_PRIN_COD`, SUM |
| V76 | traseu casa16:30-17:15 + P08-16:30 | traseu casa0.75h, C2=0.75h; prezenta8h | tichete1 | `CONFIRMATĂ_PRIN_COD`, SUM |
| V77 | sambata WORK P08-12 | prezenta4h; C6=4h; C1-C5=0; tichet0 | raport WORK4h | `CONFIRMATĂ_PRIN_COD`, SUM |
| V78 | duminica WORK P08-12 | prezenta4h; C7=4h; tichet0 | raport4h | `CONFIRMATĂ_PRIN_COD`, SUM |
| V79 | sarbatoare luni WORK P08-12 | prezenta4h; C7=4h; tichet0 | raport4h | `CONFIRMATĂ_PRIN_COD`, SUM |
| V80 | doua P duplicate sambata08-12 pastrate manual in cell | calc prezenta union4h; C6 suma bruta8h | grila4h, C6 8h | `CONTRADICTORIE` semantic, SUM raw vs TC union |
| V81 | o zi WORK8h + cerere aprobata CO aceeasi zi | prezenta8h, CO count1, tichet0 | KPI WORK8h chiar daca cererea exista | `CONFIRMATĂ_PRIN_COD`, SUM request exclusion |
| V82 | celule CO, CFP, CM, IN, DEL, WE, SL, fara EMPTY | `zileLucrate=7`; orePrezenta0; SL hours default8 | raport numara CO1/SL1/WE1 | `CONFIRMATĂ_PRIN_COD`; denumirea `NECONFIRMATĂ_BUSINESS` |
| V83 | 2 angajati activi: E1 WORK8h, E2 fara TS | raport total8, medie4.0 | profil E1=8; condica medie4 | `CONFIRMATĂ_PRIN_COD`, KPI |
| V84 | doua zile WORK: 8h si 6h | prezenta14, workDays2, banca `14-16=-2h`; tichete2 | condica total14, diff-2 | `CONFIRMATĂ_PRIN_COD`, SUM+KPI |
| V85 | program individual net 6h, o celula WORK6h | prezenta6, banca `6-6=0h` | condica diff0 | `CONFIRMATĂ_PRIN_COD`, individual schedule norm |

## 7. Oracole contradictorii care nu trebuie transformate in assert unic

| Caz | Oracol client | Oracol Functions/live posibil | Clasificare |
|---|---|---|---|
| cerere cu entries suprapuse | union minus intersectia pauzei | suma bruta entries minus pauza bruta | `CONTRADICTORIE` |
| cross-midnight legacy | bulk selecteaza dupa START | single selecteaza dupa END | `CONTRADICTORIE` |
| browser alt timezone | zi/luna browser | zi/luna Bucharest in Functions | `CONTRADICTORIE` |

Pana la unificarea implementarii sau confirmarea ordinii writer-ilor in deployment, un test end-to-end trebuie sa accepte numai observarea si clasificarea acestor ramuri, nu sa declare una dintre ele regula de business.

## 8. Acoperire

Documentul contine 85 vectori distincti. Sunt acoperite: interval unic/multiplu, overlap/duplicate, toate formele de pauza, toate cele trei niveluri de program, intarziere/plecare devreme, inainte/dupa program, sambata/duminica/sarbatoare, cross-midnight, luna/an/februarie/an bisect, ambele schimbari DST, codurile protejate, DEL/WE/SL cu interval, manual/Pontaj/combinat, cron, QR, resync repetat, lipsa `employeeId`, lipsa `userUid` si fallback legacy pe nume.
