export default function DashboardPage() {
  return (
    <main style={{ maxWidth: 720, margin: '80px auto', padding: 24, fontFamily: 'system-ui' }}>
      <h1>Welcome</h1>
      <p>You are signed in.</p>
      <p>
        <em>Note: a real app would read the session cookie and display user info here.</em>
      </p>
    </main>
  );
}
