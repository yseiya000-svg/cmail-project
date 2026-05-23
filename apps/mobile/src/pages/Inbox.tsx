import { useAuth } from "../contexts/AuthContext";

export default function Inbox() {
  const { signOut } = useAuth();

  return (
    <main style={{
      display: "flex",
      flexDirection: "column",
      height: "100%",
      background: "var(--color-bg)",
      paddingTop: "var(--safe-top)",
      paddingBottom: "var(--safe-bottom)",
    }}>
      <header style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "1rem 1.25rem 0.75rem",
        borderBottom: "1px solid var(--color-border)",
      }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 700 }}>受信トレイ</h1>
        <button
          onClick={signOut}
          style={{
            background: "none",
            color: "var(--color-primary)",
            fontSize: "0.9rem",
            padding: "0.25rem 0.5rem",
          }}
        >
          サインアウト
        </button>
      </header>

      <div style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--color-text-secondary)",
      }}>
        <p>メールを読み込み中... (P6 で実装)</p>
      </div>
    </main>
  );
}
