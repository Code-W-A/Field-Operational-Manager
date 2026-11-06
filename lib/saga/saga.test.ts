import test from "node:test";
import assert from "node:assert/strict";
import { sagaConfig } from "./config.server";
import { encryptToken, decryptToken } from "./crypto.server";
import { parseReadInput } from "./contracts";
import { parseSagaResponse } from "./response.server";
const env = {
  SAGA_READS_ENABLED: "true",
  SAGA_API_KEY: "test-api-token",
  SAGA_COD_FISCAL: "RO123456",
  SAGA_API_BASE_URL: "https://web.sagasoft.ro/api/v20260225",
  SAGA_TOKEN_ENCRYPTION_KEY: "ab".repeat(32),
};
test("config accepts only official HTTPS API, validates secret/CIF/key and reports no values", () => {
  assert.equal(sagaConfig(env).fiscalCode, "123456");
  assert.equal(
    sagaConfig({ ...env, SAGA_READS_ENABLED: undefined }).readsEnabled,
    false,
  );
  assert.equal(
    sagaConfig({ ...env, SAGA_READS_ENABLED: "false" }).readsEnabled,
    false,
  );
  for (const base of [
    "http://web.sagasoft.ro/api/v20260225",
    "https://example.test/api/v20260225",
    "https://web.sagasoft.ro.evil.test/api/v20260225",
    "https://user:password@web.sagasoft.ro/api/v20260225",
    "https://web.sagasoft.ro/api/v20260225?x=1",
    "https://web.sagasoft.ro/api/v20260225/Import",
  ])
    assert.throws(() => sagaConfig({ ...env, SAGA_API_BASE_URL: base }));
  assert.throws(
    () => sagaConfig({ ...env, SAGA_COD_FISCAL: "" }),
    /SAGA_COD_FISCAL/,
  );
  assert.throws(() =>
    sagaConfig({ ...env, SAGA_TOKEN_ENCRYPTION_KEY: "wrong" }),
  );
  assert.throws(
    () => sagaConfig({ ...env, SAGA_API_KEY: "bad token" }),
    (error) => !String(error).includes("bad token"),
  );
});
test("AES-GCM binds secrets to the company, authenticates ciphertext and uses random IVs", () => {
  const key = sagaConfig(env).encryptionKey,
    encrypted = encryptToken(env.SAGA_API_KEY, key, "123456");
  assert.equal(decryptToken(encrypted, key, "123456"), env.SAGA_API_KEY);
  assert.notEqual(encrypted, encryptToken(env.SAGA_API_KEY, key, "123456"));
  assert.ok(!encrypted.includes(env.SAGA_API_KEY));
  assert.throws(() => decryptToken(encrypted, key, "654321"));
  assert.throws(() => decryptToken(encrypted, Buffer.alloc(32), "123456"));
  assert.throws(() => decryptToken(encrypted.slice(0, -5), key, "123456"));
});
test("input keeps leading zeros, validates calendar dates and disallows unsupported operations", () => {
  assert.deepEqual(
    parseReadInput({
      kind: "stock",
      code: "0001",
      warehouse: "0002",
      date: "2026-11-06",
    }),
    { kind: "stock", code: "0001", warehouse: "0002", date: "2026-11-06" },
  );
  for (const v of [
    { kind: "import", code: "1" },
    { kind: "article", code: 1 },
    { kind: "stock", code: "1", date: "2026-02-30" },
    { kind: "article", code: "1", warehouse: "2" },
    { kind: "article", code: "1\n" },
  ])
    assert.throws(() => parseReadInput(v));
});
test("documented JSON stock supports zero, negatives, decimal precision and explicit failures", () => {
  const input = parseReadInput({ kind: "stock", code: "0001" });
  for (const quantity of ["0", "-2.5", "0.1234567890123456789"])
    assert.equal(
      parseSagaResponse(
        input,
        JSON.stringify({ success: true, data: quantity }),
        "now",
        [],
      ).quantity,
      quantity,
    );
  assert.equal(
    parseSagaResponse(input, '{"Success":true,"Data":"1,5"}', "now", [])
      .quantity,
    "1.5",
  );
  for (const text of [
    '{"success":false,"data":"0"}',
    '{"success":true,"data":null}',
    '{"success":true,"data":"NaN"}',
    "<html>error</html>",
    '{"success":"true","data":"1"}',
  ])
    assert.throws(() => parseSagaResponse(input, text, "now", []));
});
test("documented article XML yields only allowed fields and never reflects tokens", () => {
  const input = parseReadInput({ kind: "article", code: "0001" });
  const result = parseSagaResponse(
    input,
    '<?xml version="1.0"?><Articol><Denumire>A &amp; B test-token</Denumire><UM>BUC</UM><TVA>0</TVA><Pret_Vanzare1>0010.50</Pret_Vanzare1><private>test-token</private></Articol>',
    "now",
    ["test-token"],
  );
  assert.deepEqual(result.article, {
    name: "A & B [redactat]",
    unit: "BUC",
    vat: "0",
    price: "0010.50",
  });
  assert.equal(result.code, "0001");
  assert.ok(!JSON.stringify(result).includes("test-token"));
  for (const text of [
    '<!DOCTYPE Articol [<!ENTITY x SYSTEM "file:///etc/passwd">]><Articol/>',
    "<Articol><Denumire>x</Denumire>",
    "<html>error</html>",
    "<Articol><Denumire>A</Denumire><Denumire>B</Denumire><UM>buc</UM></Articol>",
    '{"success":false}',
  ])
    assert.throws(() => parseSagaResponse(input, text, "now", []));
});
