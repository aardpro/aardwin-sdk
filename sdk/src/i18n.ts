/**
 * SDK 文案字典与 locale 解析。
 *
 * 遵循 sdk 现有「DOM-free 纯函数 + 单测无 document」模式（见 api-origin.ts）。
 * component.ts 调 resolveSdkTexts(attr, navLang) 取字典，渲染时按 key 引用。
 *
 * 解析链（优先级从高到低）：
 * 1. i18n attr 显式 'zh' → 中文
 * 2. i18n attr 显式 'en' → 英文
 * 3. attr 缺失 / 空 / 垃圾值 → 看 navLang：
 *    - navLang（string 或 string[]）任意一项小写含 'zh' → 中文
 *    - 否则 → 英文（英文是 default）
 */

export type SdkLang = 'zh' | 'en';

export interface SdkTexts {
  /** 缺 site-id 属性时 */
  missingSiteId: string;
  /** 拉取 providers 中 */
  loading: string;
  /** 拉取失败 */
  loadFailed: string;
  /** 零渠道 */
  zeroChannels: string;
  /** OAuth 按钮文案前缀，与 label/后缀拼成「{prefix} {label}[ {suffix}]」。
   *  en="Continue with" / zh="使用"。 */
  continueWithPrefix: string;
  /** OAuth 按钮文案后缀（可空）：en="" / zh="继续"。
   *  en 无后缀 → 「Continue with Google」；zh → 「使用 微信 继续」。 */
  continueWithSuffix: string;
  /** email 按钮文案（保持 Continue with Email / 继续使用邮箱，独立于前缀方案） */
  emailButton: string;
  /** provider 标签字典，按当前语言给出 */
  labels: Record<string, string>;
  /** 解析出的 locale 代码，回传给 startAuth 拼到跳转 URL 的 ?lang=（issue 2） */
  lang: SdkLang;

  /** <aardwin-account> 缺 code 属性（且 sessionStorage 无已存 token） */
  missingAccountCode: string;
  /** <aardwin-account> 加载账号信息中 */
  accountLoading: string;
  /** <aardwin-account> 账号信息加载失败（非 401 的通用失败） */
  accountError: string;
  /** <aardwin-account> token 过期（401）：提示刷新页面重新进入 */
  sessionExpired: string;
  /** <aardwin-account> 已绑 identity 列表标题 */
  identitiesTitle: string;
  /** <aardwin-account> 无已绑 identity 的空态文案 */
  noIdentities: string;
  /** <aardwin-account> 账号级 email 行的 label（响应里的顶层 email 字段） */
  emailLabel: string;
  /** <aardwin-account> 已绑 identity 的 linkedAt 前缀（后接日期） */
  linkedAtPrefix: string;
  /** <aardwin-account> 绑定按钮前缀，与 label 拼成「{prefix}[ ]{label}」。
   *  en="Bind " / zh="绑定"。sep: zh="" / en=" "（与 aardwin-auth 同形）。 */
  bindPrefix: string;
  /** <aardwin-account> 绑定按钮分组标题 */
  bindTitle: string;
  /** <aardwin-account> 解绑按钮文案 */
  unbindLabel: string;
  /** <aardwin-account> 解绑二次确认，`{p}` 占位 provider 显示名 */
  confirmUnbind: string;
  /** <aardwin-account> 绑定回调 confirm 成功反馈 */
  linkSuccess: string;
  /** <aardwin-account> 绑定回调 confirm 失败反馈 */
  linkFailed: string;
  /** <aardwin-account> 解绑成功反馈 */
  unbindSuccess: string;
  /** <aardwin-account> 解绑失败反馈 */
  unbindFailed: string;
}

export const LABELS: Record<SdkLang, Record<string, string>> = {
  zh: { email: '邮箱', wechat: '微信', google: 'Google', github: 'GitHub', outlook: 'Outlook', discord: 'Discord' },
  en: { email: 'Email', wechat: 'WeChat', google: 'Google', github: 'GitHub', outlook: 'Outlook', discord: 'Discord' },
};
// 注释：LABELS 只含纯字符串 label，icon/class 留给 v0.3 flow 字段接管。

const ZH: SdkTexts = {
  missingSiteId: 'aardwin-auth 需要 site-id 属性',
  loading: '加载登录方式…',
  loadFailed: '登录方式加载失败，请稍后重试',
  zeroChannels: '该站点未启用任何登录方式',
  continueWithPrefix: '使用',
  continueWithSuffix: '继续',
  emailButton: '继续使用邮箱',
  labels: LABELS.zh,
  lang: 'zh',
  missingAccountCode: 'aardwin-account 需要 code 属性（或刷新页面重新进入）',
  accountLoading: '加载账号信息…',
  accountError: '账号信息加载失败，请稍后重试',
  sessionExpired: '会话已过期，请刷新页面重新进入',
  identitiesTitle: '已绑定的账号',
  noIdentities: '尚未绑定任何账号',
  emailLabel: '邮箱',
  linkedAtPrefix: '绑定于 ',
  bindPrefix: '绑定',
  bindTitle: '添加绑定',
  unbindLabel: '解绑',
  confirmUnbind: '确定要解绑 {p} 吗？',
  linkSuccess: '绑定成功',
  linkFailed: '绑定失败，请重试',
  unbindSuccess: '已解绑',
  unbindFailed: '解绑失败，请重试',
};

const EN: SdkTexts = {
  missingSiteId: 'aardwin-auth requires a site-id attribute',
  loading: 'Loading login options...',
  loadFailed: 'Failed to load login options. Please try again later.',
  zeroChannels: 'No login channels enabled for this site',
  continueWithPrefix: 'Continue with',
  continueWithSuffix: '',
  emailButton: 'Continue with Email',
  labels: LABELS.en,
  lang: 'en',
  missingAccountCode: 'aardwin-account requires a code attribute (or refresh the page)',
  accountLoading: 'Loading account…',
  accountError: 'Failed to load account info. Please try again later.',
  sessionExpired: 'Session expired. Please refresh the page.',
  identitiesTitle: 'Linked accounts',
  noIdentities: 'No linked accounts yet',
  emailLabel: 'Email',
  linkedAtPrefix: 'Linked ',
  bindPrefix: 'Bind ',
  bindTitle: 'Add a connection',
  unbindLabel: 'Unbind',
  confirmUnbind: 'Unbind {p}?',
  linkSuccess: 'Linked successfully',
  linkFailed: 'Failed to link. Please try again.',
  unbindSuccess: 'Unlinked',
  unbindFailed: 'Failed to unbind. Please try again.',
};

export function resolveSdkTexts(
  attr: string | null | undefined,
  navLang?: string | readonly string[] | null,
): SdkTexts {
  const trimmed = attr?.trim().toLowerCase();
  if (trimmed === 'zh') return ZH;
  if (trimmed === 'en') return EN;

  const arr = Array.isArray(navLang) ? navLang : navLang != null ? [navLang] : [];
  for (const item of arr) {
    if (String(item).toLowerCase().includes('zh')) return ZH;
  }
  return EN;
}
