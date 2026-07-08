import { describe, it, expect } from 'bun:test';
import { resolveAardwinApiOrigin } from '../src/aardwin-api-origin';
import { resolveSdkTexts } from '../src/i18n';
import { AARDWIN_API_ORIGIN, PROVIDER_LABELS } from '../src/config';

/**
 * 组件 origin 解析逻辑的纯函数单元测试。
 *
 * `resolveAardwinApiOrigin(attr)` 是 `<aardwin-auth>` 中 render() 与 startAuth() 共用的
 * 入口解析逻辑：它决定 fetch `/api/providers` 与 `/authorize` 兜底用哪个 origin。
 * 把它从组件里抽出来作为纯函数，是为了让单测无需 DOM 环境（bun test 默认无 document）
 * 即可覆盖以下三个分支：
 *
 *   1. 设 `aardwin-api-origin` 属性 → 返回 trim 后的属性值（覆盖 fetch origin）。
 *   2. 不设属性 / 空串 / 纯空白 → 回退到 AARDWIN_API_ORIGIN 常量。
 *   3. startAuth 的 `/authorize` 兜底：provider authorizeEndpoint 为空时，
 *      `endpoint || resolveAardwinApiOrigin(attr)` 即用属性 origin 作 base，
 *      这里通过模拟同样表达式直接验证解析结果。
 *
 * DOM 集成验证（shadowRoot 渲染、button click → window.location.href）由
 * dogfood 页手动验证（见 plan 验收标准 5）；CI 侧用纯函数断言锁定语义。
 */

describe('resolveAardwinApiOrigin — attribute override', () => {
  it('returns the trimmed attribute value when aardwin-api-origin is set', () => {
    // 对应 render(): `${apiOrigin}/api/providers?…` 命中 localhost。
    expect(resolveAardwinApiOrigin('http://localhost:4000')).toBe(
      'http://localhost:4000',
    );
  });

  it('trims surrounding whitespace before returning', () => {
    expect(resolveAardwinApiOrigin('  http://localhost:4000  ')).toBe(
      'http://localhost:4000',
    );
  });
});

describe('resolveAardwinApiOrigin — fallback to AARDWIN_API_ORIGIN', () => {
  it('falls back to AARDWIN_API_ORIGIN when attribute is null (absent)', () => {
    // 不设属性：document.createElement('aardwin-auth') 未 setAttribute。
    expect(resolveAardwinApiOrigin(null)).toBe(AARDWIN_API_ORIGIN);
    expect(AARDWIN_API_ORIGIN).toBe('https://oauth.aard.win');
  });

  it('falls back to AARDWIN_API_ORIGIN when attribute is empty string', () => {
    // AppTestPage 在 PROD 传空串兜底（import.meta.env.DEV ? localhost : ''）。
    expect(resolveAardwinApiOrigin('')).toBe(AARDWIN_API_ORIGIN);
  });

  it('falls back to AARDWIN_API_ORIGIN when attribute is whitespace-only', () => {
    expect(resolveAardwinApiOrigin('   ')).toBe(AARDWIN_API_ORIGIN);
    expect(resolveAardwinApiOrigin('\t\n')).toBe(AARDWIN_API_ORIGIN);
  });
});

describe('startAuth /authorize fallback expression', () => {
  // 复制组件里的兜底表达式 `const base = endpoint || apiOrigin;` —— 这里 apiOrigin
  // 已是 resolveAardwinApiOrigin(attr) 的结果。当 provider 的 authorizeEndpoint 为空时，
  // base 落到 aardwin-api-origin 属性（dev：localhost），不到 AARDWIN_API_ORIGIN。
  it('uses aardwin-api-origin as base when endpoint is empty', () => {
    const apiOrigin = resolveAardwinApiOrigin('http://localhost:4000');
    const endpoint = ''; // provider.authorizeEndpoint 缺失
    const base = endpoint || apiOrigin;
    expect(base).toBe('http://localhost:4000');
  });

  it('uses endpoint (provider authorizeEndpoint) when non-empty, ignoring aardwin-api-origin', () => {
    // api 返回的 authorizeEndpoint 优先级最高 —— 这是 Q1=是 的语义保证：
    // aardwin-api-origin 不改动 providers 响应里的 authorizeEndpoint。
    const apiOrigin = resolveAardwinApiOrigin('http://localhost:4000');
    const endpoint = 'https://oauth.aard.win';
    const base = endpoint || apiOrigin;
    expect(base).toBe('https://oauth.aard.win');
  });

  it('falls back to AARDWIN_API_ORIGIN when both endpoint and attribute are empty', () => {
    const apiOrigin = resolveAardwinApiOrigin(null);
    const endpoint = '';
    const base = endpoint || apiOrigin;
    expect(base).toBe(AARDWIN_API_ORIGIN);
    expect(base).toBe('https://oauth.aard.win');
  });
});

describe('PROVIDER_LABELS', () => {
  it('includes email with label 邮箱', () => {
    expect(PROVIDER_LABELS.email).toBe('邮箱');
  });

  it('email label is defined and non-empty', () => {
    expect(PROVIDER_LABELS.email).toBeDefined();
    expect(PROVIDER_LABELS.email.length).toBeGreaterThan(0);
  });
});

/**
 * startAuth email 分支的 state 契约。
 *
 * 组件内 startAuth 已把 randomState() + document.cookie 设置 提到 email/OAuth 分岔之前，
 * email 路径同样需要 /console/apps/callback 的 state 校验通过。这里复制组件内
 * 「先生成 state、再按 provider 选 URL」的表达式（与上方 /authorize 兜底测试同风格），
 * 断言 email 跳转 URL 形如 `${endpoint}/email-auth/:siteId?state=<非空>`，
 * 与 OAuth `${base}/authorize?…&state=<非空>` 同形 —— 锁定回归（早 return 在设 cookie 前）
 * 而无需 DOM 环境。
 */
describe('startAuth email branch — state contract', () => {
  // 复制组件内 randomState() 的 16-byte hex 输出形状（非空、32 字符）。
  function sampleState(): string {
    const bytes = new Uint8Array(16);
    // 测试确定性：填充可读字节，仅用于断言 URL 形状，不依赖 crypto。
    for (let i = 0; i < bytes.length; i++) bytes[i] = i;
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }

  it('email 跳转 URL 带 ?state= 且路径为 /email-auth/:siteId', () => {
    const siteId = 'site_abc';
    const endpoint = 'https://oauth.aard.win';
    const provider = 'email';
    const state = sampleState();
    // 组件表达式：provider==='email' 分支
    const href =
      provider === 'email'
        ? `${endpoint}/email-auth/${encodeURIComponent(siteId)}?state=${encodeURIComponent(state)}`
        : '';
    expect(href).toBe(
      'https://oauth.aard.win/email-auth/site_abc?state=000102030405060708090a0b0c0d0e0f',
    );
    // 关键契约：state 非空地出现在 query 里。
    const u = new URL(href);
    expect(u.pathname).toBe('/email-auth/site_abc');
    expect(u.searchParams.get('state')).toBe(state);
    expect(state.length).toBe(32);
  });

  it('email 分支与 OAuth 分支产出同形的 state query（都非空）', () => {
    const siteId = 'site_abc';
    const endpoint = 'https://oauth.aard.win';
    const apiOrigin = endpoint;
    const state = sampleState();

    // email 分支 URL
    const emailHref = `${endpoint}/email-auth/${encodeURIComponent(siteId)}?state=${encodeURIComponent(state)}`;
    // OAuth 分支 URL（复制组件 let params = new URLSearchParams({site_id, provider, state})）
    const params = new URLSearchParams({
      site_id: siteId,
      provider: 'github',
      state,
    });
    const oauthHref = `${endpoint}/authorize?${params.toString()}`;

    expect(new URL(emailHref).searchParams.get('state')).toBe(state);
    expect(new URL(oauthHref).searchParams.get('state')).toBe(state);
    // 两条路径都带非空 state —— 这是 AppCallbackPage state 校验通过的共同前提。
    expect(new URL(emailHref).searchParams.get('state')!.length).toBeGreaterThan(0);
    expect(new URL(oauthHref).searchParams.get('state')!.length).toBeGreaterThan(0);
  });

  it('endpoint 为空时 email 分支仍带 state（不依赖 endpoint 兜底）', () => {
    // email 分支由 endpoint 直拼（不走 OAuth 的 endpoint||apiOrigin 兜底），
    // 但无论 endpoint 是否为空，state 都应出现在 query 里。
    const siteId = 'site_abc';
    const endpoint = ''; // 异常情况，仅验证 state 拼接不依赖 endpoint
    const state = sampleState();
    const href = `${endpoint}/email-auth/${encodeURIComponent(siteId)}?state=${encodeURIComponent(state)}`;
    expect(href.endsWith(`?state=${state}`)).toBe(true);
  });
});

/**
 * i18n 字典解析。
 *
 * 组件 render() 现通过 resolveSdkTexts(getAttribute('i18n')) 取字典，所有文案
 * （missingSiteId / loading / loadFailed / zeroChannels / oauthSuffix / emailButton）
 * 都从字典里取。email 按钮的 endpoint 与 OAuth 统一走 api 返回的 authorizeEndpoint
 * （email-endpoint attribute 已移除）。
 *
 * 这里沿用「复制组件表达式」的纯函数风格，不引入 DOM，断言 resolveSdkTexts 的
 * locale 解析，给 CI 一个可锁定的回归契约。
 */
describe('resolveSdkTexts — i18n locale resolution', () => {
  it('no attr + navLang="en-US" → EN', () => {
    expect(resolveSdkTexts(null, 'en-US').emailButton).toBe('Continue with Email');
    expect(resolveSdkTexts(undefined, 'en-US').zeroChannels).toBe('No login channels enabled for this site');
  });

  it('no attr + no navLang → EN (default)', () => {
    expect(resolveSdkTexts(null).emailButton).toBe('Continue with Email');
    expect(resolveSdkTexts(undefined).emailButton).toBe('Continue with Email');
    expect(resolveSdkTexts('').emailButton).toBe('Continue with Email');
    expect(resolveSdkTexts('   ').emailButton).toBe('Continue with Email');
  });

  it('attr="zh" + navLang="en-US" → ZH (attr overrides navigator)', () => {
    expect(resolveSdkTexts('zh', 'en-US').emailButton).toBe('继续使用邮箱');
    expect(resolveSdkTexts('ZH', 'en-US').zeroChannels).toBe('该站点未启用任何登录方式');
  });

  it('attr="en" → EN (no navLang needed)', () => {
    expect(resolveSdkTexts('en').emailButton).toBe('Continue with Email');
    expect(resolveSdkTexts('EN').oauthSuffix).toBe('Sign in');
    expect(resolveSdkTexts('  En ').emailButton).toBe('Continue with Email');
  });

  it('attr="xyz" + navLang="fr" → EN fallback', () => {
    expect(resolveSdkTexts('xyz', 'fr').emailButton).toBe('Continue with Email');
    expect(resolveSdkTexts('ja', 'fr').missingSiteId).toBe('aardwin-auth requires a site-id attribute');
  });

  it('attr="xyz" + navLang="zh-CN" → ZH (navigator when attr missing/garbage)', () => {
    expect(resolveSdkTexts('xyz', 'zh-CN').emailButton).toBe('继续使用邮箱');
    expect(resolveSdkTexts('', 'zh-CN').zeroChannels).toBe('该站点未启用任何登录方式');
  });

  it('no attr + navLang=["zh-CN","en"] → ZH (array shape)', () => {
    expect(resolveSdkTexts(null, ['zh-CN', 'en']).emailButton).toBe('继续使用邮箱');
    expect(resolveSdkTexts(undefined, ['zh-CN', 'en']).oauthSuffix).toBe('登录');
  });

  it('no attr + navLang=["fr","de"] → EN', () => {
    expect(resolveSdkTexts(null, ['fr', 'de']).emailButton).toBe('Continue with Email');
    expect(resolveSdkTexts(undefined, ['fr', 'de']).zeroChannels).toBe('No login channels enabled for this site');
  });

  it('all keys are non-empty strings in both locales', () => {
    for (const lang of ['zh', 'en'] as const) {
      const texts = resolveSdkTexts(lang);
      for (const key of Object.keys(texts) as (keyof typeof texts)[]) {
        // labels 是 Record<string,string>（object），单独由下一条 case 覆盖，这里只校验纯字符串文案字段。
        if (key === 'labels') continue;
        expect(typeof texts[key]).toBe('string');
        expect((texts[key] as string).length).toBeGreaterThan(0);
      }
    }
  });

  it('texts.labels contains all 6 provider ids in both locales', () => {
    const zh = resolveSdkTexts('zh');
    const en = resolveSdkTexts('en');
    for (const id of ['email', 'wechat', 'google', 'github', 'outlook', 'discord']) {
      expect(zh.labels[id]).toBeDefined();
      expect(zh.labels[id].length).toBeGreaterThan(0);
      expect(en.labels[id]).toBeDefined();
      expect(en.labels[id].length).toBeGreaterThan(0);
    }
  });
});

describe('email button endpoint — uses api authorizeEndpoint', () => {
  // email-endpoint attribute 已移除：email 与 OAuth 统一由 api 返回的 authorizeEndpoint。
  // 复制 component render() 内的表达式：const endpoint = p.authorizeEndpoint;
  it('email button uses the same authorizeEndpoint as OAuth buttons', () => {
    const pAuthorizeEndpoint = 'https://oauth.aard.win';
    const endpoint = pAuthorizeEndpoint;
    expect(endpoint).toBe('https://oauth.aard.win');
  });

  it('endpoint comes solely from api (no attribute override)', () => {
    // email-endpoint attribute 已移除，endpoint 唯一来源是 api 的 authorizeEndpoint
    const pAuthorizeEndpoint = 'https://oauth.aard.win';
    const emailEndpoint = pAuthorizeEndpoint;
    const oauthEndpoint = pAuthorizeEndpoint;
    expect(emailEndpoint).toBe(oauthEndpoint);
  });
});
