import { useEffect, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useSettings } from "../contexts/SettingsContext";
import { getAiKey, setAiKey, maskedAiKey } from "../lib/aiKey";
import {
  listObsidianFiles,
  testAiKey,
  fetchGithubStatus,
  type ObsidianFile,
  type GithubStatus,
} from "../lib/api";
import {
  getSelectedObsidianFiles,
  setSelectedObsidianFiles,
} from "../lib/obsidianFiles";
import { LANGUAGE_NAMES, type Language } from "../lib/i18n";
import type { Theme } from "../lib/settings";

const LANGUAGE_OPTIONS: Language[] = ["ja", "en", "es", "ko", "zh"];
const THEME_OPTIONS: Theme[] = ["light", "dark", "system"];

/**
 * セクションカード共通スタイル。PC 版の `bg-white rounded-xl border border-gray-200 p-4`
 * を CSS 変数ベースに置き換えたもの。
 */
const cardStyle: CSSProperties = {
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: "12px",
  padding: "1rem",
};

const sectionTitleStyle: CSSProperties = {
  fontSize: "0.95rem",
  fontWeight: 600,
  color: "var(--color-text)",
  marginBottom: "0.35rem",
};

const sectionDescStyle: CSSProperties = {
  fontSize: "0.78rem",
  color: "var(--color-text-secondary)",
  marginBottom: "0.75rem",
  lineHeight: 1.5,
};

const primaryBtnStyle: CSSProperties = {
  background: "var(--color-primary)",
  color: "#fff",
  fontSize: "0.85rem",
  fontWeight: 600,
  padding: "0.5rem 1rem",
  borderRadius: "8px",
  cursor: "pointer",
};

const secondaryBtnStyle: CSSProperties = {
  background: "var(--color-surface)",
  color: "var(--color-text)",
  fontSize: "0.85rem",
  padding: "0.5rem 1rem",
  borderRadius: "8px",
  border: "1px solid var(--color-border)",
  cursor: "pointer",
};

export default function Settings() {
  const navigate = useNavigate();
  const { signOut, token } = useAuth();
  const { language, theme, setLanguage, setTheme, t } = useSettings();

  // ── AI APIキー ───────────────────────────────────────────────────
  const [storedKey, setStoredKey] = useState(() => getAiKey() ?? "");
  const [keyDraft, setKeyDraft] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function saveKey() {
    if (!keyDraft.trim()) return;
    setAiKey(keyDraft.trim());
    setStoredKey(keyDraft.trim());
    setKeyDraft("");
  }

  async function handleTest() {
    if (!token) return;
    const candidate = keyDraft.trim() || storedKey;
    if (!candidate) {
      setTestMsg({ ok: false, text: t("testFailed") + ": " + t("aiApiKeyPlaceholder") });
      return;
    }
    setTesting(true);
    setTestMsg(null);
    const res = await testAiKey(token, candidate);
    setTesting(false);
    setTestMsg({
      ok: res.ok,
      text: res.ok ? t("testOk") : `${t("testFailed")}: ${res.error ?? ""}`,
    });
    setTimeout(() => setTestMsg(null), 6000);
  }

  // ── GitHub 連携状態 ──────────────────────────────────────────────
  const [ghStatus, setGhStatus] = useState<GithubStatus | null>(null);
  const [ghChecking, setGhChecking] = useState(false);

  async function checkGithub() {
    if (!token) return;
    setGhChecking(true);
    try {
      setGhStatus(await fetchGithubStatus(token));
    } catch {
      setGhStatus({ configured: false, owner: null, repo: null, treeOk: false });
    } finally {
      setGhChecking(false);
    }
  }

  useEffect(() => {
    if (token && !ghStatus) void checkGithub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // ── 学習ファイル選択 (既存) ──────────────────────────────────────
  const [obsidianFiles, setObsidianFiles] = useState<ObsidianFile[] | null>(null);
  const [obsidianLoading, setObsidianLoading] = useState(false);
  const [obsidianError, setObsidianError] = useState<string>("");
  const [selectedSet, setSelectedSet] = useState<Set<string> | null>(() => {
    const stored = getSelectedObsidianFiles();
    return stored ? new Set(stored) : null;
  });

  useEffect(() => {
    if (token && !obsidianFiles && !obsidianLoading) void loadObsidianFiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function loadObsidianFiles() {
    if (!token) return;
    setObsidianLoading(true);
    setObsidianError("");
    try {
      const files = await listObsidianFiles(token);
      setObsidianFiles(files);
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

  // ── レンダリング ─────────────────────────────────────────────────
  return (
    <main
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "var(--color-bg)",
        color: "var(--color-text)",
        paddingTop: "var(--safe-top)",
        paddingBottom: "var(--safe-bottom)",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          padding: "0.75rem 1rem",
          borderBottom: "1px solid var(--color-border)",
          background: "var(--color-surface)",
        }}
      >
        <button
          onClick={() => navigate(-1)}
          style={{
            background: "none",
            color: "var(--color-primary)",
            fontSize: "1rem",
            padding: "0.25rem 0.5rem",
          }}
        >
          ← {t("back")}
        </button>
        <h1 style={{ fontSize: "1.1rem", fontWeight: 600, marginLeft: "0.5rem" }}>
          {t("settings")}
        </h1>
      </header>

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "1.5rem 1.25rem",
          display: "flex",
          flexDirection: "column",
          gap: "1.5rem",
        }}
      >
        {/* 1. 言語 */}
        <section>
          <h2 style={sectionTitleStyle}>{t("language")}</h2>
          <div
            style={{
              ...cardStyle,
              display: "flex",
              flexWrap: "wrap",
              columnGap: "1.25rem",
              rowGap: "0.6rem",
            }}
          >
            {LANGUAGE_OPTIONS.map((l) => (
              <label
                key={l}
                style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}
              >
                <input
                  type="radio"
                  name="language"
                  value={l}
                  checked={language === l}
                  onChange={() => setLanguage(l)}
                  style={{ accentColor: "var(--color-primary)" }}
                />
                <span style={{ fontSize: "0.9rem" }}>{LANGUAGE_NAMES[l]}</span>
              </label>
            ))}
          </div>
        </section>

        {/* 2. テーマ */}
        <section>
          <h2 style={sectionTitleStyle}>{t("theme")}</h2>
          <div style={{ ...cardStyle, display: "flex", gap: "1.25rem" }}>
            {THEME_OPTIONS.map((th) => (
              <label
                key={th}
                style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}
              >
                <input
                  type="radio"
                  name="theme"
                  value={th}
                  checked={theme === th}
                  onChange={() => setTheme(th)}
                  style={{ accentColor: "var(--color-primary)" }}
                />
                <span style={{ fontSize: "0.9rem" }}>
                  {th === "light" ? t("themeLight") : th === "dark" ? t("themeDark") : t("themeSystem")}
                </span>
              </label>
            ))}
          </div>
        </section>

        {/* 3. AI APIキー */}
        <section>
          <h2 style={sectionTitleStyle}>{t("aiApiKey")}</h2>
          <p style={sectionDescStyle}>{t("aiApiKeyDescription")}</p>
          <div style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {storedKey && (
              <div
                style={{
                  fontSize: "0.78rem",
                  color: "var(--color-text-secondary)",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                }}
              >
                <span>{t("currentKey")}</span>
                <code
                  style={{
                    background: "var(--color-bg)",
                    border: "1px solid var(--color-border)",
                    padding: "0.15rem 0.45rem",
                    borderRadius: "6px",
                    fontFamily: "ui-monospace, Menlo, monospace",
                    color: "var(--color-text)",
                  }}
                >
                  {maskedAiKey(storedKey)}
                </code>
              </div>
            )}

            <div
              style={{
                display: "flex",
                gap: 0,
                border: "1px solid var(--color-border)",
                borderRadius: "8px",
                overflow: "hidden",
                background: "var(--color-bg)",
              }}
            >
              <input
                type={showKey ? "text" : "password"}
                value={keyDraft}
                onChange={(e) => setKeyDraft(e.target.value)}
                placeholder={t("aiApiKeyPlaceholder")}
                autoComplete="off"
                spellCheck={false}
                style={{
                  flex: 1,
                  fontSize: "0.9rem",
                  padding: "0.6rem 0.75rem",
                  outline: "none",
                  border: "none",
                  background: "transparent",
                  color: "var(--color-text)",
                  fontFamily: "ui-monospace, Menlo, monospace",
                  minWidth: 0,
                }}
              />
              <button
                onClick={() => setShowKey((v) => !v)}
                style={{
                  fontSize: "0.75rem",
                  padding: "0 0.75rem",
                  background: "var(--color-surface)",
                  color: "var(--color-text-secondary)",
                  borderLeft: "1px solid var(--color-border)",
                }}
              >
                {showKey ? t("hide") : t("show")}
              </button>
            </div>

            <p
              style={{
                fontSize: "0.72rem",
                color: "var(--color-text-secondary)",
                marginTop: "-0.25rem",
              }}
            >
              {t("aiApiKeyHelp")}
            </p>

            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
              <button
                onClick={saveKey}
                disabled={!keyDraft.trim()}
                style={{
                  ...primaryBtnStyle,
                  opacity: keyDraft.trim() ? 1 : 0.5,
                }}
              >
                {t("saveBtn")}
              </button>
              <button
                onClick={handleTest}
                disabled={testing || (!keyDraft && !storedKey)}
                style={{
                  ...secondaryBtnStyle,
                  color: "var(--color-primary)",
                  borderColor: "var(--color-primary)",
                  opacity: testing || (!keyDraft && !storedKey) ? 0.5 : 1,
                }}
              >
                {testing ? t("testing") : t("test")}
              </button>
              <a
                href="https://console.anthropic.com/settings/keys"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontSize: "0.78rem",
                  color: "var(--color-primary)",
                  textDecoration: "underline dotted",
                }}
              >
                {t("getKey")} ↗
              </a>
              {testMsg && (
                <span
                  style={{
                    fontSize: "0.75rem",
                    color: testMsg.ok ? "#16a34a" : "#dc2626",
                  }}
                >
                  {testMsg.text}
                </span>
              )}
            </div>
          </div>
        </section>

        {/* 4. GitHub 連携 (Obsidian) */}
        <section>
          <h2 style={sectionTitleStyle}>{t("obsidianIntegration")}</h2>
          <p style={sectionDescStyle}>
            モバイル版は GitHub 経由で Obsidian Vault を読み取ります。owner/repo はサーバー環境変数で設定されています。
          </p>
          <div style={cardStyle}>
            {!ghStatus && <div style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>{t("loading")}</div>}
            {ghStatus && (
              <div style={{ fontSize: "0.85rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                <div>
                  <span style={{ color: "var(--color-text-secondary)" }}>Repository: </span>
                  <code
                    style={{
                      background: "var(--color-bg)",
                      border: "1px solid var(--color-border)",
                      padding: "0.1rem 0.4rem",
                      borderRadius: "6px",
                      fontFamily: "ui-monospace, Menlo, monospace",
                    }}
                  >
                    {ghStatus.configured ? `${ghStatus.owner}/${ghStatus.repo}` : "(未設定)"}
                  </code>
                </div>
                <div>
                  <span style={{ color: "var(--color-text-secondary)" }}>接続: </span>
                  <span style={{ color: ghStatus.treeOk ? "#16a34a" : "#dc2626", fontWeight: 600 }}>
                    {ghStatus.treeOk ? "OK" : ghStatus.configured ? "接続失敗" : "未設定"}
                  </span>
                </div>
                <button
                  onClick={checkGithub}
                  disabled={ghChecking}
                  style={{
                    ...secondaryBtnStyle,
                    color: "var(--color-primary)",
                    borderColor: "var(--color-primary)",
                    alignSelf: "flex-start",
                    marginTop: "0.25rem",
                    opacity: ghChecking ? 0.5 : 1,
                  }}
                >
                  {ghChecking ? t("testing") : t("test")}
                </button>
              </div>
            )}
          </div>
        </section>

        {/* 5. 学習ファイル選択 */}
        <section>
          <h2 style={sectionTitleStyle}>{t("learningFiles")}</h2>
          <p style={sectionDescStyle}>{t("learningFilesDesc")}</p>
          <div style={cardStyle}>
            {obsidianLoading && (
              <div style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>
                {t("loading")}
              </div>
            )}
            {obsidianError && (
              <div style={{ fontSize: "0.82rem", color: "#dc2626" }}>
                エラー: {obsidianError}
              </div>
            )}
            {!obsidianLoading && obsidianFiles && obsidianFiles.length === 0 && (
              <div style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>
                {t("noFilesFound")}
              </div>
            )}
            {obsidianFiles && obsidianFiles.length > 0 && (
              <>
                <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
                  <button onClick={selectAll} style={{ ...secondaryBtnStyle, fontSize: "0.75rem", padding: "0.25rem 0.6rem", color: "var(--color-primary)", borderColor: "var(--color-primary)" }}>
                    {t("selectAllFiles")}
                  </button>
                  <button onClick={deselectAll} style={{ ...secondaryBtnStyle, fontSize: "0.75rem", padding: "0.25rem 0.6rem" }}>
                    {t("deselectAllFiles")}
                  </button>
                  <button
                    onClick={loadObsidianFiles}
                    style={{ ...secondaryBtnStyle, fontSize: "0.75rem", padding: "0.25rem 0.6rem", marginLeft: "auto" }}
                  >
                    {t("loadFileList")}
                  </button>
                </div>
                <ul
                  style={{
                    listStyle: "none",
                    padding: 0,
                    margin: 0,
                    maxHeight: "280px",
                    overflowY: "auto",
                    border: "1px solid var(--color-border)",
                    borderRadius: "8px",
                  }}
                >
                  {obsidianFiles.map((f) => {
                    const checked = (selectedSet ?? new Set()).has(f.path);
                    return (
                      <li key={f.path}>
                        <label
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.6rem",
                            padding: "0.5rem 0.6rem",
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
                          <span
                            style={{
                              fontSize: "0.85rem",
                              fontFamily: "ui-monospace, Menlo, monospace",
                              wordBreak: "break-all",
                            }}
                          >
                            {f.path.replace(/^Cmail\//, "")}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
                <p style={{ fontSize: "0.72rem", color: "var(--color-text-secondary)", marginTop: "0.5rem" }}>
                  選択中: {selectedSet?.size ?? 0} / {obsidianFiles.length}
                </p>
              </>
            )}
          </div>
        </section>

        {/* 6. 学習データの再生成 (モバイルでは未対応) */}
        <section>
          <h2 style={sectionTitleStyle}>{t("preferencesRegenLabel")}</h2>
          <p style={sectionDescStyle}>{t("preferencesRegenDesc")}</p>
          <div style={cardStyle}>
            <p style={{ fontSize: "0.82rem", color: "var(--color-text-secondary)", lineHeight: 1.5 }}>
              モバイルからは未対応です。デスクトップ版の設定画面から「{t("regeneratePreferences")}」ボタンで実行してください。
            </p>
            <button
              disabled
              style={{
                ...primaryBtnStyle,
                marginTop: "0.6rem",
                opacity: 0.4,
                cursor: "not-allowed",
              }}
            >
              {t("regeneratePreferences")}
            </button>
          </div>
        </section>

        {/* 7. サインアウト */}
        <section>
          <h2 style={sectionTitleStyle}>{t("account")}</h2>
          <button
            onClick={() => {
              signOut();
              navigate("/login", { replace: true });
            }}
            style={{
              width: "100%",
              background: "rgba(220, 38, 38, 0.12)",
              color: "#dc2626",
              fontSize: "0.95rem",
              fontWeight: 600,
              padding: "0.85rem",
              borderRadius: "10px",
              border: "1px solid rgba(220, 38, 38, 0.3)",
              cursor: "pointer",
            }}
          >
            {t("logout")}
          </button>
        </section>
      </div>
    </main>
  );
}
