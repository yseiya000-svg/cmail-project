"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useSettings, type Theme } from "@/contexts/SettingsContext";
import { LANGUAGE_NAMES, type Language } from "@/lib/i18n";

// 表示順: 日本語 → 英語 → スペイン語 → 韓国語 → 中国語
const LANGUAGE_OPTIONS: Language[] = ["ja", "en", "es", "ko", "zh"];

/** Sentinel sent to the server to mean "don't touch the existing aiApiKey". */
const KEEP_SENTINEL = "__keep__";

function PreferencesRegenSection() {
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  async function handleRegenerate() {
    if (!confirm("my-preferences.md を AI で再生成します。よろしいですか？")) return;
    setRunning(true);
    setMsg("");
    setErr("");
    try {
      const res = await fetch("/api/preferences/regenerate", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "再生成エラー");
      setMsg("再生成しました。Obsidian で my-preferences.md を確認してください。");
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={handleRegenerate}
        disabled={running}
        className="flex items-center gap-1.5 bg-violet-600 text-white text-sm px-4 py-1.5 rounded-lg hover:bg-violet-700 disabled:opacity-60 transition-colors"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z" />
        </svg>
        {running ? "再生成中..." : "返信スタイルを再生成"}
      </button>
      {msg && <span className="text-xs text-green-600">{msg}</span>}
      {err && <span className="text-xs text-red-500">{err}</span>}
    </div>
  );
}

export default function SettingsPage() {
  const { status } = useSession();
  const router = useRouter();
  const { settings, loaded, setLocal, save, t } = useSettings();

  // 編集用ドラフト。aiApiKey はマスク値ではなく「ユーザーが新たに入力した値」を保持する。
  // 空 = 「変更しない」。
  const [draft, setDraft] = useState(settings);
  const [aiKeyDraft, setAiKeyDraft] = useState(""); // 新しいキー入力欄
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [baseline, setBaseline] = useState(settings);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") router.push("/");
  }, [status, router]);

  useEffect(() => {
    if (loaded) {
      setDraft(settings);
      setBaseline(settings);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  const isDirty = useMemo(() => {
    return (
      draft.language !== baseline.language ||
      draft.theme !== baseline.theme ||
      draft.obsidianCmailPath !== baseline.obsidianCmailPath ||
      aiKeyDraft.length > 0
    );
  }, [draft, baseline, aiKeyDraft]);

  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  function updateDraft(patch: Partial<typeof draft>) {
    const next = { ...draft, ...patch };
    setDraft(next);
    if (patch.language !== undefined || patch.theme !== undefined) {
      setLocal(patch);
    }
  }

  async function handleSave() {
    setSaving(true);
    setSavedMsg("");
    const payload: any = {
      obsidianCmailPath: draft.obsidianCmailPath,
      language: draft.language,
      theme: draft.theme,
    };
    if (aiKeyDraft.length > 0) {
      payload.aiApiKey = aiKeyDraft.trim();
    } else {
      payload.aiApiKey = KEEP_SENTINEL;
    }
    const result = await save(payload);
    if (result.ok) {
      setBaseline({ ...draft });
      setAiKeyDraft("");
      setSavedMsg(t("saved"));
      setTimeout(() => setSavedMsg(""), 2500);
    } else {
      setSavedMsg(result.error || t("saveFailed"));
    }
    setSaving(false);
  }

  async function handleTest() {
    setTesting(true);
    setTestMsg(null);
    try {
      const body = aiKeyDraft.length > 0 ? { aiApiKey: aiKeyDraft.trim() } : {};
      const res = await fetch("/api/claude/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.ok) {
        setTestMsg({ ok: true, text: t("testOk") });
      } else {
        setTestMsg({ ok: false, text: `${t("testFailed")}: ${data.error || ""}` });
      }
    } catch (e: any) {
      setTestMsg({ ok: false, text: `${t("testFailed")}: ${e?.message || ""}` });
    } finally {
      setTesting(false);
      setTimeout(() => setTestMsg(null), 6000);
    }
  }

  function handleBack() {
    if (isDirty) {
      const ok = window.confirm(t("unsavedWarning"));
      if (!ok) return;
      setLocal({ language: baseline.language, theme: baseline.theme });
    }
    router.push("/mail");
  }

  function openAnthropicConsole() {
    const url = "https://console.anthropic.com/settings/keys";
    if (typeof window !== "undefined") {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }

  if (status === "loading" || !loaded) {
    return (
      <div className="flex items-center justify-center h-screen text-gray-400">
        {t("loading")}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4">
        <button
          onClick={handleBack}
          className="flex items-center gap-1.5 text-gray-500 hover:text-gray-700 transition-colors"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
          </svg>
          <span className="text-sm">{t("back")}</span>
        </button>
        <h1 className="text-lg font-semibold text-gray-800">{t("settings")}</h1>
        {isDirty && (
          <span className="ml-auto text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-full border border-amber-200">
            ●
          </span>
        )}
      </div>

      {/* Content */}
      <div className="max-w-xl mx-auto px-6 py-8 space-y-8">

        {/* 言語 */}
        <section>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">{t("language")}</h2>
          <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap gap-x-6 gap-y-3">
            {LANGUAGE_OPTIONS.map((lang) => (
              <label key={lang} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="language"
                  value={lang}
                  checked={draft.language === lang}
                  onChange={() => updateDraft({ language: lang })}
                  className="accent-violet-600"
                />
                <span className="text-sm text-gray-700">{LANGUAGE_NAMES[lang]}</span>
              </label>
            ))}
          </div>
        </section>

        {/* テーマ */}
        <section>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">{t("theme")}</h2>
          <div className="bg-white rounded-xl border border-gray-200 p-4 flex gap-6">
            {(["light", "dark", "system"] as Theme[]).map((th) => (
              <label key={th} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="theme"
                  value={th}
                  checked={draft.theme === th}
                  onChange={() => updateDraft({ theme: th })}
                  className="accent-violet-600"
                />
                <span className="text-sm text-gray-700">
                  {th === "light" ? t("themeLight") : th === "dark" ? t("themeDark") : t("themeSystem")}
                </span>
              </label>
            ))}
          </div>
        </section>

        {/* AI APIキー */}
        <section>
          <h2 className="text-sm font-semibold text-gray-700 mb-1">{t("aiApiKey")}</h2>
          <p className="text-xs text-gray-400 mb-3">{t("aiApiKeyDescription")}</p>
          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
            {settings.aiApiKeySet && (
              <div className="text-xs text-gray-500 flex items-center gap-2">
                <svg className="w-3 h-3 text-green-500" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                </svg>
                <span>現在のキー: <code className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-700">{settings.aiApiKey || "********"}</code></span>
              </div>
            )}
            <div className="flex items-stretch gap-0 border border-gray-200 rounded-lg overflow-hidden focus-within:border-violet-400 transition-colors bg-white">
              <input
                type={showKey ? "text" : "password"}
                value={aiKeyDraft}
                onChange={(e) => setAiKeyDraft(e.target.value)}
                placeholder={t("aiApiKeyPlaceholder")}
                autoComplete="off"
                spellCheck={false}
                className="flex-1 text-sm px-3 py-2 outline-none placeholder-gray-300 bg-transparent text-gray-800 min-w-0 font-mono"
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                className="text-xs px-3 border-l border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-500"
              >
                {showKey ? t("hide") : t("show")}
              </button>
            </div>
            <p className="text-xs text-gray-400">{t("aiApiKeyHelp")}</p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleTest}
                disabled={testing || (!aiKeyDraft && !settings.aiApiKeySet)}
                className="text-xs px-3 py-1.5 rounded-lg border border-violet-200 text-violet-700 hover:bg-violet-50 disabled:opacity-50 transition-colors"
              >
                {testing ? t("testing") : t("test")}
              </button>
              <button
                type="button"
                onClick={openAnthropicConsole}
                className="text-xs text-violet-600 hover:text-violet-700 flex items-center gap-1 underline decoration-dotted"
              >
                {t("getKey")}
                <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3z" />
                  <path d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7z" />
                </svg>
              </button>
              {testMsg && (
                <span className={`text-xs ${testMsg.ok ? "text-green-600" : "text-red-500"}`}>
                  {testMsg.text}
                </span>
              )}
            </div>
          </div>
        </section>

        {/* Obsidian連携 */}
        <section>
          <h2 className="text-sm font-semibold text-gray-700 mb-1">{t("obsidianIntegration")}</h2>
          <p className="text-xs text-gray-400 mb-3">{t("obsidianDescription")}</p>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <label className="text-xs text-gray-500 font-medium block mb-1.5">
              {t("obsidianFolderPath")}
            </label>
            <p className="text-[11px] text-gray-400 mb-1.5">
              フォルダを選択すると、その直下に <code className="bg-gray-100 px-1 rounded">contacts/</code> /
              <code className="bg-gray-100 px-1 rounded ml-1">labels/</code> /
              <code className="bg-gray-100 px-1 rounded ml-1">my-preferences.md</code> /
              <code className="bg-gray-100 px-1 rounded ml-1">reply-patterns.json</code> が自動作成されます。
            </p>
            <div className="flex items-stretch gap-0 border border-gray-200 rounded-lg overflow-hidden focus-within:border-violet-400 transition-colors bg-white">
              <input
                type="text"
                value={draft.obsidianCmailPath}
                onChange={(e) => updateDraft({ obsidianCmailPath: e.target.value })}
                placeholder={t("obsidianPlaceholder")}
                autoComplete="off"
                spellCheck={false}
                className="flex-1 text-sm px-3 py-2 outline-none placeholder-gray-300 bg-transparent text-gray-800 min-w-0"
              />
              <button
                type="button"
                onClick={async () => {
                  if (typeof window !== "undefined" && window.cmail?.selectFolder) {
                    const picked = await window.cmail.selectFolder(draft.obsidianCmailPath);
                    if (picked) updateDraft({ obsidianCmailPath: picked });
                  } else {
                    alert("フォルダ選択はデスクトップアプリ版で利用できます。");
                  }
                }}
                title="フォルダを参照"
                className="flex items-center justify-center px-3 border-l border-gray-200 bg-gray-50 hover:bg-violet-50 hover:text-violet-600 text-gray-500 transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
                </svg>
              </button>
            </div>
          </div>
        </section>

        {/* 学習データの再生成 */}
        <section>
          <h2 className="text-sm font-semibold text-gray-700 mb-1">学習データの再生成</h2>
          <p className="text-xs text-gray-400 mb-3">
            これまでの送受信履歴（reply-patterns.json）を AI が分析し、
            <code className="bg-gray-100 px-1 rounded">my-preferences.md</code>
            を最新の傾向に合わせて書き直します。AI 料金がかかる操作のため手動実行です。
          </p>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <PreferencesRegenSection />
          </div>
        </section>

        {/* 保存ボタン */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving || !isDirty}
            className="bg-violet-600 text-white text-sm px-5 py-2 rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors"
          >
            {saving ? t("saving") : t("saveSettings")}
          </button>
          {savedMsg && (
            <span className={`text-sm ${savedMsg === t("saved") ? "text-green-600" : "text-red-500"}`}>
              {savedMsg}
            </span>
          )}
        </div>

        <div className="border-t border-gray-200" />

        {/* ログアウト */}
        <section>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">{t("account")}</h2>
          <button
            onClick={() => signOut({ callbackUrl: "/" })}
            className="flex items-center gap-2 text-sm text-red-500 hover:text-red-600 border border-red-200 hover:border-red-300 rounded-lg px-4 py-2 transition-colors bg-white"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z" />
            </svg>
            {t("logout")}
          </button>
        </section>
      </div>
    </div>
  );
}
