# Backlog security hardening

Toate elementele au status `DEFERRED_BY_OWNER_NOT_EXECUTED`, fara termen inventat:

- restaurarea Firestore deny-by-default;
- restaurarea Storage owner/path/MIME/size;
- matricea rolurilor;
- dispecer BUS-01;
- testele Web SDK negative;
- deploy controlat al Rules restrictive;
- verificarea Rules pe date reale;
- App Check, daca va fi adoptat;
- rate limiting pentru endpointuri;
- monitorizare acces anonim;
- audit security final.

Pana la restaurare, sursele active Rules permit acces anonim complet. Backupurile restrictive si testele negative opt-in sunt pastrate.
