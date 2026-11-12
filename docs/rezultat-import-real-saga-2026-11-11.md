# Prima verificare reală FOM → SAGA — 11 noiembrie 2026

## Document și autorizare

Operatorul a apăsat personal confirmarea finală în FOM. Firma reală: NRG ACCESS SYSTEMS S.R.L., CIF 34272913. Tichet: #002363 (`PiL7MIw5yCJsL4EDFl9b`). Document FOM: `SIMFOM-ANDREI-26-0001`. Client SAGA: `00974`, CLIENT TEST EDIT. Datele beneficiarului și notele documentului provin din simularea anterioară; nu reprezintă date fiscale reale confirmate.

Linie: `WIFI4CHR3`, marfă, gestiune `0005` / DEPOZIT 1, 1 BUC, bază 128,10 RON, TVA 26,90 RON, total 155,00 RON.

## Rezultat efectiv

Procesorul local a preluat exclusiv operațiunea confirmată din `invoiceSagaTransfers`, folosind serviciul persistent existent. API-ul a confirmat importul integral. Nu s-a repetat POST-ul.

Citiri reale, ora României:

| Moment | Cantitate |
| --- | --- |
| 16:35:08, înainte de import | 2 BUC |
| 16:35:14, după import | 2 BUC |
| 16:35:20, reverificare | 2 BUC |
| 16:35:26, reverificare finală | 2 BUC |

Stare finală FOM: `phase=done`, `importStatus=imported`, `stockStatus=not_confirmed`, diferență 0, necesar 1. Mesajul din interfață: **Factură importată în SAGA; scăderea stocului nu este confirmată.**

## Consultarea SAGA Web

S-a deschis separat pagina Ieșiri, pentru a nu interveni asupra formularului deschis de utilizator. S-au observat clientul 00974, produsul WIFI4CHR3, gestiunea DEPOZIT 1, cantitatea 1 și totalul 155,00 RON. Documentul are lacăt deschis, butonul **Validez** activ și **Devalidez** dezactivat. Nu s-a apăsat Validez, Salvez, Șterg sau altă operațiune contabilă în panou.

**Numărul nu este identic:** SAGA afișează și în consultarea separată `SIMFOM-ANDREI-26` (16 caractere), față de numărul FOM complet. Aceasta este o trunchiere observată, nu o limită contractuală API încă documentată/confirmată de SAGA. Seria de test lungă nu se reutilizează pentru alte importuri. Documentul existent nu se regenerează și nu se retransmite pentru corectare.

## Concluzie și continuare

Importul automat a produs o modificare reală în SAGA, însă în acest caz nu a validat documentul și nu a diminuat stocul în cele trei verificări. Nu se prezintă fluxul drept facturare/descărcare complet automatizată.

Înaintea altor importuri trebuie clarificate cu SAGA mecanismul Web suportat de validare automată și lungimea acceptată a numărului. Nu există în documentația publică verificată un endpoint separat Validez; nu se inventează unul și nu se modifică artificial stocurile FOM. Orice validare sau corecție a documentului real existent necesită o operațiune explicită a operatorului; nu se execută prin retry de import.

Modul real a fost activat în `.env.local`, fără publicare pe Vercel sau schimbarea configurației Functions. Procesorul local țintit s-a terminat; nu a rămas un proces de import în așteptare.
