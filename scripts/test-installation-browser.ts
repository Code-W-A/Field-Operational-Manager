import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { writeFileSync, createWriteStream } from "node:fs";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import {
  chromium,
  expect,
  type Page,
  type BrowserContext,
} from "@playwright/test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QRCodeSVG } from "qrcode.react";
import { installationService } from "../lib/installations/service";

async function main() {
  const projectId = "demo-fom-installation";
  assert.match(
    process.env.FIRESTORE_EMULATOR_HOST || "",
    /^(127\.0\.0\.1|localhost):\d+$/,
  );
  assert.match(
    process.env.FIREBASE_AUTH_EMULATOR_HOST || "",
    /^(127\.0\.0\.1|localhost):\d+$/,
  );
  const app = initializeApp(
    { projectId, storageBucket: `${projectId}.appspot.com` },
    "installation-browser",
  );
  const db = getFirestore(app);
  const auth = getAuth(app);
  const password = "InstallationDemo123!";
  for (const [uid, role, displayName] of [
    ["browser-tech", "tehnician", "Tehnician browser"],
    ["browser-admin", "admin", "Admin browser"],
    ["browser-other-tech", "tehnician", "Alt tehnician browser"],
    ["browser-dispatcher", "dispecer", "Dispecer browser"],
  ]) {
    await auth.createUser({
      uid,
      email: `${uid}@example.invalid`,
      password,
      displayName,
    });
    await db
      .collection("users")
      .doc(uid)
      .set({ uid, email: `${uid}@example.invalid`, displayName, role });
  }
  await db
    .collection("clienti")
    .doc("browser-client")
    .set({
      nume: "Client browser",
      cui: "ROTEST",
      telefon: "0711111111",
      email: "firma@example.invalid",
      reprezentantFirma: "Reprezentant browser",
      regCom: "J23/123/2026",
      adresa: "Adresă test",
      persoaneContact: [],
      locatii: [
        {
          id: "browser-location",
          nume: "Locație browser",
          adresa: "Adresă locație",
          persoaneContact: [
            {
              id: "browser-contact",
              nume: "Beneficiar browser",
              telefon: "0700000000",
              email: "beneficiar@example.invalid",
            },
          ],
          echipamente: [
            {
              id: "browser-equipment",
              nume: "Server browser",
              cod: "BROWSER1",
              model: "Test",
            },
            {
              id: "browser-equipment2",
              nume: "Cameră browser",
              cod: "BROWSER2",
              model: "Test",
            },
          ],
        },
      ],
    });
  const manager = { uid: "browser-admin", role: "admin" };
  const tech = { uid: "browser-tech", role: "tehnician" };
  const service = installationService(db);
  const input = {
    clientId: "browser-client",
    locationId: "browser-location",
    contactId: "browser-contact",
    client: "Client browser",
    locatie: "Locație browser",
    persoanaContact: "Beneficiar browser",
    telefon: "0700000000",
    persoanaContactEmail: "beneficiar@example.invalid",
    equipmentIds: ["browser-equipment"],
    tehnicieni: ["Tehnician browser"],
    nrLucrare: "#000999",
    dataEmiterii: "03.10.2026 10:00",
    dataInterventie: "03.10.2026 10:00",
    descriere: "Instalare test",
    defectReclamat: "Montaj server și configurare rețea.",
  };
  const work = await service.create(manager, input, "browser-installation");
  let started: Awaited<ReturnType<typeof service.start>>;
  const qrSvg = (value: string) =>
    renderToStaticMarkup(
      createElement(QRCodeSVG, {
        value,
        size: 640,
        marginSize: 4,
        level: "H",
        xmlns: "http://www.w3.org/2000/svg",
      }),
    );
  const env = {
    ...process.env,
    FOM_TEST_DIST_DIR: ".next/installation-ui-test",
    NEXT_PUBLIC_USE_FIREBASE_EMULATORS: "true",
    NEXT_PUBLIC_E2E_TEST_MODE: "false",
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: projectId,
    NEXT_PUBLIC_FIREBASE_API_KEY: "demo-api-key",
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: `${projectId}.firebaseapp.com`,
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: `${projectId}.appspot.com`,
    NEXT_PUBLIC_FIREBASE_APP_ID: "demo-app",
    SENTRY_DISABLE_AUTO_UPLOAD: "true",
    SENTRY_AUTH_TOKEN: "",
    SENTRY_DSN: "",
    NEXT_PUBLIC_SENTRY_DSN: "",
  };
  const log = createWriteStream("/private/tmp/fom-installation-dev.log");
  const server = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "dev", "-p", "3100"],
    { env, stdio: ["ignore", "pipe", "pipe"] },
  );
  server.stdout.pipe(log);
  server.stderr.pipe(log);
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    const origin = "http://127.0.0.1:3100";
    let ready = false;
    for (let i = 0; i < 90; i++) {
      try {
        if ((await fetch(`${origin}/login`)).ok) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    assert.ok(ready, "Dev server did not start");
    // Mandatory dev-server gut check before functional browser work.
    for (const args of [
      ["open", `${origin}/login`],
      ["snapshot", "-i"],
      ["screenshot", "/private/tmp/fom-installation-login.png"],
      [
        "eval",
        'document.querySelector("[data-nextjs-dialog]") ? "ERROR_OVERLAY" : document.body.innerText.trim().length ? "HAS_CONTENT" : "BLANK"',
      ],
    ]) {
      const result = spawnSync(
        "agent-browser",
        ["--session", "fom-installation", ...args],
        { encoding: "utf8", timeout: 45000 },
      );
      assert.equal(result.status, 0, result.stderr);
      assert.ok(!result.stdout.includes("ERROR_OVERLAY"));
      console.log(result.stdout.trim().slice(0, 1000));
    }
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ acceptDownloads: true });
    async function attachCamera(target: BrowserContext) {
      await target.addInitScript(
        ({ initialSvg }) => {
          // tsx keeps function names using this helper, including serialized nested functions.
          Object.defineProperty(window, "__name", {
            value: Function("fn", "return fn"),
            configurable: true,
          });
          const state = window as typeof window & {
            installationTestQr?: string;
          };
          state.installationTestQr = initialSvg;
          // Virtual camera: exercises the scanner with actual QR pixels, without a physical camera.
          navigator.mediaDevices.getUserMedia = async () => {
            const canvas = document.createElement("canvas");
            canvas.width = 720;
            canvas.height = 720;
            const ctx = canvas.getContext("2d")!;
            let lastSvg = "";
            const image = new Image();
            const draw = async () => {
              if (state.installationTestQr !== lastSvg) {
                lastSvg = state.installationTestQr || "";
                image.src =
                  "data:image/svg+xml;charset=utf-8," +
                  encodeURIComponent(lastSvg);
                await image.decode();
              }
              ctx.fillStyle = "white";
              ctx.fillRect(0, 0, 720, 720);
              ctx.drawImage(image, 40, 40, 640, 640);
            };
            await draw();
            const stream = canvas.captureStream(10);
            const timer = setInterval(() => void draw(), 100);
            stream
              .getTracks()[0]
              .addEventListener("ended", () => clearInterval(timer));
            return stream;
          };
        },
        { initialSvg: qrSvg("WRONG-QR") },
      );
    }
    await attachCamera(context);
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (message) => {
      if (message.type() === "error" && message.text().startsWith("error "))
        console.log("SCANNER DIAGNOSTIC", message.text());
    });
    async function login(p: Page, uid: string) {
      await p.goto(`${origin}/login`);
      await p
        .getByLabel("Email", { exact: true })
        .fill(`${uid}@example.invalid`);
      await p.getByLabel("Parolă", { exact: true }).fill(password);
      await p
        .getByRole("button", { name: "Autentificare", exact: true })
        .click();
      await p.waitForURL(/dashboard/, { timeout: 90000 });
    }
    await login(page, "browser-tech");
    await page.goto(
      `${origin}/dashboard/lucrari/${work.id}/instalare?equipmentId=browser-equipment`,
    );
    await page
      .getByRole("button", { name: "Scanează QR", exact: true })
      .click();
    await expect(
      page.getByRole("alert").filter({ hasText: "nu corespunde" }),
    ).toBeVisible({ timeout: 30000 });
    await page.evaluate((svg) => {
      (
        window as typeof window & { installationTestQr: string }
      ).installationTestQr = svg;
    }, qrSvg("BROWSER1"));
    await expect(
      page.getByLabel("Constatare la locație *", { exact: true }),
    ).toBeVisible({ timeout: 30000 });
    const firstSheet = (
      await db
        .collection("lucrari")
        .doc(work.id)
        .collection("installationSheets")
        .get()
    ).docs[0];
    started = {
      sheet: { ...firstSheet.data(), id: firstSheet.id },
    } as typeof started;
    // The sheet remains accessible after daily close and refresh through its stable ID.
    await page.goto(
      `${origin}/dashboard/lucrari/${work.id}/instalare?tab=sheets&sheetId=${started.sheet.id}`,
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(
      page.getByLabel("Constatare la locație *", { exact: true }),
    ).toBeVisible();
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      "Mobile sheet overflow",
    );
    await page.screenshot({
      path: "/private/tmp/fom-installation-sheet-mobile.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({
      path: "/private/tmp/fom-installation-sheet-desktop.png",
      fullPage: true,
    });
    await page
      .getByLabel("Constatare la locație *", { exact: true })
      .fill("Locație pregătită pentru instalare.");
    await page
      .getByRole("link", { name: "Înapoi la fișele zilnice", exact: true })
      .click();
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await page
      .getByRole("button", { name: "Rămân pe fișă", exact: true })
      .click();
    await page
      .getByLabel("Operațiuni executate *", { exact: true })
      .fill("Montaj server și verificare conexiuni.");
    await page
      .getByLabel("Notă internă — nu apare în PDF")
      .fill("NOTA INTERNA BROWSER");
    await page
      .getByRole("button", { name: "Salvează ciorna", exact: true })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "Ciorna a fost salvată" }),
    ).toBeVisible();
    await page.getByLabel("Fotografii (0/4)", { exact: true }).setInputFiles({
      name: "montaj.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB1UAAAAASUVORK5CYII=",
        "base64",
      ),
    });
    await expect(
      page.getByLabel("Fotografii (1/4)", { exact: true }),
    ).toBeVisible({ timeout: 30000 });
    await expect(page.getByRole("img", { name: "montaj.jpg" })).toBeVisible();
    await page.reload();
    await expect(
      page.getByLabel("Constatare la locație *", { exact: true }),
    ).toHaveValue("Locație pregătită pentru instalare.", { timeout: 30000 });
    assert.equal(
      (
        await db
          .collection("lucrari")
          .doc(work.id)
          .collection("installationSheets")
          .get()
      ).size,
      1,
    );
    await page.getByLabel("Statusul instalării").selectOption("completed");
    await page
      .getByLabel("Numele beneficiarului *", { exact: true })
      .fill("Beneficiar browser");
    async function drawSignatures(p: Page) {
      const canvases = p.locator("canvas");
      await expect(canvases).toHaveCount(2);
      for (let i = 0; i < 2; i++) {
        await canvases.first().scrollIntoViewIfNeeded();
        const bounds = await canvases.first().boundingBox();
        assert.ok(bounds);
        await p.mouse.move(bounds.x + 20, bounds.y + 30);
        await p.mouse.down();
        await p.mouse.move(bounds.x + 95, bounds.y + 60, { steps: 12 });
        await p.mouse.move(bounds.x + 140, bounds.y + 25, { steps: 12 });
        await p.mouse.up();
        await p
          .getByRole("button", { name: "Salvează semnătura", exact: true })
          .first()
          .click();
      }
    }
    await drawSignatures(page);
    await page
      .getByRole("button", { name: "Închide fișa zilei", exact: true })
      .click();
    await expect(
      page.getByText("Fișă semnată · Finalizat", { exact: true }),
    ).toBeVisible({ timeout: 30000 });
    const saved = (
      await db
        .collection("lucrari")
        .doc(work.id)
        .collection("installationSheets")
        .doc(started.sheet.id)
        .get()
    ).data()!;
    assert.equal(saved.state, "closed");
    assert.ok(
      !JSON.stringify(saved.documentSnapshot).includes("NOTA INTERNA BROWSER"),
    );
    const downloadEvent = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Descarcă PDF", exact: true })
      .first()
      .click();
    const download = await downloadEvent;
    await download.saveAs("/private/tmp/fom-installation-sheet.pdf");
    await page
      .getByRole("button", { name: "Proces-verbal de terminare", exact: true })
      .click();
    await page
      .getByLabel("Observații finale", { exact: true })
      .fill("Predat beneficiarului.");
    await page
      .getByLabel("Numele beneficiarului *", { exact: true })
      .fill("Beneficiar browser");
    await drawSignatures(page);
    await page
      .getByRole("button", {
        name: "Semnează și finalizează lucrarea",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Descarcă procesul-verbal final",
        exact: true,
      }),
    ).toBeVisible({ timeout: 30000 });
    const finalDownload = page.waitForEvent("download");
    await page
      .getByRole("button", {
        name: "Descarcă procesul-verbal final",
        exact: true,
      })
      .click();
    await (
      await finalDownload
    ).saveAs("/private/tmp/fom-installation-completion.pdf");
    await page.screenshot({
      path: "/private/tmp/fom-installation-completed.png",
      fullPage: true,
    });
    await page.goto(`${origin}/dashboard/lucrari/${work.id}`);
    await expect(
      page.getByRole("tab", { name: "Echipamente", exact: true }),
    ).toBeVisible({ timeout: 30000 });
    await expect(
      page.getByRole("heading", { name: "Detalii instalare", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Informații client", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("firma@example.invalid", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("beneficiar@example.invalid", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Montaj server și configurare rețea.", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Google Maps", exact: true }),
    ).toHaveAttribute("href", /query=Adres%C4%83%20loca%C8%9Bie/);
    await expect(
      page.getByRole("link", { name: "Waze", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Contextul tichetului", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Statusuri", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByText("Nr. ordine ONRC:", { exact: true }),
    ).toHaveCount(0);
    const frozenBefore = JSON.stringify(
      (
        await db
          .collection("lucrari")
          .doc(work.id)
          .collection("installationSheets")
          .doc(started.sheet.id)
          .get()
      ).data()?.documentSnapshot,
    );
    await db
      .collection("clienti")
      .doc("browser-client")
      .update({ email: "firma-actualizata@example.invalid" });
    await expect(
      page.getByText("firma-actualizata@example.invalid", { exact: true }),
    ).toBeVisible();
    assert.equal(
      JSON.stringify(
        (
          await db
            .collection("lucrari")
            .doc(work.id)
            .collection("installationSheets")
            .doc(started.sheet.id)
            .get()
        ).data()?.documentSnapshot,
      ),
      frozenBefore,
    );
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      "Installation detail mobile overflow",
    );
    await page.screenshot({
      path: "/private/tmp/fom-installation-details-mobile.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({
      path: "/private/tmp/fom-installation-details-desktop.png",
      fullPage: true,
    });
    await page.getByRole("tab", { name: "Documente", exact: true }).click();
    await expect(
      page.getByRole("button", {
        name: "Descarcă procesul-verbal final",
        exact: true,
      }),
    ).toBeVisible();
    assert.equal(
      (await db.collection("lucrari").doc(work.id).get()).data()?.statusLucrare,
      "Finalizat",
    );
    await page.getByRole("tab", { name: "Fișe zilnice", exact: true }).click();
    await expect(page).toHaveURL(/tab=sheets/);
    await page.reload();
    await expect(
      page.getByRole("tab", { name: "Fișe zilnice", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    // Create 27 explicit historical fixtures to test the cursor across page boundaries.
    const batch = db.batch();
    for (let i = 0; i < 27; i++)
      batch.set(
        db
          .collection("lucrari")
          .doc(work.id)
          .collection("installationSheets")
          .doc(`history-${i}`),
        {
          ...saved,
          id: `history-${i}`,
          createdAt: `2026-09-${String(i + 1).padStart(2, "0")}T10:00:00.000Z`,
        },
      );
    await batch.commit();
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Mai multe fișe", exact: true }),
    ).toBeVisible();
    await expect(page.locator("table tbody tr")).toHaveCount(25);
    await page
      .getByRole("button", { name: "Mai multe fișe", exact: true })
      .click();
    await expect(page.locator("table tbody tr")).toHaveCount(28);
    await expect(
      page.getByRole("button", { name: "Mai multe fișe", exact: true }),
    ).toHaveCount(0);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator("table")).not.toBeVisible();
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      "Mobile history overflow",
    );
    await page.screenshot({
      path: "/private/tmp/fom-installation-history-mobile.png",
      fullPage: true,
    });
    await page.getByRole("tab", { name: "Echipamente", exact: true }).click();
    await expect(
      page.getByRole("tab", { name: "Echipamente", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await page.locator("main").evaluate((el) => el.scrollTo(0, 0));
    await page.screenshot({
      animations: "disabled",
      path: "/private/tmp/fom-installation-overview-mobile.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await expect(
      page.getByRole("tab", { name: "Echipamente", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await page.locator("main").evaluate((el) => el.scrollTo(0, 0));
    await page.screenshot({
      animations: "disabled",
      path: "/private/tmp/fom-installation-overview-desktop.png",
      fullPage: true,
    });
    await page.goto(`${origin}/raport/${work.id}?tab=documents`);
    await expect(
      page.getByRole("button", {
        name: "Descarcă procesul-verbal final",
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.locator("main")).toHaveCount(1);
    const followWork = await service.create(
      manager,
      {
        ...input,
        equipmentIds: ["browser-equipment", "browser-equipment2"],
        tehnicieni: ["Tehnician browser", "Alt tehnician browser"],
      },
      "browser-continuation-ui",
    );
    const draft = await service.start(tech, followWork.id, {
      equipmentId: "browser-equipment",
      qrRaw: "BROWSER1",
      requestId: "browser-readonly-draft",
    });
    const fields = {
      finding: "Constatare publică",
      operations: "Montaj parțial",
      installationStatus: "blocked",
      blockReason: "Lipsește alimentarea",
      internalNote: "NOTA PRIVATA PRINCIPAL",
    };
    const updatedDraft = await service.save(
      tech,
      followWork.id,
      { sheetId: draft.sheet.id, revision: draft.sheet.revision, fields },
      false,
    );
    const otherContext = await browser.newContext();
    const otherPage = await otherContext.newPage();
    await login(otherPage, "browser-other-tech");
    await otherPage.goto(
      `${origin}/dashboard/lucrari/${followWork.id}/instalare?sheetId=${draft.sheet.id}`,
    );
    await expect(
      otherPage.getByText("Constatare publică", { exact: true }),
    ).toBeVisible();
    await expect(
      otherPage.getByText("Lipsește alimentarea", { exact: true }),
    ).toBeVisible();
    assert.equal(await otherPage.locator("textarea").count(), 0);
    await expect(
      otherPage.getByText("NOTA PRIVATA PRINCIPAL", { exact: true }),
    ).toHaveCount(0);
    await otherContext.close();
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await adminPage.route("**/api/notifications/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: '{"success":true}',
      }),
    );
    await login(adminPage, "browser-admin");
    await adminPage.goto(
      `${origin}/dashboard/lucrari/${followWork.id}/instalare?sheetId=${draft.sheet.id}`,
    );
    await expect(
      adminPage.getByText("NOTA PRIVATA PRINCIPAL", { exact: true }),
    ).toBeVisible();
    assert.equal(await adminPage.locator("textarea").count(), 0);
    await adminPage.goto(`${origin}/dashboard/lucrari/${work.id}`);
    await expect(
      adminPage.getByRole("heading", { name: "Statusuri", exact: true }),
    ).toBeVisible({ timeout: 30000 });
    await expect(
      adminPage.getByText("J23/123/2026", { exact: true }),
    ).toBeVisible();
    await expect(
      adminPage.getByText("Montaj server și configurare rețea.", {
        exact: true,
      }),
    ).toBeVisible();
    assert.equal(
      await adminPage.locator("textarea, [role=combobox]").count(),
      0,
      "Details remain informational",
    );
    assert.equal(await adminPage.locator("main").count(), 1);
    await adminPage.screenshot({
      path: "/private/tmp/fom-installation-details-admin.png",
      fullPage: true,
    });
    const clientBefore = (
      await db.collection("clienti").doc("browser-client").get()
    ).data()!;
    await db.collection("clienti").doc("browser-client").delete();
    await expect(
      adminPage.getByText(
        "Datele actuale ale clientului nu sunt disponibile. Sunt afișate datele salvate în tichet.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      adminPage.getByText("Adresa locației nu este specificată.", {
        exact: true,
      }),
    ).toBeVisible();
    await db.collection("clienti").doc("browser-client").set(clientBefore);
    await expect(
      adminPage.getByText("firma-actualizata@example.invalid", { exact: true }),
    ).toBeVisible();
    const signature = {
      beneficiaryName: "Beneficiar browser",
      technicianSignature:
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB1UAAAAASUVORK5CYII=",
      beneficiarySignature:
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB1UAAAAASUVORK5CYII=",
    };
    await service.save(
      tech,
      followWork.id,
      {
        sheetId: draft.sheet.id,
        revision: updatedDraft.sheet.revision,
        fields,
        signatures: signature,
      },
      true,
    );
    const dispatcherContext = await browser.newContext();
    const dispatcherPage = await dispatcherContext.newPage();
    await login(dispatcherPage, "browser-dispatcher");
    await dispatcherPage.goto(`${origin}/dashboard/lucrari/${work.id}`);
    await expect(
      dispatcherPage.getByRole("heading", { name: "Statusuri", exact: true }),
    ).toBeVisible({ timeout: 30000 });
    await expect(
      dispatcherPage.getByText("J23/123/2026", { exact: true }),
    ).toBeVisible();
    await dispatcherPage.goto(
      `${origin}/dashboard/lucrari/${followWork.id}/instalare?tab=documents`,
    );
    await expect(
      dispatcherPage.getByRole("button", {
        name: "Trimite restul spre replanificare",
        exact: true,
      }),
    ).toBeVisible();
    await dispatcherContext.close();
    await adminPage.goto(
      `${origin}/dashboard/lucrari/${followWork.id}/instalare`,
    );
    await expect(adminPage.getByText("Blocat", { exact: true })).toBeVisible();
    await adminPage.goto(
      `${origin}/dashboard/lucrari/${followWork.id}/instalare?tab=documents`,
    );
    await adminPage
      .getByRole("button", {
        name: "Trimite restul spre replanificare",
        exact: true,
      })
      .click();
    await expect(adminPage.getByRole("alertdialog")).toBeVisible();
    await adminPage
      .getByRole("button", { name: "Renunță", exact: true })
      .click();
    await expect(adminPage.getByRole("alertdialog")).toHaveCount(0);
    await adminPage
      .getByRole("button", {
        name: "Trimite restul spre replanificare",
        exact: true,
      })
      .click();
    await adminPage
      .getByRole("button", { name: "Confirmă replanificarea", exact: true })
      .click();
    await expect(
      adminPage.getByRole("link", {
        name: "Deschide tichetul de continuare",
        exact: true,
      }),
    ).toBeVisible();
    const continued = (
      await db.collection("lucrari").doc(followWork.id).get()
    ).data()!.installation.continuationWorkId;
    assert.deepEqual(
      (await db.collection("lucrari").doc(continued).get()).data()!.tehnicieni,
      [],
    );
    await adminPage
      .getByRole("link", {
        name: "Deschide tichetul de continuare",
        exact: true,
      })
      .click();
    await expect(adminPage).toHaveURL(
      new RegExp(`/dashboard/lucrari/${continued}$`),
    );
    await expect(
      adminPage.getByText("Neatribuit", { exact: true }),
    ).toBeVisible({ timeout: 30000 });
    await adminPage
      .getByRole("tab", { name: "Fișe zilnice", exact: true })
      .click();
    await expect(
      adminPage.getByText(
        "Nu există încă fișe de montaj pentru această selecție.",
        { exact: true },
      ),
    ).toBeVisible();
    await adminPage
      .getByRole("tab", { name: "Documente", exact: true })
      .click();
    await expect(
      adminPage.getByRole("link", {
        name: "Istoricul lucrării inițiale",
        exact: true,
      }),
    ).toBeVisible();
    await adminPage.screenshot({
      path: "/private/tmp/fom-installation-documents-desktop.png",
      fullPage: true,
    });
    await adminPage.goto(`${origin}/dashboard/lucrari/new`);
    await adminPage.locator("#tipLucrare").click();
    await adminPage
      .getByRole("option", { name: "Instalare", exact: true })
      .click();
    await expect(
      adminPage.getByText("Echipamente pentru instalare", { exact: true }),
    ).toBeVisible();
    assert.equal(await adminPage.locator("#echipament").count(), 0);
    console.log(
      "BROWSER PASS: dispatcher creation form exposes installation multiple equipment selector.",
    );
    // Full 1B: auto team -> secondary QR transfer -> stop -> former participant signs -> continuation.
    const teamWork = await service.create(
      manager,
      {
        ...input,
        equipmentIds: ["browser-equipment", "browser-equipment2"],
        tehnicieni: [
          "Tehnician browser",
          "Alt tehnician browser",
          "Tehnician fără cont",
        ],
      },
      "browser-installation-team",
    );
    const teamFirst = await service.start(tech, teamWork.id, {
      equipmentId: "browser-equipment",
      qrRaw: "BROWSER1",
      requestId: "browser-team-first",
    });
    await page.goto(
      `${origin}/dashboard/lucrari/${teamWork.id}/instalare?sheetId=${teamFirst.sheet.id}`,
    );
    await expect(
      page.getByText("Alt tehnician browser · secundar", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(/Tehnician fără cont: nu a putut fi alocat automat/),
    ).toBeVisible();
    const teamContext = await browser.newContext({ acceptDownloads: true });
    await attachCamera(teamContext);
    const teamPage = await teamContext.newPage();
    teamPage.on("pageerror", (e) => errors.push(e.message));
    await login(teamPage, "browser-other-tech");
    await teamPage.goto(
      `${origin}/dashboard/lucrari/${teamWork.id}/instalare?equipmentId=browser-equipment2`,
    );
    await expect(
      teamPage.getByRole("button", { name: "Scanează QR", exact: true }),
    ).toBeEnabled();
    await teamPage.evaluate((svg) => {
      (
        window as typeof window & { installationTestQr: string }
      ).installationTestQr = svg;
    }, qrSvg("BROWSER2"));
    await teamPage
      .getByRole("button", { name: "Scanează QR", exact: true })
      .click();
    await expect(
      teamPage.getByLabel("Constatare la locație *", { exact: true }),
    ).toBeVisible({ timeout: 30000 });
    const newTeamSheets = await db
      .collection("lucrari")
      .doc(teamWork.id)
      .collection("installationSheets")
      .get();
    const secondTeamSheet = newTeamSheets.docs.find(
      (d) => d.id !== teamFirst.sheet.id,
    )!;
    assert.deepEqual(secondTeamSheet.data().participantUids, [
      "browser-other-tech",
    ]);
    await teamPage
      .getByLabel("Constatare la locație *", { exact: true })
      .fill("Cameră pregătită.");
    await teamPage
      .getByLabel("Operațiuni executate *", { exact: true })
      .fill("Montaj parțial cameră.");
    await teamPage
      .getByRole("button", {
        name: "Oprește lucrul și semnează ulterior",
        exact: true,
      })
      .click();
    await expect(
      teamPage.getByText("Semnare ulterioară", { exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByText("Alt tehnician browser · secundar · mutat pe altă fișă", {
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByLabel("Constatare la locație *", { exact: true })
      .fill("Constatare înghețată 1B.");
    await page
      .getByLabel("Operațiuni executate *", { exact: true })
      .fill("Montaj server finalizat 1B.");
    await page
      .getByLabel("Notă internă — nu apare în PDF")
      .fill("NOTA PRIVATA 1B");
    await page.getByLabel("Fotografii (0/4)", { exact: true }).setInputFiles({
      name: "echipa.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB1UAAAAASUVORK5CYII=",
        "base64",
      ),
    });
    await expect(
      page.getByLabel("Fotografii (1/4)", { exact: true }),
    ).toBeVisible();
    await page.getByLabel("Statusul instalării").selectOption("completed");
    await page
      .getByRole("button", {
        name: "Oprește lucrul și semnează ulterior",
        exact: true,
      })
      .click();
    await expect(
      page.getByText("Semnare ulterioară", { exact: true }),
    ).toBeVisible();
    assert.equal(
      (await db.collection("installationTechnicianSessions").get()).size,
      0,
    );
    await adminPage.goto(
      `${origin}/dashboard/lucrari/${teamWork.id}/instalare?tab=documents`,
    );
    await expect(
      adminPage.getByText(
        "Echipa este liberă. Pentru o fișă nouă pe acest echipament sau replanificare, semnează mai întâi fișa în așteptare.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      adminPage.getByRole("button", {
        name: "Trimite restul spre replanificare",
        exact: true,
      }),
    ).toBeDisabled();
    await expect(
      adminPage.getByRole("button", {
        name: "Proces-verbal de terminare",
        exact: true,
      }),
    ).toHaveCount(0);
    await adminPage
      .getByRole("tab", { name: "Echipamente", exact: true })
      .click();
    await expect(
      adminPage.getByRole("link", {
        name: "Vezi fișa în așteptare",
        exact: true,
      }),
    ).toHaveCount(2);
    await service.edit(manager, teamWork.id, {
      tehnicieni: ["Tehnician browser"],
    });
    await teamPage.goto(
      `${origin}/dashboard/lucrari/${teamWork.id}/instalare?sheetId=${teamFirst.sheet.id}`,
    );
    await expect(
      teamPage.getByText("Constatare înghețată 1B.", { exact: true }),
    ).toBeVisible();
    await expect(
      teamPage.getByText("NOTA PRIVATA 1B", { exact: true }),
    ).toHaveCount(0);
    await expect(
      teamPage.getByRole("img", { name: "echipa.jpg" }),
    ).toBeVisible();
    assert.equal(await teamPage.locator("textarea").count(), 0);
    await teamPage.setViewportSize({ width: 390, height: 844 });
    assert.ok(
      await teamPage.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      "1B mobile sign overflow",
    );
    await teamPage.screenshot({
      path: "/private/tmp/fom-installation-1b-pending-mobile.png",
      fullPage: true,
    });
    await teamPage
      .getByLabel("Numele beneficiarului *", { exact: true })
      .fill("Beneficiar 1B");
    await drawSignatures(teamPage);
    await teamPage
      .getByRole("button", { name: "Semnează fișa zilei", exact: true })
      .click();
    await expect(
      teamPage.getByText("Fișă semnată · Finalizat", { exact: true }),
    ).toBeVisible();
    const teamSigned = (
      await db
        .collection("lucrari")
        .doc(teamWork.id)
        .collection("installationSheets")
        .doc(teamFirst.sheet.id)
        .get()
    ).data()!;
    assert.equal(
      teamSigned.documentSnapshot.technicianName,
      "Alt tehnician browser",
    );
    assert.equal(
      teamSigned.documentSnapshot.principalName,
      "Tehnician browser",
    );
    const teamDownload = teamPage.waitForEvent("download");
    await teamPage
      .getByRole("button", { name: "Descarcă PDF", exact: true })
      .click();
    await (
      await teamDownload
    ).saveAs("/private/tmp/fom-installation-1b-sheet.pdf");
    await teamPage.goto(
      `${origin}/dashboard/lucrari/${teamWork.id}/instalare?sheetId=${secondTeamSheet.id}`,
    );
    await teamPage
      .getByLabel("Numele beneficiarului *", { exact: true })
      .fill("Beneficiar 1B");
    await drawSignatures(teamPage);
    await teamPage
      .getByRole("button", { name: "Semnează fișa zilei", exact: true })
      .click();
    await expect(
      teamPage.getByText("Fișă semnată · În lucru", { exact: true }),
    ).toBeVisible();
    await adminPage.goto(
      `${origin}/dashboard/lucrari/${teamWork.id}/instalare?tab=documents`,
    );
    await expect(
      adminPage.getByRole("button", {
        name: "Trimite restul spre replanificare",
        exact: true,
      }),
    ).toBeEnabled();
    await adminPage
      .getByRole("button", {
        name: "Trimite restul spre replanificare",
        exact: true,
      })
      .click();
    await adminPage
      .getByRole("button", { name: "Confirmă replanificarea", exact: true })
      .click();
    await expect(
      adminPage.getByRole("link", {
        name: "Deschide tichetul de continuare",
        exact: true,
      }),
    ).toBeVisible();
    await teamContext.close();
    console.log(
      "BROWSER PASS 1B: automatic team, secondary QR transfer, frozen content/photos, pending blockers, former participant signs in own name on mobile, PDF, continuation.",
    );
    // Loading and API failure presentation remain usable, with a retry action.
    await page.route(
      `**/api/lucrari/${work.id}/installation`,
      async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 800));
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: '{"error":"Eroare de test local"}',
        });
      },
    );
    await page.goto(`${origin}/dashboard/lucrari/${work.id}/instalare`);
    await expect(
      page.getByLabel("Se încarcă instalarea", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("alert").filter({ hasText: "Eroare de test local" }),
    ).toBeVisible();
    await page.unroute(`**/api/lucrari/${work.id}/installation`);
    await page.getByRole("button", { name: "Reîncarcă", exact: true }).click();
    await expect(
      page.getByRole("tab", { name: "Echipamente", exact: true }),
    ).toBeVisible();
    assert.deepEqual(errors, []);
    console.log(
      "BROWSER PASS: virtual QR camera and wrong-code rejection, desktop/mobile, dirty warning, pagination, readonly roles, continuation dialog, report layout, loading/retry, authenticated draft save/reload, photo upload, signatures, daily PDF, final document/PDF, detail page, no runtime errors.",
    );
    writeFileSync(
      "/private/tmp/fom-installation-browser-result.json",
      JSON.stringify(
        { passed: true, errors, workId: work.id, sheetId: started.sheet.id },
        null,
        2,
      ),
    );
  } catch (error) {
    const failedPage = browser
      ?.contexts()
      .flatMap((context) => context.pages())[0];
    if (failedPage) {
      console.log(
        "FAILED PAGE",
        failedPage.url(),
        (await failedPage.locator("body").innerText()).slice(0, 2000),
      );
      await failedPage.screenshot({
        path: "/private/tmp/fom-installation-browser-failure.png",
        fullPage: true,
      });
    }
    console.error(error);
    throw error;
  } finally {
    await browser?.close();
    spawnSync("agent-browser", ["--session", "fom-installation", "close"], {
      timeout: 10000,
    });
    server.kill("SIGTERM");
    log.end();
    await db.terminate();
    await deleteApp(app);
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
