# Changelog

## 0.5.0 - 2026-09-26

### Added
- `<aardwin-account>` 新增可选 `providers` 属性（第二层过滤）：逗号分隔白名单，与站点已启用
  providers（`site-id` → `GET /api/providers`，第一层）取交集后决定渲染哪些绑定按钮。
  值须与 canonical 名（`wechat`/`google`/`github`/`outlook`/`discord`）逐字一致（不 trim、
  大小写敏感）；缺省/空串 = 不过滤；仅影响绑定按钮区，已绑 identity 列表不受影响；
  属性变更触发重渲染（已加入 `observedAttributes`）。
- `<aardwin-auth>` 新增同语义 `providers` 属性：白名单与站点已启用 providers 取交集后决定
  渲染哪些登录按钮。差异点：auth 的 `email` 也是登录按钮、同受白名单控制（值域比 account
  多一个 `email`）；交集为空 → 渲染 zeroChannels 错误并 `console.warn` 列出站点 providers
  与白名单两侧值（便于发现大小写/空格 typo）。解析函数迁至 `provider-shared` 两元素共用。
- `react.d.ts` 补全：`<aardwin-account>` JSX 类型声明（此前仅 `<aardwin-auth>`，React 用户
  无法类型安全使用 account 元素）；`<aardwin-auth>` 声明补 `providers` 属性。
- 文档（README 双语）：显式写明退化值行为——`providers=","` / 纯空白值逐字比对必然落空
  （account：绑定区不渲染；auth：zeroChannels 错误），严格匹配是刻意契约。

## 0.4.0 - 2026-08-18

### Changed
- Docs: 删除 `api-origin` 相关描述；图片改为 png 格式；demo 视频使用线上链接
- Docs: 预览图片统一使用表格布局

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
