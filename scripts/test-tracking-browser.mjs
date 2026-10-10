// Isolated browser test of the actual dashboard component with synthetic API/auth adapters.
// No Next server, production auth, location writes or native builds are involved.
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
    'export const DashboardShell=({children})=><main style={{maxWidth:1100,margin:"auto",padding:16}}>{children}</main>;',
  "next/dynamic":
    'import React from "react"; export default function dynamic(load){const C=React.lazy(load);return props=><React.Suspense fallback={<p>Se încarcă harta…</p>}><C {...props}/></React.Suspense>}',
};
await build({
  stdin: {
    contents:
      'import React from "react";import {createRoot} from "react-dom/client";import Page from "./app/dashboard/harta-tehnicieni/page";createRoot(document.getElementById("root")).render(<Page/>);',
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
    } else {
      res.setHeader("Content-Type", "text/html");
      res.end(
        '<!doctype html><html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><style>body{font:16px Arial;margin:0}select,input{max-width:100%;padding:8px}label{display:inline-grid;gap:6px;margin:8px}li{margin:12px 0;padding:10px;border:1px solid #ddd;border-radius:8px}.h-\\[420px\\]{height:420px}svg{max-width:100%}</style><div id="root"></div><script type="module" src="/app.js"></script></html>',
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
      viewport: { width: 1200, height: 900 },
    }),
    errors = [];
  page.setDefaultTimeout(10000);
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("https://tile.openstreetmap.org/**", (route) =>
    route.abort(),
  );
  const now = Date.now(),
    p = {
      id: "a",
      sessionId: "s",
      lat: 44.42,
      lng: 26.1,
      capturedAt: now - 180000,
      accuracy: 10,
    };
  await page.route("**/api/tracking/live", (route) =>
    route.fulfill({
      json: {
        technicians: [
          {
            uid: "t",
            name: "Tehnician cu nume lung pentru verificare",
            sessionId: "s",
            point: p,
            state: "active",
            stale: true,
          },
        ],
      },
    }),
  );
  await page.route("**/api/tracking/history?**", (route) =>
    route.fulfill({
      json: {
        points: [p],
        segments: [[p]],
        stops: [
          { ...p, startedAt: now - 600000, endedAt: now - 180000, minutes: 7 },
        ],
        truncated: false,
      },
    }),
  );
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await expect(page.getByText("Pontaj activ", { exact: true })).toBeVisible();
  await expect(page.getByText(/Ultima poziție:.*neactualizată/)).toBeVisible();
  await expect(page.getByText(/Fundalul hărții nu s-a încărcat/)).toBeVisible();
  await page.getByLabel("Vizualizare").selectOption("history");
  await expect(
    page.getByText("Selectează un tehnician pentru traseul zilei."),
  ).toBeVisible();
  await page.getByLabel("Tehnician", { exact: true }).selectOption("t");
  await expect(page.getByText(/7 minute/)).toBeVisible();
  await page.screenshot({
    path: "/tmp/fom-tracking-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 360, height: 800 });
  await expect(
    page.getByRole("heading", { name: "Hartă tehnicieni", exact: true }),
  ).toHaveCount(1);
  await page.screenshot({
    path: "/tmp/fom-tracking-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
  const denied = await browser.newPage();
  let requests = 0;
  await denied.addInitScript(() => {
    window.fixtureRole = "tehnician";
  });
  await denied.route("**/api/tracking/**", (route) => {
    requests++;
    return route.abort();
  });
  await denied.goto(`http://127.0.0.1:${server.address().port}`);
  await expect(
    denied.getByText("Acces disponibil administratorului și dispecerului."),
  ).toBeVisible();
  expect(requests).toBe(0);
  console.log(
    "PASS: actual dashboard UI with fixture adapters — live/stale, history/stops, tile failure fallback, 360px layout, denied technician.",
  );
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  await rm(directory, { recursive: true, force: true });
}
