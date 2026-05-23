import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { getAiKey, setAiKey, maskedAiKey } from "../lib/aiKey";

export default function Settings() {
  const navigate = useNavigate();
  const { signOut } = useAuth();

  const [storedKey, setStoredKey] = useState(() => getAiKey() ?? "");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  function startEdit() {
    setDraft("");
    setEditing(true);
  }

  function saveKey() {
    setAiKey(draft);
    setStoredKey(draft);
    setEditing(false);
  }

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
        gap: "0.5rem",
        padding: "0.75rem 1rem",
        borderBottom: "1px solid var(--color-border)",
      }}>
        <button
          onClick={() => navigate(-1)}
          style={{
            background: "none",
            color: "var(--color-primary)",
            fontSize: "1rem",
            padding: "0.25rem 0.5rem",
          }}
        >
          ← 戻る
        </button>
        <h1 style={{ fontSize: "1.1rem", fontWeight: 600, marginLeft: "0.5rem" }}>設定</h1>
      </header>

      <div style={{ flex: 1, overflowY: "auto", padding: "1.5rem 1.25rem" }}>
        {/* AI API キー */}
        <section style={{ marginBottom: "2rem" }}>
          <h2 style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: "0.5rem" }}>
            Anthropic API キー
          </h2>
          <p style={{ fontSize: "0.82rem", color: "var(--color-text-secondary)", marginBottom: "1rem", lineHeight: 1.5 }}>
            AI 返信生成に使います。<a href="https://console.anthropic.com/" target="_blank" rel="noreferrer" style={{ color: "var(--color-primary)" }}>console.anthropic.com</a> で取得した sk-ant-... で始まるキーを入力してください。お使いの端末にのみ保存されます。
          </p>

          {!editing ? (
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "0.75rem",
              padding: "0.75rem 1rem",
              background: "var(--color-surface)",
              borderRadius: "10px",
            }}>
              <div style={{
                flex: 1,
                fontSize: "0.9rem",
                fontFamily: "ui-monospace, Menlo, monospace",
                color: storedKey ? "var(--color-text)" : "var(--color-text-secondary)",
              }}>
                {storedKey ? maskedAiKey(storedKey) : "未設定"}
              </div>
              <button
                onClick={startEdit}
                style={{
                  background: "var(--color-primary)",
                  color: "#fff",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  padding: "0.4rem 0.9rem",
                  borderRadius: "8px",
                }}
              >
                {storedKey ? "変更" : "設定"}
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <input
                type="password"
                placeholder="sk-ant-..."
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                autoFocus
                style={{
                  width: "100%",
                  padding: "0.75rem 1rem",
                  background: "var(--color-surface)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "10px",
                  color: "var(--color-text)",
                  fontSize: "0.9rem",
                  fontFamily: "ui-monospace, Menlo, monospace",
                  outline: "none",
                }}
              />
              <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                <button
                  onClick={() => setEditing(false)}
                  style={{
                    background: "var(--color-surface)",
                    color: "var(--color-text)",
                    fontSize: "0.9rem",
                    padding: "0.5rem 1rem",
                    borderRadius: "8px",
                  }}
                >
                  キャンセル
                </button>
                <button
                  onClick={saveKey}
                  disabled={!draft.trim()}
                  style={{
                    background: draft.trim() ? "var(--color-primary)" : "var(--color-text-secondary)",
                    color: "#fff",
                    fontSize: "0.9rem",
                    fontWeight: 600,
                    padding: "0.5rem 1.25rem",
                    borderRadius: "8px",
                    opacity: draft.trim() ? 1 : 0.5,
                  }}
                >
                  保存
                </button>
              </div>
            </div>
          )}
        </section>

        {/* サインアウト */}
        <section>
          <button
            onClick={() => {
              signOut();
              navigate("/login", { replace: true });
            }}
            style={{
              width: "100%",
              background: "rgba(255, 59, 48, 0.12)",
              color: "#ff3b30",
              fontSize: "0.95rem",
              fontWeight: 600,
              padding: "0.85rem",
              borderRadius: "10px",
            }}
          >
            サインアウト
          </button>
        </section>
      </div>
    </main>
  );
}
