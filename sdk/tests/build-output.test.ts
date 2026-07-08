import { describe, it, expect } from "bun:test";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const DIST = fileURLToPath(new URL("../dist/", import.meta.url));

function readDist(name: string): string {
  const path = DIST + name;
  if (!existsSync(path)) {
    throw new Error(`dist artifact missing: ${path} (run: bun run build && bun run build:iife)`);
  }
  return Bun.file(path).text();
}

describe("sdk build output (regression guard for batch 5 iife stub bug)", () => {
  it("iife contains customElements.define registration", async () => {
    const iife = await readDist("aardwin-auth.iife.js");
    expect(iife).toMatch(/customElements/);
    expect(iife).toMatch(/aardwin-auth/);
  });

  it("iife inlines AARDWIN_API_ORIGIN + /api/providers fetch", async () => {
    const iife = await readDist("aardwin-auth.iife.js");
    expect(iife).toMatch(/oauth\.aard\.win/);
    expect(iife).toMatch(/api\/providers/);
  });

  it("iife contains the aardwin-api-origin attribute name (regression guard against minify)", async () => {
    const iife = await readDist("aardwin-auth.iife.js");
    expect(iife).toMatch(/aardwin-api-origin/);
  });

  it("index.mjs (browser entry) contains customElements + AARDWIN_API_ORIGIN", async () => {
    const mjs = await readDist("index.mjs");
    expect(mjs).toMatch(/customElements/);
    expect(mjs).toMatch(/oauth\.aard\.win/);
  });
});
