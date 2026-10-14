import { build } from "esbuild";
import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
const bundle = await build({
  stdin: {
    contents: `import React,{useState} from 'react';import{createRoot}from'react-dom/client';import{EquipmentCatalogFields}from'./components/equipment/equipment-catalog-fields';function Fixture(){const[data,setData]=useState({producator:'',model:'Legacy model'});return <><input aria-label="Ciornă"/><input aria-label="Fotografie" type="file"/><EquipmentCatalogFields {...data} canAdd={window.role!=='tehnician'} onChange={patch=>setData(prev=>({...prev,...patch}))}/></>;}createRoot(document.getElementById('root')).render(<Fixture/>);`,
    resolveDir: process.cwd(),
    loader: "tsx",
  },
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"test"' },
  plugins: [
    {
      name: "auth",
      setup(b) {
        b.onResolve({ filter: /^@\/lib\/firebase\/config$/ }, () => ({
          path: "auth",
          namespace: "mock",
        }));
        b.onLoad({ filter: /.*/, namespace: "mock" }, () => ({
          contents: `export const auth={currentUser:{getIdToken:async()=> 'fixture'}};`,
          loader: "js",
        }));
      },
    },
  ],
});
const browser = await chromium.launch({ headless: true, channel: "chrome" });
try {
  for (const role of ["admin", "dispecer", "tehnician"]) {
    const page = await browser.newPage();
    await page.route("https://catalog.test/**", (r) =>
      r.fulfill({ contentType: "text/html", body: '<div id="root"></div>' }),
    );
    let fail = false;
    let postCalls = 0;
    const catalog = {
      manufacturers: [{ id: "nice", name: "Nice" }],
      models: [{ id: "model", name: "M400" }],
    };
    await page.route("**/api/equipment-catalog", async (r) => {
      if (r.request().method() === "POST") {
        postCalls++;
        if (fail) {
          fail = false;
          return r.fulfill({
            status: 503,
            contentType: "application/json",
            body: JSON.stringify({ error: "Rețea indisponibilă" }),
          });
        }
        const { name, kind } = r.request().postDataJSON();
        const option = { id: "new", name: name.trim() };
        catalog[kind].push(option);
        return r.fulfill({
          contentType: "application/json",
          body: JSON.stringify({ option, catalog }),
        });
      }
      return r.fulfill({
        contentType: "application/json",
        body: JSON.stringify(catalog),
      });
    });
    await page.goto("https://catalog.test");
    await page.evaluate((role) => (window.role = role), role);
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.getByLabel("Ciornă").fill("Datele rămân");
    await page
      .getByLabel("Fotografie")
      .setInputFiles({
        name: "photo.png",
        mimeType: "image/png",
        buffer: Buffer.from("fixture"),
      });
    await expect(
      page.getByRole("combobox", { name: "Model", exact: true }),
    ).toHaveText(/Legacy model/);
    if (role === "tehnician") {
      await expect(
        page.getByRole("button", { name: "Adaugă producător", exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Adaugă model", exact: true }),
      ).toHaveCount(0);
    } else {
      await page
        .getByRole("button", { name: "Adaugă producător", exact: true })
        .click();
      await page.getByRole("button", { name: "Anulează", exact: true }).click();
      await page
        .getByRole("button", { name: "Adaugă producător", exact: true })
        .click();
      await page.getByLabel("Denumire", { exact: true }).fill("New producer");
      fail = true;
      await page
        .getByRole("button", { name: "Adaugă și selectează", exact: true })
        .click();
      await expect(page.getByRole("alert")).toHaveText("Rețea indisponibilă");
      await expect(page.getByLabel("Denumire", { exact: true })).toHaveValue(
        "New producer",
      );
      await page
        .getByRole("button", { name: "Adaugă și selectează", exact: true })
        .click();
      await expect(
        page.getByRole("combobox", { name: "Producător", exact: true }),
      ).toHaveText(/New producer/);
      assert.equal(postCalls, 2);
    }
    await page.getByRole("combobox", { name: "Model", exact: true }).click();
    await page.getByLabel("Caută model", { exact: true }).fill("m400");
    await page.getByRole("option", { name: "M400", exact: true }).click();
    await expect(
      page.getByRole("combobox", { name: "Model", exact: true }),
    ).toHaveText(/M400/);
    await expect(page.getByLabel("Ciornă")).toHaveValue("Datele rămân");
    assert.equal(
      await page.getByLabel("Fotografie").evaluate((el) => el.files.length),
      1,
    );
    await page.close();
  }
  console.log(
    "Catalog browser checks passed: admin, dispatcher, technician; search, legacy value, cancellation, failed add/retry and draft/photo retention.",
  );
} finally {
  await browser.close();
}
