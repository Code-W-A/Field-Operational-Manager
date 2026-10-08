import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { technicianService } from "../../lib/technician/service";
import { mobileService } from "../../lib/mobile/service";
import { versionOf } from "../../packages/fom-domain";

if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8189") throw new Error("Local Emulator only.");
const suffix = `parity-${Date.now()}`;
const app = initializeApp({ projectId: "demo-fom-technician-parity" }, suffix);
const db = getFirestore(app), svc = technicianService(db);
const uid = suffix, name = `Technician ${suffix}`, at = new Date(Date.now() - 7200000).toISOString();
let sequence = 0;
function command(action: any, entityId: string, payload: any = {}, extra: any = {}) {
  return { action, entityId, payload, baseVersion: null, mutationId: `${suffix}-${++sequence}`, occurredAt: at, ...extra };
}
async function work(id: string, extra: any = {}) {
  await db.doc(`lucrari/${id}`).set({ clientId: suffix, client: "Client paritate", locatie: "Locație", locationId: "loc", equipmentId: "eq", echipamentCod: "QR", echipament: "Echipament", tipLucrare: "Intervenție", statusLucrare: "Atribuită", tehnicieni: [name], updatedAt: Timestamp.fromMillis(Date.now() - 9000000), ...extra });
  return versionOf((await db.doc(`lucrari/${id}`).get()).data()!);
}
async function execute(channel: "web" | "mobile", action: any, workId: string, payload: any = {}, extra: any = {}) {
  const baseVersion = versionOf((await db.doc(`lucrari/${workId}`).get()).data()!);
  return svc.command(uid, command(action, workId, payload, { baseVersion, attendanceId: `${suffix}-attendance`, ...extra }), channel);
}
before(async () => {
  await db.doc(`users/${uid}`).set({ role: "tehnician", displayName: name });
  await db.doc(`clienti/${suffix}`).set({ nume: "Client paritate", locatii: [{ id: "loc", nume: "Locație", echipamente: [{ id: "eq", cod: "QR", denumire: "Echipament", dynamicSettings: { "revision.checklistParentId": suffix } }] }] });
  await db.doc(`settings/${suffix}`).set({ type: "category", name: "Verificări" });
  await db.doc(`settings/${suffix}-item`).set({ type: "variable", parentId: suffix, name: "Control", value: "Control" });
  await db.doc(`attendance/${suffix}-attendance`).set({ userId: uid, status: "completed", sessionStart: Timestamp.fromMillis(Date.parse(at) - 3600000), sessionEnd: Timestamp.fromMillis(Date.parse(at) + 60000) });
});
after(async () => { await deleteApp(app); });

test("mobile entry point delegates to the exact same service", () => assert.equal(mobileService, technicianService));
test("web and mobile persist identical intervention/warranty fields and later-sign report", async () => {
  const ids = [`${suffix}-web`, `${suffix}-mobile`];
  const channels = ["web", "mobile"] as const;
  const states: any[] = [];
  for (let i = 0; i < 2; i++) {
    await work(ids[i], { tipLucrare: "Intervenție în garanție" });
    await execute(channels[i], "verify", ids[i], { code: "QR" });
    await execute(channels[i], "intervention.save", ids[i], { constatareLaLocatie: "Diagnostic", descriereInterventie: "Reparație", statusEchipament: "Funcțional", tehnicianGarantieDecizie: "nu_intra", tehnicianGarantieNuIntraMotiv: "Utilizare incorectă", notaInternaTehnician: "Privat", cauzaPrincipalaDefectId: "uzura" });
    // Incremental report input must preserve the warranty decision already saved by either client.
    await execute(channels[i], "report.later", ids[i], { products: [{ name: "Serviciu", quantity: 2, price: 10 }] });
    await execute(channels[i], "report.finalize", ids[i], { numeBeneficiar: "Beneficiar", products: [{ name: "Serviciu", quantity: 2, price: 10 }] });
    const state = (await db.doc(`lucrari/${ids[i]}`).get()).data()!;
    states.push(state);
    assert.equal(state.raportSnapshot.notaInternaTehnician, undefined);
    assert.equal(state.raportSnapshot.constatareLaLocatie, "Diagnostic");
    assert.equal(state.raportDataLocked, true);
    assert.equal(state.tehnicianConfirmaGarantie, false);
    assert.equal(state.timpSosire, at);
    assert.equal(state.timpPlecare, at);
  }
  const keys = ["statusLucrare", "statusFinalizareInterventie", "constatareLaLocatie", "descriereInterventie", "tehnicianGarantieDecizie", "tehnicianGarantieNuIntraMotiv", "notaInternaTehnician", "products", "numeBeneficiar", "timpSosire", "timpPlecare"];
  assert.deepEqual(Object.fromEntries(keys.map(k => [k, states[0][k]])), Object.fromEntries(keys.map(k => [k, states[1][k]])));
});
test("cross-channel retry returns original receipt and never increments report counter twice", async () => {
  const id = `${suffix}-retry`;
  const baseVersion = await work(id, { equipmentVerified: true, timpSosire: at, cauzaPrincipalaDefectId: "uzura" });
  const c = command("report.finalize", id, { products: [] }, { baseVersion, attendanceId: `${suffix}-attendance` });
  const web = await svc.command(uid, c, "web");
  const counter = (await db.doc("numarRaport/document-numar-raport").get()).data();
  const mobile = await svc.command(uid, c, "mobile");
  assert.deepEqual(mobile, web);
  assert.deepEqual((await db.doc("numarRaport/document-numar-raport").get()).data(), counter);
  assert.equal((await db.doc(`mobileEffects/${uid}_${c.mutationId}`).get()).data()?.status, "pending");
});
test("mobile attendance requirement cannot be removed by payload channel; web consult/work policy stays independent", async () => {
  const id = `${suffix}-policy`, baseVersion = await work(id);
  const c = command("verify", id, { code: "QR", channel: "web" }, { baseVersion });
  await assert.rejects(svc.command(uid, c, "mobile"), /Pornește pontajul/);
  assert.equal((await db.doc(`lucrari/${id}`).get()).data()?.equipmentVerified, undefined);
  const result = await svc.command(uid, c, "web");
  assert.equal(result.work.equipmentVerified, true);
});
test("revizie draft and custom legacy point retain all required points; completion is atomic", async () => {
  const id = `${suffix}-revision`;
  await work(id, { tipLucrare: "Revizie", equipmentIds: ["eq"], revision: { equipmentStatus: { eq: "pending" } } });
  await execute("web", "verify", id, { code: "QR", equipmentId: "eq" });
  const { checklistFromSettings } = await import("../../packages/fom-domain");
  const settings = (await db.collection("settings").get()).docs.map(d => ({ id: d.id, ...d.data() }));
  const sections = checklistFromSettings(settings, suffix);
  assert.ok(sections.length);
  sections[0].items.push({ id: "manual-legacy-0.123", label: "Control suplimentar" });
  await execute("web", "revision.save", id, { equipmentId: "eq", sections, draft: true });
  const draft = (await db.doc(`lucrari/${id}/revisions/eq`).get()).data()!;
  assert.equal(draft.completedAt, undefined);
  assert.equal((await db.doc(`lucrari/${id}`).get()).data()?.revision.equipmentStatus.eq, "in_progress");
  const incomplete = structuredClone(sections);
  incomplete[0].items.splice(0, 1);
  await assert.rejects(execute("mobile", "revision.save", id, { equipmentId: "eq", sections: incomplete }), /Structura|Completează/);
  sections.forEach(s => s.items.forEach(item => { item.state = "functional"; }));
  const saved = await execute("mobile", "revision.save", id, { equipmentId: "eq", sections });
  assert.equal(saved.work.revision.equipmentStatus.eq, "done");
  assert.equal(saved.work.revisionEquipmentTimes.eq.startIso, at);
  assert.equal((await db.doc(`lucrari/${id}`).get()).data()?.revision.equipmentStatus.eq, "done");
  assert.equal((await db.doc(`lucrari/${id}/revisions/eq`).get()).data()?.sections[0].items.length, sections[0].items.length);
});
test("reassignment and stale base reject both web and mobile without partial writes", async () => {
  const id = `${suffix}-conflict`, baseVersion = await work(id, { equipmentVerified: true });
  await db.doc(`lucrari/${id}`).update({ updatedAt: Timestamp.now(), descriereInterventie: "Alt dispozitiv" });
  const c = command("intervention.save", id, { descriereInterventie: "Ciornă" }, { baseVersion, attendanceId: `${suffix}-attendance` });
  for (const channel of ["web", "mobile"] as const) await assert.rejects(svc.command(uid, c, channel), /modificat/);
  assert.equal((await db.doc(`lucrari/${id}`).get()).data()?.descriereInterventie, "Alt dispozitiv");
  await db.doc(`lucrari/${id}`).update({ tehnicieni: [] });
  for (const channel of ["web", "mobile"] as const) await assert.rejects(svc.command(uid, c, channel), /atribuit/);
});

test("postponement and per-user notifications have the same atomic effects", async () => {
  for (const channel of ["web", "mobile"] as const) {
    const id = `${suffix}-postpone-${channel}`;
    await work(id, { technicianIds: [uid], dataInterventie: "2026-10-07", notificationReadBy: ["other-user"] });
    await execute(channel, "notification.read", id);
    assert.deepEqual((await db.doc(`lucrari/${id}`).get()).data()?.notificationReadBy, ["other-user", uid]);
    const result = await execute(channel, "postpone", id, { motivAmanare: "Piesa necesară lipsește" });
    assert.equal(result.work.statusLucrare, "Amânată");
    assert.deepEqual(result.work.tehnicieni, []);
    assert.deepEqual(result.work.technicianIds, []);
    assert.equal(result.work.dataInterventie, "2026-10-07");
  }
});

test("attendance preserves web metadata and writes the same condica cell from either channel", async () => {
  await db.doc(`hrEmployees/${suffix}`).set({ userUid: uid, nume: "Popescu", prenume: "Tehnician", sectorIds: [suffix], programLucruStart: "08:00", programLucruEnd: "16:30" });
  await db.doc(`hrDepartments/${suffix}`).set({ name: "Service", managerUid: "manager-parity" });
  const cells: any[] = [];
  for (const channel of ["web", "mobile"] as const) {
    const sessionId = `${suffix}-${channel}-clock`;
    const start = command("attendance.start", sessionId, { mode: "office", specialDayConfirmed: true, location: { lat: 44, lng: 26 }, deviceInfo: { type: "browser", userAgent: "Paritate" }, checkInSelfieUrl: "https://example.test/start.jpg" });
    const result = await svc.command(uid, start, channel);
    assert.equal(result.session.mode, "office");
    assert.equal(result.session.location.lat, 44);
    const stop = command("attendance.stop", sessionId, { mode: "office", location: { lat: 44, lng: 26 }, deviceInfo: { type: "browser", userAgent: "Paritate" }, checkOutSelfieUrl: "https://example.test/end.jpg" }, { occurredAt: new Date(Date.parse(at) + 3600000).toISOString() });
    const stopped = await svc.command(uid, stop, channel);
    assert.equal(stopped.session.checkOutMode, "office");
    assert.equal(stopped.timesheetSync.synced, true);
    const sheet = (await db.doc(`hrTimesheets/${suffix}_${stopped.timesheetSync.monthKey}`).get()).data()!;
    const cell = sheet.days[String(stopped.timesheetSync.day)];
    const lastEntry = cell.entries.find((e: any) => e.attendanceSessionId === sessionId);
    assert.equal(lastEntry.selfieStartUrl, "https://example.test/start.jpg");
    assert.equal(lastEntry.selfieEndUrl, "https://example.test/end.jpg");
    cells.push({ ...lastEntry, attendanceSessionId: undefined });
    await db.doc(`attendance/${sessionId}`).delete();
    await db.doc(`hrTimesheets/${suffix}_${stopped.timesheetSync.monthKey}`).delete();
  }
  assert.deepEqual(cells[0], cells[1]);
});

test("personal requests share HR routing, overlap protection and one receipt across channels", async () => {
  const payload = { kind: "CO", sectorId: suffix, payload: { kind: "CO", startDate: "2027-02-01", endDate: "2027-02-02" }, requesterUid: "forged-user", managerUid: "forged-manager" };
  const c = command("request.create", suffix, payload);
  const web = await svc.command(uid, c, "web");
  const mobile = await svc.command(uid, c, "mobile");
  assert.deepEqual(web, mobile);
  assert.equal(web.request.requesterUid, uid);
  assert.equal(web.request.managerUid, "manager-parity");
  assert.equal(web.request.employeeId, suffix);
  await assert.rejects(svc.command(uid, command("request.create", suffix, payload), "mobile"), /Există deja o cerere/);
});

test("revision empty sections use template; historic sections remain authoritative", async()=>{
  for(const channel of ["web","mobile"] as const){
    const id=`${suffix}-empty-${channel}`;
    await work(id,{tipLucrare:"Revizie",equipmentIds:["eq"],revision:{equipmentStatus:{eq:"pending"}}});
    await execute(channel,"verify",id,{equipmentId:"eq",code:"QR"});
    await db.doc(`lucrari/${id}/revisions/eq`).set({sections:[]},{merge:true});
    const sections=[{id:`${suffix}__root`,title:"Verificări",items:[{id:`${suffix}-item`,label:"Control",state:"functional",obs:"Control efectuat"}]}];
    await execute(channel,"revision.save",id,{equipmentId:"eq",sections});
    assert.equal((await db.doc(`lucrari/${id}`).get()).data()?.revision.equipmentStatus.eq,"done");
    const historical=[{id:"historical-section",title:"Istoric",items:[{id:"historical-point",label:"Punct vechi",state:"functional"}]}];
    await db.doc(`lucrari/${id}/revisions/eq`).set({sections:historical},{merge:true});
    await execute(channel,"revision.save",id,{equipmentId:"eq",sections:historical});
    assert.equal((await db.doc(`lucrari/${id}/revisions/eq`).get()).data()?.sections[0].id,"historical-section");
  }
});
test("paid reports require findings and operations, include current payload, and stay locked",async()=>{
  const paidUid=`${uid}-paid`, paidName=`${name} paid`;
  await db.doc(`users/${paidUid}`).set({role:"tehnician",displayName:paidName});
  const paidExecute=async(action: string,id: string,payload:any)=>svc.command(paidUid,command(action,id,payload,{baseVersion:versionOf((await db.doc(`lucrari/${id}`).get()).data()!)}),"web");
  for(const action of ["report.finalize","report.later"] as const){
    const id=`${suffix}-paid-${action.replace('.','-')}`;
    await work(id,{tipLucrare:"Intervenție contra cost",technicianIds:[paidUid],tehnicieni:[paidName]});
    await paidExecute("verify",id,{code:"QR"});
    await assert.rejects(paidExecute(action,id,{cauzaPrincipalaDefectId:"uzura"}),/Completează constatarea/);
    const fields={constatareLaLocatie:"Diagnostic nou",descriereInterventie:"Reparație nouă",cauzaPrincipalaDefectId:"uzura",numeBeneficiar:"Beneficiar"};
    await paidExecute(action,id,fields);
    const saved=(await db.doc(`lucrari/${id}`).get()).data()!;
    assert.equal(saved.descriereInterventie,fields.descriereInterventie);
    if(action==="report.finalize"){
      assert.equal(saved.raportSnapshot.constatareLaLocatie,fields.constatareLaLocatie);
      await assert.rejects(paidExecute("intervention.save",id,{descriereInterventie:"Modificare interzisă"}),/nu mai permite/);
    }else assert.equal(saved.statusLucrare,"Fără semnătură");
  }
});
