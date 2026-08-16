"use client";

import { useState } from "react";

export type PracticeRecord = {
  id: string;
  athleteId: string;
  athleteName?: string;
  date: string;
  event: string;
  course: "SCM" | "LCM";
  time: string;
  rt?: string;
  splits?: { distanceM: number; time: string }[];
  note?: string;
};
type TimeParts = { minute: string; second: string; centis: string };

const practiceGroups = {
  Freestyle: ["25m自由形", "50m自由形", "100m自由形", "200m自由形", "400m自由形", "800m自由形", "1500m自由形"],
  Backstroke: ["25m背泳ぎ", "50m背泳ぎ", "100m背泳ぎ", "200m背泳ぎ"],
  Breaststroke: ["25m平泳ぎ", "50m平泳ぎ", "100m平泳ぎ", "200m平泳ぎ"],
  Butterfly: ["25mバタフライ", "50mバタフライ", "100mバタフライ", "200mバタフライ"],
  IndividualMedley: ["100m個人メドレー", "200m個人メドレー", "400m個人メドレー"],
};
const toParts = (time = ""): TimeParts => {
  const [first, afterMinute] = time.split(":");
  const [second = "", centis = ""] = (afterMinute ?? first).split(".");
  return { minute: afterMinute === undefined ? "" : first, second, centis };
};
const fromParts = (parts: TimeParts) => `${parts.minute ? `${parts.minute}:` : ""}${parts.second}.${parts.centis}`;
const splitDistances = (event: string) => {
  const distance = Number(event.match(/^(\d+)m/)?.[1] ?? 0);
  if (!distance) return [];
  return Array.from({ length: Math.ceil(distance / 50) }, (_, index) => Math.min((index + 1) * 50, distance));
};

export function PracticeModal({ athleteId, editing, close, saved }: { athleteId: string; editing?: PracticeRecord; close: () => void; saved: (record: PracticeRecord) => void }) {
  const [value, setValue] = useState({ date: editing?.date ?? new Date().toISOString().slice(0, 10), event: editing?.event ?? "", course: editing?.course ?? "SCM" as PracticeRecord["course"], rt: editing?.rt ?? "", note: editing?.note ?? "" });
  const [timeParts, setTimeParts] = useState(() => toParts(editing?.time));
  const [splitParts, setSplitParts] = useState<Record<number, TimeParts>>(() => Object.fromEntries((editing?.splits ?? []).map((split) => [split.distanceM, toParts(split.time)])));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const distances = splitDistances(value.event);
  const updateTimePart = (part: keyof TimeParts, next: string) => setTimeParts((current) => ({ ...current, [part]: next }));
  const updateSplitPart = (distanceM: number, part: keyof TimeParts, next: string) => setSplitParts((current) => ({ ...current, [distanceM]: { ...(current[distanceM] ?? { minute: "", second: "", centis: "" }), [part]: next } }));
  const save = async () => {
    const time = fromParts(timeParts);
    const splits = distances.map((distanceM) => ({ distanceM, time: fromParts(splitParts[distanceM] ?? { minute: "", second: "", centis: "" }) })).filter((split) => split.time !== ".");
    if (!value.date || !value.event || !timeParts.second || !timeParts.centis) return setError("日付・種目・記録を入力してください");
    if (!/^(?:\d{1,2}:)?\d{1,2}\.\d{2}$/.test(time)) return setError("記録を正しい形式で入力してください");
    if (value.rt && !/^\d+(?:\.\d{1,2})?$/.test(value.rt)) return setError("RTは小数第2位までで入力してください");
    if (splits.some((split) => !/^(?:\d{1,2}:)?\d{1,2}\.\d{2}$/.test(split.time))) return setError("通過タイムを正しい形式で入力してください");
    setSaving(true); setError("");
    try {
      const response = await fetch(editing ? `/api/practice-records/${editing.id}` : "/api/practice-records", { method: editing ? "PUT" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...value, time, athleteId, rt: value.rt || undefined, splits }) });
      if (!response.ok) throw new Error();
      saved(await response.json() as PracticeRecord);
    } catch { setError("保存できませんでした"); } finally { setSaving(false); }
  };
  const timeFields = (parts: TimeParts, update: (part: keyof TimeParts, value: string) => void) => <div className="grid grid-cols-3 gap-2"><input className="input" inputMode="numeric" placeholder="分" value={parts.minute} onChange={(event) => update("minute", event.target.value)}/><input className="input" inputMode="numeric" placeholder="秒" value={parts.second} onChange={(event) => update("second", event.target.value)}/><input className="input" inputMode="numeric" placeholder="1/100" value={parts.centis} onChange={(event) => update("centis", event.target.value)}/></div>;
  return <div className="fixed inset-0 z-30 flex items-end bg-slate-950/40 p-4"><div className="mx-auto max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5"><div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-black">{editing ? "練習記録を編集" : "練習記録を追加"}</h2><button onClick={close} aria-label="閉じる" className="text-xl">×</button></div><div className="space-y-4"><label className="block font-bold">日付<input type="date" value={value.date} onChange={(event) => setValue({ ...value, date: event.target.value })} className="input"/></label><label className="block font-bold">種目<select value={value.event} onChange={(event) => setValue({ ...value, event: event.target.value })} className="input"><option value="">選択してください</option>{Object.entries(practiceGroups).map(([group, events]) => <optgroup key={group} label={group}>{events.map((event) => <option key={event}>{event}</option>)}</optgroup>)}</select></label><label className="block font-bold">コース<select value={value.course} onChange={(event) => setValue({ ...value, course: event.target.value as PracticeRecord["course"] })} className="input"><option value="SCM">短水路（SCM）</option><option value="LCM">長水路（LCM）</option></select></label><div><p className="font-bold">記録</p><div className="mt-1 grid grid-cols-3 gap-2 text-xs text-slate-500"><span>分</span><span>秒</span><span>1/100秒</span></div>{timeFields(timeParts, updateTimePart)}</div><label className="block font-bold">RT（任意）<input value={value.rt} inputMode="decimal" placeholder="例: 0.68" onChange={(event) => setValue({ ...value, rt: event.target.value })} className="input"/></label>{distances.length > 0 && <div className="space-y-3"><p className="font-bold">通過タイム（任意）</p>{distances.map((distanceM) => <div key={distanceM}><p className="mb-1 text-sm font-bold">{distanceM}m</p>{timeFields(splitParts[distanceM] ?? { minute: "", second: "", centis: "" }, (part, next) => updateSplitPart(distanceM, part, next))}</div>)}</div>}<label className="block font-bold">メモ（任意）<input value={value.note} placeholder="例: A1メイン" onChange={(event) => setValue({ ...value, note: event.target.value })} className="input"/></label>{error && <p className="text-sm text-rose-600">{error}</p>}<button onClick={save} disabled={saving} className="w-full rounded-xl bg-pool px-4 py-3 font-bold text-white disabled:opacity-60">{saving ? "保存中..." : editing ? "更新" : "保存"}</button></div></div></div>;
}
