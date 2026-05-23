import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { fetchMessage, type Email } from "../lib/api";

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
  const [email, setEmail] = useState<Email | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !id) return;
    setLoading(true);
    setError(null);
    try {
      setEmail(await fetchMessage(token, id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "読み込みエラー");
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
          aria-label="戻る"
        >
          ← 受信トレイ
        </button>

        {email && (
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
            返信
          </Link>
        )}
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
