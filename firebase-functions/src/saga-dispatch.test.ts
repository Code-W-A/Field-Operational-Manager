import test from "node:test";
import assert from "node:assert/strict";
import {
  onInvoiceSagaTransferQueued,
  onInvoiceSagaSimulationQueued,
} from "./saga-dispatch";
test("Firebase dispatches only new/resumed matching-company jobs to protected Next worker", async () => {
  const keys = [
    "SAGA_WORKER_ENABLED",
    "SAGA_WORKER_SECRET",
    "SAGA_WORKER_APP_URL",
    "SAGA_WORKER_COD_FISCAL",
    "SAGA_IMPORT_MODE",
  ];
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]])),
    originalFetch = globalThis.fetch,
    calls: { url: string; body: unknown }[] = [];
  const secret = "w".repeat(43),
    value = { fiscalCode: "123456", mode: "test", phase: "baseline" };
  const change = (before: unknown, after: unknown) =>
    ({
      before: { exists: !!before, data: () => before },
      after: { exists: !!after, data: () => after },
    }) as any;
  const context = { params: { transferId: "a".repeat(64) } } as any;
  try {
    globalThis.fetch = async (url, init) => {
      assert.equal(
        String(url),
        "https://fixture.example/api/internal/saga-worker",
      );
      assert.equal(
        new Headers(init?.headers).get("Authorization"),
        `Bearer ${secret}`,
      );
      assert.equal(init?.redirect, "manual");
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return Response.json({ processed: true, pending: false });
    };
    delete process.env.SAGA_WORKER_ENABLED;
    await onInvoiceSagaTransferQueued.run(change(null, value), context);
    assert.equal(calls.length, 0);
    Object.assign(process.env, {
      SAGA_WORKER_ENABLED: "true",
      SAGA_WORKER_SECRET: secret,
      SAGA_WORKER_APP_URL: "https://fixture.example",
      SAGA_WORKER_COD_FISCAL: "123456",
      SAGA_IMPORT_MODE: "test",
    });
    await onInvoiceSagaTransferQueued.run(change(null, value), context);
    assert.equal(calls.length, 1);
    await onInvoiceSagaTransferQueued.run(
      change(value, { ...value, phase: "ready" }),
      context,
    );
    assert.equal(calls.length, 1);
    await onInvoiceSagaTransferQueued.run(
      change({ ...value, phase: "done" }, { ...value, phase: "after" }),
      context,
    );
    assert.equal(calls.length, 2);
    await onInvoiceSagaTransferQueued.run(
      change(null, { ...value, fiscalCode: "654321" }),
      context,
    );
    await onInvoiceSagaTransferQueued.run(change(value, null), context);
    assert.equal(calls.length, 2);
    process.env.SAGA_IMPORT_MODE = "dry-run";
    await onInvoiceSagaSimulationQueued.run(
      change(null, { ...value, mode: "dry-run" }),
      context,
    );
    assert.equal(calls.length, 3);
    assert.equal((calls[2].body as { simulation: boolean }).simulation, true);
    process.env.SAGA_WORKER_APP_URL = "http://untrusted.example";
    await onInvoiceSagaSimulationQueued.run(
      change(null, { ...value, mode: "dry-run" }),
      context,
    );
    assert.equal(calls.length, 3);
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
});
