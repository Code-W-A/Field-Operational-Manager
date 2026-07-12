# ETAPA 8A - defecte kiosk

## Remediate

| ID | Severitate | Remediere | Verificare |
|---|---|---|---|
| DEF-KSK-001 | mare | Storage Rules apela `matches` pe un path si respingea fallback-ul la runtime. | Uploadurile kiosk si fluxurile KSK-005/006/008/011/012. |
| DEF-KSK-002 | medie | Rosterul putea ramane in loading nedefinit. Timeout de 10 secunde, eroare si Retry. | KSK-004 UI si 4 teste unitare ale loaderului. |
| DEF-KSK-003 | infrastructura | Media falsa contamina fluxurile field. Este limitata la runnerul Kiosk. | `PONTAJ_KIOSK_FAKE_MEDIA=true` numai pentru KSK. |
| DEF-KSK-004 | infrastructura | Seed admin/dispecer modifica premisa STA-006. | Seed mutat numai in `kiosk.spec.ts`. |
| DEF-KSK-005 | medie | Escape nu reseta consistent dialogul controlat de logout. | Escape, X si Cancel in KSK-013. |
| DEF-KSK-006 | medie | Uploadul selfie putea astepta nedefinit la esec Storage. | Timeout 10 secunde si KSK-010 Storage failure. |
| DEF-KSK-007 | test | Testele KSK-010 apelau un helper sters si KSK-012 dereferentia timesheetul inainte de sync. | Rerularile tinta 4/4 PASS. |

## Deschise / blocate

| ID | Stare | Actiune necesara |
|---|---|---|
| KSK-009 / BLK-006 | BUSINESS_BLOCKED | Decizie explicita: este necesara parola individuala? Daca da, definirea sursei, hash-ului, rate limiting si UX-ului. |
| KSK-014 | MANUAL_REQUIRED | Checklist pe kiosk fizic: camera, GPS, touch, rotatie, dimensiuni si permission prompts. |
| DEF-SEC-002 | OPEN | Restrangerea fallback-ului autenticat din Storage Rules pentru path-urile non-CRM. |
| INF-EMULATOR-001 | NON_BLOCKING | La shutdown poate expira publicarea unui trigger deja in zbor. Rularea testelor este terminata inainte de shutdown. |
