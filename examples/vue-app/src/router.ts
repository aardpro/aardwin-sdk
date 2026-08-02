import { createRouter, createWebHistory } from 'vue-router';
import Login from './views/Login.vue';
import Dashboard from './views/Dashboard.vue';

/**
 * Browser-history router with two real routes plus a catch-all redirect.
 * /callback is not handled by Vue routing — the Vite dev-server plugin intercepts it
 * before the SPA fallback. In production this would be configured at the edge or
 * reverse proxy.
 */
const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: Login,
      // Pass ?lang= through as a prop so the login view can set <aardwin-auth i18n>.
      props: (route) => ({ lang: route.query.lang }),
    },
    {
      path: '/dashboard',
      name: 'dashboard',
      component: Dashboard,
    },
    {
      path: '/',
      redirect: '/login',
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/login',
    },
  ],
});

export default router;
