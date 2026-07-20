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
  /** OAuth 按钮后缀（texts.labels[id] + ' ' + oauthSuffix） */
  oauthSuffix: string;
  /** email 按钮文案 */
  emailButton: string;
  /** provider 标签字典，按当前语言给出 */
  labels: Record<string, string>;

  /** <aardwin-account> 缺 code 属性 */
  missingAccountCode: string;
  /** <aardwin-account> 缺 manage-url 属性 */
  missingManageUrl: string;
  /** <aardwin-account> 加载管理页中 */
  loadingAccount: string;
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
  oauthSuffix: '登录',
  emailButton: '继续使用邮箱',
  labels: LABELS.zh,
  missingAccountCode: 'aardwin-account 需要 code 属性',
  missingManageUrl: 'aardwin-account 需要 manage-url 属性',
  loadingAccount: '加载账户管理…',
};

const EN: SdkTexts = {
  missingSiteId: 'aardwin-auth requires a site-id attribute',
  loading: 'Loading login options...',
  loadFailed: 'Failed to load login options. Please try again later.',
  zeroChannels: 'No login channels enabled for this site',
  oauthSuffix: 'Sign in',
  emailButton: 'Continue with Email',
  labels: LABELS.en,
  missingAccountCode: 'aardwin-account requires a code attribute',
  missingManageUrl: 'aardwin-account requires a manage-url attribute',
  loadingAccount: 'Loading account management...',
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
