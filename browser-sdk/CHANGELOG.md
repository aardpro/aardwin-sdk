# Changelog

## 0.1.0 - 2026-07-08

### BREAKING
- 移除 `<aardwin-auth>` 的 `email-endpoint` attribute。email 按钮与 OAuth 统一走 api 返回的 `authorizeEndpoint`。
  本地测 email-auth 复用 OAuth 的 ngrok 机制（本地 bff ngrok + 本地 api 的 `email.bff_origin` 指 ngrok）。
- **命名归一（BREAKING）**：npm 包名 `@aardpro/aardwin` → `@aardwin/auth-browser`；WC 自定义元素标签 `<aard-win-auth>` → `<aardwin-auth>`；类名 `AardWinAuthElement` → `AardwinAuthElement`。所有嵌入方需更新 HTML 标签名与 npm 包名（`npm deprecate @aardpro/aardwin` 指向新包）。
### Added
- i18n 英文优先：默认英文 UI，按 `navigator.language` 自动检测中文（`i18n="zh"` 显式覆盖）。
- provider 标签进 i18n 字典（`LABELS`），英文 UI 中 wechat 显示 "WeChat"、email 显示 "Email" 等。
- 错误事件：`aardwin:error`（render/start 失败，detail `{phase, message, provider?}`）；`aardwin:ready`，`composed:true` 穿透 Shadow DOM 到父页面。
- TS JSX 声明：`import '@aardwin/auth-browser/react.d.ts'` 令 `<aardwin-auth>` 在 React 18 + React 19 / Next.js 15 项目无类型错误。
- Next.js App Router 示例（见 `examples/nextjs-app-router/`）。
### Changed
- state cookie 寿命 600s → 1800s（微信扫码 / email 输码不再中途超时）。
- email 登录与 OAuth 共享 state-verify 回调，state 全程透传（SDK → bff → callbackUrl），开发者标准 state 校验对 email 也通用。
