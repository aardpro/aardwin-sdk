# @aardwin/auth-server

[English](https://github.com/aardpro/aardwin-sdk/blob/main/server-sdk/README.md) | **中文**

框架无关的 aardwin 服务端 API 客户端。用一次性 OAuth 码换取最终用户身份，并为浏览器端 `<aardwin-account>` 组件铸造账号接管码（handoff code）。零运行时依赖；纯 ESM；Node ≥ 18 / Bun。

本 SDK 的设计目标是：未来新增方法时不会改变任何现有公开签名（见 [10. Roadmap](#10-roadmap-非承诺)）。

> 与浏览器包 `@aardwin/auth-browser`（`<aardwin-auth>` Web Component）配对使用，构成完整的 OAuth2 authorization-code 流程。本 server SDK 是位于你后端的另一半。

---

## 1. 安装

```bash
bun add @aardwin/auth-server
# 或
npm install @aardwin/auth-server
```

---

## 2. 快速开始（客户端实例）

任何会发起多次换码调用（或未来会使用其他 SDK 方法）的进程，优先使用 `createAardwinClient()` —— 它在闭包里保存 `siteId` / `clientSecret` / `apiOrigin` / `timeoutMs` / `fetch`，避免重复传参。

```ts
import { createAardwinClient } from '@aardwin/auth-server';

const client = createAardwinClient({
  siteId: 'YOUR_SITE_ID',
  clientSecret: process.env.AARDWIN_CLIENT_SECRET, // 仅服务端；永远不要下发到浏览器
  // apiOrigin: 'https://api.aard.win', // 默认值；本地开发时可覆盖
  // timeoutMs: 8000,                  // 默认值；0 / Infinity 表示禁用
});

// 当回调路由收到 ?code=...&state=... 后：
const user = await client.exchangeCode({ code });
// user = { user_id, provider, email?, nickname?, avatar? }

const session = await createSession(user.user_id); // 你自己的 session
```

`client.exchangeCode(input)` 对 `input` 中省略的字段回退到客户端默认值；每次调用必填的字段只有 `code`，且它会覆盖客户端默认值。

---

## 3. 单次调用（独立函数）

对于 serverless 处理函数 / 只发起一次换码的脚本，可以直接内联所有参数调用 `exchangeCode()`：

```ts
import { exchangeCode } from '@aardwin/auth-server';

const user = await exchangeCode({
  code,
  siteId: 'YOUR_SITE_ID',
  clientSecret: process.env.AARDWIN_CLIENT_SECRET,
});
```

两种调用方式走同一个内部 HTTP 路径；按你的调用点选择即可。

---

## 4. 错误处理

`exchangeCode()` 在**所有**失败路径上都会抛出 `AardwinError`（`Error` 的子类）。用 `instanceof` 分支处理：

```ts
import { exchangeCode, AardwinError } from '@aardwin/auth-server';

try {
  const user = await exchangeCode({ code, siteId, clientSecret });
} catch (e) {
  if (e instanceof AardwinError) {
    // 下面矩阵说明了每一行会填充哪些字段
  } else {
    throw e; // 重新抛出未知错误
  }
}
```

### `AardwinError` 字段矩阵

`AardwinError` 暴露以下字段（与 `src/aardwin-error.ts` 逐字段对应）：

| 字段      | 类型                              | 是否始终存在 |
| ---------- | --------------------------------- | --------------- |
| `message`  | `string`                          | 是             |
| `name`     | `'AardwinError'`                  | 是             |
| `code`     | `number \| undefined`             | 否              |
| `status`   | `number \| undefined`             | 否              |
| `reason`   | `'timeout' \| 'aborted' \| undefined` | 否          |
| `cause`    | `unknown`（ES2022 `Error.cause`）  | 否              |

每种失败会填充的字段：

| 失败原因                                   | `code`                | `status`     | `reason`     | `cause`           | `message`                                      |
| ----------------------------------------- | --------------------- | ------------ | ------------ | ----------------- | ---------------------------------------------- |
| code 无效 / 过期 / 已消费 / 不匹配 | `40001`               | `400`        | `undefined`  | `undefined`       | envelope message                               |
| `client_secret` 错误                     | `40002`               | `401`        | `undefined`  | `undefined`       | envelope message                               |
| `401 unauthorized`（站点不存在）         | `undefined`           | `401`        | `undefined`  | `undefined`       | envelope message                               |
| `403 origin not allowed`                  | `undefined`           | `403`        | `undefined`  | `undefined`       | envelope message                               |
| 非 JSON 响应体（如 HTML 502）             | `undefined`           | HTTP status  | `undefined`  | `undefined`       | `aardwin-auth exchange failed: HTTP <s> (non-JSON body)` |
| 裸网络错误                        | `undefined`           | `undefined`  | `undefined`  | 原始 `Error`  | `aardwin-auth exchange failed: <msg>`         |
| 默认 8 秒超时触发                 | `undefined`           | `undefined`  | `'timeout'`  | abort `DOMException` | `aardwin-auth exchange timed out`          |
| 调用方 `signal` 中止                   | `undefined`           | `undefined`  | `'aborted'`  | abort `DOMException` | `aardwin-auth exchange aborted`            |

> `code === 40003`（`CHANNEL_NOT_ENABLED`，见 `EXCHANGE_CODES`）是**保留值** —— 目前 `POST /api/oauth/token` 不会返回它（channel 未启用的检查发生在 bff authorize 流程更早阶段，表现为 `error=channel_not_enabled` 的重定向）。此处仅作前瞻性说明。

---

## 5. 超时与中止

`exchangeCode()` 默认使用 **8 秒**超时（通过 `AbortSignal.timeout`），即使上游卡住也能让你的请求返回。两个字段可以调节（既可在客户端选项上设置，也可在每次调用时设置）：

```ts
await client.exchangeCode({
  code,
  timeoutMs: 5000,                     // 覆盖默认 8 秒
  signal: myAbortController.signal,    // 与调用方传入的 AbortSignal 组合
});

// 完全禁用默认超时（只依赖调用方 signal，或完全不超时）：
await client.exchangeCode({ code, timeoutMs: 0 });
```

调用方的 `signal` 会通过 `AbortSignal.any` 与内部超时组合；谁先触发谁就生效。传 `timeoutMs: 0`（或 `Infinity`）可禁用默认超时。超时时 SDK 抛出 `reason: 'timeout'` 的 `AardwinError`；调用方 signal 中止时抛出 `reason: 'aborted'`。

---

## 6. state 校验是你的责任

**本 SDK 不管理 cookie 或 session。** 它只负责换一次性码。你必须在回调路由中自己校验 OAuth `state` 随机数，且只校验一次，以防止登录 CSRF。

下面是一个示意性的、框架无关的参考片段，使用 Web Fetch API（`Request` / `Response` / `Headers`）。它**不是**本包导出的代码 —— 复制并适配到你的框架（Astro / Next.js / Hono / Express 等）。

```ts
// 示意性参考片段 —— 不是本包导出的代码。
// 先校验 state 随机数，再换取一次性码。

import { exchangeCode, AardwinError } from '@aardwin/auth-server';
import { timingSafeEqual } from 'node:crypto';

async function handleCallback(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const stateParam = url.searchParams.get('state');
  const code = url.searchParams.get('code');

  // 1. 读取 <aardwin-auth> 标签在跳转前设置的 state cookie。
  const cookieHeader = req.headers.get('cookie') ?? '';
  const stateCookie = parseCookie(cookieHeader, 'aard_win_auth_state');

  // 2. 常量时间比较。不匹配 → 400（不要继续调用 exchangeCode）。
  if (!stateCookie || !code || !safeStateEqual(stateCookie, stateParam)) {
    return new Response('bad state', { status: 400 });
  }

  // 3. 换取一次性码。一次性消费 —— 失败时不要重试。
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
      // 提示用户重新登录（该码已被消费或无效）。
      return new Response('auth failed: ' + e.message, { status: 400 });
    }
    throw e;
  }
}

// --- 你需要自己实现或从框架里拿的小工具 ---
function parseCookie(header: string, name: string): string | undefined {
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
}
/** 使用 Node 内置 crypto.timingSafeEqual 做常量时间字符串比较。
 *  避免手写循环泄露长度信息。state 是定长 32 字符十六进制随机数，
 *  因此长度判断在实践中不会泄露有效信息。 */
function safeStateEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false; // 防护：timingSafeEqual 在长度不同时会抛错
  return timingSafeEqual(ab, bb);
}
async function createSession(userId: string): Promise<{ token: string; ttl: number }> {
  // ... 你自己的 session 存储 ...
  return { token: '...', ttl: 86400 };
}
```

---

## 7. 重试策略 —— 不要重试

`exchangeCode()` 是**一次性**调用。api 会原子性地消费一次性码（`UPDATE ... WHERE consumed_at IS NULL RETURNING`）；任何非 2xx / 网络错误后重试，都有概率命中「已消费」（`code: 40001`）。失败时，**请提示用户重新登录**（`<aardwin-auth>` 的重定向流程会铸造一个新码）。

---

## 8. Contract 参考

本包接触两个端点：

| Endpoint                | 调用方           | 请求体                                                          | 成功响应（`data`）                                        |
| ----------------------- | ------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------- |
| `POST /api/oauth/token`   | 你的后端 → api | `{ site_id, code, client_secret }`（JSON，`client_secret_post`） | `{ user_id, provider, email?, nickname?, avatar? }`（envelope `code: 0`） |
| `POST /api/account/handoff` | 你的后端 → api | `{ site_id, user_id, client_secret }`（JSON）                  | `{ code, expires_in }`（envelope `code: 0`）           |

默认 origin 是 `https://api.aard.win`（aardwin 的 **api**，不是 bff）。完整的流程表（provider 列表、authorize 重定向、callback）以及两个 SDK 的 origin 覆盖参数对照，见浏览器 SDK 指南：
`https://github.com/aardpro/aardwin-sdk/blob/main/browser-sdk/SDK.md`。

---

## 9. 账号接管码（`<aardwin-account>`）

`createAccountHandoff()` 铸造一个短时效的一次性码，你把它传给仅浏览器端的 `<aardwin-account>` Web Component（由 `@aardwin/auth-browser` 提供）。该组件是自包含内联渲染（Shadow DOM）—— 列出已绑 identity、解绑、以及渲染剩余 provider 的绑定按钮，模式与 `<aardwin-auth>` 相同；没有托管管理页，也没有 `manageUrl`。用户绑定时组件会把页面自身 URL 作为 `return_url`，OAuth 回调仍会回到该页面。该码一次性消费，60 秒过期，因此应在用户打开账号页时按需铸造，而不是在登录时铸造。

通过客户端实例调用（推荐 —— 复用你的 `siteId` / `clientSecret`）：

```ts
import { createAardwinClient } from '@aardwin/auth-server';

const client = createAardwinClient({
  siteId: process.env.NEXT_PUBLIC_AARDWIN_SITE_ID,
  clientSecret: process.env.AARDWIN_CLIENT_SECRET, // 仅服务端
});

// 服务端，针对已登录用户：
const { code, expiresIn } = await client.createAccountHandoff({
  userId: user.user_id, // 来自 exchangeCode() 时你生成的 session
});
// → 把 `code`（和你的 siteId）传给浏览器，渲染 <aardwin-account site-id code>。
```

然后在页面（浏览器端）：

```html
<!-- 引入 @aardwin/auth-browser 会自动注册 <aardwin-account> 元素 -->
<aardwin-account site-id="YOUR_SITE_ID" code="ONE_TIME_CODE"></aardwin-account>
```

`client.createAccountHandoff({ userId })` 对其他所有字段（`siteId`、`clientSecret`、`apiOrigin`、`timeoutMs`、`signal`、`fetch`）回退到客户端默认值；只有 `userId` 必填。

独立单次调用形式：

```ts
import { createAccountHandoff } from '@aardwin/auth-server';

const { code, expiresIn } = await createAccountHandoff({
  userId,
  siteId: process.env.NEXT_PUBLIC_AARDWIN_SITE_ID,
  clientSecret: process.env.AARDWIN_CLIENT_SECRET,
});
```

**注意：**

- 这是 server-to-server 调用：`client_secret` 永远不能到达浏览器。在路由处理函数 / server component 里铸造 handoff code，只把 `code` 交给客户端。
- handoff 与 `exchangeCode()` 一样是一次性的 —— 失败时重新铸造新码，不要重试已消费的码。
- 失败时同样抛出 `AardwinError`；字段形状与上方的 [错误矩阵](#4-错误处理) 相同。

---

## 10. Roadmap（非承诺）

以下方法**正在考虑中**；当它们发布时，现有公开 API（`createAardwinClient`、`client.exchangeCode`、独立 `exchangeCode`、`AardwinError`）**不会**改变。客户端骨架（`createAardwinClient` 返回一个对象，其方法委托给共享的内部 `postJson`）会以新增成员或顶层导出的方式吸收它们：

- `client.getUser(userId)` —— 近期；需要新的公开 api 路由。
- `verifyWebhookSignature(payload, sig, secret)` —— 纯函数，无 HTTP；新增顶层导出。
- `verifyToken(token, opts?)` ——  speculative；aardwin 目前不对外发放 JWT。

`AardwinError` 保持为单一的扁平 `Error` 子类；任何未来需要区分错误类型的方法都会继承 `AardwinError`，因此 `instanceof AardwinError` 继续成立。

---

## License

MIT
