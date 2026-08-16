"use client";

import { FormEvent, useState } from "react";

const deviceIdStorageKey = "swimlog_device_id";
const deviceId = () => {
  const existing = localStorage.getItem(deviceIdStorageKey);
  if (existing) return existing;
  const created = crypto.randomUUID();
  localStorage.setItem(deviceIdStorageKey, created);
  return created;
};

export function AdminPinDialog({ close, authenticated, entry = false }: { close: () => void; authenticated: (session: { expiresAt?: number }) => void; entry?: boolean }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(entry ? "/api/entry/session" : "/api/admin/session", {
        method: "POST",
        headers: { "content-type": "application/json", "x-swimlog-device-id": deviceId() },
        body: JSON.stringify({ pin }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { retryAfterSeconds?: number } | null;
        if (response.status === 429 && body?.retryAfterSeconds) {
          const minutes = Math.floor(body.retryAfterSeconds / 60);
          const seconds = body.retryAfterSeconds % 60;
          setError(`PIN認証は一時的にロックされています。${minutes}分${seconds}秒後に再試行してください`);
          return;
        }
        setError("PINが正しくありません");
        return;
      }
      const session = await response.json() as { expiresAt?: number };
      setPin("");
      authenticated(session);
      close();
    } catch {
      setError("認証できませんでした");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-slate-950/40 p-4">
      <form onSubmit={submit} className="mx-auto w-full max-w-md rounded-2xl bg-white p-5">
        <h2 className="text-lg font-black">{entry ? "追加モードPINを入力" : "管理PINを入力"}</h2>
        <p className="mt-2 text-sm text-slate-500">{entry ? "練習記録の追加を行います。" : "選手・レースの追加、編集、削除には認証が必要です。"}</p>
        <input
          type="password"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={pin}
          onChange={(event) => setPin(event.target.value)}
          className="input mt-4"
          aria-label="管理PIN"
          autoFocus
        />
        {error && <p className="mt-2 text-sm font-bold text-rose-600">{error}</p>}
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button type="button" onClick={close} disabled={submitting} className="rounded-xl border border-slate-200 px-4 py-3 font-bold">キャンセル</button>
          <button type="submit" disabled={submitting || !pin} className="rounded-xl bg-pool px-4 py-3 font-bold text-white disabled:opacity-60">{submitting ? "認証中..." : "認証"}</button>
        </div>
      </form>
    </div>
  );
}
