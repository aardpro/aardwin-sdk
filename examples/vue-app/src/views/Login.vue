<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();

// Public site id — the same value is rendered in the browser tag and used by the
// server-side callback. It is safe to expose.
const siteId = import.meta.env.VITE_AARDWIN_SITE_ID ?? '';

// Optional callback path. Empty string / undefined means the SDK will not send
// return_url; the bff will fall back to the callbackUrl registered in the console.
const callbackPath = import.meta.env.VITE_AARDWIN_CALLBACK_PATH ?? '';

// ?lang= query overrides the default 'en' locale passed to the custom element.
const lang = computed(() => {
  const raw = route.query.lang;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === 'zh' ? 'zh' : 'en';
});

const error = ref<string | null>(null);

onMounted(() => {
  // Surface component-level errors in the host UI. The component already renders
  // an inline error banner inside the shadow DOM; this host banner duplicates the
  // message so it is visible outside the component and offers a Retry reload.
  const onError = (e: Event) => {
    const detail = (e as CustomEvent).detail;
    error.value = detail?.message ?? 'Authentication error';
  };
  window.addEventListener('aardwin:error', onError);

  onUnmounted(() => {
    window.removeEventListener('aardwin:error', onError);
  });
});

function retry() {
  window.location.reload();
}
</script>

<template>
  <div class="login-card">
    <h1 class="title">Sign in</h1>
    <p class="subtitle">Continue with one of the providers below</p>

    <div v-if="error" class="error-banner" role="alert">
      <span>{{ error }}</span>
      <button class="retry-btn" @click="retry">Retry</button>
    </div>

    <!--
      The custom element is imported once in src/main.ts. The component fetches the
      provider list for this siteId from the aardwin api and renders the buttons.
      :callback-path is bound only when the env variable is non-empty; an empty value
      would cause the SDK to omit return_url and rely on the registered callbackUrl.
      :i18n is bound to the reactive lang computed so the query string is honored.
    -->
    <aardwin-auth
      :site-id="siteId"
      :i18n="lang"
      :callback-path="callbackPath || undefined"
    />
  </div>
</template>

<style scoped>
.login-card {
  max-width: 400px;
  margin: 10vh auto 0;
  padding: 36px 32px;
  border: 1px solid #e3e6ea;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 1px 2px rgba(16, 24, 40, 0.04), 0 12px 32px rgba(16, 24, 40, 0.06);
}

.title {
  margin: 0 0 6px;
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: #16181d;
}

.subtitle {
  margin: 0 0 24px;
  font-size: 13px;
  color: #5b616e;
}

.error-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
  padding: 10px 12px;
  border: 1px solid #f1d5d3;
  border-radius: 10px;
  background: #fdf3f2;
  color: #b42318;
  font-size: 13px;
}

.retry-btn {
  padding: 5px 12px;
  border: 1px solid #e3e6ea;
  border-radius: 8px;
  background: #fff;
  color: #16181d;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
</style>
