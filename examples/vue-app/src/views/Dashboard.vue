<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();

interface UserInfo {
  user_id: string;
  provider: string;
  email?: string | null;
  nickname?: string;
  avatar?: string;
}

interface Handoff {
  code: string;
  expiresIn: number;
}

const user = ref<UserInfo | null>(null);
const accountHandoff = ref<Handoff | null>(null);
const accountHandoffError = ref<string | null>(null);

// Public site id for the inline account-management component.
const siteId = import.meta.env.VITE_AARDWIN_SITE_ID ?? '';

onMounted(async () => {
  // 1) Verify the session. If the sid cookie is missing/expired, the server returns 401
  // and we send the user back to /login. The browser is redirected back here after the
  // callback route sets the HttpOnly sid cookie.
  const meRes = await fetch('/api/me');
  if (!meRes.ok) {
    router.push('/login');
    return;
  }
  const meData = await meRes.json();
  user.value = meData.user;

  // 2) Mint a one-time handoff code for <aardwin-account>. This must be done server-side
  // because it needs the clientSecret; the userId is taken from the server session, not
  // from the client, so a tampered browser cannot request a handoff for another user.
  // Failures are non-fatal: the dashboard still shows user info, we simply hide the
  // account widget and display a warning.
  const handoffRes = await fetch('/api/account-handoff', { method: 'POST' });
  if (handoffRes.ok) {
    const data = await handoffRes.json();
    accountHandoff.value = { code: data.code, expiresIn: data.expiresIn };
  } else {
    accountHandoffError.value = 'Account management is temporarily unavailable.';
  }
});

async function signOut() {
  await fetch('/api/logout', { method: 'POST' });
  router.push('/login');
}
</script>

<template>
  <div class="dashboard">
    <h1 class="title">Dashboard</h1>

    <section v-if="user" class="card">
      <h2 class="card-title">User Info</h2>
      <table class="kv-table">
        <tbody>
          <tr>
            <td class="kv-label">user_id</td>
            <td class="kv-value">{{ user.user_id }}</td>
          </tr>
          <tr>
            <td class="kv-label">provider</td>
            <td class="kv-value">{{ user.provider }}</td>
          </tr>
          <tr v-if="user.email">
            <td class="kv-label">email</td>
            <td class="kv-value">{{ user.email }}</td>
          </tr>
          <tr v-if="user.nickname">
            <td class="kv-label">nickname</td>
            <td class="kv-value">{{ user.nickname }}</td>
          </tr>
          <tr v-if="user.avatar">
            <td class="kv-label">avatar</td>
            <td class="kv-value">
              <img :src="user.avatar" alt="avatar" width="32" height="32" class="avatar" />
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <section v-if="accountHandoff" class="card">
      <h2 class="card-title">Account Management</h2>
      <p class="card-hint">Bind or unbind identity providers — managed by aardwin.</p>
      <aardwin-account :site-id="siteId" :code="accountHandoff.code" />
    </section>

    <section v-else-if="accountHandoffError" class="card warning">
      <h2 class="card-title">Account Management</h2>
      <p class="card-hint">{{ accountHandoffError }}</p>
    </section>

    <section>
      <button class="signout-btn" @click="signOut">Sign out</button>
    </section>

    <p class="footer-note">Sessions are stored in an in-memory Map. Restarting the dev server clears all sessions.</p>
  </div>
</template>

<style scoped>
.dashboard {
  max-width: 680px;
  margin: 56px auto 72px;
  padding: 0 24px;
}

.title {
  margin: 0 0 24px;
  font-size: 24px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: #16181d;
}

.card {
  margin-bottom: 20px;
  padding: 20px 22px;
  border: 1px solid #e3e6ea;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 1px 2px rgba(16, 24, 40, 0.03);
}

.card-title {
  margin: 0 0 14px;
  font-size: 14px;
  font-weight: 600;
  color: #16181d;
}

.card-hint {
  margin: 0 0 14px;
  font-size: 13px;
  color: #5b616e;
}

.warning {
  color: #b42318;
  background: #fdf3f2;
  border-color: #f1d5d3;
}

.kv-table {
  border-collapse: collapse;
}

.kv-label {
  padding: 4px 16px 4px 0;
  font-weight: 600;
  font-size: 13px;
  color: #5b616e;
  white-space: nowrap;
}

.kv-value {
  padding: 4px 0;
  font-size: 13px;
  color: #16181d;
  word-break: break-all;
}

.avatar {
  border-radius: 8px;
  border: 1px solid #e3e6ea;
}

.signout-btn {
  padding: 9px 18px;
  border: 1px solid #e3e6ea;
  border-radius: 10px;
  background: #fff;
  color: #16181d;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.footer-note {
  margin-top: 28px;
  color: #8a919e;
  font-size: 12px;
  line-height: 1.6;
}
</style>
