/**
 * <aardwin-auth> 的 React JSX 类型声明（opt-in）。
 *
 * 用法：`import '@aardwin/auth-browser/react.d.ts';`
 *
 * 同时增强两处 JSX 命名空间以兼容 React 18 与 React 19：
 *   - global.JSX.IntrinsicElements：React ≤18 使用全局 JSX 命名空间。
 *   - React.JSX.IntrinsicElements：React 19 把 JSX 命名空间移到 React 命名空间下，
 *     通过 `declare module 'react'` 增强。
 * 非 React 框架（Preact/Solid/Vue JSX）消费者请自行写 3 行 IntrinsicElements 声明（见 SDK.md）。
 */

type AardwinAuthI18n = 'zh' | 'en';

interface AardwinAuthAttributes {
  /** 站点 ID（必填），决定拉取哪个 provider 按钮。 */
  'site-id': string;
  /** 显式指定语言；缺省时组件按 navigator.language 检测。 */
  i18n?: AardwinAuthI18n;
  /** 覆盖默认 api 入口，用于本地开发。 */
  'api-origin'?: string;
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'aardwin-auth': AardwinAuthAttributes;
    }
  }
}

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'aardwin-auth': AardwinAuthAttributes;
    }
  }
}
