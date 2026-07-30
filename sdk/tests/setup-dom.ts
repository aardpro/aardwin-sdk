import { Window } from 'happy-dom';

// happy-dom 20 不再自动注册全局（无 GlobalRegistrator）；手动注入 component.ts 依赖的
// DOM 全局。crypto 保留 bun 全局 webcrypto（含 getRandomValues）。
const win = new Window();

const g = globalThis as Record<string, unknown>;
g.window = win;
g.document = win.document;
g.customElements = win.customElements;
g.HTMLElement = win.HTMLElement;
g.ShadowRoot = win.ShadowRoot;
g.CustomEvent = win.CustomEvent;
g.Event = win.Event;
g.Node = win.Node;
g.Element = win.Element;
g.navigator = win.navigator;
g.location = win.location;
// account-element 依赖：会话 token 存储 + history.replaceState（清 ?pending 回调参数）。
g.sessionStorage = win.sessionStorage;
g.localStorage = win.localStorage;
g.history = win.history;
// confirm()：happy-dom 20 无原生 confirm，给安全默认 deny；测试按需覆盖为 () => true。
g.confirm = () => false;
