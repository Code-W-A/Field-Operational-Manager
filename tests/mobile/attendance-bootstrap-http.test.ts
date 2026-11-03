import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import Module from "node:module";
import { NextRequest } from "next/server";

test("attendance-only bootstrap keeps access checks and avoids tickets and offline grants", async () => {
  const state = { blocked: false, attendance: 0, full: 0, grants: 0, checks: 0 };
  (globalThis as any).__attendanceRouteTest = state;
  const mocks: Record<string, string> = {
    "@/lib/firebase/admin": `export const adminDb={};`,
    "@/lib/installations/service": `export const installationService=()=>({});`,
    "@/lib/mobile/draft-grant": `export async function issueDraftGrant(){globalThis.__attendanceRouteTest.grants++;return {};}`,
    "@/lib/mobile/http": `
      const s=globalThis.__attendanceRouteTest;
      export const mobileIdentity=async()=>({uid:'tech'});
      export const mobileAccess={requireAccess:async()=>{s.checks++;if(s.blocked)throw Error('blocked');return{activeSessionId:'active'};},attendanceBundle:async()=>{s.attendance++;return{works:[],attendance:[{id:'active'}]};}};
      export const service={bundle:async()=>{s.full++;return{works:[{id:'work'}]};}};
      export const headers=()=>({});export const options=()=>{};
      export const failure=()=>new Response('{}',{status:403});`,
  };
  try {
    const output = await build({entryPoints:["app/api/mobile/bootstrap/route.ts"],bundle:true,write:false,platform:"node",format:"cjs",packages:"external",plugins:[{name:"isolated-dependencies",setup(b){
      b.onResolve({filter:/.*/}, a=>mocks[a.path]?{path:a.path,namespace:"mock"}:undefined);
      b.onLoad({filter:/.*/,namespace:"mock"},a=>({contents:mocks[a.path],loader:"js"}));
    }}]});
    const mod = new (Module as any)(`${process.cwd()}/attendance-bootstrap-test.cjs`);
    mod.paths=(Module as any)._nodeModulePaths(process.cwd());
    mod._compile(output.outputFiles[0].text,`${process.cwd()}/attendance-bootstrap-test.cjs`);
    const request=(query="")=>new NextRequest(`http://localhost/api/mobile/bootstrap${query}`);
    let response=await mod.exports.GET(request("?attendance=1"));
    assert.equal(response.status,200);
    const data=await response.json();
    assert.deepEqual(data.bundle.works,[]);
    assert.equal(data.bundle.attendance[0].id,"active");
    assert.equal(state.full,0);assert.equal(state.grants,0);assert.equal(state.checks,1);
    response=await mod.exports.GET(request());
    assert.equal(response.status,200);assert.equal(state.full,1);assert.equal(state.grants,1);
    state.blocked=true;
    response=await mod.exports.GET(request("?attendance=1"));
    assert.equal(response.status,403);assert.equal(state.attendance,1);
  } finally { delete (globalThis as any).__attendanceRouteTest; }
});
