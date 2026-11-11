/** Enforce procedure permissions against the actual rules in an isolated demo emulator. */
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, copyFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
const project='demo-fom-procedures', host='127.0.0.1:8287'
if (!process.env.FIRESTORE_EMULATOR_HOST) {
 const directory=await mkdtemp(path.join(tmpdir(),'fom-procedures-rules-'))
 await copyFile('firestore.rules',path.join(directory,'firestore.rules'))
 await writeFile(path.join(directory,'firebase.json'),JSON.stringify({firestore:{rules:'firestore.rules'},emulators:{firestore:{host:'127.0.0.1',port:8287},hub:{port:4507},logging:{port:4607},ui:{enabled:false}}}))
 const quote=value=>"'"+value.replaceAll("'","'\\''")+"'"
 const emulatorEnv={...process.env,FIREBASE_EMULATORS_PATH:path.join(tmpdir(),'fom-procedures-emulators')};delete emulatorEnv.DEBUG
 const child=spawn('firebase',['emulators:exec','--only','firestore','--project',project,'--config',path.join(directory,'firebase.json'),`${quote(process.execPath)} ${quote(fileURLToPath(import.meta.url))}`],{cwd:directory,stdio:'inherit',env:emulatorEnv})
 child.on('exit',code=>process.exitCode=code??1)
 child.on('error',error=>{console.error(error);process.exitCode=1})
} else {
 assert.equal(process.env.FIRESTORE_EMULATOR_HOST,host)
 assert.equal(process.env.GCLOUD_PROJECT,project)
 const base=`http://${host}/v1/projects/${project}/databases/(default)/documents/`
 const token=uid=>`${Buffer.from(JSON.stringify({alg:'none',typ:'JWT'})).toString('base64url')}.${Buffer.from(JSON.stringify({aud:project,iss:`https://securetoken.google.com/${project}`,sub:uid,user_id:uid,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600,firebase:{sign_in_provider:'custom'}})).toString('base64url')}.`
 const call=async(auth,route,method='GET',fields)=>fetch(base+route,{method,headers:{'Content-Type':'application/json',...(auth?{Authorization:`Bearer ${auth}`}:{})},...(fields?{body:JSON.stringify({fields:Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,{stringValue:v}]))})}:{})})
 for(const role of ['admin','dispecer','tehnician','client','kiosk']) assert.equal((await call('owner',`users/${role}`,'PATCH',{role})).status,200)
 assert.equal((await call(token('admin'),'note-interne/existing','PATCH',{title:'Existing',content:'Text'})).status,200)
 for(const role of ['admin','dispecer','tehnician','client','kiosk',null,'missing']) {
  const auth=role?token(role):null, read=['admin','dispecer','tehnician'].includes(role),write=role==='admin'
  assert.equal((await call(auth,'note-interne/existing')).status,read?200:403,`${role}: read`)
  assert.equal((await call(auth,'note-interne')).status,read?200:403,`${role}: list`)
  assert.equal((await call(auth,`note-interne/new-${role}`,'PATCH',{title:'New',content:'Text'})).status,write?200:403,`${role}: create`)
  assert.equal((await call(auth,'note-interne/existing','PATCH',{title:'Updated',content:'Text'})).status,write?200:403,`${role}: update`)
  assert.equal((await call(auth,'note-interne/existing/children/forged','PATCH',{title:'Bypass'})).status,403,`${role}: recursive wildcard bypass`)
  if(!write) assert.equal((await call(auth,'note-interne/existing','DELETE')).status,403,`${role}: delete`)
 }
 assert.equal((await call(token('admin'),'note-interne/existing','DELETE')).status,200)
 console.log('PASS: actual Firestore rules; internal reads, admin CRUD, client/kiosk/anonymous/unknown denial and wildcard bypass checks.')
}
