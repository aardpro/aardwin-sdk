<template>
  <!-- Neutral surface + hairline border visual token, same family as the SDK component. -->
  <main class="app-shell">
    <router-view />
  </main>
</template>

<style>
/* Global reset scoped to the example app only.
   html/body margin:0 —— 去掉浏览器默认 8px 白边（否则透明画布在灰色壳外露白条）。
   background 统一 #fafafa —— 画布与 .app-shell 同色，顶部空白区与主区一致。 */
html,
body {
  margin: 0;
  padding: 0;
  background: #fafafa;
}

.app-shell {
  min-height: 100vh;
  margin: 0;
  padding: 0;
  /* flow-root：建立 BFC，阻断登录卡 10vh margin-top 向上塌陷穿透本壳 ——
     否则顶部多出空白区且触发垂直滚动条（min-height:100vh + 塌陷 margin > 视口）。 */
  display: flow-root;
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, 'PingFang SC', 'Microsoft YaHei', sans-serif;
  color: #16181d;
  background: #fafafa;
}
</style>
