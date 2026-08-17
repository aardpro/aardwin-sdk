# aardwin SDKs

[![npm @aardwin/auth-browser](https://img.shields.io/npm/v/@aardwin/auth-browser)](https://www.npmjs.com/package/@aardwin/auth-browser)
[![npm @aardwin/auth-server](https://img.shields.io/npm/v/@aardwin/auth-server)](https://www.npmjs.com/package/@aardwin/auth-server)
[![MIT license](https://img.shields.io/npm/l/@aardwin/auth-browser)](./browser-sdk/LICENSE)

**中文** | [English](./README.md)

微信、Google、Outlook、GitHub、Discord + 邮箱验证码，一套 OAuth 登录。任意框架放一个 `<aardwin-auth>` Web Component，服务端校验回调，所有 aardwin 用户即可登录你的应用 —— 一个账号，通用于每个接入它的产品。控制台：**https://aard.win**

[![SDK demo](preview/nextjs-snapshot.png)](https://aard.win/sdk-demo.mp4)

▶ 21 秒演示 —— 同一张登录卡片分别出现在 Next.js 应用和 Vue 应用里，然后走完 OAuth 回调往返。

**同一个组件，两个框架**

<table>
  <tr>
    <th>Next.js 应用</th>
    <th>Vue 应用</th>
  </tr>
  <tr>
    <td><img src="preview/nextjs-snapshot.png" alt="Next.js 应用中渲染的 aardwin 登录卡片" width="360"></td>
    <td><img src="preview/vuejs-snapshot.png" alt="Vue 应用中渲染的 aardwin 登录卡片" width="360"></td>
  </tr>
</table>

## 快速开始

最短路径 —— 完整指南见 [browser-sdk/SDK.md](browser-sdk/SDK.md)。

1. 在 [aard.win 控制台](https://aard.win) 注册站点 → 拿到 `site-id` + `client-secret`。
2. 前端：`npm i @aardwin/auth-browser`，在登录页放 `<aardwin-auth site-id="..."></aardwin-auth>` —— 用户选择登录方式后，aard.win 带着一次性 `code` 重定向回来。
3. 回调路由：校验 `state`，再用 `@aardwin/auth-server` 的 `exchangeCode()` 换取用户身份 → 铸造你自己的会话。完整清单：[browser-sdk/SDK.md](browser-sdk/SDK.md)。

## 包

| 包 | 是什么 | 安装 |
| --- | --- | --- |
| [`@aardwin/auth-browser`](./browser-sdk/README.md) | `<aardwin-auth>` 登录组件 + `<aardwin-account>` 身份管理组件，Shadow DOM Web Component，零依赖 | `npm i @aardwin/auth-browser` |
| [`@aardwin/auth-server`](./server-sdk/README.md) | 服务端换码（`exchangeCode`）与账号 handoff（`createAccountHandoff`）；Node / Bun / edge 通用 | `npm i @aardwin/auth-server` |

## 示例

- [`examples/nextjs-app`](./examples/nextjs-app) —— Next.js App Router 应用，消费两个已发布的 npm 包。
- [`examples/vue-app`](./examples/vue-app) —— Vue 应用，嵌入同一张登录卡片。

## 链接

- 控制台与文档入口：[https://aard.win](https://aard.win)
- 浏览器 SDK：[browser-sdk/README.md](./browser-sdk/README.md) · [browser-sdk/SDK.md](./browser-sdk/SDK.md)
- 服务端 SDK：[server-sdk/README.md](./server-sdk/README.md)
- 许可证：[MIT](./browser-sdk/LICENSE)
- English docs: [README.md](./README.md)
