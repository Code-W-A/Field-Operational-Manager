import {NextRequest} from 'next/server';
import {adminDb} from '@/lib/firebase/admin';
import {FieldValue} from 'firebase-admin/firestore';
import {POST as sendReport} from '@/app/api/send-email/route';
import {POST as notifyRequest} from '@/app/api/notifications/hr-request/route';
import {servicePdf,revisionPdf} from './documents';
import {loadCurrentTicketRecipients} from '@/lib/work-documents/current-ticket-recipients.server';
import {resolveMailTransportPolicy,areSinkRecipientsAllowed} from '@/lib/email/mail-transport-policy.server';
import {resolveMailTransport} from '@/lib/email/resolve-mail-transport.server';
import {sendMailWithSentCopy} from '@/lib/email/send-with-sent-copy.server';

/** Business success is durable before email. Ambiguous SMTP outcomes require an explicit operator decision. */
export async function dispatchEffect(request:NextRequest,uid:string,mutationId:string) {
 const ref=adminDb.collection('mobileEffects').doc(`${uid}_${mutationId}`);
 const claim:Record<string,any> | null=await adminDb.runTransaction(async tx=>{const s=await tx.get(ref);if(!s.exists)return null;const d=s.data()!;if(d.status!=='pending')return {...d,claimed:false};tx.update(ref,{status:'processing',updatedAt:FieldValue.serverTimestamp()});return {...d,claimed:true};});
 if(!claim)return undefined;
 if(!claim.claimed)return {status:claim.status,error:claim.error || undefined};
 const policy=resolveMailTransportPolicy();
 try {
  if(policy.mode==='disabled')throw new Error('Serviciul de email nu este configurat. Lucrarea a fost salvată.');
  const authorization=request.headers.get('authorization') || '';
  let response:Response | undefined;
  if(claim.action==='request.create')response=await notifyRequest(new NextRequest(new URL('/api/notifications/hr-request',request.url),{method:'POST',headers:{authorization,'Content-Type':'application/json'},body:JSON.stringify({requestId:claim.requestId,event:'created'})}));
  else {
   const current=await loadCurrentTicketRecipients(claim.workId,claim.action==='postpone'?'postponed':'report');
   const recipients=[...current.emails,...(claim.action==='report.finalize'?current.work.reportManualRecipients || []:[])];
   if(policy.mode==='sink' && !areSinkRecipientsAllowed(recipients,policy.sinkAllowedDomains))throw new Error('Destinatarii nu sunt permiși de transportul izolat.');
   if(claim.action==='report.finalize' && policy.mode!=='sink') {
    const form=new FormData();form.set('recipientMode','current-ticket');form.set('lucrareId',claim.workId);form.set('manualEmails',JSON.stringify(current.work.reportManualRecipients || []));
    form.set('pdfFile',new File([new Uint8Array(await servicePdf(adminDb,current.work))],'Raport_FOM.pdf',{type:'application/pdf'}));
    if(current.work.tipLucrare==='Revizie')form.set('opsPdfFile',new File([new Uint8Array(await revisionPdf(adminDb,current.work))],'Fisa_revizie.pdf',{type:'application/pdf'}));
    response=await sendReport(new NextRequest(new URL('/api/send-email',request.url),{method:'POST',headers:{authorization},body:form}));
   } else if(claim.action==='postpone' && policy.mode!=='sink') {
    if(!recipients.length)throw new Error('Nu există destinatari pentru notificare.');
    const mail=await resolveMailTransport(uid);
    await sendMailWithSentCopy({transporter:mail.transporter,smtpAuth:mail.smtpAuth,imapExplicit:mail.imapExplicit,mailOptions:{from:mail.mailFrom,to:recipients.join(', '),subject:`Lucrare amânată - ${current.work.nrLucrare || claim.workId}`,text:`Lucrarea a fost amânată.\nMotiv: ${current.work.motivAmanare || ''}\nLocație: ${current.locationName || ''}`},imapContext:{route:'/api/mobile/commands',requestId:mutationId}});
   }
  }
  if(response && !response.ok)throw new Error('Trimiterea emailului a eșuat. Lucrarea a fost salvată.');
  await ref.update({status:policy.mode==='sink'?'simulated':'sent',updatedAt:FieldValue.serverTimestamp()});return {status:policy.mode==='sink'?'simulated':'sent'};
 } catch(e) {
  const error=(e as Error).message;
  // No automatic replay after an SMTP call: a lost response cannot prove non-delivery.
  await ref.update({status:policy.mode==='disabled'?'failed':'uncertain',error,updatedAt:FieldValue.serverTimestamp()});return {status:policy.mode==='disabled'?'failed':'uncertain',error};
 }
}
