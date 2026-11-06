import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { SagaError } from "./contracts";
export function encryptToken(token: string, key: Buffer, fiscalCode: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(`saga:${fiscalCode}:v1`));
  const data = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return `v1.${Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64")}`;
}
export function decryptToken(encoded: string, key: Buffer, fiscalCode: string) {
  try {
    if (!encoded.startsWith("v1.")) throw new Error();
    const data = Buffer.from(encoded.slice(3), "base64");
    if (data.length < 29) throw new Error();
    const decipher = createDecipheriv("aes-256-gcm", key, data.subarray(0, 12));
    decipher.setAAD(Buffer.from(`saga:${fiscalCode}:v1`));
    decipher.setAuthTag(data.subarray(12, 28));
    return Buffer.concat([
      decipher.update(data.subarray(28)),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new SagaError(
      "TOKEN_UNREADABLE",
      "Cheia SAGA salvată nu poate fi decriptată. Administratorul trebuie să verifice conexiunea.",
      409,
    );
  }
}
