import { createApp } from 'vue';
import App from './App.vue';
import router from './router';

// Import the browser SDK once at the app entry. This is a side-effect import that
// registers <aardwin-auth> and <aardwin-account> as standard custom elements.
// Unlike the Next.js example, which uses a dynamic import inside a client component,
// Vue 3 apps run entirely in the browser after hydration, so a static import at the
// entry is simpler and equivalent. Either pattern works: the custom elements are
// framework-agnostic.
import '@aardwin/auth-browser';

const app = createApp(App);
app.use(router);
app.mount('#app');
