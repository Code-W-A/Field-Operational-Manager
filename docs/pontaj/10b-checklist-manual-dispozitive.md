# ETAPA 10B - checklist manual dispozitive

Stare implicita pentru toate cazurile: `MANUAL_PENDING`. Niciun caz nu este declarat PASS fara dispozitiv real si mediu staging confirmat.

Pentru fiecare executie se completeaza: dispozitiv, model, OS si versiune, browser si versiune, URL/mediu, runId, pasi, rezultat, screenshot/video fara date personale, defect si severitate.

## Android

| ID | Caz | Stare |
|---|---|---|
| MAN-AND-01 | camera reala si acordare/refuz/reacordare permisiune | MANUAL_PENDING |
| MAN-AND-02 | GPS si acordare/refuz/reacordare locatie | MANUAL_PENDING |
| MAN-AND-03 | touch pe Start/Stop, dialoguri si controale mici | MANUAL_PENDING |
| MAN-AND-04 | portrait si landscape fara continut taiat | MANUAL_PENDING |
| MAN-AND-05 | tastatura virtuala, focus si scroll campuri | MANUAL_PENDING |
| MAN-AND-06 | captura si upload selfie pe date E2E | MANUAL_PENDING |
| MAN-AND-07 | background/foreground in timpul fluxului | MANUAL_PENDING |
| MAN-AND-08 | conexiune intrerupta si reconectare | MANUAL_PENDING |
| MAN-AND-09 | logout si eliminarea sesiunii | MANUAL_PENDING |

## iPhone/iOS Safari

| ID | Caz | Stare |
|---|---|---|
| MAN-IOS-01 | Safari, camera si permisiuni | MANUAL_PENDING |
| MAN-IOS-02 | GPS si permisiuni locatie precise/aproximative | MANUAL_PENDING |
| MAN-IOS-03 | rotatie portrait/landscape | MANUAL_PENDING |
| MAN-IOS-04 | captura si upload selfie | MANUAL_PENDING |
| MAN-IOS-05 | back/forward si refresh fara duplicare | MANUAL_PENDING |
| MAN-IOS-06 | tastatura virtuala, focus si safe areas | MANUAL_PENDING |
| MAN-IOS-07 | background/foreground si expirare sesiune | MANUAL_PENDING |
| MAN-IOS-08 | logout | MANUAL_PENDING |

## Tableta Kiosk

| ID | Caz | Stare |
|---|---|---|
| MAN-TAB-01 | camera reala si selfie | MANUAL_PENDING |
| MAN-TAB-02 | touch si selectie roster | MANUAL_PENDING |
| MAN-TAB-03 | landscape si portrait, butoane netaiate | MANUAL_PENDING |
| MAN-TAB-04 | sleep/wake si sesiune lunga | MANUAL_PENDING |
| MAN-TAB-05 | refresh, reconnectare si recovery lock | MANUAL_PENDING |
| MAN-TAB-06 | logout si revenire la ecranul permis | MANUAL_PENDING |
| MAN-TAB-07 | fullscreen/kiosk mode, daca este folosit operational | MANUAL_PENDING |

Executia manuala ramane blocata pana la existenta unui staging izolat, a conturilor E2E si a unei politici sigure pentru camera/GPS/media.
