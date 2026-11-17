import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { validateSignatureImage } from "./core";

const png = async (background: { r: number; g: number; b: number; alpha: number }) =>
  "data:image/png;base64," + (await sharp({ create: { width: 30, height: 10, channels: 4, background } }).png().toBuffer()).toString("base64");

test("signature pixels accept visible ink without rewriting the reviewed image", async () => {
  const input = await png({ r: 30, g: 30, b: 30, alpha: 1 });
  await validateSignatureImage(input);
});

test("blank, transparent and malformed images cannot become signatures", async () => {
  await assert.rejects(validateSignatureImage(await png({ r: 255, g: 255, b: 255, alpha: 1 })), /goală/);
  await assert.rejects(validateSignatureImage(await png({ r: 0, g: 0, b: 0, alpha: 0 })), /goală/);
  await assert.rejects(validateSignatureImage("data:image/png;base64,aW52YWxpZA=="), /nu poate fi citită/);
});
