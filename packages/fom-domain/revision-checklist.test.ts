import test from "node:test";
import assert from "node:assert/strict";
import { checklistFromSettings, validateRevision, equipmentFor } from "./index";

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
  assert.deepEqual(sections.map(s=>s.id),["root__root","cat","sub"]);
  const answers=sections.map(s=>({...s,items:s.items.map(i=>({...i,state:"functional" as const}))}));
  assert.deepEqual(validateRevision(answers,sections),answers.map(s=>({...s,items:s.items.map(i=>({...i,obs:""}))})));
  assert.throws(()=>validateRevision(answers.slice(1),sections),/Checklistul/);
});
test("orphaned root follows its authoritative children; missing template stays empty",()=>{
  assert.deepEqual(checklistFromSettings(settings.slice(1),"root").map(s=>s.id),["root__root","cat","sub"]);
  assert.deepEqual(checklistFromSettings(settings,"missing"),[]);
});
test("equipment template identifiers are trimmed with metadata fallback",()=>{
  const work={tipLucrare:"Revizie",equipmentIds:["eq"],revision:{equipment:[{equipmentId:"eq",revisionChecklistTemplateId:" root "}]}};
  assert.equal(equipmentFor(work,{echipamente:[{id:"eq",dynamicSettings:{"revision.checklistParentId":"   "}}]})[0].rootId,"root");
});
