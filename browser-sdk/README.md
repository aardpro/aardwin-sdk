# @aardwin/auth-browser

[![npm version](https://img.shields.io/npm/v/@aardwin/auth-browser)](https://www.npmjs.com/package/@aardwin/auth-browser)
[![MIT license](https://img.shields.io/npm/l/@aardwin/auth-browser)](./LICENSE)

**English** | [中文](./README.zh-CN.md)

Embeddable `<aardwin-auth>` Web Component for OAuth login (WeChat, Google, Outlook, GitHub, Discord, email OTP): Shadow DOM, zero dependencies, works in any framework. Also ships `<aardwin-account>` for inline identity management (bind / unbind providers).

## Install + minimal usage

```bash
npm install @aardwin/auth-browser
```

```ts
import '@aardwin/auth-browser'; // side-effect: registers <aardwin-auth> and <aardwin-account>
```

```html
<aardwin-auth site-id="YOUR_SITE_ID"></aardwin-auth>
```

No bundler? Build the IIFE bundle (`bun run build:iife` → `dist/aardwin-auth.iife.js`) and load it with a `<script>` tag:

```html
<script src="/aardwin-auth.iife.js"></script>
<aardwin-auth site-id="YOUR_SITE_ID"></aardwin-auth>
```

The element fetches your site's provider list from the aardwin API and renders one button per provider — you never hardcode providers. Button order is fixed: WeChat → Google → Outlook → GitHub → Discord → Email.

## Props

`<aardwin-auth>`:

| Attribute | Required | Description |
| --- | --- | --- |
| `site-id` | yes | Site ID created in the [aard.win console](https://aard.win); decides which provider buttons are fetched |
| `i18n` | no | `'zh' \| 'en'`; omitted → auto-detect via `navigator.language`, English default |
| `callback-path` | no | Explicit callback path (e.g. `/callback`); when set, the SDK appends `return_url` to the redirect; omitted → the bff falls back to your registered callbackUrl |

`<aardwin-account>`:

| Attribute | Required | Description |
| --- | --- | --- |
| `site-id` | yes | Site ID; determines which providers can be bound |
| `code` | yes | One-time handoff code minted server-side via `createAccountHandoff()` (60 s, single-use) |
| `i18n` | no | `'zh' \| 'en'`; omitted → auto-detect |

React projects: `import '@aardwin/auth-browser/react.d.ts'` for JSX typings (React 18 / 19, Next.js 15).

## Security model

- The component sets the CSRF `state` nonce itself in a `SameSite=Lax` cookie (`aard_win_auth_state`); your callback route verifies it.
- The frontend holds zero secrets — `client-secret` stays on your backend, used only with `@aardwin/auth-server`.
- The callback `code` is one-time (60 s expiry, atomic consume).

## What it looks like

![aardwin login card in a Next.js app](../preview/nextjs-snapshot.webp)
![aardwin login card in a Vue app](../preview/vuejs-snapshot.webp)

▶ Demo video: [../preview/demo.mp4](../preview/demo.mp4)

## Going deeper

- Full integration guide (callback route, contract reference, troubleshooting): [SDK.md](./SDK.md)
- Server-side code exchange: [`@aardwin/auth-server`](../server-sdk/README.md)
- Repo & examples: [aardpro/aardwin-sdk](..)

## License

[MIT](./LICENSE)
