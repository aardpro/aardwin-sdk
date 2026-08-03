import { LABELS } from './i18n';

/**
 * Hardcoded aardwin api origin. The <aardwin-auth> element and exchangeCode() call this
 * service. Edit this constant to point at your deployed **api** origin.
 *
 * Wave 2 (#4) 后 API_ORIGIN 是 api 入口，两个用途：
 *   - 把 provider→authorize 映射：`GET ${API_ORIGIN}/api/providers?site_id=`
 *     （api 按 provider 返回对应区域 bff 的 authorizeEndpoint）。
 *   - 一次性换码：`POST ${API_ORIGIN}/api/oauth/token`（exchangeCode）。
 *
 * provider 的实际扫码授权（`/authorize` + `/oauth/callback`）由 api 在
 * `/api/providers` 响应里按区域路由到国内/海外 bff，sdk 不再硬编码 bff 域名。
 *
 * 已设为生产 api 公网入口 `https://api.aard.win`（CF LB 跨两区 api 隧道；专职 api 域，
 * 与 bff 域 `auth.aard.win` / `auth.aoki-infinity.tech` 分离）。
 *
 * 本地开发：
 *   - server 端换码：第三方后端通过 `@aardwin/auth-server` 包的 `exchangeCode({ apiOrigin: 'http://localhost:4000' })`
 *     覆盖，无需改本常量。
 *   - 浏览器端组件（`<aardwin-auth>`）：组件支持 `api-origin` 属性覆盖；不传则用本常量。
 *     例：`<aardwin-auth site-id="…" api-origin="http://localhost:4000">`。
 */
export const API_ORIGIN = "https://api.aard.win";

/** Cookie name holding the CSRF `state` nonce between redirect-out and callback. */
export const STATE_COOKIE = "aard_win_auth_state";

/**
 * Display labels for known providers. Unknown ids fall back to their raw id.
 *
 * 派生自 i18n LABELS.zh，向后兼容 zh-only 消费者；component.ts 已改用 texts.labels
 * 按当前语言取。
 */
export const PROVIDER_LABELS: Record<string, string> = LABELS.zh;
