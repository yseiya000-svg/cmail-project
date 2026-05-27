import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { getAiKey, setAiKey, maskedAiKey } from "../lib/aiKey";
import { debugObsidian, listObsidianFiles, type ObsidianFile } from "../lib/api";
import {
  getSelectedObsidianFiles,
  setSelectedObsidianFiles,
} from "../lib/obsidianFiles";

export default function Settings() {
  const navigate = useNavigate();
  const { signOut, token } = useAuth();

  const [storedKey, setStoredKey] = useState(() => getAiKey() ?? "");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [debugResult, setDebugResult] = useState<string>("");
  const [debugLoading, setDebugLoading] = useState(false);

  // Obsidian 学習ファイル選択
  const [obsidianFiles, setObsidianFiles] = useState<ObsidianFile[] | null>(null);
  const [obsidianLoading, setObsidianLoading] = useState(false);
  const [obsidianError, setObsidianError] = useState<string>("");
  // null = 未選択（=全選択扱い）
  const [selectedSet, setSelectedSet] = useState<Set<string> | null>(() => {
    const stored = getSelectedObsidianFiles();
    return stored ? new Set(stored) : null;
  });

  // 初回マウント時にファイル一覧を自動取得（既に取れていれば skip）
  useEffect(() => {
    if (token && !obsidianFiles && !obsidianLoading) {
      void loadObsidianFiles();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function loadObsidianFiles() {
    if (!token) return;
    setObsidianLoading(true);
    setObsidianError("");
    try {
      const files = await listObsidianFiles(token);
      setObsidianFiles(files);
      // 初回 (未保存) はデフォルト全選択にしておく — UX を分かりやすく
      if (selectedSet === null) {
        setSelectedSet(new Set(files.map((f) => f.path)));
      }
    } catch (err) {
      setObsidianError(err instanceof Error ? err.message : String(err));
    } finally {
      setObsidianLoading(false);
    }
  }

  function toggleFile(path: string) {
    const next = new Set(selectedSet ?? []);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    setSelectedSet(next);
    setSelectedObsidianFiles(Array.from(next));
  }

  function selectAll() {
    if (!obsidianFiles) return;
    const all = new Set(obsidianFiles.map((f) => f.path));
    setSelectedSet(all);
    setSelectedObsidianFiles(Array.from(all));
  }

  function deselectAll() {
    setSelectedSet(new Set());
    setSelectedObsidianFiles([]);
  }

  async function runDebug() {
    if (!token) return;
    setDebugLoading(true);
    setDebugResult("取得中...");
    try {
      const result = await debugObsidian(token);
      setDebugResult(JSON.stringify(result, null, 2));
    } catch (err) {
      setDebugResult("エラー: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setDebugLoading(false);
    }
  }

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

        {/* Obsidian 学習ファイル選択 */}
        <section style={{ marginBottom: "2rem" }}>
          <h2 style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: "0.5rem" }}>
            Obsidian 学習ファイル
          </h2>
          <p style={{ fontSize: "0.82rem", color: "var(--color-text-secondary)", marginBottom: "0.75rem", lineHeight: 1.5 }}>
            Cmail/ フォルダの .md ファイルから、AI 返信の参考にするものを選びます。チェックを外したファイルは学習に使われません。
          </p>

          <div style={{
            background: "var(--color-surface)",
            borderRadius: "10px",
            border: "1px solid var(--color-border)",
            padding: "0.75rem",
          }}>
            {obsidianLoading && (
              <div style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)", padding: "0.5rem" }}>
                ファイル一覧を取得中…
              </div>
            )}

            {obsidianError && (
              <div style={{ fontSize: "0.82rem", color: "#dc2626", padding: "0.5rem", marginBottom: "0.5rem" }}>
                エラー: {obsidianError}
              </div>
            )}

            {!obsidianLoading && obsidianFiles && obsidianFiles.length === 0 && (
              <div style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)", padding: "0.5rem" }}>
                Cmail/ フォルダに .md ファイルが見つかりませんでした。Obsidian で Cmail/my-preferences.md などを作成して GitHub に push してください。
              </div>
            )}

            {obsidianFiles && obsidianFiles.length > 0 && (
              <>
                <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
                  <button
                    onClick={selectAll}
                    style={{
                      fontSize: "0.75rem",
                      color: "var(--color-primary)",
                      background: "transparent",
                      padding: "0.25rem 0.5rem",
                      borderRadius: "6px",
                    }}
                  >
                    全選択
                  </button>
                  <button
                    onClick={deselectAll}
                    style={{
                      fontSize: "0.75rem",
                      color: "var(--color-text-secondary)",
                      background: "transparent",
                      padding: "0.25rem 0.5rem",
                      borderRadius: "6px",
                    }}
                  >
                    全解除
                  </button>
                  <button
                    onClick={loadObsidianFiles}
                    style={{
                      fontSize: "0.75rem",
                      color: "var(--color-text-secondary)",
                      background: "transparent",
                      padding: "0.25rem 0.5rem",
                      borderRadius: "6px",
                      marginLeft: "auto",
                    }}
                  >
                    再読込
                  </button>
                </div>

                <ul style={{ listStyle: "none", padding: 0, margin: 0, maxHeight: "280px", overflowY: "auto" }}>
                  {obsidianFiles.map((f) => {
                    const checked = (selectedSet ?? new Set()).has(f.path);
                    return (
                      <li key={f.path}>
                        <label
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.6rem",
                            padding: "0.5rem 0.25rem",
                            cursor: "pointer",
                            borderBottom: "1px solid var(--color-border)",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleFile(f.path)}
                            style={{ accentColor: "var(--color-primary)", width: "1.05rem", height: "1.05rem" }}
                          />
                          <span style={{ fontSize: "0.85rem", color: "var(--color-text)", wordBreak: "break-all" }}>
                            {f.path.replace(/^Cmail\//, "")}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>

                <p style={{ fontSize: "0.72rem", color: "var(--color-text-secondary)", marginTop: "0.5rem" }}>
                  選択中: {selectedSet?.size ?? 0} / {obsidianFiles.length}（変更は自動保存）
                </p>
              </>
            )}
          </div>

          {/* 折りたたみデバッグ */}
          <details style={{ marginTop: "0.75rem" }}>
            <summary style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)", cursor: "pointer", padding: "0.25rem 0" }}>
              詳細デバッグ情報
            </summary>
            <div style={{ marginTop: "0.5rem" }}>
              <button
                onClick={runDebug}
                disabled={debugLoading}
                style={{
                  background: "var(--color-surface)",
                  color: "var(--color-primary)",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  padding: "0.5rem 0.9rem",
                  borderRadius: "8px",
                  border: "1px solid var(--color-border)",
                  opacity: debugLoading ? 0.5 : 1,
                }}
              >
                {debugLoading ? "確認中..." : "GitHub 連携をテスト"}
              </button>
              {debugResult && (
                <pre style={{
                  marginTop: "0.5rem",
                  padding: "0.75rem",
                  background: "var(--color-surface)",
                  borderRadius: "8px",
                  fontSize: "0.7rem",
                  fontFamily: "ui-monospace, Menlo, monospace",
                  color: "var(--color-text)",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                  maxHeight: "300px",
                  overflowY: "auto",
                  border: "1px solid var(--color-border)",
                }}>
                  {debugResult}
                </pre>
              )}
            </div>
          </details>
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
