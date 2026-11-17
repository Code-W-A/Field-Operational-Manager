/** Real signing service + public route + browser component, isolated Firestore and sink mail only. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { build } from "esbuild";
import { chromium, expect } from "@playwright/test";

async function main() {
  assert.match(
    process.env.FIRESTORE_EMULATOR_HOST || "",
    /^(127\.0\.0\.1|localhost):\d+$/,
  );
  assert.equal(
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    "demo-fom-remote-browser",
  );
  assert.equal(process.env.MAIL_TRANSPORT_MODE, "sink");
  const { adminDb: db } = await import("../lib/firebase/admin");
  const { signingServer } = await import("../lib/remote-signatures/server");
  const { POST } = await import("../app/api/remote-signatures/public/route");
  const { NextRequest } = await import("next/server");
  const dir = await mkdtemp(path.join(tmpdir(), "fom-remote-browser-"));
  const png =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAB4AAAAKCAYAAACjd+4vAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAIElEQVR4nGMQsQj6PxCYYdRikVGLLUYtDhq1+D85FgMAZd7kDNae2IoAAAAASUVORK5CYII=";
  const user = `tech-${randomUUID()}`,
    workId = `work-${randomUUID()}`,
    clientId = `client-${randomUUID()}`;
  await db.doc(`users/${user}`).set({ role: "tehnician", displayName: user });
  await db
    .doc(`clienti/${clientId}`)
    .set({
      nume: "Client test",
      locatii: [{ id: "loc", nume: "Locatie test", persoaneContact: [] }],
    });
  await db
    .doc(`lucrari/${workId}`)
    .set({
      client: "Client test",
      clientId,
      locationId: "loc",
      locatie: "Locatie test",
      technicianIds: [user],
      tehnicieni: [user],
      nrLucrare: "#TEST-EMAIL",
      statusLucrare: "Fără semnătură",
      tipLucrare: "Intervenție contra cost",
      equipmentVerified: true,
      constatareLaLocatie: "Test constatare",
      descriereInterventie: "Test reparație",
      cauzaPrincipalaDefectId: "uzura",
      products: [],
      timpSosire: "2026-11-17T10:00:00Z",
      timpPlecare: "2026-11-17T11:00:00Z",
    });
  const js = await build({
    stdin: {
      contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {BeneficiarySigning} from './components/remote-signatures/beneficiary'; createRoot(document.getElementById('root')).render(<BeneficiarySigning/>);`,
      loader: "tsx",
      resolveDir: process.cwd(),
    },
    bundle: true,
    write: false,
    format: "iife",
    define: { "process.env.NODE_ENV": '"production"' },
    jsx: "automatic",
  });
  let origin = "";
  const server = createServer(async (req, res) => {
    try {
      if (req.url?.startsWith("/api/remote-signatures/public")) {
        const chunks: Buffer[] = [];
        for await (const c of req) chunks.push(Buffer.from(c));
        const response = await POST(
          new NextRequest(origin + req.url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: Buffer.concat(chunks),
          }),
        );
        res.writeHead(response.status, Object.fromEntries(response.headers));
        res.end(Buffer.from(await response.arrayBuffer()));
        return;
      }
      if (req.url === "/app.js") {
        res.writeHead(200, { "Content-Type": "text/javascript" });
        res.end(js.outputFiles[0].text);
        return;
      }
      // Tailwind-sized layout equivalents, independent of the application auth shell.
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(
        `<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:16px Arial;margin:0;background:#f5f7f9;color:#182126}*{box-sizing:border-box}main{padding:16px;max-width:768px;margin:auto}main>*{margin-bottom:16px}button,input{font:inherit;padding:12px;max-width:100%;border:1px solid #c7ced4;border-radius:8px}button{background:#ddedf0;margin:4px;cursor:pointer}button:disabled{opacity:.5}input:not([type=checkbox]){display:block;width:100%}iframe{width:100%;height:320px}img{width:100%;max-height:240px;object-fit:contain}canvas{touch-action:none}a{display:block;margin-bottom:12px}.space-y-3>*{margin-bottom:12px}.break-all{word-break:break-all}[role=alert]{color:#a21c1c}</style></head><body><div id="root"></div><script src="/app.js"></script></body></html>`,
      );
    } catch {
      res.writeHead(500);
      res.end("Test harness failed");
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as any).port}`;
  process.env.REMOTE_SIGNATURE_ORIGIN = origin;
  const service = signingServer(),
    r = await service.create(user, {
      requestId: randomUUID(),
      workId,
      kind: "report",
      email: "beneficiary@example.invalid",
      technicianSignature: png,
    });
  assert.equal(r!.delivery.invite.status, "simulated");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
    });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(r!.url!);
    await expect(
      page.getByRole("link", { name: "Deschide documentul PDF" }),
    ).toBeVisible();
    await page.getByLabel("Numele beneficiarului").fill("Beneficiar de test");
    await page
      .getByLabel("Confirmă adresa")
      .fill("beneficiary@example.invalid");
    await page.getByRole("button", { name: "Adaugă semnătura" }).click();
    const box = (await page.locator("canvas").boundingBox())!;
    await page.mouse.move(box.x + 20, box.y + 120);
    await page.mouse.down();
    for (let i = 0; i < 30; i++)
      await page.mouse.move(
        box.x + 20 + i * 8,
        box.y + 100 + Math.sin(i / 3) * 45,
      );
    await page.mouse.up();
    await page.getByRole("button", { name: "Folosește semnătura" }).click();
    const image = page.getByAltText("Previzualizarea semnăturii");
    await expect(image).toBeVisible();
    const preview = await image.getAttribute("src");
    await page.getByRole("checkbox").check();
    await page.screenshot({
      path: path.join(dir, "beneficiary-preview-390.png"),
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Trimite linkul pentru confirmarea finală" })
      .click();
    await expect(
      page.getByText("Emailul de confirmare a fost simulat", { exact: false }),
    ).toBeVisible();
    const request = (await db.doc(`remoteSignatures/${r!.id}`).get()).data()!;
    assert.equal(request.signature, preview);
    assert.equal(
      (await db.doc(`lucrari/${workId}`).get()).data()!.raportDataLocked,
      undefined,
    );
    const mail = (
      await db.collection(`remoteSignatures/${r!.id}/testMail`).get()
    ).docs
      .map((d) => d.data())
      .find((d) => d.subject.startsWith("Confirmă"))!;
    const finalUrl = mail.text.match(/http:\/\/[^\s]+/)![0];
    await page.setViewportSize({ width: 320, height: 760 });
    await page.goto(finalUrl);
    await expect(
      page.getByAltText("Semnătura pentru confirmare"),
    ).toBeVisible();
    assert.equal(
      (await db.doc(`lucrari/${workId}`).get()).data()!.raportDataLocked,
      undefined,
      "Opening second link does not sign",
    );
    await expect(
      page.getByRole("button", { name: "Confirm semnătura și finalizez" }),
    ).toBeDisabled();
    await page.getByRole("checkbox").check();
    await page.screenshot({
      path: path.join(dir, "confirmation-320.png"),
      fullPage: true,
    });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      true,
    );
    await page
      .getByRole("button", { name: "Confirm semnătura și finalizez" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Document semnat", exact: true }),
    ).toBeVisible();
    const work = (await db.doc(`lucrari/${workId}`).get()).data()!;
    assert.equal(work.raportSnapshot.semnaturaBeneficiar, preview);
    const { signingPdf } = await import("../lib/remote-signatures/server");
    const final = (await db.doc(`remoteSignatures/${r!.id}`).get()).data()!;
    const pdf = await signingPdf(final);
    assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
    await writeFile(path.join(dir, "signed-report.pdf"), pdf);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Document semnat", exact: true }),
    ).toBeVisible();
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify(
        {
          result: "passed",
          screenshotsAndPdf: dir,
          checks: [
            "real public API + Firestore emulator + sink email",
            "390px signature preview",
            "320px confirmation, no overflow",
            "no finalization by link access",
            "same PNG in preview, request and official snapshot",
            "signed PDF generated",
            "reload stays signed",
          ],
        },
        null,
        2,
      ),
    );
  } finally {
    await browser.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
