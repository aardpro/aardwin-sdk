# 本地开发指南（localhost 全流）

前置条件：本仓库已 clone，能本地启动 api 与 bff（各 package README 中有启动说明）。

## 1. 启动 api

```bash
cd packages/api
# 默认端口 4000；确保 PostgreSQL 已启动且数据库已初始化
npm run dev
```

## 2. 启动 bff

```bash
cd packages/bff
# 按你配置的 provider 跑对应节点；本地可单节点启动
npm run dev
```

## 3. 创建测试 site

在开发者控制台创建测试站点，记录 `siteId`，并配置至少一个 provider（如 GitHub 或 email）。

## 4. 在测试页嵌入 SDK

```html
<aardwin-auth
  site-id="test-site-id"
  aardwin-api-origin="http://localhost:4000"
></aardwin-auth>
```

`aardwin-api-origin` 指向本地 api，使 SDK 从 localhost 拉取 provider 列表与授权入口。

## 5. 授权 → 回调 → 换码

1. 点击按钮 → 跳转 bff 授权页。
2. 完成授权 → bff 302 跳回你注册的 `callbackUrl`，并携带 `?code=...&state=...`。
3. 在后端回调路由中，使用 `@aardwin/auth-server` 的 `exchangeCode` 换码：

```ts
import { exchangeCode } from '@aardwin/auth-server';

const user = await exchangeCode({
  code,
  siteId: 'test-site-id',
  clientSecret: process.env.AARDWIN_CLIENT_SECRET!,
  apiOrigin: 'http://localhost:4000',
});
```

## 调试 checklist

- **Network**：确认 `GET /api/providers` 返回 200 且 `data.providers` 非空。
- **Cookie**：确认登录页设置了 `aard_win_auth_state`（`Path=/`, `SameSite=Lax`, `Max-Age=1800`）。
- **事件监听**：在元素上监听 `aardwin:error` 与 `aardwin:ready` 排查渲染与启动异常。

## 注意：同 host 要求

SDK 嵌入页与 callback URL 页**必须是同一 host**。`aard_win_auth_state` cookie 为 host-only（无 `Domain` 属性），跨 host 时回调页无法读取该 cookie，导致 state 校验失败。
