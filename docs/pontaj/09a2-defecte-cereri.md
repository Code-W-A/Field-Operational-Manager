# ETAPA 9A.2 - defecte cereri HR

## Remediate

1. `APP_BUG`: triggerul `onHrRequestApproved` suprascria celulele proiectate de client fara `sourceRequestId` si `sourceRequestKind`. Corectat in `firebase-functions/src/index.ts`; regresie: `approval.spec.ts` pentru CO, CFP, CM, DEL si IN.
2. `APP_BUG`: doua taburi puteau decide aceeasi cerere prin update neconditionat. Corectat prin tranzactie care accepta numai tranzitia `pending -> approved|rejected`; regresie: `concurrency.spec.ts`.
3. `APP_BUG`: intervalele calendaristice invalide/inversate si IN cu durata nula puteau ajunge la persistenta. Corectat prin `lib/hr/request-validation.ts`; regresie unitara si UI.
4. `APP_BUG`: dialogurile puteau porni doua submit-uri inainte de rerandare. Corectat prin guard synchron `useRef`; regresie UI dublu click.
5. `APP_BUG`: CM accepta la runtime fisiere neconforme sau goale. Corectat pentru PDF/imagine si dimensiune nenula; limita maxima nu exista in contract.
