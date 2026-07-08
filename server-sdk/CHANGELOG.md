# Changelog

## 0.1.0 - 2026-07-08

### BREAKING
- `createAardwinClient` / `exchangeCode` 的 `origin` 字段改为 `apiOrigin`。
- 常量 `BACKEND_ORIGIN` 改为 `API_ORIGIN`。
- `http-client` 内部 `origin` 不变（仅公开 API 层改名）。
- **命名归一（BREAKING）**：npm 包名 `@aardpro/aardwin-server` → `@aardwin/auth-server`。公开导出（`createAardwinClient` / `exchangeCode` / `AardwinError`）签名不变。
- 错误消息前缀 `aard-win-auth …` → `aardwin-auth …`（命名归一连带；按 `error.message` 字符串匹配的消费者需更新）。
### Changed
- README state-verify 示例改用 `crypto.timingSafeEqual`（替代手写常量时间比较，避免长度泄漏）。
### Added
- 文档：state-verify 调试指引与 cookie 删除示例。
