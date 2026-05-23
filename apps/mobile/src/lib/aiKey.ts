const AI_KEY = "cmail_ai_key";

export function getAiKey(): string | null {
  return localStorage.getItem(AI_KEY);
}

export function setAiKey(key: string) {
  if (key.trim()) {
    localStorage.setItem(AI_KEY, key.trim());
  } else {
    localStorage.removeItem(AI_KEY);
  }
}

export function clearAiKey() {
  localStorage.removeItem(AI_KEY);
}

/** 表示用のマスク (sk-ant-xxxx...xxxx) */
export function maskedAiKey(key: string): string {
  if (key.length <= 12) return "•".repeat(key.length);
  return `${key.slice(0, 8)}…${key.slice(-4)}`;
}
