<template>
  <!-- Neutral surface + hairline border visual token, same family as the SDK component. -->
  <main class="app-shell">
    <router-view />
  </main>
</template>

<style>
/* Global reset scoped to the example app only. */
.app-shell {
  min-height: 100vh;
  margin: 0;
  padding: 0;
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, 'PingFang SC', 'Microsoft YaHei', sans-serif;
  color: #16181d;
  background: #fafafa;
}
</style>
