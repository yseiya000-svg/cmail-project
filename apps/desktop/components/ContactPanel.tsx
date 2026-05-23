"use client";

import { useEffect, useState } from "react";
import type { ContactNote } from "@/types";
import { useSettings } from "@/contexts/SettingsContext";

interface ContactPanelProps {
  email: string;
  displayName?: string;
  onClose: () => void;
}

/**
 * メール詳細から開く、相手ごとのノートパネル。
 * 過去のやり取りから AI が特徴・プロジェクト・口調をまとめる「AI で更新」ボタン付き。
 */
export default function ContactPanel({ email, displayName, onClose }: ContactPanelProps) {
  const { t, tf } = useSettings();
  const [note, setNote] = useState<ContactNote | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/contacts?email=${encodeURIComponent(email)}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setNote(
          d.contact || {
            email,
            name: displayName,
            exchangeCount: 0,
            body: "## メモ\n",
          }
        );
      })
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [email, displayName]);

  async function handleRefresh() {
    setRefreshing(true);
    setError("");
    try {
      const res = await fetch("/api/contacts/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, displayName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("saveFailed"));
      setNote(data.contact);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRefreshing(false);
    }
  }

  async function handleSave() {
    if (!note) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(note),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("saveFailed"));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/30"
      onClick={onClose}
    >
      <div
        className="bg-white w-[640px] max-h-[80vh] rounded-xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between bg-violet-50">
          <div className="flex items-center gap-2">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#7c3aed">
              <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
            </svg>
            <div>
              <div className="text-sm font-semibold text-gray-800">
                {note?.name || displayName || email}
              </div>
              <div className="text-xs text-gray-500">{email}</div>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="text-sm text-gray-400">{t("loading")}</div>
          ) : note ? (
            <>
              <div className="flex items-center gap-4 mb-3 text-xs text-gray-500">
                <span>{tf("nExchanges", note.exchangeCount ?? 0)}</span>
                {note.firstSeen && <span>{t("firstSeenLabel")} {note.firstSeen}</span>}
                {note.lastSeen && <span>{t("lastSeenLabel")} {note.lastSeen}</span>}
              </div>
              <textarea
                value={note.body}
                onChange={(e) => setNote({ ...note, body: e.target.value })}
                className="w-full h-72 text-sm bg-white border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-violet-400 text-gray-700 font-mono resize-y"
              />
            </>
          ) : null}
          {error && <div className="text-xs text-red-500 mt-2">{error}</div>}
        </div>

        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between bg-gray-50">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 text-xs bg-violet-600 text-white px-3 py-1.5 rounded-lg hover:bg-violet-700 disabled:opacity-60 transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z" />
            </svg>
            {refreshing ? t("analyzing") : t("aiUpdateContact")}
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="text-xs border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-white disabled:opacity-60 text-gray-700"
            >
              {saving ? t("saving") : t("saveManualEdit")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
