"use client";

import { useState } from "react";
import { useSettings } from "@/contexts/SettingsContext";

interface Props {
  onClose: () => void;
}

export default function OnboardingModal({ onClose }: Props) {
  const { save, t } = useSettings();
  const [key, setKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  function openConsole() {
    if (typeof window !== "undefined") {
      window.open(
        "https://console.anthropic.com/settings/keys",
        "_blank",
        "noopener,noreferrer"
      );
    }
  }

  async function handleSave() {
    const trimmed = key.trim();
    if (!trimmed) {
      setErr(t("apiKeyRequired"));
      return;
    }
    setSaving(true);
    setErr("");
    const result = await save({ aiApiKey: trimmed });
    setSaving(false);
    if (result.ok) {
      onClose();
    } else {
      setErr(result.error || t("onboardingError"));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-br from-violet-500 to-violet-700 px-6 py-5 text-white">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 bg-white/20 rounded-lg flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold">{t("onboardingTitle")}</h2>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-gray-600 whitespace-pre-line leading-relaxed">
            {t("onboardingBody")}
          </p>

          <button
            type="button"
            onClick={openConsole}
            className="w-full flex items-center justify-center gap-2 text-sm border border-violet-200 text-violet-700 hover:bg-violet-50 rounded-lg px-4 py-2 transition-colors"
          >
            {t("getKey")}
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
              <path d="M14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3z" />
              <path d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7z" />
            </svg>
          </button>

          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder={t("onboardingPlaceholder")}
            autoComplete="off"
            spellCheck={false}
            className="w-full text-sm font-mono border border-gray-200 rounded-lg px-3 py-2.5 outline-none focus:border-violet-400 placeholder-gray-300 text-gray-800"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
            }}
          />

          {err && <p className="text-xs text-red-500">{err}</p>}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            {t("later")}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !key.trim()}
            className="bg-violet-600 text-white text-sm font-medium px-5 py-2 rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors"
          >
            {saving ? t("saving") : t("saveAndStart")}
          </button>
        </div>
      </div>
    </div>
  );
}
