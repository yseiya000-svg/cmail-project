"use client";

import { useEffect, useRef, useState } from "react";
import type { EmailMessage } from "@/types";
import AIReplyPanel from "./AIReplyPanel";

interface EmailViewProps {
  message: EmailMessage | null;
  onReplyLearned: () => void;
}

/**
 * Wrap arbitrary email HTML with a strict CSP and dark-mode-friendly base styles.
 * The iframe sandbox attribute prevents script execution regardless of CSP,
 * but CSP is the second layer of defense and also blocks remote images
 * (tracking pixels) unless the user opts in.
 */
function buildSrcDoc(html: string, allowImages: boolean): string {
  const csp = allowImages
    ? "default-src 'none'; img-src 'self' data: https:; style-src 'unsafe-inline'; font-src data: https:;"
    : "default-src 'none'; img-src 'none'; style-src 'unsafe-inline'; font-src data:;";
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<base target="_blank">
<style>
  html, body { margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 14px;
    line-height: 1.6;
    color: #374151;
    word-wrap: break-word;
    overflow-wrap: break-word;
  }
  img { max-width: 100%; height: auto; }
  a { color: #7c3aed; }
  pre, code { white-space: pre-wrap; }
  table { max-width: 100% !important; }
</style>
</head>
<body>${html}</body>
</html>`;
}

export default function EmailView({ message, onReplyLearned }: EmailViewProps) {
  const [showReply, setShowReply] = useState(false);
  // Load images by default (matches Gmail/Outlook behavior). Scripts are still
  // blocked by the iframe sandbox, so the worst case is a tracking pixel —
  // a reasonable trade for a usable inbox. Users who want stricter privacy
  // can revoke per-message via a future setting.
  const [allowImages, setAllowImages] = useState(true);
  const [iframeHeight, setIframeHeight] = useState(400);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // Reset image state when the message changes.
  useEffect(() => {
    setAllowImages(true);
    setIframeHeight(400);
  }, [message?.id]);

  function handleIframeLoad() {
    const ifr = iframeRef.current;
    if (!ifr) return;
    try {
      const body = ifr.contentDocument?.body;
      if (body) {
        // +20 to avoid a phantom scrollbar from rounding
        setIframeHeight(Math.max(120, body.scrollHeight + 20));
      }
    } catch {
      // Cross-origin or sandbox restriction — keep default height
    }
  }

  if (!message) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm bg-gray-50">
        メールを選択してください
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Email header */}
      <div className="px-6 py-4 border-b border-gray-100 bg-white">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">{message.subject}</h2>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center text-violet-700 text-sm font-bold leading-none">
              <span className="-mt-px">
                {(message.fromName || message.from)[0]?.toUpperCase()}
              </span>
            </div>
            <div>
              <div className="text-sm font-medium text-gray-800">
                {message.fromName || message.from}
              </div>
              <div className="text-xs text-gray-400">
                To: {message.to || "me"} · {message.date}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowReply((v) => !v)}
              className="flex items-center gap-1.5 text-sm bg-violet-600 text-white px-3 py-1.5 rounded-lg hover:bg-violet-700 transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z" />
              </svg>
              返信
            </button>
          </div>
        </div>
      </div>

      {/* Email body */}
      <div className="flex-1 overflow-y-auto bg-white">
        {message.bodyHtml ? (
          <>
            {!allowImages && /<img[\s>]/i.test(message.bodyHtml) && (
              <div className="mx-6 mt-4 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-between text-xs text-amber-800">
                <span>このメールには画像が含まれています。プライバシー保護のため初期状態では読み込みません。</span>
                <button
                  onClick={() => setAllowImages(true)}
                  className="text-xs font-medium text-amber-900 hover:text-amber-700 underline ml-3 whitespace-nowrap"
                >
                  画像を読み込む
                </button>
              </div>
            )}
            <iframe
              ref={iframeRef}
              title="Email body"
              // `allow-same-origin` only — NO `allow-scripts`, so JS in email never executes.
              // `allow-popups` lets target=_blank links open in the system browser
              // (which Electron routes through shell.openExternal).
              sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
              srcDoc={buildSrcDoc(message.bodyHtml, allowImages)}
              onLoad={handleIframeLoad}
              style={{ height: iframeHeight }}
              className="w-full px-6 pt-4 pb-6 border-0 bg-white"
            />
          </>
        ) : (
          <div className="p-6 text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
            {message.body}
          </div>
        )}
      </div>

      {/* AI Reply panel */}
      {showReply && (
        <AIReplyPanel
          message={message}
          onClose={() => setShowReply(false)}
          onSent={() => {
            setShowReply(false);
            onReplyLearned();
          }}
        />
      )}
    </div>
  );
}
