# @aardwin/auth-browser

面向第三方站点的嵌入式登录组件。零依赖、纯 TypeScript Web Component，通过标准 OAuth2 authorization-code flow 完成扫码/跳转登录。

第三方接入只需两步：
1. **登录页**放一个 `<aardwin-auth site-id="…">` 标签。
2. **后端回调路由**校验 `state`，用 **`@aardwin/auth-server`** 包的 `exchangeCode()` 换取终端用户身份。

完整集成指南见 [SDK.md](./SDK.md)；后端换码 helper 见 [`@aardwin/auth-server`](../server-sdk/README.md)。

## 包入口

| 入口 | 环境 | 说明 |
|---|---|---|
| `@aardwin/auth-browser` | 浏览器 | side-effect：注册 `<aardwin-auth>` 自定义元素 |
| `@aardwin/auth-server` | Node / Bun | 后端 `exchangeCode()` helper（独立包，server-only） |

```ts
// 浏览器（CDN 或 npm）
import "@aardwin/auth-browser"; // 注册 <aardwin-auth site-id="...">

// 第三方后端（独立包）
import { exchangeCode } from "@aardwin/auth-server";
const user = await exchangeCode({ code, siteId, clientSecret: process.env.AARDWIN_CLIENT_SECRET! });
// user = { user_id, provider, nickname?, avatar? }
```

## 配置

后端 origin 硬编码在 `src/config.ts` 的 `AARDWIN_API_ORIGIN`（指向已部署的 `@aardwin/bff`）。发布前改为真实地址。元素只接受 `site-id`（必填）和 `i18n`（预留，v1 未实现）。

## 构建

```bash
cd packages/sdk
bun run build        # 产出 dist/index.mjs（浏览器 ESM）+ dist/server.mjs（node）+ dist/*.d.ts（类型）
bun run build:iife   # 产出 dist/aardwin-auth.iife.js（CDN <script> 即用）
```

## 目录结构

```
src/
├── index.ts          # 浏览器入口（导出 + 注册元素）
├── component.ts      # <aardwin-auth> Web Component 实现
├── exchange-code.ts  # server-only：exchangeCode() 换码
├── config.ts         # AARDWIN_API_ORIGIN / STATE_COOKIE / PROVIDER_LABELS
└── types.ts          # AuthUser / ProviderInfo
```

## 安全模型

- 前端零密文：只暴露 `siteId`。
- `state` nonce 存 SameSite=Lax cookie，防 login CSRF。
- 换码由第三方后端用注册的 `client_secret` 完成；code 一次性（60s）。

## 发布（npm）

前置（仅需做一次）：
1. 在 https://www.npmjs.com 创建 `@aardpro` org，把发布账号加为 owner。
2. 本地 `npm login`（用该账号）。

发布步骤：
```bash
cd packages/sdk
# 1. 改 src/config.ts 的 AARDWIN_API_ORIGIN 为真实线上 api origin（发布前必改！）
# 2. 如需升版本号
npm version patch   # 或 minor / major
# 3. 一键构建 + 发布（prepublishOnly 会自动 clean + build dist + .d.ts）
npm publish --access public
```

> 产物：`dist/index.mjs`（浏览器 ESM）+ `dist/server.mjs`（node）+ `dist/*.d.ts`（类型）+ `src/`（源码兜底）。IIFE CDN 包 `dist/aardwin-auth.iife.js` **不包含在 npm 包内**（它是 CDN 单独托管的）；如需发布 CDN 版本，单独走 CDN 上传流程。

**验证发布内容（不发实际 publish）**：
```bash
cd packages/sdk
bun run build
npm pack --dry-run    # 检查将要发布的文件清单
```
