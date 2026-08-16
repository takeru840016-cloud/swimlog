"use client";
import { useEffect, useState } from "react";
import { AdminPinDialog } from "../../components/admin-pin-dialog";
import { dateValue, sortByDateDesc } from "../../lib/date";

type Detail = {
  id: string;
  athleteName?: string;
  meetName: string;
  date: string;
  event: string;
  course: string;
  time: string;
  rt?: string;
  rank?: number;
  qualification?: { label: string; nextLabel?: string; nextGapCentis?: number; isHighest: boolean };
  splits: { distanceM: number; time: string }[];
};
type AthleteRace = { id: string; date: string; meetName: string; event: string; course: string; time: string };

export default function RaceDetail() {
  const [race, setRace] = useState<Detail | null>(null);
  const [error, setError] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(false);
  const [personalBest, setPersonalBest] = useState<AthleteRace | null>(null);
  const [previousRace, setPreviousRace] = useState<AthleteRace | null>(null);
  const [previousRaceSplits, setPreviousRaceSplits] = useState<{ distanceM: number; time: string }[] | null>(null);
  const [admin, setAdmin] = useState(false);
  const [adminDialog, setAdminDialog] = useState<"edit" | "delete" | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const [shareError, setShareError] = useState(false);
  useEffect(() => {
    fetch("/api/admin/session")
      .then((response) => (response.ok ? response.json() : { authenticated: false }))
      .then((session: { authenticated: boolean }) => setAdmin(session.authenticated))
      .catch(() => setAdmin(false));
  }, []);
  useEffect(() => {
    const id = new URLSearchParams(location.search).get("id");
    if (!id) return setError(true);
    fetch(`/api/races/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setRace)
      .catch(() => setError(true));
  }, []);
  useEffect(() => {
    if (!race) return;
    const athleteId = localStorage.getItem("swimlog:active-athlete");
    if (!athleteId) return;
    setPersonalBest(null);
    setPreviousRace(null);
    setPreviousRaceSplits(null);
    fetch(`/api/races?athleteId=${athleteId}`)
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((races: AthleteRace[]) => {
        const best = races
          .filter((candidate) => candidate.event === race.event && candidate.course === race.course)
          .reduce<AthleteRace | null>((currentBest, candidate) => !currentBest || seconds(candidate.time) < seconds(currentBest.time) || (seconds(candidate.time) === seconds(currentBest.time) && candidate.id === race.id) ? candidate : currentBest, null);
        setPersonalBest(best);
        const previous = sortByDateDesc(
          races.filter(
            (candidate) =>
              candidate.event === race.event &&
              candidate.course === race.course &&
              dateValue(candidate.date) < dateValue(race.date),
          ),
        )[0] ?? null;
        setPreviousRace(previous);
        if (!previous) return;
        fetch(`/api/races/${previous.id}`)
          .then((response) => (response.ok ? response.json() : Promise.reject()))
          .then((previousDetail: Detail) => setPreviousRaceSplits(previousDetail.splits))
          .catch(() => setPreviousRaceSplits(null));
      })
      .catch(() => { setPersonalBest(null); setPreviousRace(null); setPreviousRaceSplits(null); });
  }, [race]);
  if (error) return <main className="mx-auto max-w-md p-5">レース詳細を取得できませんでした。</main>;
  if (!race) return <main className="mx-auto max-w-md p-5">読み込み中...</main>;
  const laps = race.splits.map((s, i) => ({
    label: `${i ? race.splits[i - 1].distanceM + 1 : 1}-${s.distanceM}m`,
    time: format(seconds(s.time) - (i ? seconds(race.splits[i - 1].time) : 0)),
  }));
  const split100 = race.splits.find((split) => split.distanceM === 100);
  const split200 = race.splits.find((split) => split.distanceM === 200);
  const halfAnalysis = race.event.startsWith("200m") && split100 && split200
    ? (() => {
        const firstHalf = seconds(split100.time);
        const secondHalf = seconds(split200.time) - firstHalf;
        return { firstHalf, secondHalf, difference: secondHalf - firstHalf };
      })()
    : null;
  const isPersonalBest = personalBest !== null && seconds(race.time) === seconds(personalBest.time);
  const personalBestDifference = personalBest === null ? null : seconds(race.time) - seconds(personalBest.time);
  const qualification = race.qualification;
  const previousTimeDifference = previousRace === null ? null : seconds(race.time) - seconds(previousRace.time);
  const previousSplitComparison = previousRaceSplits && race.splits.length
    ? race.splits.map((split) => {
        const previousSplit = previousRaceSplits.find((candidate) => candidate.distanceM === split.distanceM);
        return previousSplit ? { distanceM: split.distanceM, previous: previousSplit.time, current: split.time, difference: seconds(split.time) - seconds(previousSplit.time) } : null;
      }).filter((comparison): comparison is { distanceM: number; previous: string; current: string; difference: number } => !!comparison)
    : [];
  const remove = async () => {
    setIsDeleting(true);
    setDeleteError(false);
    try {
      const response = await fetch(`/api/races/${race.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("delete failed");
      location.href = "/";
    } catch {
      setDeleteError(true);
      setIsDeleting(false);
    }
  };
  const goBack = () => {
    if (history.length > 1) history.back();
    else location.href = "/";
  };
  const share = async () => {
    setIsSharing(true);
    setShareError(false);
    try {
      const image = await createRaceShareImage(race, qualification, isPersonalBest);
      const file = new File([image], `race-result-${race.date}.png`, { type: "image/png" });
      let canShareFiles = Boolean(navigator.share);
      if (navigator.canShare) {
        try { canShareFiles = navigator.canShare({ files: [file] }); } catch { canShareFiles = false; }
      }
      if (canShareFiles) {
        await navigator.share({ title: race.event, files: [file] });
      } else {
        downloadRaceShareImage(image, file.name);
      }
    } catch (cause) {
      if (!(cause instanceof Error) || cause.name !== "AbortError") setShareError(true);
    } finally {
      setIsSharing(false);
    }
  };
  return <main className="mx-auto min-h-dvh max-w-md bg-slate-50 px-4 pb-4 pt-[max(2.5rem,calc(env(safe-area-inset-top)+1.25rem))]">
    <div className="flex items-center justify-between">
      <button onClick={goBack} className="text-sm font-bold text-pool">← 戻る</button>
      <div><button onClick={() => admin ? (location.href = `/?edit=${race.id}`) : setAdminDialog("edit")} className="rounded-lg bg-pool px-3 py-2 text-sm font-bold text-white">編集</button></div>
    </div>
    {shareError && <p className="mt-3 text-right text-sm font-bold text-rose-600">画像を作成できませんでした</p>}
    <div className="card relative mt-4"><button aria-label={"\u5171\u6709"} onClick={share} disabled={isSharing} className="absolute right-4 top-4 rounded-full border border-sky-200 bg-white p-2 text-lg shadow-sm disabled:opacity-60">{isSharing ? "\u2026" : "\u{1F4E4}"}</button><p className="text-xs text-slate-400">{race.date} · {race.meetName}</p><h1 className="mt-2 text-2xl font-black">{race.event}（{race.course}）</h1><p className="mt-4 text-4xl font-black text-pool">{race.time}</p><div className="mt-3 flex justify-between border-t pt-3"><span>資格級</span><b className="text-pool">{qualification?.label ?? "資格級なし"}</b></div>{qualification && <p className="mt-1 text-right text-xs text-slate-500">{qualification.isHighest ? "最高級です" : qualification.nextLabel && qualification.nextGapCentis !== undefined ? `${qualification.nextLabel}まであと${(qualification.nextGapCentis / 100).toFixed(2)}秒` : ""}</p>}{race.rt && <p className="mt-3">RT <b>{race.rt}</b></p>}{race.rank && <p className="mt-1">順位 <b>{race.rank}位</b></p>}{personalBest && <div className="mt-4 border-t pt-3">{isPersonalBest ? <a href={`/race/?id=${personalBest.id}`} className="block"><p className="font-black text-pool">自己ベスト！</p><p className="mt-2 text-sm">達成日 <b>{race.date}</b></p><p className="mt-1 flex gap-2 text-sm"><span>大会</span><b className="truncate">{race.meetName}</b></p></a> : <a href={`/race/?id=${personalBest.id}`} className="block"><div className="flex justify-between"><span>自己ベスト</span><b>{personalBest.time}</b></div><div className="mt-1 flex justify-between"><span>差</span><b className={personalBestDifference! > 0 ? "text-rose-600" : "text-emerald-600"}>{personalBestDifference! > 0 ? "+" : "-"}{Math.abs(personalBestDifference!).toFixed(2)}秒</b></div><p className="mt-2 text-sm">達成日 <b>{personalBest.date}</b></p><p className="mt-1 flex gap-2 text-sm"><span>大会</span><b className="truncate">{personalBest.meetName}</b></p></a>}</div>}</div>
    <div className="card mt-4"><h2 className="font-black">通過タイム</h2>{race.splits.length ? race.splits.map((s) => <div key={s.distanceM} className="flex justify-between border-b py-3 last:border-0"><span>{s.distanceM}m</span><b>{s.time}</b></div>) : <p className="mt-3 text-sm text-slate-400">スプリットデータなし</p>}</div>
    {laps.length > 1 && <div className="card mt-4"><h2 className="font-black">区間ラップ</h2>{laps.map((lap) => <div key={lap.label} className="flex justify-between border-b py-3 last:border-0"><span>{lap.label}</span><b>{lap.time}</b></div>)}</div>}
    {halfAnalysis && <div className="card mt-4"><h2 className="font-black">前半後半分析</h2><div className="mt-3 space-y-2"><div className="flex justify-between"><span>前半100m</span><b>{format(halfAnalysis.firstHalf)}</b></div><div className="flex justify-between"><span>後半100m</span><b>{format(halfAnalysis.secondHalf)}</b></div><div className="flex justify-between border-t pt-2"><span>差</span><b className={halfAnalysis.difference > 0 ? "text-rose-600" : "text-emerald-600"}>{halfAnalysis.difference >= 0 ? "+" : "-"}{format(Math.abs(halfAnalysis.difference))}秒</b></div></div></div>}
    <div className="card mt-4"><h2 className="font-black">前回比較</h2>{previousRace && previousTimeDifference !== null ? <><div className="mt-3 grid grid-cols-3 gap-2 text-sm"><div><p className="text-xs text-slate-400">前回</p><b>{previousRace.time}</b></div><div><p className="text-xs text-slate-400">今回</p><b>{race.time}</b></div><div><p className="text-xs text-slate-400">差</p><b className={previousTimeDifference < 0 ? "text-emerald-600" : previousTimeDifference > 0 ? "text-rose-600" : "text-slate-500"}>{previousTimeDifference > 0 ? "+" : previousTimeDifference < 0 ? "-" : "±"}{Math.abs(previousTimeDifference).toFixed(2)}秒</b></div></div>{previousSplitComparison.length ? <div className="mt-4"><h3 className="text-sm font-black">通過タイム比較</h3><div className="mt-2"><div className="grid grid-cols-4 gap-2 border-b pb-2 text-xs text-slate-400"><span>距離</span><span>前回</span><span>今回</span><span>変化</span></div>{previousSplitComparison.map((split) => <div key={split.distanceM} className="grid grid-cols-4 gap-2 border-b py-2 text-sm last:border-b-0"><span>{split.distanceM}m</span><b>{split.previous}</b><b>{split.current}</b><b className={split.difference < 0 ? "text-emerald-600" : split.difference > 0 ? "text-rose-600" : "text-slate-500"}>{split.difference < 0 ? "↑" : split.difference > 0 ? "↓" : "→"}{Math.abs(split.difference).toFixed(2)}秒</b></div>)}</div></div> : null}</> : <p className="mt-3 text-sm text-slate-400">比較データなし</p>}</div>
    <button onClick={() => admin ? setConfirmingDelete(true) : setAdminDialog("delete")} className="mt-6 w-full rounded-xl bg-rose-600 px-4 py-3 font-bold text-white">レースを削除</button>
    {confirmingDelete && <div className="fixed inset-0 z-20 flex items-end bg-slate-950/40 p-4"><div className="mx-auto w-full max-w-md rounded-2xl bg-white p-5"><h2 className="text-lg font-black">このレースを削除しますか？</h2><div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm"><p>{race.meetName}</p><p className="mt-1">{race.event}</p><p className="mt-1 font-black text-pool">{race.time}</p></div>{deleteError && <p className="mt-3 text-sm font-bold text-rose-600">削除できませんでした</p>}<div className="mt-5 grid grid-cols-2 gap-3"><button onClick={() => { setConfirmingDelete(false); setDeleteError(false); }} disabled={isDeleting} className="rounded-xl border border-slate-200 px-4 py-3 font-bold">キャンセル</button><button onClick={remove} disabled={isDeleting} className="rounded-xl bg-rose-600 px-4 py-3 font-bold text-white disabled:opacity-70">{isDeleting ? "削除中..." : "削除"}</button></div></div></div>}
    {adminDialog && <AdminPinDialog close={() => setAdminDialog(null)} authenticated={() => { setAdmin(true); if (adminDialog === "edit") location.href = `/?edit=${race.id}`; else { setConfirmingDelete(true); setAdminDialog(null); } }} />}
  </main>;
}

function seconds(v: string) {
  const [m, s] = v.split(":");
  return s === undefined ? Number(m) : Number(m) * 60 + Number(s);
}
function format(v: number) {
  const m = Math.floor(v / 60), s = (v % 60).toFixed(2).padStart(5, "0");
  return m ? `${m}:${s}` : s.replace(/^0/, "");
}

async function createRaceShareImage(race: Detail, qualification: Detail["qualification"], isPersonalBest: boolean): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = 1350;
  canvas.height = 800;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas unavailable");
  const background = context.createLinearGradient(0, 0, 1350, 800);
  background.addColorStop(0, "#dff5ff");
  background.addColorStop(1, "#f8fbff");
  context.fillStyle = background;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#087bbd";
  context.fillRect(0, 0, canvas.width, 140);
  context.fillStyle = "rgba(255,255,255,0.14)";
  for (let index = 0; index < 7; index += 1) {
    context.beginPath();
    context.arc(950 + index * 100, 54 + index * 18, 64, 0, Math.PI * 2);
    context.fill();
  }
  drawRoundedRect(context, 48, 100, 1254, 650, 40, "#ffffff");
  drawRoundedRect(context, 80, 42, 190, 48, 24, "#bae6fd");
  context.fillStyle = "#075985";
  context.font = "800 26px system-ui, sans-serif";
  context.fillText("\u7af6\u6cf3\u8a18\u9332", 108, 74);
  const athleteName = race.athleteName ? `\u9078\u624b\u540d\uFF1A${race.athleteName}` : "";
  if (athleteName) {
    context.fillStyle = "#0f172a";
    context.font = "800 50px system-ui, sans-serif";
    drawShareText(context, athleteName, 88, 172, 680, 52, 1);
  }
  context.fillStyle = "#0f172a";
  context.font = "800 44px system-ui, sans-serif";
  drawShareText(context, race.meetName, 88, athleteName ? 232 : 180, 690, 46, 1);
  context.fillStyle = "#64748b";
  context.font = "700 30px system-ui, sans-serif";
  context.fillText(race.date.split("-").map((part) => part.padStart(2, "0")).join("/"), 90, athleteName ? 276 : 224);
  context.fillStyle = "#0f172a";
  context.font = "900 66px system-ui, sans-serif";
  drawShareText(context, race.event, 88, athleteName ? 364 : 312, 690, 72, 1);
  const recordLabelY = athleteName ? 412 : 360;
  if (isPersonalBest) {
    drawRoundedRect(context, 88, recordLabelY, 430, 60, 30, "#fef3c7");
    context.fillStyle = "#a16207";
    context.font = "900 34px system-ui, sans-serif";
    context.textAlign = "center";
    context.fillText("\u{1F3C5} \u81ea\u5df1\u30d9\u30b9\u30c8\u66f4\u65b0\uFF01", 303, recordLabelY + 40);
    context.textAlign = "left";
  }
  context.fillStyle = "#64748b";
  context.font = "700 28px system-ui, sans-serif";
  context.fillText("\u8a18\u9332", 90, recordLabelY + (isPersonalBest ? 94 : 38));
  context.fillStyle = "#0284c7";
  context.font = "900 80px system-ui, sans-serif";
  context.fillText(race.time, 86, recordLabelY + (isPersonalBest ? 168 : 116));
  const summaryY = 600;
  drawRoundedRect(context, 80, summaryY, 700, 102, 24, "#effaff");
  context.fillStyle = "#0f172a";
  context.font = "800 30px system-ui, sans-serif";
  context.fillText("\u8cc7\u683c\u7d1a", 112, summaryY + 36);
  context.fillStyle = "#0284c7";
  context.font = "900 46px system-ui, sans-serif";
  context.fillText(qualification?.label ?? "\u8cc7\u683c\u7d1a\u306a\u3057", 245, summaryY + 38);
  const qualificationNote = qualification?.isHighest
    ? "\u6700\u9ad8\u7d1a\u3067\u3059"
    : qualification?.nextLabel && qualification.nextGapCentis !== undefined
      ? `${qualification.nextLabel}\u307e\u3067\u3042\u3068${(qualification.nextGapCentis / 100).toFixed(2)}\u79d2`
      : "";
  context.fillStyle = "#0369a1";
  context.font = "700 28px system-ui, sans-serif";
  if (qualificationNote) context.fillText(qualificationNote, 390, summaryY + 36);
  context.fillStyle = "#0369a1";
  context.font = "800 30px system-ui, sans-serif";
  const courseAndRt = `${race.course === "SCM" ? "\u77ed\u6c34\u8def" : "\u9577\u6c34\u8def"}${race.rt ? `  \uFF5C  RT ${race.rt}` : ""}`;
  context.fillText(courseAndRt, 112, summaryY + 78);
  if (race.splits.length) drawShareSplitGrid(context, race.splits);
  context.fillStyle = "#0284c7";
  context.fillRect(48, 770, 1254, 10);
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("image encoding failed")), "image/png"));
}
function drawRoundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number, color: string) {
  context.fillStyle = color;
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
  context.fill();
}

function drawShareText(context: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number, maxLines: number) {
  const lines: string[] = [];
  let line = "";
  for (const character of text) {
    const candidate = line + character;
    if (line && context.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = character;
    } else line = candidate;
  }
  if (line) lines.push(line);
  lines.slice(0, maxLines).forEach((value, index) => context.fillText(value, x, y + index * lineHeight));
}

function drawShareSplitGrid(context: CanvasRenderingContext2D, splits: Detail["splits"]) {
  const columns = splits.length <= 4 ? 1 : splits.length <= 8 ? 2 : splits.length <= 16 ? 2 : 3;
  const rows = Math.ceil(splits.length / columns);
  const compactTable = splits.length <= 8;
  const x = 820, y = compactTable ? 420 : 150, width = compactTable && columns === 1 ? 340 : 430;
  const rowHeight = rows > 8 ? 42 : rows > 4 ? 48 : 54;
  const height = Math.min(590, 88 + rows * rowHeight + 18);
  drawRoundedRect(context, x, y, width, height, 28, "#f8fafc");
  context.fillStyle = "#0f172a";
  context.font = "900 30px system-ui, sans-serif";
  context.fillText("\u901a\u904e\u30bf\u30a4\u30e0", x + 32, y + 48);
  const cellWidth = (width - 56) / columns;
  context.font = rows > 8 ? "700 20px system-ui, sans-serif" : rows > 4 ? "700 23px system-ui, sans-serif" : "700 28px system-ui, sans-serif";
  context.strokeStyle = "#dbeafe";
  context.lineWidth = 1;
  for (let row = 0; row < rows; row += 1) {
    const lineY = y + 112 + row * rowHeight;
    context.beginPath();
    context.moveTo(x + 24, lineY);
    context.lineTo(x + width - 24, lineY);
    context.stroke();
  }
  splits.forEach((split, index) => {
    const column = Math.floor(index / rows);
    const row = index % rows;
    const cellX = x + 28 + column * cellWidth;
    const cellY = y + 98 + row * rowHeight;
    context.fillStyle = "#64748b";
    context.fillText(`${split.distanceM}m`, cellX, cellY);
    context.fillStyle = "#0284c7";
    if (columns === 1) context.fillText(split.time, cellX + 130, cellY);
    else {
      context.textAlign = "right";
      context.fillText(split.time, cellX + cellWidth - 12, cellY);
      context.textAlign = "left";
    }
  });
}

function downloadRaceShareImage(image: Blob, name: string) {
  const url = URL.createObjectURL(image);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
