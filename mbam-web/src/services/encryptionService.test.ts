import { describe, expect, it } from "vitest";
import {
  createWrappedDataKey,
  decryptJson,
  encryptJson,
  unwrapDataKey,
} from "./encryptionService";

describe("encryptionService", () => {
  it("wraps a data key and decrypts records after unlocking", async () => {
    const { key, wrappedKey } = await createWrappedDataKey(
      "correct horse battery staple",
    );
    const encrypted = await encryptJson(
      key,
      { customer: "Amina", total: 42 },
      "outbox:operation-1",
    );
    const unlockedKey = await unwrapDataKey(
      "correct horse battery staple",
      wrappedKey,
    );

    await expect(
      decryptJson<{ customer: string; total: number }>(
        unlockedKey,
        encrypted,
        "outbox:operation-1",
      ),
    ).resolves.toEqual({ customer: "Amina", total: 42 });
  });

  it("rejects the wrong passphrase", async () => {
    const { wrappedKey } = await createWrappedDataKey(
      "correct horse battery staple",
    );

    await expect(
      unwrapDataKey("incorrect horse battery staple", wrappedKey),
    ).rejects.toThrow();
  });

  it("binds ciphertext to its record identity", async () => {
    const { key } = await createWrappedDataKey("correct horse battery staple");
    const encrypted = await encryptJson(
      key,
      { total: 42 },
      "outbox:operation-1",
    );

    await expect(
      decryptJson(key, encrypted, "outbox:operation-2"),
    ).rejects.toThrow();
  });
});
