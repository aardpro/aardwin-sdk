# aardwin browser SDK — 完整接入指南

[English](./README.md) | **中文**

[browser-sdk README](../browser-sdk/README.md) 是简短入门，本文档是完整接入指南：OAuth2 authorization-code 流程如何工作、`<aardwin-auth>` 与 `<aardwin-account>` 的行为，以及你的后端回调路由必须实现哪些步骤。

---
## 流程时序

```text
  ┌─────────────────┐
  │   你的登录页     │  <aardwin-auth site-id="…">
  │（与 callbackUrl │  请求 GET /api/providers?site_id=…
  │   同 host）     │  按 provider 渲染按钮
  └────────┬────────┘
           │ 点击
           │ 设置 aard_win_auth_state cookie（SameSite=Lax）
           ▼
  ┌─────────────────┐      ┌──────────────┐      ┌──────────────┐
  │ aardwin bff     │ ──▶  │   provider   │ ──▶  │  provider    │
  │ /authorize      │ 扫码 │（微信/谷歌等）│ 授权 │  返回 code   │
  └────────┬────────┘      └──────────────┘      └──────────────┘
           │ 302 跳回你注册的 callbackUrl
           │ ?code=<一次性码>&state=<随机数>
           ▼
  ┌─────────────────┐
  │  你的回调路由    │  1. 读取 aard_win_auth_state cookie
  │                 │  2. timingSafeEqual 比较 cookie 与 query 的 state
  │                 │  3. POST /api/oauth/token {site_id,code,client_secret}
  │                 │  4. 生成你自己的 session，跳回应用
  └─────────────────┘
```

流程中**没有 iframe**，也**没有 postMessage**。provider 扫码通过整页跳转完成，一次性码交到你的后端回调路由。你的路由必须校验 `state` 随机数，并用 `@aardwin/auth-server` 换码。

---
## 快速开始

### 1. 在 https://aard.win 注册站点

你会收到 / 配置：

- `siteId` —— 公开，放在 `<aardwin-auth>` 标签里。
- `clientSecret` —— 仅服务端使用，用于 `exchangeCode()`。
- 站点的 **provider 列表**（wechat / google / github / outlook / discord / email）。
- 你的 **callbackUrl** —— 接收 `?code=&state=` 的路由。

provider 列表与 callbackUrl 存在站点记录中；标签会动态拉取 provider 列表。

### 2. 安装

```bash
npm install @aardwin/auth-browser
```

```ts
import '@aardwin/auth-browser'; // 注册 <aardwin-auth> 与 <aardwin-account>
```

### 3. 在登录页放置标签

```html
<aardwin-auth site-id="YOUR_SITE_ID"></aardwin-auth>
```

### 4. 实现回调路由

以下示例是框架无关的 Web Fetch API 版本。复制并适配到你的框架（Astro / Next.js / Hono / Express 等）。

```ts
import { exchangeCode, AardwinError } from '@aardwin/auth-server';
import { timingSafeEqual } from 'node:crypto';

async function handleCallback(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const stateParam = url.searchParams.get('state');
  const code = url.searchParams.get('code');

  // 1. 读取 <aardwin-auth> 在跳转前设置的 state cookie。
  const cookieHeader = req.headers.get('cookie') ?? '';
  const stateCookie = parseCookie(cookieHeader, 'aard_win_auth_state');

  // 2. 常量时间比较。不匹配 → 400（不要调用 exchangeCode）。
  if (!stateCookie || !code || !safeStateEqual(stateCookie, stateParam)) {
    return new Response('bad state', { status: 400 });
  }

  // 3. 用一次性码换身份。一次性消费 —— 失败时不要重试。
  try {
    const user = await exchangeCode({
      code,
      siteId: process.env.AARD_SITE_ID!,
      clientSecret: process.env.AARDWIN_CLIENT_SECRET,
    });

    // 4. 生成你自己的 session，设置 session cookie，然后跳转。
    const session = await createSession(user.user_id);
    const res = Response.redirect(new URL('/dashboard', url), 303);
    res.headers.append('set-cookie',
      `sid=${session.token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${session.ttl}`);
    res.headers.append('set-cookie',
      'aard_win_auth_state=; Max-Age=0; Path=/'); // 删除已消费的 state cookie
    return res;
  } catch (e) {
    if (e instanceof AardwinError) {
      return new Response('auth failed: ' + e.message, { status: 400 });
    }
    throw e;
  }
}

function parseCookie(header: string, name: string): string | undefined {
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

function safeStateEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

async function createSession(userId: string): Promise<{ token: string; ttl: number }> {
  // ... 你的 session 存储 ...
  return { token: '...', ttl: 86400 };
}
```

后端换码 helper 在另一个包 [`@aardwin/auth-server`](./README.md) 中。browser 包不再提供服务端入口。

---
## state 校验是你的责任

浏览器 SDK 只负责设置 cookie，**不会替你校验 state**。你的回调路由必须：

1. 从请求中读取名为 `aard_win_auth_state` 的 cookie。
2. 用常量时间比较把它和 `?state=` 查询参数对比。
3. 成功换码后**一次性消费**：删除 cookie。
4. 不匹配时返回 `400`，不要继续调用 `exchangeCode()`。

`<aardwin-auth>` 设置的 cookie 属性：

| 属性 | 值 |
|------|-----|
| 名称 | `aard_win_auth_state` |
| Path | `/` |
| SameSite | `Lax` |
| Max-Age | `1800` 秒（30 分钟） |
| Domain | 省略 —— host-only cookie |

因为 cookie 是 host-only，登录页与回调 URL **必须是同一 host**。

---
## `<aardwin-auth>` 属性参考表

只有 `site-id` 必填。

| 属性 | 必填 | 类型 | 说明 |
|------|------|------|------|
| `site-id` | 是 | `string` | 在 aardwin 控制台创建的站点 ID |
| `i18n` | 否 | `'zh' \| 'en'` | 显式指定语言；省略或非法值时按 `navigator.language` 检测，默认英文 |
| `callback-path` | 否 | `string` | 显式 OAuth / email 回调路径；非空时 SDK 会在 bff 跳转 URL 中追加 `return_url`，空串/缺省时不发，bff 回退站点注册 callbackUrl |

React 类型补全可 opt-in：`import '@aardwin/auth-browser/react.d.ts';`（React 18 / React 19 / Next.js 15）。Preact、Solid 或 Vue JSX 消费者请自行添加 `JSX.IntrinsicElements` 声明。

CDN / 零构建：

```html
<script src="/aardwin-auth.iife.js"></script>
<aardwin-auth site-id="YOUR_SITE_ID"></aardwin-auth>
```

稳定版 IIFE CDN URL 将在首个稳定构建发布后公布。本地测试时，可把 `dist/aardwin-auth.iife.js` 产物复制到项目的 `public/` 目录。

---
## `<aardwin-account>` 组件

`<aardwin-account>` 是自包含的内联账号管理 Web Component，在 Shadow DOM 内渲染。它**没有托管的管理页**，也**没有 `manage-url`**。

它需要一个由服务端通过 `@aardwin/auth-server` 的 `createAccountHandoff()` 铸造的一次性账号接管码（handoff code）。该码一次性消费，60 秒过期，因此应在用户打开账号页时按需铸造，而不是在登录时铸造。

```html
<aardwin-account site-id="YOUR_SITE_ID" code="ONE_TIME_HANDOFF_CODE"></aardwin-account>
```

```ts
import { createAardwinClient } from '@aardwin/auth-server';

const client = createAardwinClient({
  siteId: process.env.AARDWIN_SITE_ID,
  clientSecret: process.env.AARDWIN_CLIENT_SECRET, // 仅服务端
});

const { code, expiresIn } = await client.createAccountHandoff({ userId: session.userId });
// 把 code 传给浏览器，渲染 <aardwin-account site-id code>
```

### `<aardwin-account>` 属性

| 属性 | 必填 | 说明 |
|------|------|------|
| `site-id` | 是 | 站点 ID；决定可绑定的 provider |
| `code` | 是 | `createAccountHandoff()` 返回的一次性账号接管码（handoff code）。如果 `sessionStorage` 已有 token，则不消费该 code |
| `i18n` | 否 | `'zh' \| 'en'`，默认按 `navigator.language` 检测 |

### 生命周期

1. 解析 access token：优先复用 `sessionStorage` 中缓存的 token（key 为 `aardwin_account_token`）；如无 token 且提供了新鲜 `code`，则调用 `POST /api/account/session {code}` 并保存返回的 `access_token`。
2. 如果页面 URL 带有 `?pending` 和 `?provider`（从 OAuth provider 回调回来），则携带 Bearer token 调用 `POST /api/account/link/:provider/confirm {pending_token}`，清除 URL 参数，并重新渲染成功/失败反馈条。
3. 否则渲染当前状态：`GET /api/account/identities`（Bearer）→ 已绑 identity 列表（每项带**解绑**按钮），以及剩余站点 provider 的绑定按钮（排除 `email` 和已绑 provider）。

绑定与解绑行为：

- **绑定**：`POST /api/account/link/:provider {return_url: <本页 URL>}`（Bearer）→ 整页跳转到 provider 的 authorize 端点。OAuth 回调回到同一页并带 `?pending=&provider=`，由步骤 2 处理。
- **解绑**：在原生 `confirm()` 确认后调用 `DELETE /api/account/identities/:identityId`（Bearer）。
- **token 过期（401）**：清除缓存 token，显示「会话已过期，请刷新页面」。下次加载 dashboard 时重新铸造 handoff code。

### 错误事件

缺少 `code` 且无缓存 token、建会话 / 拉取 / 绑定 / 解绑失败、以及 token 过期（401）时，都会派发 `aardwin:account-error` 事件（`bubbles: true, composed: true`）。`detail.phase` 区分来源：

```ts
el.addEventListener('aardwin:account-error', (e) => {
  console.log(e.detail.phase, e.detail.message);
});
```

---
## Provider 路由表

组件不会硬编码 provider URL。它调用 `GET /api/providers?site_id=`，接收每个 provider 对应的 `authorizeEndpoint`。平台自动路由：

| Provider | 区域 bff 节点 |
|----------|--------------|
| 微信（WeChat） | 国内节点（domestic bff） |
| Google、GitHub、Outlook、Discord | 海外节点（overseas bff） |
| email | 由配置的 bff origin 提供 email 入口 |

你不需要自己处理这些路由。按钮点击会跳转到 `${authorizeEndpoint}/authorize?site_id=&provider=&state=&lang=`（`email` 走专用入口）。换码始终走 API origin 的 `POST /api/oauth/token`。

---
## 接口契约

| 接口 | 调用方 | 用途 |
|------|--------|------|
| `GET /api/providers?site_id=` | 浏览器 SDK → API | 拉取 provider 列表及 `authorizeEndpoint`；校验 Origin |
| `GET {authorizeEndpoint}/authorize?site_id=&provider=&state=` | 浏览器 → 区域 bff | 渲染扫码页；302→callbackUrl `?code=&state=` |
| `POST /api/oauth/token` | 你的后端 → API | `{ site_id, code, client_secret }` → 用户身份 |
| `POST /api/account/session` | 浏览器 SDK → API | `{ code }` → `{ access_token }` |
| `GET /api/account/identities` | 浏览器 SDK → API | Bearer token → 已绑 identity 列表 |
| `POST /api/account/link/:provider` | 浏览器 SDK → API | Bearer + `{ return_url }` → 跳转绑定 provider |
| `POST /api/account/link/:provider/confirm` | 浏览器 SDK → API | Bearer + `{ pending_token }` → 确认绑定 |
| `DELETE /api/account/identities/:identityId` | 浏览器 SDK → API | Bearer → 解绑 identity |

---
## 问题排查

### 按钮没有渲染

打开浏览器 DevTools 的 Network 面板，检查 `GET /api/providers?site_id=...`：

- 确认响应状态为 **200**；
- 确认响应体中 `data.providers` 数组非空。数组为空表示该站点在控制台未配置任何 provider。

### iframe 或嵌入式 webview 阻止跳转

`<aardwin-auth>` 通过 `window.location.href` 做整页跳转。如果登录页被加载到限制顶层导航的 iframe 或应用内 webview 中，OAuth provider 可能拒绝流程或跳转失败。请把登录页放在顶层浏览上下文。

### state 不匹配

- 检查 `aard_win_auth_state` cookie 是否已设置（`Path=/`、`SameSite=Lax`、`Max-Age=1800`）。
- 确认 `?state=` 查询参数与 cookie 值完全一致。
- 确认登录页与回调 URL 在**同一 host**。cookie 是 host-only（无 `Domain` 属性），跨 host 回调无法读取。

### code 已消费（`40001`）

`exchangeCode()` 在一次性码无效、过期、已消费或不匹配时抛出 `code: 40001` 的 `AardwinError`。该码是一次性原子消费，**不要重试**。提示用户重新登录，`<aardwin-auth>` 的重定向流程会生成一个新 code。

### 监听生命周期事件

在 `<aardwin-auth>` 上：

```ts
const el = document.querySelector('aardwin-auth');
el.addEventListener('aardwin:error', (e) => console.log(e.detail));
// { phase: 'render' | 'start', message: string, provider?: string }
el.addEventListener('aardwin:ready', () => console.log('rendered'));
```

在 `<aardwin-account>` 上：

```ts
const el = document.querySelector('aardwin-account');
el.addEventListener('aardwin:account-error', (e) => console.log(e.detail.phase, e.detail.message));
```

---
## 样式覆盖

`<aardwin-auth>` 暴露 `part="button"`：

```css
aardwin-auth::part(button) {
  border-radius: 999px;
  background: #07c160;
  color: #fff;
}
```

`<aardwin-account>` 的绑定按钮同样暴露 `part="button"`。

---
## 相关链接

- [browser-sdk README](../browser-sdk/README.md)
- [LOCALDEV.md](../browser-sdk/LOCALDEV.md)
- [RELEASING.md](../RELEASING.md)
- [https://aard.win](https://aard.win) —— 开发者控制台
