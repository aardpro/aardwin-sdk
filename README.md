# aardwin SDKs

Standalone home for aardwin's public, MIT-licensed auth SDKs.

- [`sdk/`](./sdk) — `@aardwin/auth-browser`: embeddable `<aardwin-auth>` Web Component (browser)
- [`server-sdk/`](./server-sdk) — `@aardwin/auth-server`: framework-agnostic server client (`createAardwinClient` / `exchangeCode`)
- [`examples/nextjs-app-router/`](./examples/nextjs-app-router) — Next.js App Router demo consuming both published packages

Both packages are published to npm. Consumers should depend on the npm packages
(`@aardwin/auth-browser`, `@aardwin/auth-server`), not the local source.

Build/test a package from its subdirectory: `bun install && bun run build && bun test`.
