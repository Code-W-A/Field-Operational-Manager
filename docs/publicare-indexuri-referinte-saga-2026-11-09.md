# Publicare indexuri catalog SAGA

Proiect Firebase: `field-operational-manager`. Data: 9 noiembrie 2026.

La cererea utilizatorului au fost create exclusiv cele două indexuri compuse `referenceItems`, cu domeniu `COLLECTION` și ordine ascendentă:

| Index | Câmpuri | Identificator |
| --- | --- | --- |
| Căutare după cod | `kind`, `codeSearch`, `__name__` | `CICAgLiI64sK` |
| Căutare după denumire | `kind`, `nameSearch`, `__name__` | `CICAgNiryokK` |

Creare acceptată de Firebase la **20:50:35 Europe/Bucharest**. Ambele indexuri sunt **READY**, confirmat la **20:56:53**. După propagarea activării, ambele interogări reale după `kind + codeSearch` și `kind + nameSearch` au răspuns **HTTP 200**, fără eroare de index. Rezultatele sunt goale pentru articolele de referință consultate; publicarea nu importă date în catalog.

Publicarea a folosit operațiuni de creare punctuale, fără publicarea întregului fișier de indexuri. Nu au fost emise operațiuni de modificare sau ștergere pentru celelalte indexuri. Nu au fost publicate reguli, funcții sau cod Vercel și nu a fost activată politica comercială.

Comparația listei înainte/după a confirmat **32 de indexuri anterioare neschimbate și exact două adăugate**.

**SAGA Web:** niciun apel, import sau modificare; operațiunile au vizat exclusiv infrastructura Firestore.
