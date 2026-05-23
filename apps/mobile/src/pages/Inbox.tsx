import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../contexts/AuthContext";
import { fetchMessages, type Email } from "../lib/api";

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffDays === 0) return date.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
  if (diffDays < 7) return date.toLocaleDateString("ja-JP", { weekday: "short" });
  return date.toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" });
}

function EmailRow({ email }: { email: Email }) {
  return (
    <li style={{
      display: "flex",
      gap: "0.75rem",
      padding: "0.875rem 1.25rem",
      borderBottom: "1px solid var(--color-border)",
      cursor: "pointer",
      background: email.isRead ? "var(--color-bg)" : "var(--color-surface)",
    }}>
      {/* 未読インジケーター */}
      <div style={{
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: email.isRead ? "transparent" : "var(--color-primary)",
        flexShrink: 0,
        marginTop: 6,
      }} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.2rem" }}>
          <span style={{
            fontWeight: email.isRead ? 400 : 700,
            fontSize: "0.95rem",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            maxWidth: "70%",
          }}>
            {email.fromName || email.from}
          </span>
          <span style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)", flexShrink: 0 }}>
            {formatDate(email.date)}
          </span>
        </div>

        <div style={{
          fontWeight: email.isRead ? 400 : 600,
          fontSize: "0.88rem",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          marginBottom: "0.15rem",
        }}>
          {email.subject}
        </div>

        <div style={{
          fontSize: "0.82rem",
          color: "var(--color-text-secondary)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {email.snippet}
        </div>
      </div>
    </li>
  );
}

export default function Inbox() {
  const { token, signOut } = useAuth();
  const [emails, setEmails] = useState<Email[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchMessages(token);
      setEmails(data.messages);
    } catch (err) {
      setError(err instanceof Error ? err.message : "読み込みエラー");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

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
          style={{ background: "none", color: "var(--color-primary)", fontSize: "0.9rem" }}
        >
          サインアウト
        </button>
      </header>

      <div style={{ flex: 1, overflowY: "auto" }}>
        {loading && (
          <div style={{ padding: "2rem", textAlign: "center", color: "var(--color-text-secondary)" }}>
            読み込み中...
          </div>
        )}

        {error && (
          <div style={{ padding: "2rem", textAlign: "center" }}>
            <p style={{ color: "#ff3b30", marginBottom: "1rem" }}>{error}</p>
            <button
              onClick={load}
              style={{
                background: "var(--color-primary)",
                color: "#fff",
                padding: "0.5rem 1.25rem",
                borderRadius: "8px",
                fontSize: "0.9rem",
              }}
            >
              再試行
            </button>
          </div>
        )}

        {!loading && !error && (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {emails.length === 0
              ? <li style={{ padding: "2rem", textAlign: "center", color: "var(--color-text-secondary)" }}>メールなし</li>
              : emails.map((email) => <EmailRow key={email.id} email={email} />)
            }
          </ul>
        )}
      </div>
    </main>
  );
}
