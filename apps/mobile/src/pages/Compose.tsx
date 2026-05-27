import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useSettings } from "../contexts/SettingsContext";
import { sendMessage, fetchMessage } from "../lib/api";

export default function Compose() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { token } = useAuth();
  const { t } = useSettings();

  const replyId = params.get("reply");
  const fromAi = params.get("fromAi") === "1";

  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [threadId, setThreadId] = useState<string | undefined>(undefined);
  const [inReplyTo, setInReplyTo] = useState<string | undefined>(undefined);
  const [references, setReferences] = useState<string | undefined>(undefined);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prefilling, setPrefilling] = useState(false);

  // 返信モード: 元メールの情報を取得して各フィールドにプリフィル
  useEffect(() => {
    if (!replyId || !token) return;
    setPrefilling(true);
    fetchMessage(token, replyId)
      .then((m) => {
        setTo(m.from);
        setSubject(m.subject.startsWith("Re: ") ? m.subject : `Re: ${m.subject}`);
        setThreadId(m.threadId);
        setInReplyTo(m.messageIdHeader);
        setReferences(m.references);

        if (fromAi) {
          // AI が生成した本文を sessionStorage から取り出して入れる
          const aiBody = sessionStorage.getItem("cmail_ai_body");
          sessionStorage.removeItem("cmail_ai_body");
          setBody(aiBody ?? "");
        } else {
          // 手動返信: 引用ブロック
          const quoted = (m.body || m.snippet || "")
            .split("\n")
            .map((line) => `> ${line}`)
            .join("\n");
          setBody(`\n\n--- ${m.fromName || m.from} さんからのメール ---\n${quoted}`);
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : t("loadError")))
      .finally(() => setPrefilling(false));
  }, [replyId, token, fromAi]);

  async function handleSend() {
    if (!token) return;
    if (!to || !subject) {
      setError(t("recipientAndSubjectRequired"));
      return;
    }
    setSending(true);
    setError(null);
    try {
      await sendMessage(token, { to, subject, body, threadId, inReplyTo, references });
      navigate("/inbox", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("sendError"));
      setSending(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    border: "none",
    borderBottom: "1px solid var(--color-border)",
    padding: "0.75rem 0",
    background: "transparent",
    color: "var(--color-text)",
    fontSize: "0.95rem",
    fontFamily: "inherit",
    outline: "none",
  };

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
          {t("cancel")}
        </button>
        <h1 style={{ fontSize: "1rem", fontWeight: 600 }}>
          {replyId ? t("replyBtn") : t("newMail")}
        </h1>
        <button
          onClick={handleSend}
          disabled={sending || prefilling}
          style={{
            background: sending || prefilling ? "var(--color-text-secondary)" : "var(--color-primary)",
            color: "#fff",
            fontSize: "0.9rem",
            fontWeight: 600,
            padding: "0.4rem 0.9rem",
            borderRadius: "8px",
            opacity: sending || prefilling ? 0.5 : 1,
          }}
        >
          {sending ? t("sending") : t("sendBtn")}
        </button>
      </header>

      <div style={{ flex: 1, overflowY: "auto", padding: "0 1.25rem" }}>
        {error && (
          <div style={{
            background: "rgba(255, 59, 48, 0.12)",
            color: "#ff3b30",
            padding: "0.75rem 1rem",
            borderRadius: "8px",
            marginTop: "1rem",
            fontSize: "0.88rem",
          }}>
            {error}
          </div>
        )}

        <input
          type="email"
          placeholder={t("recipient")}
          value={to}
          onChange={(e) => setTo(e.target.value)}
          style={inputStyle}
          disabled={prefilling}
        />

        <input
          type="text"
          placeholder={t("subjectLabel")}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          style={inputStyle}
          disabled={prefilling}
        />

        <textarea
          placeholder={t("bodyPlaceholder")}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          disabled={prefilling}
          style={{
            ...inputStyle,
            borderBottom: "none",
            minHeight: "300px",
            resize: "none",
            padding: "1rem 0",
            lineHeight: 1.5,
          }}
        />
      </div>
    </main>
  );
}
