# ETAPA 8A.1 - reconciliere istorica si audit Kiosk

## 109 versus 107

**Concluzie:** nu exista doua teste executabile pierdute. Diferenta este o eroare istorica de raportare, nu o regresie de acoperire.

Comanda istorica enumerata astazi este:

```sh
npx playwright test tests/e2e/pontaj/calculations \
  tests/e2e/pontaj/flow/v01-complete-flow.spec.ts \
  tests/e2e/pontaj/routes/access-smoke.spec.ts \
  tests/e2e/pontaj/start/start-basic.spec.ts \
  tests/e2e/pontaj/stop/stop-minimum.spec.ts \
  --config=playwright.pontaj.config.ts --list
```

Rezultatul mecanic este 107: `1` setup + `101` calculations (`85` V01--V85, `15` proiectii UI, `1` registry) + `1` V01 flow + `1` access + `1` start + `2` stop.

Snapshotul Git anterior `8f49017751ba6b90f58ed85b931762d89509e7e8` contine aceeasi selectie si acelasi total de 107. Nu exista un artefact sursa pentru doua cazuri suplimentare care sa poata fi restaurat fara a inventa teste.

Singura schimbare istorica urmaribila este redenumirea cazului Stage 5 Stop normal de la `+61 secunde` la verificarea de prag `STO-003 +60 secunde`; nu reduce numarul de teste. Cazul vechi `+61` este acoperit explicit de `STO-004` in `tests/e2e/pontaj/stop/core-stop.spec.ts`.

Raportarile `109/109` din `05-rezultate-vectori.md`, `06-rezultate-core-functional.md`, `07b-inchidere-testabilitate.md` si scriptul `scripts/generate-pontaj-stage6-report.mjs` trebuie tratate ca metadata incorecta pana la actualizarea lor intr-o etapa dedicata. Nu au fost rescrise aici pentru a pastra scopul 8A.1.

Executia din 2026-07-12 a produs initial 106/107 PASS: `CAL-V01` astepta un toast tranzitoriu, desi pagina arata deja sesiunea activa. Helperul a fost mutat la verificarea persistenta a butonului Stop, iar rerularea V01 a trecut 2/2. Nu exista inca o executie atomica noua a celor 107 dupa aceasta corectie.

## Acoperire Kiosk inchisa

- KSK-004: UI pentru loading/empty/timeout/error/retry; failure-ul fiecarui loader este determinist la nivelul modulului injectabil, fara hook production sau dependenta de protocolul intern Firestore WebChannel.
- KSK-008: trei variante automate, sambata/duminica/sarbatoare, fiecare cu Cancel no-op, confirmare persistata si refresh.
- KSK-010: camera fake, denied, absent; GPS denied/timeout; Storage failure; offline pre-commit; retry/reconnect; post-commit non-duplicare.
- KSK-013: cancel, Escape, X, parola gresita/corecta, lock UI in verificare, dublu-submit si reset context.
- KSK-014: companion automat responsive. Camera/GPS/touch/rotatie fizice raman neautomatizabile in browser.

## Blocaje declarate

- KSK-009 este caracterizat, nu rezolvat functional: `KIOSK_EMPLOYEE_PASSWORD_ENABLED=false`. Este necesara o decizie business inainte de implementare.
- KSK-014 necesita validare fizica pe dispozitiv dedicat.
- Niciun test sau seed din aceasta etapa nu foloseste proiectul Firebase live.
