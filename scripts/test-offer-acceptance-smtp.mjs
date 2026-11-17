/** Real Firestore transactions and SMTP sockets, restricted to local demo services. */
import assert from "node:assert/strict";
import net from "node:net";
import { randomUUID, createHash } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import { build } from "esbuild";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { NextRequest } from "next/server.js";
assert.match(
  process.env.FIRESTORE_EMULATOR_HOST || "",
  /^(127\.0\.0\.1|localhost):\d+$/,
);
const app = initializeApp(
  { projectId: "demo-fom-acceptance-smtp" },
  "acceptance-smtp",
);
const db = getFirestore(app);
globalThis.__acceptanceSmtpDb = db;
const delivered = [];
const attempts = [];
const sockets = new Set();
let failIssuer = false;
const smtp = net.createServer((socket) => {
  sockets.add(socket);
  socket.on("close", () => sockets.delete(socket));
  let buffer = "",
    data = false,
    raw = [],
    recipients = [];
  socket.write("220 localhost FOM test SMTP\r\n");
  socket.on("data", (chunk) => {
    buffer += chunk.toString();
    let end;
    while ((end = buffer.indexOf("\r\n")) >= 0) {
      const line = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      if (data) {
        if (line !== ".") {
          raw.push(line);
          continue;
        }
        delivered.push({ recipients: [...recipients], raw: raw.join("\r\n") });
        data = false;
        raw = [];
        socket.write("250 captured locally\r\n");
        continue;
      }
      const command = line.split(" ")[0].toUpperCase();
      if (command === "EHLO" || command === "HELO")
        socket.write("250-localhost\r\n250 8BITMIME\r\n");
      else if (command === "MAIL") {
        recipients = [];
        socket.write("250 OK\r\n");
      } else if (command === "RCPT") {
        const recipient = /<([^>]+)>/.exec(line)?.[1];
        attempts.push(recipient);
        if (failIssuer && recipient === "issuer@example.test")
          socket.write("550 simulated issuer mailbox failure\r\n");
        else {
          recipients.push(recipient);
          socket.write("250 OK\r\n");
        }
      } else if (command === "DATA") {
        data = true;
        socket.write("354 end with dot\r\n");
      } else if (command === "QUIT") {
        socket.end("221 goodbye\r\n");
      } else socket.write("250 OK\r\n");
    }
  });
});
await new Promise((resolve) => smtp.listen(0, "127.0.0.1", resolve));
globalThis.__acceptanceSmtpPort = smtp.address().port;
const adapters = {
  "@/lib/firebase/admin": `export const adminDb=globalThis.__acceptanceSmtpDb;export const adminApp={};`,
  "@/lib/email/resolve-mail-transport.server": `import nodemailer from 'nodemailer';export async function resolveMailTransport(){return {transporter:nodemailer.createTransport({host:'127.0.0.1',port:globalThis.__acceptanceSmtpPort,secure:false,ignoreTLS:true,connectionTimeout:3000,socketTimeout:3000}),smtpAuth:{},imapExplicit:null,mailFrom:'fom@example.test',source:'local-test'};}`,
  "@/lib/offer/certified-pdf.server": `export async function generateCertifiedCrmOfferPdf(){return null}export async function generateCertifiedLucrariOfferPdf(){return null}`,
  "@/lib/sentry/report-error": `export function reportToSentry(){}`,
};
async function load(source) {
  const result = await build({
    entryPoints: [
      source === "crm"
        ? "app/api/crm/offers/respond/route.ts"
        : "app/api/offer/respond/route.ts",
    ],
    bundle: true,
    write: false,
    platform: "node",
    format: "cjs",
    packages: "external",
    plugins: [
      {
        name: "local-ports",
        setup(b) {
          b.onResolve({ filter: /^@\// }, ({ path }) =>
            adapters[path] ? { path, namespace: "local" } : undefined,
          );
          b.onLoad({ filter: /.*/, namespace: "local" }, ({ path }) => ({
            contents: adapters[path],
            loader: "js",
            resolveDir: process.cwd(),
          }));
        },
      },
    ],
  });
  const module = { exports: {} };
  new Function("require", "module", "exports", result.outputFiles[0].text)(
    createRequire(path.resolve("package.json")),
    module,
    module.exports,
  );
  return module.exports;
}
async function fixture(source) {
  const id = randomUUID(),
    token = randomUUID(),
    proof = randomUUID();
  const issuer = { userId: "test-issuer", email: "issuer@example.test" };
  await db.doc("users/test-issuer").set({ email: issuer.email });
  const verification = {
    email: "client@example.test",
    responseProofHash: createHash("sha256").update(proof).digest("hex"),
    responseProofExpiresAt: new Date(Date.now() + 600000),
  };
  const ref = db.doc(`${source === "crm" ? "crm_offers" : "lucrari"}/${id}`);
  if (source === "crm") {
    await db
      .doc(`crm_opportunities/${id}`)
      .set({ code: "OP-QA", title: "Test local", clientId: id });
    await db.doc(`crm_clients/${id}`).set({ name: "Client test <script>&" });
    await ref.set({
      status: "SENT",
      actionToken: token,
      actionExpiresAt: new Date(Date.now() + 600000),
      verification,
      opportunityId: id,
      version: 1,
      createdById: issuer.userId,
      issuer,
      snapshot: { comments: "PRIVATE COMMENT" },
    });
  } else
    await ref.set({
      nrLucrare: "#QA",
      client: "Client test <script>&",
      createdBy: "different-ticket-creator",
      offerActionToken: token,
      offerActionExpiresAt: new Date(Date.now() + 600000),
      offerActionVerification: verification,
      offerActionSnapshot: {
        savedAt: "qa-version",
        comments: "PRIVATE COMMENT",
      },
      lastOfferEmail: { issuer, offerVersionSavedAt: "qa-version" },
    });
  return {
    id,
    ref,
    token,
    proof,
    request(action = "accept", patch = {}) {
      return new NextRequest(
        `http://localhost/api/${source === "crm" ? "crm/offers" : "offer"}/respond`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            lucrareId: id,
            offerId: id,
            token,
            verificationProof: proof,
            action,
            ...patch,
          }),
        },
      );
    },
  };
}
try {
  for (const source of ["lucrari", "crm"]) {
    const route = await load(source);
    const f = await fixture(source),
      before = delivered.length;
    const responses = await Promise.all([
      route.POST(f.request()),
      route.POST(f.request()),
    ]);
    assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
    assert.equal((await route.POST(f.request())).status, 409);
    const row = (await f.ref.get()).data();
    assert.equal(
      source === "crm" ? row.response.status : row.offerResponse.status,
      "accept",
    );
    const messages = delivered
      .slice(before)
      .filter((m) => m.recipients.includes("issuer@example.test"));
    assert.equal(messages.length, 1);
    assert.deepEqual(messages[0].recipients, ["issuer@example.test"]);
    const raw = messages[0].raw.replace(/=\r\n/g, "");
    assert.match(raw, /Content-Type: multipart\/alternative/);
    assert.ok(
      !raw.includes(f.token) &&
        !raw.includes(f.proof) &&
        !raw.includes("PRIVATE COMMENT"),
    );
    const events = await db
      .collection("offerEvents")
      .where(source === "crm" ? "offerId" : "lucrareId", "==", f.id)
      .get();
    assert.equal(
      events.docs.filter(
        (d) =>
          d.data().type === "OFFER_ISSUER_ACCEPTANCE_NOTIFICATION" &&
          d.data().status === "sent",
      ).length,
      1,
    );
    const mailEvents = await db
      .collection("emailEvents")
      .where("meta.notification", "==", "offer_issuer_acceptance")
      .get();
    assert.ok(
      mailEvents.docs.some(
        (d) =>
          d.data().status === "sent" &&
          (d.data().meta.offerId === f.id ||
            d.data().meta.lucrareId === f.id) &&
          d.data().messageId,
      ),
    );
    console.log(
      `PASS ${source}: real commit, concurrent accept/replay, exactly one SMTP delivery to issuer, MIME and audit confirmed`,
    );
    const rejected = await fixture(source),
      n = delivered.filter((m) =>
        m.recipients.includes("issuer@example.test"),
      ).length;
    assert.equal((await route.POST(rejected.request("reject"))).status, 200);
    const invalid = await fixture(source);
    assert.equal(
      (
        await route.POST(
          invalid.request("accept", { verificationProof: "wrong" }),
        )
      ).status,
      403,
    );
    assert.equal(
      delivered.filter((m) => m.recipients.includes("issuer@example.test"))
        .length,
      n,
    );
    console.log(
      `PASS ${source}: refusal and invalid client proof produce no issuer email`,
    );
    failIssuer = true;
    const failed = await fixture(source),
      a = attempts.filter((x) => x === "issuer@example.test").length;
    assert.equal((await route.POST(failed.request())).status, 200);
    assert.equal((await route.POST(failed.request())).status, 409);
    assert.equal(
      attempts.filter((x) => x === "issuer@example.test").length,
      a + 1,
    );
    const failedRow = (await failed.ref.get()).data();
    assert.equal(
      source === "crm"
        ? failedRow.response.status
        : failedRow.offerResponse.status,
      "accept",
    );
    const failures = await db
      .collection("offerEvents")
      .where(source === "crm" ? "offerId" : "lucrareId", "==", failed.id)
      .get();
    assert.ok(
      failures.docs.some(
        (d) =>
          d.data().type === "OFFER_ISSUER_ACCEPTANCE_NOTIFICATION" &&
          d.data().status === "failed",
      ),
    );
    failIssuer = false;
    console.log(
      `PASS ${source}: SMTP 550 is logged; acceptance survives; replay never resends`,
    );
  }
  console.log(
    "PASS: all SMTP traffic stayed on 127.0.0.1; no production records or external inboxes used.",
  );
} finally {
  for (const s of sockets) s.destroy();
  await new Promise((resolve) => smtp.close(resolve));
  await deleteApp(app);
}
