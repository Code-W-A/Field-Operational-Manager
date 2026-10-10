// Actual dashboard/Leaflet components with synthetic auth, API and tile adapters.
// No Next server, production authentication, location writes or native builds.
import { build } from "esbuild";
import { chromium, expect } from "@playwright/test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import http from "node:http";
const directory = await mkdtemp(path.join(tmpdir(), "fom-tracking-ui-"));
const stubs = {
  "@/contexts/AuthContext":
    'export const useAuth=()=>({userData:{role:window.fixtureRole||"admin"}});',
  "@/lib/firebase/config":
    'export const auth={currentUser:{getIdToken:async()=>"fixture"}};',
  "@/components/dashboard-shell":
    'export const DashboardShell=({children})=><main style={{width:"100%",padding:24,boxSizing:"border-box",background:"#f7f9fc",minHeight:"100vh"}}>{children}</main>;',
  "next/link":
    "export default function Link({children,...props}){return <a {...props}>{children}</a>}",
  "next/dynamic":
    'import React from "react"; export default function dynamic(load){const C=React.lazy(load);return props=><React.Suspense fallback={<p>Se încarcă harta…</p>}><C {...props}/></React.Suspense>}',
};
await build({
  stdin: {
    contents:
      'import React from "react";import {createRoot} from "react-dom/client";import * as L from "leaflet";L.Map.addInitHook(function(){window.fixtureMap=this});import Page from "./app/dashboard/harta-tehnicieni/page";createRoot(document.getElementById("root")).render(<Page/>);',
    resolveDir: process.cwd(),
    loader: "tsx",
  },
  bundle: true,
  platform: "browser",
  format: "esm",
  jsx: "automatic",
  outfile: path.join(directory, "app.js"),
  loader: { ".png": "dataurl" },
  define: {
    "process.env.NODE_ENV": '"development"',
    "process.env.NEXT_PUBLIC_TRACKING_TILE_URL":
      '"https://tile.openstreetmap.org/{z}/{x}/{y}.png"',
  },
  plugins: [
    {
      name: "fixture",
      setup(b) {
        b.onResolve({ filter: /.*/ }, (a) =>
          stubs[a.path] ? { path: a.path, namespace: "fixture" } : undefined,
        );
        b.onLoad({ filter: /.*/, namespace: "fixture" }, (a) => ({
          contents: stubs[a.path],
          loader: "jsx",
          resolveDir: process.cwd(),
        }));
      },
    },
  ],
});
const server = http.createServer(async (req, res) => {
  try {
    if (req.url === "/app.js" || req.url === "/app.css") {
      res.setHeader(
        "Content-Type",
        req.url.endsWith(".js") ? "text/javascript" : "text/css",
      );
      res.end(await readFile(path.join(directory, req.url.slice(1))));
    } else if (req.url !== "/") {
      res.statusCode = 404;
      res.end();
    } else {
      res.setHeader("Content-Type", "text/html");
      res.end(
        '<!doctype html><html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><style>body{font:14px Arial;margin:0}*{box-sizing:border-box}button,input,select{font:inherit}a{color:inherit;text-decoration:none}svg{vertical-align:middle}button{font-family:inherit}</style><div id="root"></div><script type="module" src="/app.js"></script></html>',
      );
    }
  } catch {
    res.statusCode = 500;
    res.end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({
      viewport: { width: 1700, height: 1080 },
    }),
    errors = [];
  page.setDefaultTimeout(10000);
  page.on("pageerror", (error) => errors.push(error.message));
  // Background tiles are intentionally unavailable; assertions exercise the usable list/map fallback.
  await page.route("https://tile.openstreetmap.org/**", (route) =>
    route.abort(),
  );
  const now = Date.now(),
    point = {
      id: "a",
      sessionId: "s",
      lat: 44.48,
      lng: 26.01,
      capturedAt: now - 30000,
      accuracy: 10,
    };
  let fail = false,
    empty = false,
    liveReads = 0;
  const technicians = [
    {
      uid: "rotar",
      name: "Rotar Adrian",
      sessionId: "s",
      point,
      state: "active",
      stale: false,
    },
    {
      uid: "baia",
      name: "Alexandru Baia",
      sessionId: "s2",
      point: {
        ...point,
        sessionId: "s2",
        lat: 44.42,
        lng: 26.18,
        capturedAt: now - 180000,
      },
      state: "active",
      stale: true,
    },
    {
      uid: "sima",
      name: "Mihai Sima",
      sessionId: "s3",
      point: { ...point, sessionId: "s3", lat: 44.38, lng: 26.1 },
      state: "permission_denied",
      stale: false,
    },
    {
      uid: "ban",
      name: "Cristian Ban",
      sessionId: "s4",
      point: null,
      state: "gps_unavailable",
      stale: true,
    },
    {
      uid: "long",
      name: "Tehnician cu nume foarte lung pentru verificarea ecranului mic",
      sessionId: null,
      point: null,
      state: "stopped",
      stale: true,
    },
  ];
  await page.route("**/api/tracking/live", async (route) => {
    liveReads++;
    await new Promise((resolve) => setTimeout(resolve, 120));
    await route.fulfill({
      status: fail ? 503 : 200,
      json: fail
        ? { error: "Conexiune indisponibilă." }
        : { technicians: empty ? [] : technicians },
    });
  });
  await page.route("**/api/tracking/history?**", (route) =>
    route.fulfill({
      json: {
        points: [point],
        segments: [[point]],
        stops: [
          {
            ...point,
            startedAt: now - 600000,
            endedAt: now - 180000,
            minutes: 7,
          },
        ],
        truncated: false,
      },
    }),
  );
  const url = `http://127.0.0.1:${server.address().port}`;
  await page.clock.setFixedTime(new Date(now));
  await page.goto(url);
  await expect(page.getByLabel("Se încarcă tehnicienii")).toBeVisible();
  await expect(
    page.locator('[aria-label="Total tehnicieni"] strong'),
  ).toHaveText("5");
  await expect(page.locator('[aria-label="Pontați"] strong')).toHaveText("4");
  await expect(page.locator('[aria-label="GPS activ"] strong')).toHaveText("1");
  await expect(
    page.locator('[aria-label="Fără poziție actualizată"] strong'),
  ).toHaveText("4");
  const list = page.getByLabel("Lista tehnicienilor");
  await expect(list.getByRole("button", { name: /^Selectează / })).toHaveCount(
    5,
  );
  await expect(list.getByText("Neactualizată", { exact: true })).toBeVisible();
  await expect(
    list.getByText("Permisiune GPS lipsă", { exact: true }),
  ).toBeVisible();
  await expect(
    list.getByText("GPS indisponibil", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Fundalul hărții nu s-a încărcat/)).toBeVisible();
  await page
    .getByRole("button", { name: "Selectează Rotar Adrian", exact: true })
    .click();
  await expect(
    page.locator(".leaflet-popup").getByText("Precizie: ±10 m"),
  ).toBeVisible();
  await page.screenshot({
    path: "/tmp/fom-tracking-design-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Încadrează toate pozițiile" })
    .click();
  await page.locator('[title="Alexandru Baia — Neactualizată"]').click();
  await expect(
    page.getByRole("button", {
      name: "Selectează Alexandru Baia",
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.locator(".leaflet-popup").getByText("Alexandru Baia", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Încadrează toate pozițiile" })
    .click();
  await page
    .locator('[title="Mihai Sima — Permisiune GPS lipsă"]')
    .press("Enter");
  await expect(
    page.getByRole("button", { name: "Selectează Mihai Sima", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("button", { name: "Selectează Alexandru Baia", exact: true })
    .click();
  const fullscreenButton = page.getByRole("button", {
    name: "Hartă pe ecran complet",
  });
  if (await fullscreenButton.count()) {
    await fullscreenButton.click();
    await expect(
      page.getByRole("button", { name: "Ieși din ecran complet" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Ieși din ecran complet" }).click();
    await expect(fullscreenButton).toBeVisible();
  }
  // Poll/manual refresh must not recenter a map moved by the operator.
  await page.evaluate(() =>
    window.fixtureMap.setView([44.7, 26.4], 12, { animate: false }),
  );
  const view = await page.evaluate(() => ({
    center: window.fixtureMap.getCenter(),
    zoom: window.fixtureMap.getZoom(),
  }));
  await page.getByRole("button", { name: "Reîmprospătează pozițiile" }).click();
  await expect(
    page.getByRole("button", { name: "Reîmprospătează pozițiile" }),
  ).toBeEnabled();
  expect(
    await page.evaluate(() => ({
      center: window.fixtureMap.getCenter(),
      zoom: window.fixtureMap.getZoom(),
    })),
  ).toEqual(view);
  await page
    .getByRole("button", { name: "Încadrează toate pozițiile" })
    .click();
  expect(await page.evaluate(() => window.fixtureMap.getCenter())).not.toEqual(
    view.center,
  );
  await page
    .locator(".leaflet-popup")
    .getByRole("button", { name: "Vezi istoricul →" })
    .click();
  await expect(
    page.getByRole("button", { name: "Istoric", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("7 minute", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Ziua traseului")).toBeVisible();
  await page.getByRole("button", { name: "Live", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Reîmprospătează pozițiile" }),
  ).toBeEnabled();
  await list.getByRole("button", { name: /^GPS activ/ }).click();
  await expect(list.getByRole("button", { name: /^Selectează / })).toHaveCount(
    1,
  );
  await list.getByRole("button", { name: /^Fără poziție actualizată/ }).click();
  await expect(list.getByRole("button", { name: /^Selectează / })).toHaveCount(
    4,
  );
  await list.getByRole("button", { name: /^Toți/ }).click();
  await page.getByLabel("Caută tehnician").fill("inexistent");
  await expect(
    page.getByText("Niciun tehnician nu corespunde filtrelor."),
  ).toBeVisible();
  await page.getByLabel("Caută tehnician").fill("");
  // Existing records survive an API failure; retry restores the status.
  fail = true;
  await page.getByRole("button", { name: "Reîmprospătează pozițiile" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Conexiune indisponibilă.",
  );
  await expect(list.getByRole("button", { name: /^Selectează / })).toHaveCount(
    5,
  );
  fail = false;
  await page.getByRole("button", { name: "Reîncearcă", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  // Reaching the stale cutoff updates counters without another successful position.
  const cutoff = new Date(now + 100000);
  await page.clock.setFixedTime(cutoff);
  await page.getByRole("button", { name: "Reîmprospătează pozițiile" }).click();
  await expect(
    page.getByRole("button", { name: "Reîmprospătează pozițiile" }),
  ).toBeEnabled();
  await expect(page.locator('[aria-label="GPS activ"] strong')).toHaveText("0");
  await page.setViewportSize({ width: 360, height: 800 });
  await page.screenshot({
    path: "/tmp/fom-tracking-design-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
  empty = true;
  await page.getByRole("button", { name: "Reîmprospătează pozițiile" }).click();
  await expect(page.getByText("Nu există tehnicieni în echipă.")).toBeVisible();
  await expect(
    page.locator('[aria-label="Total tehnicieni"] strong'),
  ).toHaveText("0");
  const denied = await browser.newPage();
  let deniedReads = 0;
  await denied.addInitScript(() => {
    window.fixtureRole = "tehnician";
  });
  await denied.route("**/api/tracking/**", (route) => {
    deniedReads++;
    return route.abort();
  });
  await denied.goto(url);
  await expect(
    denied.getByText("Acces disponibil administratorului și dispecerului."),
  ).toBeVisible();
  expect(deniedReads).toBe(0);
  expect(liveReads).toBeGreaterThan(1);
  console.log(
    "PASS: real dashboard components — loading, statistics, GPS states, list/marker selection, popup/history, filters/search, refresh preserves view, API failure/retry, stale cutoff, empty data, 360px layout, denied role.",
  );
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  await rm(directory, { recursive: true, force: true });
}
