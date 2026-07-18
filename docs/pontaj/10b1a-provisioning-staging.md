# ETAPA 10B.1A - provisioning staging

Checklist administrativ. Nu se stocheaza parole, tokenuri, service accounts sau cookie-uri in acest document ori in repo.

- [ ] 1. Firebase project ID staging confirmat.
- [ ] 2. Firebase project number confirmat.
- [ ] 3. Auth domain staging confirmat.
- [ ] 4. Firestore database staging confirmata.
- [ ] 5. Storage bucket staging confirmat.
- [ ] 6. Functions region confirmata.
- [ ] 7. Proiectul Vercel staging identificat.
- [ ] 8. URL-ul HTTPS staging confirmat.
- [ ] 9. Mapping-ul branch/commit aprobat si imuabil confirmat.
- [ ] 10. Variabilele Vercel staging introduse prin environment/secret manager.
- [ ] 11. Email `disabled` sau sink complet izolat si allowlistat.
- [ ] 12. Push si SMS dezactivate.
- [ ] 13. Politica reverse-geocode staging aprobata; implicit disabled.
- [ ] 14. Cont admin E2E dedicat.
- [ ] 15. Cont tehnician E2E dedicat.
- [ ] 16. Cont kiosk E2E dedicat.
- [ ] 17. Cont client/unauthorized E2E dedicat.
- [ ] 18. Confirmare scrisa ca staging nu contine date reale.
- [ ] 19. Billing si quota staging confirmate.
- [ ] 20. Persoana care aproba deploy-ul identificata.
- [ ] 21. Politica exacta a rolului dispecer confirmata.
- [ ] 22. Politica rutei HR notification aprobata: owner la creare, admin/manager asignat la decizie, dispecer deny pana la decizie.
- [ ] 23. Politica callable scheduled works aprobata: admin-only sau contract alternativ explicit.

Inainte de deploy se mai confirma: allowlist-ul contine exact project ID-ul furnizat, denylist-ul productiei ramane activ, `.firebaserc` nu este folosit implicit, sursa este commitul aprobat si worktree-ul este curat. Credentialele conturilor se furnizeaza separat prin secret manager/environment.

