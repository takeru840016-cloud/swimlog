"use client";

import { useEffect, useState } from "react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PracticeModal, type PracticeRecord } from "../../components/practice-modal";
import { sortByDateDesc } from "../../lib/date";

export default function PracticeHistoryPage() {
  const [records, setRecords] = useState<PracticeRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [admin, setAdmin] = useState(false);
  const [event, setEvent] = useState("");
  const [course, setCourse] = useState("");
  const [editing, setEditing] = useState<PracticeRecord | null>(null);
  const [deleting, setDeleting] = useState<PracticeRecord | null>(null);
  const [deleteError, setDeleteError] = useState(false);
  const [deletingNow, setDeletingNow] = useState(false);
  const [sharingId, setSharingId] = useState<string | null>(null);
  const [shareErrorId, setShareErrorId] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    setEvent(params.get("event") ?? "");
    setCourse(params.get("course") ?? "");
    fetch("/api/admin/session")
      .then((response) => response.ok ? response.json() : { authenticated: false })
      .then((session: { authenticated: boolean }) => setAdmin(session.authenticated))
      .catch(() => setAdmin(false));
    const athleteId = localStorage.getItem("swimlog:active-athlete");
    if (!athleteId) return setLoaded(true);
    fetch(`/api/practice-records?athleteId=${athleteId}`)
      .then((response) => response.ok ? response.json() : [])
      .then((items: PracticeRecord[]) => setRecords(sortByDateDesc(items)))
      .finally(() => setLoaded(true));
  }, []);

  const filtered = event ? records.filter((record) => record.event === event && record.course === course) : records;
  const best = filtered.reduce<PracticeRecord | null>((current, record) => !current || seconds(record.time) < seconds(current.time) ? record : current, null);
  const trend = filtered.slice().reverse().map((record) => ({ date: record.date, time: seconds(record.time) }));
  const isPracticeBest = (record: PracticeRecord) => {
    const bestForEvent = records
      .filter((item) => item.event === record.event && item.course === record.course)
      .reduce<PracticeRecord | null>((current, item) => !current || seconds(item.time) < seconds(current.time) ? item : current, null);
    return bestForEvent !== null && seconds(record.time) === seconds(bestForEvent.time);
  };
  const share = async (record: PracticeRecord) => {
    setSharingId(record.id);
    setShareErrorId(null);
    try {
      const image = await createPracticeShareImage(record, isPracticeBest(record));
      const file = new File([image], `practice-${record.event}-${record.date}.png`, { type: "image/png" });
      let canShareFile = Boolean(navigator.share);
      if (navigator.canShare) {
        try { canShareFile = navigator.canShare({ files: [file] }); } catch { canShareFile = false; }
      }
      if (canShareFile) {
        await navigator.share({ title: record.event, files: [file] });
      } else {
        downloadPracticeShareImage(image, file.name);
      }
    } catch (error) {
      if (!(error instanceof Error) || error.name !== "AbortError") setShareErrorId(record.id);
    } finally {
      setSharingId(null);
    }
  };
  const save = (record: PracticeRecord) => {
    setRecords((current) => sortByDateDesc(current.map((item) => item.id === record.id ? { ...record, athleteName: record.athleteName ?? item.athleteName } : item)));
    setEditing(null);
  };
  const remove = async () => {
    if (!deleting) return;
    setDeletingNow(true);
    setDeleteError(false);
    try {
      const response = await fetch(`/api/practice-records/${deleting.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error();
      setRecords((current) => current.filter((record) => record.id !== deleting.id));
      setDeleting(null);
    } catch {
      setDeleteError(true);
    } finally {
      setDeletingNow(false);
    }
  };
  const details = (record: PracticeRecord) => (record.rt || record.splits?.length) ? (
    <div className="mt-3 border-t pt-3 text-sm text-slate-600">
      {record.rt && <p>RT: <b>{record.rt}</b></p>}
      {record.splits?.length ? <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">{record.splits.map((split) => <span key={split.distanceM}>{split.distanceM}m <b>{split.time}</b></span>)}</div> : null}
    </div>
  ) : null;
  const actions = (record: PracticeRecord) => <>{details(record)}{admin && <div className="mt-3 flex justify-end gap-4 border-t pt-3 text-sm font-bold"><button onClick={() => setEditing(record)} className="text-pool">編集</button><button onClick={() => { setDeleteError(false); setDeleting(record); }} className="text-rose-600">削除</button></div>}{shareErrorId === record.id && <p className="mt-2 text-xs font-bold text-rose-600">共有画像を作成できませんでした</p>}</>;
  const shareIcon = (record: PracticeRecord) => (
    <button type="button" aria-label="共有" onClick={() => share(record)} disabled={sharingId === record.id} className="absolute right-4 top-4 rounded-full bg-sky-50 px-2.5 py-1.5 text-sm text-pool shadow-sm disabled:opacity-60">
      {sharingId === record.id ? "…" : "📤"}
    </button>
  );

  return <main className="mx-auto min-h-dvh max-w-md bg-slate-50 px-4 pb-4 pt-[max(2.5rem,calc(env(safe-area-inset-top)+1.25rem))]">
    <button onClick={() => history.back()} className="text-sm font-bold text-pool">← 戻る</button>
    <h1 className="mt-4 text-2xl font-black">{event ? `${event}・${course}` : "練習履歴"}</h1>
    {event && best && <section className="card mt-4"><p className="label">練習ベスト</p><p className="mt-1 text-2xl font-black text-pool">{best.time}</p><div className="mt-4 h-40">{trend.length > 1 ? <ResponsiveContainer width="100%" height="100%"><LineChart data={trend}><XAxis dataKey="date" tickFormatter={(date) => date.slice(2).replaceAll("-", "/")} fontSize={10}/><YAxis dataKey="time" tickFormatter={(value) => format(Number(value))} width={48} fontSize={10}/><Tooltip formatter={(value) => format(Number(value))}/><Line type="monotone" dataKey="time" stroke="#1173b8" strokeWidth={3} dot={{ r: 3 }}/></LineChart></ResponsiveContainer> : <p className="pt-12 text-center text-sm text-slate-400">2件以上の記録で推移を表示します。</p>}</div></section>}
    <section className="mt-4 space-y-2">
      {!loaded ? <p className="text-sm text-slate-400">読み込み中...</p> : filtered.length ? filtered.map((record) => event ? (
        <div key={record.id} className="card relative p-4">
          {shareIcon(record)}
          <div className="flex justify-between pr-12"><div><p className="font-bold">{record.date}</p>{record.note && <p className="mt-1 text-xs text-slate-400">メモ: {record.note}</p>}</div><b className="text-xl text-pool">{record.time}</b></div>
          {actions(record)}
        </div>
      ) : (
        <div key={record.id} className="card relative p-4">
          {shareIcon(record)}
          <a href={`/practice/?event=${encodeURIComponent(record.event)}&course=${record.course}`} className="flex justify-between pr-12"><div><p className="font-bold">{record.event}</p><p className="mt-1 text-xs text-slate-400">{record.date} ・ {record.course}{record.note ? ` ・ ${record.note}` : ""}</p></div><b className="text-xl text-pool">{record.time}</b></a>
          {actions(record)}
        </div>
      )) : <p className="card text-sm text-slate-400">練習記録はまだありません。</p>}
    </section>
    {editing && <PracticeModal athleteId={editing.athleteId} editing={editing} close={() => setEditing(null)} saved={save}/>} 
    {deleting && <div className="fixed inset-0 z-30 flex items-end bg-slate-950/40 p-4"><div className="mx-auto w-full max-w-md rounded-2xl bg-white p-5"><h2 className="text-lg font-black">この練習記録を削除しますか？</h2><p className="mt-3 font-bold">{deleting.event}</p><p className="mt-1 text-sm text-slate-500">{deleting.date} ・ {deleting.course} ・ {deleting.time}</p>{deleting.note && <p className="mt-1 text-sm text-slate-500">メモ: {deleting.note}</p>}{deleteError && <p className="mt-3 text-sm font-bold text-rose-600">削除できませんでした</p>}<div className="mt-5 grid grid-cols-2 gap-3"><button onClick={() => { setDeleting(null); setDeleteError(false); }} disabled={deletingNow} className="rounded-xl border border-slate-200 px-4 py-3 font-bold">キャンセル</button><button onClick={remove} disabled={deletingNow} className="rounded-xl bg-rose-600 px-4 py-3 font-bold text-white disabled:opacity-60">{deletingNow ? "削除中..." : "削除"}</button></div></div></div>}
  </main>;
}

function seconds(value: string) { const [minutes, seconds] = value.split(":"); return seconds === undefined ? Number(minutes) : Number(minutes) * 60 + Number(seconds); }
function format(value: number) { const minutes = Math.floor(value / 60); const seconds = value % 60; return minutes ? `${minutes}:${seconds.toFixed(2).padStart(5, "0")}` : seconds.toFixed(2); }

async function createPracticeShareImage(record: PracticeRecord, isBest: boolean) {
  const canvas = document.createElement("canvas");
  canvas.width = 1350;
  canvas.height = 800;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable");
  context.fillStyle = "#eaf7ff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#1173b8";
  context.fillRect(0, 0, canvas.width, 150);
  practiceRoundedRect(context, 50, 50, 1250, 700, 34, "#ffffff");

  context.fillStyle = "#e5f4ff";
  practiceRoundedRect(context, 88, 82, 158, 42, 21, "#e5f4ff");
  context.fillStyle = "#1173b8";
  context.font = "700 20px sans-serif";
  context.fillText("練習記録", 112, 110);
  context.fillStyle = "#ffffff";
  context.font = "700 32px sans-serif";
  context.fillText(`選手名：${record.athleteName || "-"}`, 280, 110);

  const courseName = record.course === "SCM" ? "短水路" : "長水路";
  context.fillStyle = "#64748b";
  context.font = "600 24px sans-serif";
  context.fillText(record.date.replaceAll("-", "/"), 90, 195);
  context.fillStyle = "#0f172a";
  context.font = "700 42px sans-serif";
  drawPracticeText(context, record.event, 90, 255, 650, 1, 48);
  if (isBest) {
    context.fillStyle = "#b45309";
    context.font = "700 27px sans-serif";
    context.fillText("🏅 練習ベスト更新！", 90, 305);
  }
  context.fillStyle = "#1173b8";
  context.font = "800 92px sans-serif";
  context.fillText(record.time, 90, isBest ? 410 : 370);

  const detailY = isBest ? 455 : 420;
  const detailText = [courseName, record.rt ? `RT ${record.rt}` : ""].filter(Boolean).join(" ｜ ");
  context.fillStyle = "#334155";
  context.font = "700 28px sans-serif";
  context.fillText(detailText, 90, detailY);
  if (record.note) {
    context.fillStyle = "#64748b";
    context.font = "600 24px sans-serif";
    context.fillText("メモ", 90, detailY + 60);
    context.fillStyle = "#334155";
    context.font = "500 24px sans-serif";
    drawPracticeText(context, record.note, 90, detailY + 98, 610, 3, 31);
  }

  if (record.splits?.length) drawPracticeSplits(context, record.splits);
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Image export failed")), "image/png"));
}

function drawPracticeSplits(context: CanvasRenderingContext2D, splits: { distanceM: number; time: string }[]) {
  const many = splits.length > 4;
  const columns = splits.length > 16 ? 3 : many ? 2 : 1;
  const rows = Math.ceil(splits.length / columns);
  const x = columns === 1 ? 810 : 740;
  const width = columns === 1 ? 440 : 520;
  const y = splits.length > 8 ? 185 : 430;
  const height = Math.max(145, 74 + rows * 50);
  practiceRoundedRect(context, x, y, width, height, 24, "#edf8ff");
  context.fillStyle = "#1173b8";
  context.font = "700 26px sans-serif";
  context.fillText("通過タイム", x + 28, y + 42);
  const columnWidth = (width - 48) / columns;
  splits.forEach((split, index) => {
    const column = Math.floor(index / rows);
    const row = index % rows;
    const lineY = y + 82 + row * 47;
    const lineX = x + 28 + column * columnWidth;
    context.fillStyle = "#64748b";
    context.font = "600 22px sans-serif";
    context.fillText(`${split.distanceM}m`, lineX, lineY);
    context.fillStyle = "#0f172a";
    context.font = "700 24px sans-serif";
    context.fillText(split.time, lineX + 80, lineY);
  });
}

function practiceRoundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number, color: string) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
  context.fillStyle = color;
  context.fill();
}

function drawPracticeText(context: CanvasRenderingContext2D, value: string, x: number, y: number, maxWidth: number, maxLines: number, lineHeight: number) {
  const characters = Array.from(value);
  const lines: string[] = [];
  let line = "";
  for (const character of characters) {
    if (context.measureText(line + character).width > maxWidth && line) {
      lines.push(line);
      line = character;
    } else line += character;
  }
  if (line) lines.push(line);
  lines.slice(0, maxLines).forEach((text, index) => {
    const clipped = index === maxLines - 1 && lines.length > maxLines ? `${text.slice(0, -1)}…` : text;
    context.fillText(clipped, x, y + index * lineHeight);
  });
}

function downloadPracticeShareImage(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
