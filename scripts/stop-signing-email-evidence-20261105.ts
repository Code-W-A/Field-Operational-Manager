import {loadEnvConfig} from '@next/env';
import {initializeApp,cert,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {mkdir,writeFile} from 'node:fs/promises';
async function main(){loadEnvConfig(process.cwd());if(process.env.FIRESTORE_EMULATOR_HOST)throw Error('Unexpected emulator');const app=initializeApp({credential:cert({projectId:process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_ADMIN_CLIENT_EMAIL,privateKey:process.env.FIREBASE_ADMIN_PRIVATE_KEY!.replace(/\\n/g,'\n')})});try{const db=getFirestore(app);const effects=await db.collection('mobileEffects').where('workId','==','test-stop-signing-20261105-paid').get();console.log(JSON.stringify(effects.docs.map(d=>({id:d.id,...d.data()}))));}finally{await deleteApp(app);}}main().catch(e=>{console.error(e);process.exitCode=1;});
