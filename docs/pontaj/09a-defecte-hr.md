# ETAPA 9A - defecte HR

## Remediate

| ID | Severitate | Problema | Remediere |
| --- | --- | --- | --- |
| DEF-HR-002 | medie | Lista salariatilor nu oferea cautare globala verificabila pentru nume, email si departament. | Camp de cautare global, coloana ascunsa de index si test de regresie. |
| DEF-HR-003 | medie | Eroarea `subscribeEmployees` inchidea loading-ul fara stare de eroare sau retry. | Mesaj persistent si `Reîncearcă`. |
| DEF-HR-004 | medie | `pattern`/blur pentru ore invalide putea bloca prima salvare fara feedback persistent. | Validare controlata de aplicatie si `role=alert` persistent. |
| DEF-HR-007 | critica | `setDoc(..., { merge: true })` pastra cheile nested ale `managerUidBySector` desi UI/payload nu le mai contineau. | Remediat prin tranzactie si `deleteField()` pentru cheile stale; testele HR-005 minim si complet sunt PASS. |
| DEF-HR-008 | mare | Schimbarea defaults in timpul unei sesiuni active permitea triggerului Functions sa recalculeze cu pauza curenta, diferita de cea folosita la Start. | Remediat: snapshotul pauzei este salvat in attendance si are prioritate in sync client/Functions. |

## Characterization / decizie business necesara

| ID | Observatie |
| --- | --- |
| DEF-HR-001 | `createOrUpdateEmployee` scrie `createdAt: serverTimestamp()` si la editare. Testat ca behavior actual; nu a fost schimbat fara contract de audit confirmat. |
| DEF-HR-005 | Program start egal/inversat si pauza inversata nu sunt respinse de codul curent. Nu s-a inventat o politica HR. |
| DEF-HR-006 | Nu exista camp email in `hrEmployees`; email-ul apartine documentului `users`/Auth. Editarea ceruta nu are contract implementat in fisa salariatului. |
