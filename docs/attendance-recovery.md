# Recuperarea depontărilor istorice

Corecție locală pentru o operație `attendance.stop` cu timeout, rămasă pe telefon după încheierea pontajului vizat și apariția altui pontaj activ.

## Comportament

- Expo consultă confirmările înainte de pontare, depontare și QR, folosind același blocaj de execuție. Nu retrimite automat operațiile istorice.
- Confirmarea existentă este acceptată numai când amprenta comenzii corespunde.
- În lipsa confirmării, numai pentru `attendance.stop`, serverul poate furniza dovada încheierii sesiunii vizate. Verifică proprietarul, intervalul valid și faptul că acea sesiune nu este indicată ca activă. Citește totul într-o tranzacție read-only.
- Jurnalul local primește `confirmation: session_closed` și dovezile recuperării după salvarea durabilă. Eroarea și identificatorul original rămân păstrate; această rezoluție nu afirmă că vechea comandă a reușit.
- Toate blocajele, contoarele și reîncercările exclud operațiile astfel rezolvate. Datele pontajului curent se recitesc separat, fără aplicarea rezultatului istoric peste sesiunea curentă.
- Pontajele active, lipsă, contradictorii, confirmările incompatibile și eșecurile de rețea/disc rămân nerezolvate.

## Contract compatibil

Ruta existentă `GET /api/mobile/commands?mutationId=…` acceptă opțional perechea `action=attendance.stop&attendanceId=…`. Răspunsul rămâne `confirmed` sau `absent`; la `absent` poate include `session` cu starea, ora închiderii, sesiunea activă și ora verificării. Nu include coordonate sau payloadul comenzii.

Aplicațiile vechi pot folosi ruta fără parametrii noi. Cu backend vechi, noua aplicație nu consideră lipsa dovezii drept confirmare și păstrează blocajul. Nu sunt necesare migrații de colecții sau module native noi.

## Diagnostic

Raportul distribuibil include contextul recuperării, amprenta verificată, starea pontajului istoric, decizia, salvarea locală și contoarele înainte/după. Câmpurile `blocking*` sunt etichetate explicit drept informații istorice. Durata totală este separată de momentul eșecului (`failureAfterMs`); etapele au offset de început pentru a vedea suprapunerile dintre verificare și autentificarea telefonului.

## Verificare și publicare

- 81 de teste Expo relevante au trecut: recuperare, reîncercări, jurnal, QR, pontaj, transport și filtrarea raportului.
- 7 teste backend au trecut, inclusiv Firestore emulator pe proiectul izolat `demo-fom-attendance-recovery`: verificare read-only, concurență, proprietar diferit și lipsa modificărilor asupra sesiunilor/confirmărilor.
- TypeScript Expo trece. TypeScript global Next.js are erori existente în alte zone; nu sunt raportate erori pentru fișierele acestei corecții.
- Nu au fost modificate pontaje reale și nu a fost efectuată o probă fizică pe telefonul afectat.
- Publicare separată: întâi backendul, apoi OTA Android pentru runtime-ul compatibil. Nu este publicat automat nimic din această corecție. Nici modificările independente de semnare prin email din checkout nu trebuie confundate cu această livrare.
