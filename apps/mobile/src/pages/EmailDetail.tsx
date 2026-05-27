import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useSettings } from "../contexts/SettingsContext";
import { fetchMessage, generateAiReply, type Email, type ReplyTone } from "../lib/api";
import { getObsidianFilesForRequest } from "../lib/obsidianFiles";
import { getAiKey } from "../lib/aiKey";

const TONE_KEY_MAP: Record<ReplyTone, string> = {
  business: "toneBusiness",
  casual: "toneCasual",
  polite: "tonePolite",
  brief: "toneBrief",
};

const AI_BODY_SESSION_KEY = "cmail_ai_body";

function formatFullDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleString("ja-JP", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

// HTML メール本文を表示する iframe。サンドボックスでスクリプト無効化。
function HtmlBody({ html }: { html: string }) {
  const ref = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const iframe = ref.current;
    if (!iframe) return;

    // モバイル向けのスタイルを差し込んで srcdoc にセット
    const wrappedHtml = `<!doctype html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<base target="_blank">
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; font-size: 15px; color: #000; padding: 0; margin: 0; word-wrap: break-word; }
  img { max-width: 100% !important; height: auto !important; }
  table { max-width: 100% !important; }
  pre { white-space: pre-wrap; }
  a { color: #007aff; }
  @media (prefers-color-scheme: dark) {
    body { color: #fff; background: #000; }
    a { color: #0a84ff; }
  }
</style>
</head><body>${html}</body></html>`;

    iframe.srcdoc = wrappedHtml;

    // 高さを iframe の中身に合わせて自動調整
    const resize = () => {
      const doc = iframe.contentDocument;
      if (doc?.body) {
        iframe.style.height = `${doc.body.scrollHeight + 24}px`;
      }
    };
    iframe.addEventListener("load", () => {
      resize();
      // 画像読み込み後にも再計算
      setTimeout(resize, 500);
      setTimeout(resize, 1500);
    });
  }, [html]);

  return (
    <iframe
      ref={ref}
      sandbox="allow-same-origin allow-popups"
      style={{
        width: "100%",
        border: "none",
        background: "transparent",
        minHeight: "200px",
      }}
      title="メール本文"
    />
  );
}

export default function EmailDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { token } = useAuth();
  const { t } = useSettings();
  const [email, setEmail] = useState<Email | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // AI 返信モーダル
  const [aiOpen, setAiOpen] = useState(false);
  const [aiTone, setAiTone] = useState<ReplyTone>("business");
  const [aiHint, setAiHint] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  async function handleGenerate() {
    if (!email || !token) return;
    const aiKey = getAiKey();
    if (!aiKey) {
      setAiError(t("registerApiKeyPrompt"));
      return;
    }
    setAiGenerating(true);
    setAiError(null);
    try {
      const reply = await generateAiReply(token, aiKey, {
        emailFrom: email.from,
        emailSubject: email.subject,
        emailBody: email.body || email.snippet || "",
        tone: aiTone,
        hint: aiHint.trim() || undefined,
        selectedObsidianFiles: getObsidianFilesForRequest(),
      });
      // Compose に受け渡し
      sessionStorage.setItem(AI_BODY_SESSION_KEY, reply);
      navigate(`/compose?reply=${encodeURIComponent(email.id)}&fromAi=1`);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : t("loadFailed"));
      setAiGenerating(false);
    }
  }

  const load = useCallback(async () => {
    if (!token || !id) return;
    setLoading(true);
    setError(null);
    try {
      setEmail(await fetchMessage(token, id));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("loadError"));
    } finally {
      setLoading(false);
    }
  }, [token, id]);

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
            display: "flex",
            alignItems: "center",
            gap: "0.2rem",
          }}
          aria-label={t("back")}
        >
          ← {t("inbox")}
        </button>

        {email && (
          <div style={{ display: "flex", gap: "0.4rem" }}>
            <button
              onClick={() => setAiOpen(true)}
              style={{
                background: "var(--color-surface)",
                color: "var(--color-primary)",
                fontSize: "0.85rem",
                fontWeight: 600,
                padding: "0.4rem 0.7rem",
                borderRadius: "8px",
              }}
            >
              🤖 AI
            </button>
            <Link
              to={`/compose?reply=${encodeURIComponent(email.id)}`}
              style={{
                background: "var(--color-primary)",
                color: "#fff",
                fontSize: "0.85rem",
                fontWeight: 600,
                padding: "0.4rem 0.9rem",
                borderRadius: "8px",
                textDecoration: "none",
              }}
            >
              {t("replyBtn")}
            </Link>
          </div>
        )}
      </header>

      {/* AI 返信モーダル */}
      {aiOpen && email && (
        <div
          onClick={() => !aiGenerating && setAiOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            zIndex: 100,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 500,
              background: "var(--color-bg)",
              borderTopLeftRadius: "20px",
              borderTopRightRadius: "20px",
              padding: "1.5rem 1.25rem calc(1.5rem + var(--safe-bottom))",
              display: "flex",
              flexDirection: "column",
              gap: "1rem",
            }}
          >
            <h2 style={{ fontSize: "1.1rem", fontWeight: 700 }}>{t("generateAiReply")}</h2>

            <div>
              <label style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)", display: "block", marginBottom: "0.4rem" }}>
                {t("toneLabel")}
              </label>
              <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                {(Object.keys(TONE_KEY_MAP) as ReplyTone[]).map((tn) => (
                  <button
                    key={tn}
                    onClick={() => setAiTone(tn)}
                    style={{
                      background: aiTone === tn ? "var(--color-primary)" : "var(--color-surface)",
                      color: aiTone === tn ? "#fff" : "var(--color-text)",
                      fontSize: "0.85rem",
                      padding: "0.5rem 0.9rem",
                      borderRadius: "8px",
                      fontWeight: aiTone === tn ? 600 : 400,
                    }}
                  >
                    {t(TONE_KEY_MAP[tn])}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)", display: "block", marginBottom: "0.4rem" }}>
                {t("hintLabelOptional")}
              </label>
              <textarea
                value={aiHint}
                onChange={(e) => setAiHint(e.target.value)}
                placeholder={t("aiReplyHintExample")}
                rows={3}
                style={{
                  width: "100%",
                  padding: "0.6rem 0.8rem",
                  background: "var(--color-surface)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "10px",
                  color: "var(--color-text)",
                  fontSize: "0.9rem",
                  fontFamily: "inherit",
                  resize: "none",
                  outline: "none",
                }}
              />
            </div>

            {aiError && (
              <div style={{ color: "#ff3b30", fontSize: "0.85rem" }}>{aiError}</div>
            )}

            <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
              <button
                onClick={() => setAiOpen(false)}
                disabled={aiGenerating}
                style={{
                  flex: 1,
                  background: "var(--color-surface)",
                  color: "var(--color-text)",
                  fontSize: "0.95rem",
                  padding: "0.85rem",
                  borderRadius: "10px",
                  opacity: aiGenerating ? 0.5 : 1,
                }}
              >
                {t("cancel")}
              </button>
              <button
                onClick={handleGenerate}
                disabled={aiGenerating}
                style={{
                  flex: 1,
                  background: "var(--color-primary)",
                  color: "#fff",
                  fontSize: "0.95rem",
                  fontWeight: 600,
                  padding: "0.85rem",
                  borderRadius: "10px",
                  opacity: aiGenerating ? 0.5 : 1,
                }}
              >
                {aiGenerating ? t("generating") : t("generate")}
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ flex: 1, overflowY: "auto" }}>
        {loading && (
          <div style={{ padding: "2rem", textAlign: "center", color: "var(--color-text-secondary)" }}>
            {t("loading")}
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
              {t("retry")}
            </button>
          </div>
        )}

        {email && !loading && !error && (
          <article style={{ padding: "1rem 1.25rem" }}>
            <h1 style={{ fontSize: "1.4rem", fontWeight: 700, lineHeight: 1.3, marginBottom: "1rem" }}>
              {email.subject}
            </h1>

            <div style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.2rem",
              paddingBottom: "1rem",
              marginBottom: "1rem",
              borderBottom: "1px solid var(--color-border)",
            }}>
              <div style={{ fontSize: "0.95rem", fontWeight: 600 }}>
                {email.fromName || email.from}
              </div>
              <div style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)" }}>
                {email.from}
              </div>
              <div style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginTop: "0.3rem" }}>
                {formatFullDate(email.date)}
              </div>
            </div>

            {email.bodyHtml ? (
              <HtmlBody html={email.bodyHtml} />
            ) : (
              <pre style={{
                fontFamily: "inherit",
                fontSize: "0.95rem",
                whiteSpace: "pre-wrap",
                wordWrap: "break-word",
                lineHeight: 1.5,
                margin: 0,
              }}>
                {email.body || email.snippet}
              </pre>
            )}
          </article>
        )}
      </div>
    </main>
  );
}
