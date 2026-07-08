# @aardwin/auth-browser — third-party integration

Drop-in OAuth login (GitHub, Google, WeChat, ...) via standard OAuth2
**authorization-code flow**. No iframe, no postMessage. The third-party writes:

1. **Login page**: one `<aardwin-auth site-id="…">` tag.
2. **Backend callback route**: verify `state`, call `exchangeCode()`, mint your session.


## Quickstart

### npm 安装

```bash
npm install @aardwin/auth-browser
```

```ts
import '@aardwin/auth-browser'; // side-effect: registers <aardwin-auth>
```

### 最小用法

```html
<aardwin-auth site-id="your-site-id"></aardwin-auth>
```

### 属性参数

| 属性 | 必填 | 类型 | 说明 |
|------|------|------|------|
| `site-id` | 是 | `string` | 在控制台创建的站点 ID |
| `i18n` | 否 | `'zh' \| 'en'` | 显式指定语言；留空则按 `navigator.language` 自动检测，默认英文 |
| `aardwin-api-origin` | 否 | `string` | 覆盖 API 入口地址，本地开发时指向 `http://localhost:4000` |

## 0. Register your app (on the aardwin developer portal)

You receive / configure:

- `siteId` (public — goes in the tag)
- `clientSecret` (server-only — used in `exchangeCode`)
- pick the **provider list** (wechat / google / github / outlook / discord / email)
- register your **callbackUrl** (where the code is sent back)

The provider list + callbackUrl live on the site record; the tag fetches the provider list
dynamically, so you never hardcode providers. aardwin derives the allowed host from your
callbackUrl for anti-abuse Origin checks.

## 1. Login page (one tag)

### CDN / `<script>` (zero build)

```html
<!-- CDN URL 待定；本地测试可把 dist/aardwin-auth.iife.js 产物复制到 public/ 目测 -->
<script src="/aardwin-auth.iife.js"></script>
<aardwin-auth site-id="YOUR_SITE_ID"></aardwin-auth>
```

> The backend origin defaults to the hardcoded `AARDWIN_API_ORIGIN` (`https://oauth.aard.win`) in
> config. The tag takes `site-id` (required), an optional `aardwin-api-origin` attribute to override
> the api entry origin (see below), and an `i18n` attribute (`'zh' | 'en'`; defaults to English, auto-detects Chinese via `navigator.language`).

#### `aardwin-api-origin` (optional)

Override the SDK's default api entry (`AARDWIN_API_ORIGIN`) per-instance. Only affects:

- the `/api/providers` fetch origin, and
- the `/authorize` fallback base (used only when a provider's `authorizeEndpoint` is empty).

It does **not** rewrite each provider's `authorizeEndpoint` — that stays sourced from the api
(each provider's `bff_origin` configured by platform admins on `platform_provider_status`).
For local dev, have a super_admin set the provider's BFF 网址 to a reachable bff entry via the admin console.

```html
<!-- dev: pull providers from local api -->
<aardwin-auth site-id="YOUR_SITE_ID" aardwin-api-origin="http://localhost:4000"></aardwin-auth>
```

Empty string / absent attribute falls back to `AARDWIN_API_ORIGIN`.

> `@aardwin/auth-server`（后端换码）有对等的 `origin` 参数。两个 sdk 的 origin 覆盖参数对照见 [technical-architecture.md §3.4](../../docs/technical-architecture.md)。

### npm

```bash
bun add @aardwin/auth-browser
```

```ts
import '@aardwin/auth-browser'; // side-effect: registers <aardwin-auth>
```

The element fetches `GET {AARDWIN_API_ORIGIN}/api/providers?site_id=…` (`AARDWIN_API_ORIGIN` is the
aardwin **api** entry) and renders one button per provider you registered. Each response item
carries an `authorizeEndpoint` (the bff origin for that provider, admin-configured on `platform_provider_status.bff_origin`). Clicking a button:

1. generates a `state` nonce, stores it in the `aard_win_auth_state` cookie (SameSite=Lax),
2. full-page redirects to `{authorizeEndpoint}/authorize?site_id=…&provider=…&state=…`
   (no `redirect_uri` — the backend looks up your registered callbackUrl by site-id).


### TypeScript / React

`<aardwin-auth>` 是标准 Web Component，原生可在任何框架使用。React 项目里 `<aardwin-auth site-id="…">` 默认会报类型错误（未知 intrinsic element）。本包提供 opt-in 的 React JSX 类型声明：

```ts
import '@aardwin/auth-browser/react.d.ts';
```

import 后 `<aardwin-auth>` 的属性（`site-id` 必填、`i18n?`、`aardwin-api-origin?`）有自动补全，兼容 React 18 与 React 19 / Next.js 15。

**非 React 框架**（Preact / Solid / Vue JSX）：本声明不适用，请在你的项目里自行加 3 行：

```ts
declare global {
  namespace JSX {
    interface IntrinsicElements {
      'aardwin-auth': { 'site-id': string; i18n?: 'zh' | 'en'; 'aardwin-api-origin'?: string };
    }
  }
}
```
## 2. Backend callback route (one call)

After the scan the backend redirects the browser to your registered `callbackUrl` with
`?code=<one-time>&state=<nonce>`. Verify `state` against the cookie, then exchange the code for
the end-user identity.

**The code-exchange helper lives in a separate package: [`@aardwin/auth-server`](../server-sdk/README.md).**
It is framework-agnostic (Node / Bun / any edge runtime), ships `createAardwinClient()` +
standalone `exchangeCode()`, and documents the full error matrix, timeout/abort behavior, retry
policy, and a copy-paste state-verification reference snippet. This browser package no longer
ships a server entry.

```ts
import { exchangeCode } from '@aardwin/auth-server';

const user = await exchangeCode({
  code,
  siteId: 'YOUR_SITE_ID',
  clientSecret: process.env.AARDWIN_CLIENT_SECRET!, // server-only; never in the browser
});
// user = { user_id, provider, nickname?, avatar? }
```

## Contract reference

| Endpoint                                                      | Who calls                             | Purpose                                                                                                                       |
| ------------------------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/providers?site_id=`                                 | browser (SDK) → **api**               | provider list + per-provider `authorizeEndpoint` (validates Origin ∈ {host of callbackUrl}, emits CORS)                       |
| `GET {authorizeEndpoint}/authorize?site_id=&provider=&state=` | browser (redirect) → **regional bff** | renders the provider scan; on completion 302→registered callbackUrl `?code&state=` (validates Origin ∈ {host of callbackUrl}) |
| `POST /api/oauth/token`                                       | your backend → **api**                | `{ site_id, code, client_secret }` → `{ user_id, provider, nickname?, avatar? }`                                              |

## Security model

- **Frontend is zero-secret**: only `siteId`. Anti-abuse is **server-side** by `site_id` +
  the host derived from your registered **callbackUrl** (Origin/Referer host must match) +
  per-site rate limiting.
- **Backend exchange** uses the registered `client_secret` (standard OAuth2
  `client_secret_post`); the `code` is one-time (60s, atomic consume).
- **Trust anchor**: the one-time code + client_secret. Verify `state` (cookie) to prevent
  login CSRF. Keep `client_secret` in env; rotate/revocable via the portal.


## Troubleshooting / 调试

### 按钮不渲染

打开浏览器 DevTools 的 Network 面板，查看 `GET {apiOrigin}/api/providers?site_id=...` 请求：
- 确认响应状态为 **200**；
- 确认响应体中 `data.providers` 数组非空（为空表示该 site 未配置任何 provider）。

### state 校验失败

- 检查 `aard_win_auth_state` cookie 是否已设置（`Path=/`, `SameSite=Lax`, `Max-Age=1800`）。
- 回调 URL 中的 `?state=` 参数必须与 cookie 值完全一致。
- 如果 cookie 缺失，确认回调地址与登录页**同 host**（cookie 为 host-only，无 `Domain` 属性）。

### 监听错误事件

在 `<aardwin-auth>` 元素上监听 `aardwin:error` 与 `aardwin:ready`：

```ts
const el = document.querySelector('aardwin-auth');
el.addEventListener('aardwin:error', (e) => console.log(e.detail));
// { phase: 'render' | 'start', message: string, provider?: string }
el.addEventListener('aardwin:ready', () => console.log('rendered'));
```

### 本地开发

详细流程见 [LOCALDEV.md](LOCALDEV.md)。

## Styling

```css
aardwin-auth::part(button) {
  border-radius: 999px;
  background: #07c160;
  color: #fff;
}
```
