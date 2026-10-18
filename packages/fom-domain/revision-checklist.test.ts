import test from "node:test";
import assert from "node:assert/strict";
import { checklistFromSettings, validateRevision, equipmentFor, revisionSectionsForSheet, revisionChecksComplete, revisionChecksVerified } from "./index";

const settings = [
  {id:"root",name:"Checklist"},
  {id:"root-var",parentId:"root",type:"variable",name:"Control rădăcină"},
  {id:"cat",parentId:"root",type:"category",name:"Categorie"},
  {id:"cat-var",parentId:"cat",type:"variable",name:"Control direct"},
  {id:"hidden",parentId:"cat",type:"category",name:"Subcategorie ascunsă"},
  {id:"hidden-var",parentId:"hidden",type:"variable",name:"Nu apare în formular"},
  {id:"branch",parentId:"root",type:"category",name:"Ramură"},
  {id:"sub",parentId:"branch",type:"category",name:"Subcategorie"},
  {id:"sub-var",parentId:"sub",type:"variable",name:"Control subcategorie"},
];
test("canonical checklist matches visible web sections, including mixed trees", () => {
  const sections = checklistFromSettings(settings," root ");
  assert.deepEqual(sections.map(s=>s.id),["root__root","cat","hidden","sub"]);
  const answers=sections.map(s=>({...s,items:s.items.map(i=>({...i,state:"functional" as const}))}));
  assert.deepEqual(validateRevision(answers,sections),answers.map(s=>({...s,items:s.items.map(i=>({...i,obs:""}))})));
  assert.throws(()=>validateRevision(answers.slice(1),sections),/Checklistul/);
});
test("orphaned root follows its authoritative children; missing template stays empty",()=>{
  assert.deepEqual(checklistFromSettings(settings.slice(1),"root").map(s=>s.id),["root__root","cat","hidden","sub"]);
  assert.deepEqual(checklistFromSettings(settings,"missing"),[]);
});
test("equipment template identifiers are trimmed with metadata fallback",()=>{
  const work={tipLucrare:"Revizie",equipmentIds:["eq"],revision:{equipment:[{equipmentId:"eq",revisionChecklistTemplateId:" root "}]}};
  assert.equal(equipmentFor(work,{echipamente:[{id:"eq",dynamicSettings:{"revision.checklistParentId":"   "}}]})[0].rootId,"root");
});

test("variables with children are groups; only terminal variables can be checked", () => {
  const settings = [
    { id: "root", name: "Ușă" },
    { id: "leaf", parentId: "root", type: "variable", name: "Control direct" },
    { id: "parent", parentId: "root", type: "variable", name: "Canat mobil" },
    { id: "middle", parentId: "parent", type: "variable", name: "Sticlă" },
    { id: "last", parentId: "middle", type: "variable", name: "Integritate" },
    { id: "empty", parentId: "root", type: "category", name: "Grup gol" },
  ];
  const sections = checklistFromSettings(settings, "root");
  assert.deepEqual(sections.flatMap(s => s.items.map(i => i.id)), ["leaf", "last"]);
  assert.equal("parents" in sections[1], false);
  assert.equal(sections[1].title, "Sticlă");
  const answers = sections.map(s => ({ ...s, items: s.items.map(i => ({ ...i, state: "functional" as const })) }));
  assert.equal(validateRevision(answers, sections, { customItems: true })[1].title, "Sticlă");
  const forged = answers.map((s, index) => index ? s : { ...s, items: [...s.items, { id: "parent", label: "Canat mobil", state: "functional" as const }] });
  assert.throws(() => validateRevision(forged, sections, { customItems: true }), /Structura/);
});

test("saved sheets keep their own checks and observations even when reopened as a draft", () => {
  const current = checklistFromSettings([
    { id: "root", name: "Ușă" },
    { id: "parent", parentId: "root", type: "variable", name: "Canat mobil" },
    { id: "child", parentId: "parent", type: "variable", name: "Verificare sticlă" },
  ], "root");
  const saved = [{ id: "root__root", title: "Istoric", items: [
    { id: "parent", label: "Canat mobil", state: "functional" as const, obs: "Observație istorică" },
    { id: "manual-1", label: "Control manual", state: "nefunctional" as const },
  ] }];
  assert.equal(revisionSectionsForSheet(saved, current), saved);
  assert.doesNotThrow(() => validateRevision(saved, revisionSectionsForSheet(saved, current), { customItems: true }));
  const draft = JSON.parse(JSON.stringify(saved));
  assert.deepEqual(revisionSectionsForSheet(draft, current), saved);
  assert.deepEqual(revisionSectionsForSheet(saved, []), saved);
});

test("new or QR-only sheets use terminal children under their immediate parent", () => {
  const checklist = checklistFromSettings([
    { id: "root", name: "Ușă batantă" },
    { id: "parent", parentId: "root", type: "variable", name: "Canat mobil" },
    { id: "glass", parentId: "parent", type: "variable", name: "Verificare sticlă" },
    { id: "integrity", parentId: "parent", type: "variable", name: "Verificare integritate canat mobil" },
    { id: "corners", parentId: "parent", type: "variable", name: "Verificare colțare de îmbinare" },
  ], "root");
  const sections = revisionSectionsForSheet([], checklist);
  assert.equal(sections.length, 1);
  assert.equal(sections[0].title, "Canat mobil");
  assert.equal(sections[0].showTitle, true);
  assert.deepEqual(sections[0].items.map(i => i.id), ["glass", "integrity", "corners"]);
  assert.equal(revisionChecksComplete(sections), false);
  assert.equal(revisionChecksVerified(sections), false);
  assert.equal(revisionSectionsForSheet(undefined, checklist), checklist);
  const checked = sections.map(s => ({ ...s, items: s.items.map(i => ({ ...i, state: "functional" as const })) }));
  assert.equal(revisionChecksVerified(checked), true);
  assert.equal(revisionChecksVerified([]), false);
});
