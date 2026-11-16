/** Only runs against local Firebase emulators; never uses live credentials. */
import assert from 'node:assert/strict'
import { initializeApp, deleteApp } from 'firebase/app'
import { getAuth, connectAuthEmulator, signInAnonymously } from 'firebase/auth'
import { getFirestore, connectFirestoreEmulator, doc, getDoc, setDoc } from 'firebase/firestore'
import { getStorage, connectStorageEmulator, ref, uploadBytes, getBytes, deleteObject } from 'firebase/storage'
const projectId = 'demo-fom-attachments'
for (const key of ['FIRESTORE_EMULATOR_HOST','FIREBASE_AUTH_EMULATOR_HOST','FIREBASE_STORAGE_EMULATOR_HOST']) assert.match(process.env[key] || '', /^(127\.0\.0\.1|localhost):\d+$/)
const app = initializeApp({ projectId, apiKey:'demo-key', storageBucket:`${projectId}.appspot.com` })
const auth = getAuth(app); connectAuthEmulator(auth,`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`,{disableWarnings:true})
const db = getFirestore(app); const [dbHost,dbPort]=process.env.FIRESTORE_EMULATOR_HOST.split(':'); connectFirestoreEmulator(db,dbHost,Number(dbPort))
const storage=getStorage(app); const [host,port]=process.env.FIREBASE_STORAGE_EMULATOR_HOST.split(':'); connectStorageEmulator(storage,host,Number(port))
async function seed(name, fields) {
  const response = await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/${projectId}/databases/(default)/documents/${name}`, { method:'PATCH', headers:{Authorization:'Bearer owner','Content-Type':'application/json'},body:JSON.stringify({fields}) })
  assert.equal(response.status,200,await response.text())
}
try {
  const {user}=await signInAnonymously(auth)
  await seed(`users/${user.uid}`,{role:{stringValue:'admin'}})
  const permit={ownerUid:{stringValue:user.uid},ready:{booleanValue:false},expiresAt:{integerValue:String(Date.now()+600000)},size:{integerValue:'4'},contentType:{stringValue:'application/pdf'}}
  await seed('offerEmailAttachments/file-test-1',permit)
  const file=ref(storage,`offer-email-attachments/${user.uid}/file-test-1`)
  await assert.rejects(uploadBytes(file,new Uint8Array(5),{contentType:'application/pdf'}), /unauthorized/)
  await assert.rejects(uploadBytes(file,new Uint8Array(4),{contentType:'application/zip'}), /unauthorized/)
  await uploadBytes(file,new Uint8Array(4),{contentType:'application/pdf'})
  await assert.rejects(uploadBytes(file,new Uint8Array(4),{contentType:'application/pdf'}), /unauthorized/)
  await assert.rejects(getBytes(file), /unauthorized/)
  await assert.rejects(deleteObject(file), /unauthorized/)
  await assert.rejects(uploadBytes(ref(storage,`offer-email-attachments/other/file-test-1`),new Uint8Array(4),{contentType:'application/pdf'}), /unauthorized/)
  await seed('offerEmailAttachments/file-expired',{...permit,expiresAt:{integerValue:'1'}})
  await assert.rejects(uploadBytes(ref(storage,`offer-email-attachments/${user.uid}/file-expired`),new Uint8Array(4),{contentType:'application/pdf'}), /unauthorized/)
  await assert.rejects(getDoc(doc(db,'offerEmailAttachments','file-test-1')), /permission/i)
  await assert.rejects(setDoc(doc(db,'offerEmailAttachments','forged-permit'),{ready:true}), /permission/i)
  console.log('PASS rules: valid immutable upload; size, type, overwrite, read, delete, owner, expiry and forged registry denied.')
} finally { await deleteApp(app) }
