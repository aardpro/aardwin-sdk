# Releasing (maintainers)

Internal release guide for the `@aardwin` npm scope. Consumers never need this page — see the package READMEs instead.

**English** | 中文摘要见文末 [中文](#中文摘要)

## Packages

| Package | Directory | Tag prefix |
| --- | --- | --- |
| `@aardwin/auth-browser` | `browser-sdk/` | `auth-browser-vX.Y.Z` |
| `@aardwin/auth-server` | `server-sdk/` | `auth-server-vX.Y.Z` |

## Publishing: tag-based trusted publishing

Releases are triggered by pushing a git tag — npm trusted publishing does the rest. **Do not run `npm publish` manually**; the manual-publish instructions that used to live in the old READMEs are obsolete.

1. Bump `version` in the package's `package.json`, commit.
2. Tag with the package prefix and push the tag:

```bash
git tag auth-browser-v0.3.5
git push origin auth-browser-v0.3.5
```

3. The tag push triggers the trusted-publishing pipeline, which builds and publishes to npm. The version number is taken from the git tag — the tag is the single source of truth, keep `package.json` in sync with it.

## Before you tag

```bash
cd browser-sdk    # or server-sdk
bun run build && bun test
```

`prepublishOnly` runs the full clean + build + test suite anyway, but running it locally first gives you a faster failure loop.

## CHANGELOG rules

- Each package keeps its own `CHANGELOG.md` (`browser-sdk/CHANGELOG.md`, `server-sdk/CHANGELOG.md`).
- Every release gets an entry, including docs-only or chore-only releases — record what shipped, not only what changed behaviorally.
- Mark `BREAKING` changes explicitly; note migration steps inline.

## Local development

For the localhost full-flow setup (local api + bff + test site), see [browser-sdk/LOCALDEV.md](./browser-sdk/LOCALDEV.md).

## 中文摘要

发布走 **tag 触发的 trusted publishing**：改好 `package.json` 版本号后打 `auth-browser-vX.Y.Z` / `auth-server-vX.Y.Z` tag 并推送，由 CI 发布到 npm —— 不再手动 `npm publish`（旧 README 的手动发布指引已作废）。版本号只认 git tag。发版前在包目录跑 `bun run build && bun test`（`prepublishOnly` 也会全量跑一遍）。每个包各自维护 `CHANGELOG.md`，docs-only 变更也要记录。本地开发流程见 [browser-sdk/LOCALDEV.md](./browser-sdk/LOCALDEV.md)。
