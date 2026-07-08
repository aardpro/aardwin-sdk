import { describe, it, expect } from 'bun:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, extname } from 'node:path';

const DIST = fileURLToPath(new URL('../dist/', import.meta.url));

/**
 * Self-containment guard (Path B). The published `@aardwin/auth-server` has ZERO runtime
 * dependencies — `@aardwin/share` is NOT a dep, and the vendored types/constants (`AuthUser`,
 * `EXCHANGE_CODES`) are defined locally so consumer TypeScript doesn't try to resolve an
 * unpublished private package. This test locks that contract on both build artifacts:
 *
 *   - `dist/index.mjs` must contain no `@aardwin/share` import/require.
 *   - every declaration file under `dist/` must contain no `@aardwin/share` reference.
 *
 * If this test fails, something regressed the self-containment decision (Review Decisions D4).
 */

function readDist(name: string): string {
  const path = DIST + name;
  if (!existsSync(path)) {
    throw new Error(`dist artifact missing: ${path} (run: bun run build)`);
  }
  return readFileSync(path, "utf8");
}

function listDistFiles(): string[] {
  if (!existsSync(DIST)) {
    throw new Error(`dist dir missing: ${DIST} (run: bun run build)`);
  }
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else {
        out.push(full);
      }
    }
  };
  walk(DIST);
  return out;
}

describe("server-sdk build output (self-containment guard, Path B)", () => {
  it("dist/index.mjs exists", () => {
    const mjs = readDist("index.mjs");
    expect(mjs.length).toBeGreaterThan(0);
  });

  it("dist/index.mjs contains NO @aardwin/share import/require", () => {
    const mjs = readDist("index.mjs");
    expect(mjs).not.toMatch(/@aardwin\/share/);
  });

  it("dist/index.mjs inlines the api origin + exchange endpoint", () => {
    const mjs = readDist("index.mjs");
    expect(mjs).toMatch(/oauth\.aard\.win/);
    expect(mjs).toMatch(/api\/oauth\/token/);
  });

  it("every dist/**/*.d.ts contains NO @aardwin/share reference", () => {
    const dtsFiles = listDistFiles().filter((p) => extname(p) === ".ts");
    expect(dtsFiles.length).toBeGreaterThan(0);
    for (const file of dtsFiles) {
      const content = readFileSync(file, "utf8");
      expect(content).not.toMatch(/@aardwin\/share/);
    }
  });
});
