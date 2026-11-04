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
    'export const DashboardShell=({children,className})=><div className={className} style={{display:"flex",flexDirection:"column"}}><header style={{height:64,flexShrink:0}}>FOM</header><main style={{flex:1,minHeight:0}}><div style={{height:"100%",padding:16,boxSizing:"border-box"}}>{children}</div></main></div>;',
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
 const page=await browser.newPage({viewport:{width:1400,height:1000}});const errors=[];page.on("pageerror",e=>errors.push(e.message));
 await page.route("https://tile.openstreetmap.org/**",r=>r.abort());
 const now=Date.now(), point={id:"point",sessionId:"session",lat:44.4,lng:26.1,accuracy:12,capturedAt:now-86400000,eventKind:"checkin"};
 const missing={id:"missing",uid:"tech",sessionId:"session",kind:"checkout",occurredAt:now,capture:{status:"unavailable",reason:"gps_disabled",capturedAt:now}};
 const eventPoint={...point,id:"today",capturedAt:now-60000,eventKind:"qr_verified"};
 const history={points:[eventPoint],events:[{...missing,id:"qr",kind:"qr_verified",occurredAt:now-60000,capture:{status:"available",lat:44.4,lng:26.1,accuracy:12,capturedAt:now-60000}},missing],segments:[],stops:[],truncated:false};
 await page.route("**/api/tracking/live",r=>r.fulfill({json:{technicians:[{uid:"tech",name:"Tehnician test",sessionId:null,mode:"events",point,lastEvent:missing,state:"stopped",stale:true}]}}));
 await page.route("**/api/tracking/history?**",r=>r.fulfill({json:history}));
 await page.goto(`http://127.0.0.1:${server.address().port}`);
 await expect(page.getByText("Ultimele poziții înregistrate")).toBeVisible();
 await expect(page.getByRole("button",{name:"Selectează Tehnician test"})).toContainText("Depontat");
 await expect(page.getByRole("button",{name:"Selectează Tehnician test"})).toContainText("acum 1 zile");
 await expect(page.locator(".leaflet-marker-icon")).toHaveCount(1);
 await page.getByRole("button",{name:"Selectează Tehnician test"}).click();
 await page.getByRole("button",{name:"Vezi istoricul →",exact:true}).click();
 await expect(page.getByText("Acțiune confirmată fără locație",{exact:true})).toBeVisible();
 await expect(page.getByText("Verificare QR",{exact:true})).toBeVisible();
 const polylines=await page.evaluate(()=>{let count=0;window.fixtureMap.eachLayer(layer=>{if(layer instanceof Object && layer.getLatLngs)count++});return count});
 if(polylines!==0)throw Error("Event points must not be joined");
 await page.setViewportSize({width:390,height:844});
 await expect(page.getByText("Acțiune confirmată fără locație",{exact:true})).toBeVisible();
 await page.screenshot({path:"../test-artifacts/location-events-20261104/map-mobile.png",fullPage:true});
 if(errors.length)throw Error(errors.join("\n"));
 console.log("PASS: actual map desktop/mobile, checkout retains yesterday point, missing event, isolated QR marker");
} finally { await browser.close();await new Promise(resolve=>server.close(resolve));await rm(directory,{recursive:true,force:true}); }
