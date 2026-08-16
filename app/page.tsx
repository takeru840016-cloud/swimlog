"use client";
import { useEffect, useState } from "react";
import {
  Activity,
  BarChart3,
  House,
  Medal,
  Plus,
  Trophy,
  Timer,
  Users,
  X,
} from "lucide-react";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AdminPinDialog } from "../components/admin-pin-dialog";
import { PracticeModal as SharedPracticeModal } from "../components/practice-modal";
import { compareDateDesc, sortByDateDesc } from "../lib/date";
type Athlete = {
  id: string;
  name: string;
  gender: "male" | "female" | "other";
  birthDate: string;
  club?: string | null;
  resultsAthleteId?: string | null;
  createdAt?: string;
};
type Race = {
  id: string;
  date: string;
  meetName: string;
  event: string;
  course: "SCM" | "LCM";
  time: string;
  rt?: string;
  rank?: number;
  qualification?: { label: string; nextLabel?: string; nextGapCentis?: number; isHighest: boolean };
};
type PracticeRecord = {
  id: string;
  athleteId: string;
  date: string;
  event: string;
  course: "SCM" | "LCM";
  time: string;
  rt?: string;
  splits?: { distanceM: number; time: string }[];
  note?: string;
};
type QualificationStandard = {
  effectiveYear: number;
  system: string;
  gender: Athlete["gender"];
  minAge: number;
  maxAge: number;
  course: Race["course"];
  event: string;
  label: string;
  targetCentis: number;
};
type EditableRace = Race & {
  splits: { distanceM: number; time: string }[];
};
const groups = {
  Freestyle: [
    "50m自由形",
    "100m自由形",
    "200m自由形",
    "400m自由形",
    "800m自由形",
    "1500m自由形",
  ],
  Backstroke: ["50m背泳ぎ", "100m背泳ぎ", "200m背泳ぎ"],
  Breaststroke: ["50m平泳ぎ", "100m平泳ぎ", "200m平泳ぎ"],
  Butterfly: ["50mバタフライ", "100mバタフライ", "200mバタフライ"],
  IndividualMedley: [
    "100m個人メドレー",
    "200m個人メドレー",
    "400m個人メドレー",
  ],
};
const practiceGroups = {
  Freestyle: ["25m自由形", ...groups.Freestyle],
  Backstroke: ["25m背泳ぎ", ...groups.Backstroke],
  Breaststroke: ["25m平泳ぎ", ...groups.Breaststroke],
  Butterfly: ["25mバタフライ", ...groups.Butterfly],
  IndividualMedley: groups.IndividualMedley,
};
export default function Home() {
  const [athletes, setAthletes] = useState<Athlete[]>([]),
    [active, setActive] = useState(""),
    [races, setRaces] = useState<Race[]>([]),
    [practices, setPractices] = useState<PracticeRecord[]>([]),
    [form, setForm] = useState(false),
    [practiceForm, setPracticeForm] = useState(false),
    [editingPractice, setEditingPractice] = useState<PracticeRecord | null>(null),
    [addChoice, setAddChoice] = useState(false),
    [editingRace, setEditingRace] = useState<EditableRace | null>(null),
    [athleteForm, setAthleteForm] = useState<"edit" | "add" | null>(null),
    [admin, setAdmin] = useState(false),
    [entry, setEntry] = useState(false),
    [adminExpiresAt, setAdminExpiresAt] = useState<number | undefined>(),
    [entryExpiresAt, setEntryExpiresAt] = useState<number | undefined>(),
    [adminAction, setAdminAction] = useState<(() => void) | null>(null),
    [entryDialog, setEntryDialog] = useState(false),
    [modeChoice, setModeChoice] = useState(false),
    [releasingMode, setReleasingMode] = useState<"admin" | "entry" | null>(null),
    [screen, setScreen] = useState<"home" | "races" | "practice" | "best">("home");
  const selected = athletes.find((a) => a.id === active);
  useEffect(() => {
    fetch("/api/athletes")
      .then((r) => r.json())
      .then((a: Athlete[]) => {
        setAthletes(a);
        const id = localStorage.getItem("swimlog:active-athlete");
        const nextActive = a.some((x) => x.id === id) ? (id ?? "") : (a[0]?.id ?? "");
        setActive(nextActive);
        if (nextActive && nextActive !== id)
          localStorage.setItem("swimlog:active-athlete", nextActive);
      })
      .catch(() => {});
    fetch("/api/admin/session")
      .then((response) => (response.ok ? response.json() : { authenticated: false }))
      .then((session: { authenticated: boolean; expiresAt?: number }) => { setAdmin(session.authenticated); setAdminExpiresAt(session.expiresAt); })
      .catch(() => { setAdmin(false); setAdminExpiresAt(undefined); });
    fetch("/api/entry/session")
      .then((response) => (response.ok ? response.json() : { authenticated: false }))
      .then((session: { authenticated: boolean; expiresAt?: number }) => { setEntry(session.authenticated); setEntryExpiresAt(session.expiresAt); })
      .catch(() => { setEntry(false); setEntryExpiresAt(undefined); });
  }, []);
  useEffect(() => {
    if (active)
      fetch(`/api/races?athleteId=${active}&qualifications=1`)
        .then((r) => r.json())
        .then((items: Race[]) => setRaces(sortByDateDesc(items)))
        .catch(() => {});
  }, [active]);
  useEffect(() => {
    if (active && screen === "practice")
      fetch(`/api/practice-records?athleteId=${active}`)
        .then((r) => (r.ok ? r.json() : []))
        .then((items: PracticeRecord[]) => setPractices(sortByDateDesc(items)))
        .catch(() => setPractices([]));
  }, [active, screen]);
  useEffect(() => {
    const id = new URLSearchParams(location.search).get("edit");
    if (!id || !admin) return;
    fetch(`/api/races/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((race: EditableRace) => {
        setEditingRace(race);
        setForm(true);
      })
      .catch(() => {});
  }, [admin]);
  const changeScreen = (nextScreen: "home" | "races" | "practice" | "best") => {
    if (nextScreen === screen) return;
    window.scrollTo(0, 0);
    setScreen(nextScreen);
  };
  const choose = (id: string) => {
    setActive(id);
    localStorage.setItem("swimlog:active-athlete", id);
  };
  const requireAdmin = (action: () => void) => {
    if (admin) action();
    else setAdminAction(() => action);
  };
  const addAthlete = async (a: Omit<Athlete, "id">) => {
    const r = await fetch("/api/athletes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(a),
    });
    const saved = (await r.json()) as Athlete;
    setAthletes((x) => [saved, ...x]);
    choose(saved.id);
    setAthleteForm(null);
  };
  const updateAthlete = async (id: string, a: Omit<Athlete, "id">) => {
    const response = await fetch(`/api/athletes/${id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(a),
    });
    if (!response.ok) throw new Error("athlete update failed");
    const saved = await response.json() as Athlete;
    setAthletes((current) => current.map((athlete) => athlete.id === id ? saved : athlete));
    setAthleteForm(null);
  };
  const removeAthlete = async (id: string) => {
    const response = await fetch(`/api/athletes/${id}`, { method: "DELETE" });
    if (!response.ok) throw new Error("athlete delete failed");
    const remaining = athletes.filter((athlete) => athlete.id !== id);
    const nextActive = remaining[0]?.id ?? "";
    setAthletes(remaining);
    setActive(nextActive);
    setRaces([]);
    if (nextActive) localStorage.setItem("swimlog:active-athlete", nextActive);
    else localStorage.removeItem("swimlog:active-athlete");
  };
  return (
    <main className="mx-auto min-h-dvh max-w-md bg-slate-50 pb-28">
      <header className="bg-pool px-5 pb-8 pt-[max(1.25rem,env(safe-area-inset-top))] text-white">
        <p className="text-xs font-bold tracking-[.2em] text-sky-200">
          SWIMMING LOG
        </p>
        <h1 className="mt-1 text-2xl font-black">競泳記録</h1>
      </header>
      <section className="-mt-3 space-y-4 px-4">
        {selected ? (
          <Profile
            athlete={selected}
            athletes={athletes}
            races={races}
            admin={admin}
            entry={entry}
            adminExpiresAt={adminExpiresAt}
            entryExpiresAt={entryExpiresAt}
            choose={choose}
            manage={() => setAthleteForm("edit")}
            release={(mode) => setReleasingMode(mode)}
          />
        ) : (
          <EmptyAthlete add={() => requireAdmin(() => setAthleteForm("add"))} />
        )}{" "}
        {selected &&
          (screen === "home" ? <Dashboard races={races} showRaceList={() => changeScreen("races")} /> : screen === "races" ? <RaceList athlete={selected} races={races} /> : screen === "practice" ? <PracticeDashboard records={practices} races={races} /> : <BestScreen races={races} />)}
      </section>
      {selected && (
        <button
          aria-label="レース登録"
          onClick={() => admin ? setAddChoice(true) : entry ? setPracticeForm(true) : setModeChoice(true)}
          className="fixed bottom-20 right-5 rounded-full bg-pool p-4 text-white shadow-lg"
        >
          <Plus />
        </button>
      )}
      <nav className="fixed bottom-0 left-0 right-0 mx-auto flex max-w-md border-t bg-white px-8 pb-[max(.5rem,env(safe-area-inset-bottom))] pt-2">
        <button
          onClick={() => changeScreen("home")}
          className={`nav-item ${screen === "home" ? "text-pool" : ""}`}
        >
          <House size={20} />
          ホーム
        </button>
        <button
          onClick={() => changeScreen("races")}
          className={`nav-item ${screen === "races" ? "text-pool" : ""}`}
        >
          <Trophy size={20} />
          レース
        </button>
        <button
          onClick={() => changeScreen("practice")}
          className={`nav-item ${screen === "practice" ? "text-pool" : ""}`}
        >
          <Timer size={20} />
          練習
        </button>
        <button
          onClick={() => changeScreen("best")}
          className={`nav-item ${screen === "best" ? "text-pool" : ""}`}
        >
          <Medal size={20} />
          ベスト
        </button>
      </nav>
      {form && (
        <RaceModal
          athleteId={active}
          races={races}
          editing={editingRace ?? undefined}
          close={() => { setForm(false); setEditingRace(null); history.replaceState(null, "", "/"); }}
          saved={(r) => {
            setRaces((x) => sortByDateDesc(editingRace ? x.map((current) => current.id === r.id ? r : current) : [r, ...x]));
            setForm(false);
            setEditingRace(null);
            history.replaceState(null, "", "/");
          }}
        />
      )}
      {addChoice && <AddRecordChoice admin={admin} close={() => setAddChoice(false)} race={() => { setAddChoice(false); setEditingRace(null); setForm(true); }} practice={() => { setAddChoice(false); setEditingPractice(null); setPracticeForm(true); }} editAthlete={() => { setAddChoice(false); setAthleteForm("edit"); }} addAthlete={() => { setAddChoice(false); setAthleteForm("add"); }} />}
      {practiceForm && <SharedPracticeModal athleteId={active} editing={editingPractice ?? undefined} close={() => { setPracticeForm(false); setEditingPractice(null); }} saved={(record) => { setPractices((current) => sortByDateDesc(editingPractice ? current.map((item) => item.id === record.id ? record : item) : [record, ...current])); setPracticeForm(false); setEditingPractice(null); }} />}
      {athleteForm && (
        <AthleteModal athlete={athleteForm === "edit" ? selected : undefined} close={() => setAthleteForm(null)} save={athleteForm === "edit" && selected ? (values) => updateAthlete(selected.id, values) : addAthlete} remove={athleteForm === "edit" && selected ? async () => { await removeAthlete(selected.id); setAthleteForm(null); } : undefined} />
      )}
      {adminAction && <AdminPinDialog close={() => setAdminAction(null)} authenticated={(session) => { setAdmin(true); setAdminExpiresAt(session.expiresAt); adminAction(); setAdminAction(null); }} />}
      {entryDialog && <AdminPinDialog entry close={() => setEntryDialog(false)} authenticated={(session) => { setEntry(true); setEntryExpiresAt(session.expiresAt); setPracticeForm(true); }} />}
      {modeChoice && <ModeChoice close={() => setModeChoice(false)} admin={() => { setModeChoice(false); setAdminAction(() => () => setAddChoice(true)); }} entry={() => { setModeChoice(false); setEntryDialog(true); }} />}
      {releasingMode && <ModeReleaseDialog mode={releasingMode} close={() => setReleasingMode(null)} released={() => { if (releasingMode === "admin") { setAdmin(false); setAdminExpiresAt(undefined); } else { setEntry(false); setEntryExpiresAt(undefined); } setReleasingMode(null); }} />}
    </main>
  );
}
function Profile({
  athlete,
  athletes,
  races,
  admin,
  entry,
  adminExpiresAt,
  entryExpiresAt,
  choose,
  manage,
  release,
}: {
  athlete: Athlete;
  athletes: Athlete[];
  races: Race[];
  admin: boolean;
  entry: boolean;
  adminExpiresAt?: number;
  entryExpiresAt?: number;
  choose: (id: string) => void;
  manage: () => void;
  release: (mode: "admin" | "entry") => void;
}) {
  const today = new Date();
  const age = Math.floor(
    (today.getTime() - new Date(athlete.birthDate).getTime()) / 31557600000,
  );
  const [birthYear, birthMonth, birthDay] = athlete.birthDate.split("-").map(Number);
  const schoolYear = today.getFullYear() - (today.getMonth() < 3 ? 1 : 0);
  const schoolStartYear = birthYear + (birthMonth < 4 || (birthMonth === 4 && birthDay <= 1) ? 6 : 7);
  const grade = schoolYear - schoolStartYear + 1;
  const schoolGrade = grade < 1
    ? "未就学児"
    : grade <= 6
    ? `小学${grade}年`
    : grade <= 9
      ? `中学${grade - 6}年`
      : grade <= 12
        ? `高校${grade - 9}年`
        : "高校卒業後";
  const annualAge = today.getFullYear() - birthYear;
  const [now, setNow] = useState(Date.now());
  const [detailsOpen, setDetailsOpen] = useState(false);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => setDetailsOpen(false), [athlete.id]);
  const remaining = (expiresAt?: number) => {
    const minutes = Math.max(0, Math.ceil(((expiresAt ?? now) - now) / 60_000));
    return `残り${minutes >= 60 ? `${Math.floor(minutes / 60)}時間${minutes % 60 ? `${minutes % 60}分` : ""}` : `${minutes}分`}`;
  };
  const highestQualification = races.reduce<{ race: Race; qualification: NonNullable<Race["qualification"]> } | null>((highest, race) => {
    const qualification = race.qualification;
    if (!qualification || (highest && gradeNumber(qualification.label) <= gradeNumber(highest.qualification.label))) return highest;
    return { race, qualification };
  }, null);
  const resultsSearchUrl = athlete.name.trim()
    ? `https://result.swim.or.jp/player-search?${new URLSearchParams({
      name: athlete.name.trim(),
      ...(athlete.club?.trim() ? { entry_group_name: athlete.club.trim() } : {}),
    }).toString()}`
    : null;
  const resultsProfileUrl = athlete.resultsAthleteId?.trim()
    ? `https://result.swim.or.jp/athletes/${encodeURIComponent(athlete.resultsAthleteId.trim())}`
    : null;
  return (
    <div className="card overflow-hidden p-0">
      <div className="flex items-center justify-between gap-3 bg-gradient-to-r from-pool to-sky-500 px-4 py-3 text-white">
        <div className="min-w-0 whitespace-nowrap"><span className="text-sm font-bold text-sky-100">選手情報</span><span className="mx-2 text-sky-200">｜</span><span className="text-lg font-black">選手名：{athlete.name}</span></div>
        {admin && <button onClick={manage} className="shrink-0 rounded-lg bg-white/20 px-2.5 py-1.5 text-xs font-bold text-white ring-1 ring-white/40">✏️ 編集</button>}
      </div>
      <div className="flex items-start gap-3 px-4 pt-3">
        {highestQualification ? <><div className="flex w-32 shrink-0 items-baseline gap-1 whitespace-nowrap"><span className="text-xs font-bold text-slate-500">🏅 現在の資格級</span><span className="text-lg font-black text-pool">{highestQualification.qualification.label}</span></div><div className="min-w-0 flex-1 text-sm font-bold leading-5 text-slate-600"><p>種目：{highestQualification.race.event}</p><p>{highestQualification.qualification.isHighest ? "最高級です" : highestQualification.qualification.nextGapCentis !== undefined ? `次の資格級まであと${(highestQualification.qualification.nextGapCentis / 100).toFixed(2)}秒` : ""}</p></div></> : <p className="text-sm font-bold text-slate-400">🏅 現在の資格級　資格級なし</p>}
      </div>
      <button type="button" onClick={() => setDetailsOpen((open) => !open)} className="mx-4 mt-3 flex w-[calc(100%-2rem)] items-center border-t py-3 text-left text-sm font-bold text-pool">{detailsOpen ? "▲ 詳細情報" : "▼ 詳細情報"}</button>
      {detailsOpen && <div className="border-t border-slate-100"><div className="grid grid-cols-2 gap-px bg-slate-100">
        <ProfileField label="生年月日" value={athlete.birthDate.split("-").map((part) => part.padStart(2, "0")).join("/")} />
        <ProfileField label="年度年齢" value={`${annualAge}歳`} />
        <ProfileField label="学年" value={schoolGrade} />
        <ProfileField label="所属" value={athlete.club?.trim() || "未登録"} muted={!athlete.club?.trim()} />
        <ProfileField label="性別" value={athlete.gender === "male" ? "男性" : athlete.gender === "female" ? "女性" : "その他"} />
        <ProfileField label="登録日" value={athlete.createdAt ? athlete.createdAt.slice(0, 10).replaceAll("-", "/") : "-"} />
      </div>{(resultsProfileUrl || resultsSearchUrl) && <div className="px-4 py-3"><a href={resultsProfileUrl ?? resultsSearchUrl ?? undefined} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-bold text-pool underline underline-offset-4">{resultsProfileUrl ? "🔗 Results個人成績を見る" : "🔗 Results of Japan Swimmingで検索"} <span aria-hidden="true">↗</span></a></div>}{athletes.length > 1 && <div className="px-4 py-3"><label className="label">選手を切り替え</label><select value={athlete.id} onChange={(e) => choose(e.target.value)} className="input mt-1">{athletes.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>}<p className="px-4 pb-3 text-xs text-slate-400">満年齢 {age}歳 ・ 年度年齢は{today.getFullYear()}年度</p></div>}
      {admin && <button type="button" onClick={() => release("admin")} className="mx-4 block w-[calc(100%-2rem)] whitespace-nowrap border-t py-3 text-left text-sm font-bold text-emerald-700">🔒 管理モード有効（{remaining(adminExpiresAt)}）</button>}
      {!admin && entry && <button type="button" onClick={() => release("entry")} className="mx-4 block w-[calc(100%-2rem)] whitespace-nowrap border-t py-3 text-left text-sm font-bold text-sky-700">✏️ 追加モード有効（{remaining(entryExpiresAt)}）</button>}
    </div>
  );
}
function ProfileField({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return <div className="bg-white px-5 py-4"><p className="text-xs font-bold text-slate-400">{label}</p><p className={`mt-1 font-bold ${muted ? "text-slate-400" : "text-slate-700"}`}>{value}</p></div>;
}
function EmptyAthlete({ add }: { add: () => void }) {
  return (
    <div className="card text-center">
      <Users className="mx-auto text-pool" />
      <h2 className="mt-3 font-bold">まず選手を登録してください</h2>
      <p className="mt-1 text-sm text-slate-500">
        レース記録を登録するには選手が必要です。
      </p>
      <button
        onClick={add}
        className="mt-4 rounded-xl bg-pool px-5 py-3 font-bold text-white"
      >
        選手を登録
      </button>
    </div>
  );
}
function Dashboard({ races, showRaceList }: { races: Race[]; showRaceList: () => void }) {
  const event = races[0]?.event ?? "100m自由形";
  return (
    <div className="space-y-4">
      <RecentResultsCard races={races} showRaceList={showRaceList} />
      <GrowthCard races={races} />
      <ProgressGraphCard races={races} event={event} />
    </div>
  );
}
function BestScreen({ races }: { races: Race[] }) {
  const best = Object.values(
    races.reduce<Record<string, Race>>((a, r) => {
      const k = `${r.event}-${r.course}`;
      if (!a[k] || seconds(r.time) < seconds(a[k].time)) a[k] = r;
      return a;
    }, {}),
  );
  return <div className="space-y-4"><PersonalBestCard races={best} /></div>;
}
function PracticeList({ records, admin, edit, remove }: { records: PracticeRecord[]; admin: boolean; edit: (record: PracticeRecord) => void; remove: (record: PracticeRecord) => Promise<void> }) {
  return (
    <div className="space-y-3">
      <DashTitle title="練習記録" icon={<Activity size={18} />} />
      {records.length ? records.map((record) => (
        <div key={record.id} className="card flex items-center justify-between p-4">
          <div>
            <p className="font-bold">{record.event}</p>
            <p className="mt-1 text-xs text-slate-400">{record.date} ・ {record.course}{record.note ? ` ・ ${record.note}` : ""}</p>
          </div>
          <div className="text-right"><p className="text-xl font-black text-pool">{record.time}</p>{admin && <div className="mt-2 flex justify-end gap-2 text-xs font-bold"><button onClick={() => edit(record)} className="text-pool">編集</button><button onClick={() => remove(record)} className="text-rose-600">削除</button></div>}</div>
        </div>
      )) : <Hint text="練習記録はまだありません。" />}
    </div>
  );
}
function PracticeDashboard({ records, races }: { records: PracticeRecord[]; races: Race[] }) {
  const bests = Object.values(records.reduce<Record<string, PracticeRecord>>((all, record) => {
    const key = `${record.event}::${record.course}`;
    if (!all[key] || seconds(record.time) < seconds(all[key].time)) all[key] = record;
    return all;
  }, {}));
  const [selectedKey, setSelectedKey] = useState(() => bests[0] ? `${bests[0].event}::${bests[0].course}` : "");
  const availableKey = bests.some((record) => `${record.event}::${record.course}` === selectedKey) ? selectedKey : (bests[0] ? `${bests[0].event}::${bests[0].course}` : "");
  const trend = records.filter((record) => `${record.event}::${record.course}` === availableKey).slice().reverse().map((record) => ({ date: record.date, time: seconds(record.time) }));
  const raceBestByKey = races.reduce<Record<string, Race>>((all, race) => {
    const key = `${race.event}::${race.course}`;
    if (!all[key] || seconds(race.time) < seconds(all[key].time)) all[key] = race;
    return all;
  }, {});
  const comparisons = bests.filter((record) => raceBestByKey[`${record.event}::${record.course}`] || record.event.startsWith("25m")).slice(0, 5);
  return <div className="space-y-4"><DashTitle title="練習" icon={<Timer size={18} />} /><section className="card"><div className="mb-3 flex items-center justify-between"><h3 className="font-black">練習ベスト</h3><a href="/practice/" className="text-sm font-bold text-pool">練習履歴を見る →</a></div>{bests.length ? <div className="space-y-2">{bests.slice(0, 5).map((record) => <a key={record.id} href={`/practice/?event=${encodeURIComponent(record.event)}&course=${record.course}`} className="flex justify-between border-b py-2 last:border-0"><div><p className="font-bold">{record.event}</p><p className="text-xs text-slate-400">{record.course}</p></div><b className="text-pool">{record.time}</b></a>)}</div> : <p className="text-sm text-slate-400">まだ練習記録がありません。＋ボタンから追加できます。</p>}</section><section className="card"><h3 className="font-black">タイム推移</h3>{bests.length ? <><select value={availableKey} onChange={(event) => setSelectedKey(event.target.value)} className="input mt-3">{bests.map((record) => { const key = `${record.event}::${record.course}`; return <option key={key} value={key}>{record.event}（{record.course}）</option>; })}</select><div className="mt-3 h-40">{trend.length > 1 ? <ResponsiveContainer width="100%" height="100%"><LineChart data={trend}><XAxis dataKey="date" tickFormatter={(date) => date.slice(2).replaceAll("-", "/")} fontSize={10}/><YAxis dataKey="time" tickFormatter={(value) => formatChartTime(Number(value))} width={42} fontSize={10}/><Tooltip formatter={(value) => formatChartTime(Number(value))}/><Line type="monotone" dataKey="time" stroke="#1173b8" strokeWidth={3} dot={{ r: 3 }}/></LineChart></ResponsiveContainer> : <Hint text="2件以上の練習記録で推移を表示します。" />}</div></> : <p className="mt-3 text-sm text-slate-400">練習記録を追加すると推移を表示します。</p>}</section><section className="card"><h3 className="font-black">大会ベスト比較</h3>{comparisons.length ? <div className="mt-3 space-y-3">{comparisons.map((practice) => { const race = raceBestByKey[`${practice.event}::${practice.course}`]; if (!race) return <div key={practice.id} className="border-b pb-3 last:border-0 last:pb-0"><p className="font-bold">{practice.event} <span className="text-xs text-slate-400">{practice.course}</span></p><p className="mt-2 text-sm text-slate-400">比較対象なし</p></div>; const difference = seconds(practice.time) - seconds(race.time); return <div key={practice.id} className="border-b pb-3 last:border-0 last:pb-0"><p className="font-bold">{practice.event} <span className="text-xs text-slate-400">{practice.course}</span></p><div className="mt-2 grid grid-cols-3 text-sm"><span>大会 <b>{race.time}</b></span><span>練習 <b>{practice.time}</b></span><b className={difference > 0 ? "text-rose-600" : difference < 0 ? "text-emerald-600" : "text-slate-500"}>{difference > 0 ? "+" : difference < 0 ? "-" : "±"}{Math.abs(difference).toFixed(2)}秒</b></div></div>; })}</div> : <p className="mt-3 text-sm text-slate-400">練習記録を追加すると比較を表示します。</p>}</section><a href="/practice/" className="card block text-center font-bold text-pool">練習履歴を見る →</a></div>;
}
function RecentPracticeCard({ records, showPracticeList }: { records: PracticeRecord[]; showPracticeList: () => void }) {
  return <div><DashTitle title="最近の練習" icon={<Timer size={18} />} />{records.length ? <button onClick={showPracticeList} className="mt-2 w-full space-y-2 text-left">{records.slice(0, 5).map((record) => <div key={record.id} className="card flex items-center justify-between p-4"><div><p className="font-bold">{record.event}</p><p className="mt-1 text-xs text-slate-400">{record.date} ・ {record.course}</p></div><p className="text-xl font-black text-pool">{record.time}</p></div>)}</button> : <Hint text="まだ練習記録がありません。＋ボタンから追加できます。" />}</div>;
}
function PracticeBestCard({ records, showPracticeList }: { records: PracticeRecord[]; showPracticeList: () => void }) {
  const best = Object.values(records.reduce<Record<string, PracticeRecord>>((all, record) => {
    const key = `${record.event}::${record.course}`;
    if (!all[key] || seconds(record.time) < seconds(all[key].time)) all[key] = record;
    return all;
  }, {})).sort((a, b) => seconds(a.time) - seconds(b.time)).slice(0, 5);
  return <div><DashTitle title="練習ベスト" icon={<Timer size={18} />} />{best.length ? <button onClick={showPracticeList} className="card mt-2 w-full space-y-2 text-left">{best.map((record) => <div key={record.id} className="flex items-center justify-between border-b py-2 last:border-0"><div><p className="font-bold">{record.event}</p><p className="text-xs text-slate-400">{record.course}</p></div><p className="text-xl font-black text-pool">{record.time}</p></div>)}</button> : <Hint text="まだ練習記録がありません。＋ボタンから追加できます。" />}</div>;
}
function AddRecordChoice({ admin, close, race, practice, editAthlete, addAthlete }: { admin: boolean; close: () => void; race: () => void; practice: () => void; editAthlete: () => void; addAthlete: () => void }) {
  return <Modal title="記録を追加" close={close}><div className="space-y-3"><button onClick={race} className="w-full rounded-xl border border-slate-200 p-4 text-left"><p className="font-bold">🏁 レース記録</p><p className="mt-1 text-sm text-slate-500">大会の公式記録を登録</p></button><button onClick={practice} className="w-full rounded-xl border border-slate-200 p-4 text-left"><p className="font-bold">🏊 練習記録</p><p className="mt-1 text-sm text-slate-500">練習タイムを登録</p></button>{admin && <div className="border-t border-slate-100 pt-3"><p className="mb-2 text-xs font-bold text-slate-400">選手管理</p><button onClick={editAthlete} className="w-full rounded-xl border border-slate-200 p-4 text-left"><p className="font-bold">👤 選手情報を編集</p><p className="mt-1 text-sm text-slate-500">現在選択中の選手を編集</p></button><button onClick={addAthlete} className="mt-3 w-full rounded-xl border border-slate-200 p-4 text-left"><p className="font-bold">➕ 選手を追加</p><p className="mt-1 text-sm text-slate-500">新しい選手を登録</p></button></div>}<button onClick={close} className="w-full rounded-xl border border-slate-200 px-4 py-3 font-bold">キャンセル</button></div></Modal>;
}
function ModeChoice({ close, admin, entry }: { close: () => void; admin: () => void; entry: () => void }) {
  return <Modal title="PINモードを選択" close={close}><div className="space-y-3"><button onClick={admin} className="w-full rounded-xl border border-slate-200 p-4 text-left"><p className="font-bold">🔒 管理モード</p><p className="mt-1 text-sm text-slate-500">すべての管理操作</p></button><button onClick={entry} className="w-full rounded-xl border border-slate-200 p-4 text-left"><p className="font-bold">✏️ 追加モード</p><p className="mt-1 text-sm text-slate-500">練習記録の追加のみ</p></button></div></Modal>;
}
function ModeReleaseDialog({ mode, close, released }: { mode: "admin" | "entry"; close: () => void; released: () => void }) {
  const [releasing, setReleasing] = useState(false);
  const [error, setError] = useState("");
  const label = mode === "admin" ? "管理モード" : "追加モード";
  const description = mode === "admin" ? "現在の編集権限が無効になります。" : "練習記録追加権限が無効になります。";
  const release = async () => {
    setReleasing(true); setError("");
    try {
      const response = await fetch(`/api/${mode}/session`, { method: "DELETE" });
      if (!response.ok) throw new Error();
      released();
    } catch { setError("解除できませんでした"); } finally { setReleasing(false); }
  };
  return <Modal title={`${label}を解除しますか？`} close={close}><p className="text-sm text-slate-500">{description}</p>{error && <Err t={error}/>}<div className="mt-5 grid grid-cols-2 gap-3"><button onClick={release} disabled={releasing} className="rounded-xl bg-rose-600 px-4 py-3 font-bold text-white disabled:opacity-60">{releasing ? "解除中..." : "解除"}</button><button onClick={close} disabled={releasing} className="rounded-xl border border-slate-200 px-4 py-3 font-bold">キャンセル</button></div></Modal>;
}
function PracticeModal({ athleteId, editing, close, saved }: { athleteId: string; editing?: PracticeRecord; close: () => void; saved: (record: PracticeRecord) => void }) {
  const [value, setValue] = useState({ date: editing?.date ?? new Date().toISOString().slice(0, 10), event: editing?.event ?? "", course: editing?.course ?? "SCM" as PracticeRecord["course"], time: editing?.time ?? "", note: editing?.note ?? "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!value.date || !value.event || !value.time) return setError("日付・種目・タイムを入力してください");
    if (!/^(?:\d{1,2}:)?\d{1,2}\.\d{2}$/.test(value.time)) return setError("タイムは 38.12 または 1:23.55 形式で入力してください");
    setSaving(true); setError("");
    try {
      const response = await fetch(editing ? `/api/practice-records/${editing.id}` : "/api/practice-records", { method: editing ? "PUT" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...value, athleteId }) });
      if (!response.ok) throw new Error();
      saved(await response.json() as PracticeRecord);
    } catch { setError("保存できませんでした"); } finally { setSaving(false); }
  };
  return <Modal title={editing ? "練習記録を編集" : "練習記録を追加"} close={close}><div className="space-y-4"><Input label="日付" type="date" value={value.date} change={(date) => setValue({ ...value, date })}/><label className="block font-bold">種目<select value={value.event} onChange={(event) => setValue({ ...value, event: event.target.value })} className="input"><option value="">選択してください</option>{Object.entries(practiceGroups).map(([group, events]) => <optgroup key={group} label={group}>{events.map((event) => <option key={event}>{event}</option>)}</optgroup>)}</select></label><label className="block font-bold">コース<select value={value.course} onChange={(event) => setValue({ ...value, course: event.target.value as PracticeRecord["course"] })} className="input"><option value="SCM">短水路（SCM）</option><option value="LCM">長水路（LCM）</option></select></label><Input label="タイム" value={value.time} placeholder="例: 1:23.55" change={(time) => setValue({ ...value, time })}/><Input label="メモ（任意）" value={value.note} placeholder="例: A1メイン" change={(note) => setValue({ ...value, note })}/>{error && <Err t={error}/>}<Save onClick={save} disabled={saving} label={saving ? "保存中..." : editing ? "更新" : "保存"}/></div></Modal>;
}
function RecentResultsCard({ races, showRaceList }: { races: Race[]; showRaceList: () => void }) {
  return (
    <>
      <DashTitle title="最新結果" icon={<Trophy size={18} />} />
      {races.length ? (
        <div className="space-y-2">
          {races.slice(0, 2).map((r) => (
            <RaceRow key={r.id} race={r} qualification={r.qualification?.label ?? "資格級なし"} />
          ))}
          {races.length >= 3 && <button onClick={showRaceList} className="w-full py-2 text-sm font-bold text-pool">続きを見る ＞</button>}
        </div>
      ) : (
        <Hint text="レースを登録すると最新結果を表示します。" />
      )}
    </>
  );
}
function PersonalBestCard({ races }: { races: Race[] }) {
  const byEvent = races.reduce<Record<string, Partial<Record<Race["course"], Race>>>>((all, race) => {
    (all[race.event] ??= {})[race.course] = race;
    return all;
  }, {});
  const eventOrder = Object.values(groups).flat();
  const events = Object.entries(byEvent).sort(
    ([eventA], [eventB]) => eventOrder.indexOf(eventA) - eventOrder.indexOf(eventB),
  );
  return (
    <>
      <DashTitle title="自己ベスト一覧" icon={<Medal size={18} />} />
      <div className="space-y-2">
        {events.map(([event, courses]) => (
          <div key={event} className="card p-3">
            <p className="mb-2 text-sm font-bold">{event}</p>
            {(["SCM", "LCM"] as const).map((course) => {
              const race = courses[course];
              return race ? (
                <a key={course} href={`/race/?id=${race.id}`} className="grid grid-cols-[auto_auto_auto_minmax(0,1fr)] items-center gap-3 border-t py-2 first:border-t-0 first:pt-0 last:pb-0">
                  <span className="text-xs font-bold text-slate-500">{course}</span>
                  <span className="font-black text-pool">{race.time}</span>
                  <span className="text-xs text-slate-400">{race.date}</span>
                  <span title={race.meetName} className="truncate text-right text-xs text-slate-400">{race.meetName}</span>
                </a>
              ) : null;
            })}
          </div>
        ))}
      </div>
    </>
  );
}
function JOComparisonCard() {
  const [status, setStatus] = useState<"loading" | "missing" | "ready" | "error">(
    "loading",
  );

  useEffect(() => {
    fetch("/api/standards")
      .then((response) => {
        if (!response.ok) throw new Error("standards request failed");
        return response.json() as Promise<{ system: string }[]>;
      })
      .then((standards) =>
        setStatus(standards.some((standard) => standard.system === "JO") ? "ready" : "missing"),
      )
      .catch(() => setStatus("error"));
  }, []);

  return (
    <div className="card p-4">
      <p className="label">JO標準比較</p>
      <p className="mt-2 font-black text-slate-400">
        {status === "error"
          ? "取得失敗"
          : status === "missing"
            ? "標準データ未登録"
            : status === "ready"
              ? "判定準備中"
              : "読み込み中"}
      </p>
    </div>
  );
}
function QualificationCard() {
  const [status, setStatus] = useState<"loading" | "missing" | "ready" | "error">(
    "loading",
  );

  useEffect(() => {
    fetch("/api/standards")
      .then((response) => {
        if (!response.ok) throw new Error("standards request failed");
        return response.json() as Promise<{ system: string }[]>;
      })
      .then((standards) =>
        setStatus(
          standards.some((standard) => standard.system === "grade") ? "ready" : "missing",
        ),
      )
      .catch(() => setStatus("error"));
  }, []);

  return (
    <div className="card p-4">
      <p className="label">資格級</p>
      <p className="mt-2 font-black text-slate-400">
        {status === "error"
          ? "取得失敗"
          : status === "missing"
            ? "標準データ未登録"
            : status === "ready"
              ? "判定準備中"
              : "読み込み中"}
      </p>
    </div>
  );
}
function GrowthCard({ races }: { races: Race[] }) {
  const latestDate = races.reduce((date, race) => race.date > date ? race.date : date, "");
  const bestOnDate = (records: Race[]) => records.reduce<Race | null>(
    (best, race) => !best || seconds(race.time) < seconds(best.time) ? race : best,
    null,
  );
  const latestRecords = Object.values(
    races.filter((race) => race.date === latestDate).reduce<Record<string, Race[]>>((all, race) => {
      const key = `${race.event}::${race.course}`;
      (all[key] ??= []).push(race);
      return all;
    }, {}),
  ).map(bestOnDate).filter((race): race is Race => !!race);
  const data = latestRecords
    .map((current) => {
      const earlierRecords = races.filter((race) => race.event === current.event && race.course === current.course && race.date < latestDate);
      const previousDate = earlierRecords.reduce((date, race) => race.date > date ? race.date : date, "");
      const previous = bestOnDate(earlierRecords.filter((race) => race.date === previousDate));
      return previous ? { current, previous, delta: seconds(previous.time) - seconds(current.time) } : null;
    })
    .filter((comparison): comparison is { current: Race; previous: Race; delta: number } => !!comparison);
  return (
    <>
      <DashTitle title="最近の成長" icon={<BarChart3 size={18} />} />
      {data.length ? (
        <div className="card p-0">
          {data.map(({ current, previous, delta }) => (
            <div
              key={current.id}
              className="border-b p-3 last:border-0"
            >
              <div className="flex items-baseline justify-between gap-2"><p className="font-bold">{current.event}</p><p className="whitespace-nowrap text-xs text-slate-400">（{previous.date} → {current.date}）</p></div>
              <div className="mt-1 flex items-center justify-between gap-3"><p className="text-lg font-black"><span>{previous.time}</span><span className="mx-2 text-slate-400">→</span><span className="text-pool">{current.time}</span></p><p className={`whitespace-nowrap font-black ${delta > 0 ? "text-emerald-600" : delta < 0 ? "text-rose-600" : "text-slate-500"}`}>{delta > 0 ? `↑ ${delta.toFixed(2)}秒更新` : delta < 0 ? `↓ ${Math.abs(delta).toFixed(2)}秒低下` : "変化なし"}</p></div>
            </div>
          ))}
        </div>
      ) : (
        <Hint text="直近大会で出場した種目に、前回記録があると比較を表示します。" />
      )}
    </>
  );
}
function ProgressGraphCard({ races, event }: { races: Race[]; event: string }) {
  const eventOrder = Object.values(groups).flat();
  const series = Array.from(
    new Map(
      races.map((race) => [`${race.event}::${race.course}`, race]),
    ).values(),
  ).sort((a, b) => eventOrder.indexOf(a.event) - eventOrder.indexOf(b.event) || (a.course === "SCM" ? -1 : 1));
  const defaultKey = races.find((race) => race.event === event)
    ? `${event}::${races.find((race) => race.event === event)!.course}`
    : "";
  const [selectedKey, setSelectedKey] = useState(defaultKey);
  const activeKey = series.some(
    (race) => `${race.event}::${race.course}` === selectedKey,
  )
    ? selectedKey
    : defaultKey;
  const selected = series.find(
    (race) => `${race.event}::${race.course}` === activeKey,
  );
  const data = races
    .filter((r) => `${r.event}::${r.course}` === activeKey)
    .slice(0, 5)
    .reverse()
    .map((r, index, records) => ({ date: r.date, time: seconds(r.time), previousTime: index ? seconds(records[index - 1].time) : undefined }));
  return (
    <>
      <DashTitle title="タイム推移" icon={<Activity size={18} />} />
      <div className="card">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div><p className="font-bold">{selected ? `${selected.event}（${selected.course}）` : "タイム推移"}</p><p className="text-xs text-slate-400">直近5レース</p></div>
          <select
            aria-label="グラフの種目を選択"
            value={activeKey}
            onChange={(e) => setSelectedKey(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm font-bold text-pool"
          >
            {series.map((race) => {
              const key = `${race.event}::${race.course}`;
              return (
                <option key={key} value={key}>
                  {race.event}（{race.course}）
                </option>
              );
            })}
          </select>
        </div>
        <div className="h-40">
          {data.length > 1 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data}>
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  fontSize={10}
                  tickFormatter={formatChartDate}
                />
                <YAxis width={42} axisLine={false} tickLine={false} fontSize={10} tickFormatter={(value) => formatChartTime(value, false)} />
                <Tooltip content={<TimeGraphTooltip />} />
                <Line
                  dataKey="time"
                  stroke="#1173b8"
                  strokeWidth={3}
                  dot={{ fill: "#1173b8", r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <Hint text="2件以上の記録で推移グラフを表示します。" />
          )}
        </div>
      </div>
    </>
  );
}
function formatChartDate(date: string) {
  const [year, month = "", day = ""] = date.split("-");
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}
function formatChartTime(value: number, includeCentis = true) {
  const minutes = Math.floor(value / 60);
  const secondsPart = value % 60;
  const secondsText = includeCentis ? secondsPart.toFixed(2).padStart(5, "0") : Math.round(secondsPart).toString().padStart(2, "0");
  return minutes ? `${minutes}:${secondsText}` : secondsText;
}
function TimeGraphTooltip({ active, payload }: any) {
  const point = payload?.[0]?.payload as { date: string; time: number; previousTime?: number } | undefined;
  if (!active || !point) return null;
  const delta = point.previousTime === undefined ? null : point.previousTime - point.time;
  return <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm shadow"><p className="font-bold">{formatChartDate(point.date)}</p><p className="mt-1">記録 <b>{formatChartTime(point.time)}</b></p>{delta !== null && <p className={`mt-1 font-bold ${delta > 0 ? "text-emerald-600" : delta < 0 ? "text-rose-600" : "text-slate-500"}`}>前回比 {delta > 0 ? `${delta.toFixed(2)}秒更新` : delta < 0 ? `${Math.abs(delta).toFixed(2)}秒低下` : "変化なし"}</p>}</div>;
}
function DashTitle({ title, icon }: { title: string; icon: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-2 pt-2 text-lg font-black text-ink">
      <span className="text-pool">{icon}</span>
      {title}
    </h2>
  );
}
function Hint({ text }: { text: string }) {
  return <div className="card text-sm text-slate-400">{text}</div>;
}
function RaceRow({ race, qualification }: { race: Race; qualification: string }) {
  return (
    <a href={`/race/?id=${race.id}`} className="card flex items-center justify-between p-4">
      <div>
        <p className="font-bold">{race.event}<span className="ml-2 text-sm text-slate-500">{qualification}</span></p>
        <p className="mt-1 text-xs text-slate-400">
          {race.date} · {race.meetName} · {race.course}
        </p>
      </div>
      <div className="text-right">
        <p className="text-xl font-black text-pool">{race.time}</p>
        <p className="text-xs text-slate-400">
          {race.rank ? `${race.rank}位` : ""}
        </p>
      </div>
    </a>
  );
}
function RaceList({ athlete, races }: { athlete: Athlete; races: Race[] }) {
  const meets = Object.values(
    races.reduce<Record<string, { date: string; meetName: string; races: Race[] }>>((all, race) => {
      const key = `${race.date}::${race.meetName}`;
      (all[key] ??= { date: race.date, meetName: race.meetName, races: [] }).races.push(race);
      return all;
    }, {}),
  ).sort((a, b) => compareDateDesc(a.date, b.date));
  return (
    <div className="space-y-3">
      <DashTitle title="大会一覧" icon={<Trophy size={18} />} />
      {meets.map((meet) => {
        const key = `${meet.date}::${meet.meetName}`;
        return <section key={key} className="card overflow-hidden p-0">
          <a href={`/meet/?id=${encodeURIComponent(key)}`} className="flex items-center justify-between p-4"><div><p className="font-bold">{meet.meetName}</p><p className="mt-1 text-xs text-slate-400">{meet.date} · {ageOnRaceDate(athlete.birthDate, meet.date)}歳 · {meet.races.length}レース</p></div><span className="text-pool">＞</span></a>
        </section>;
      })}
    </div>
  );
}
function seconds(value: string) {
  const [m, s] = value.split(":");
  return s === undefined ? Number(m) : Number(m) * 60 + Number(s);
}
function ageOnRaceDate(birthDate: string, raceDate: string) {
  const [birthYear, birthMonth, birthDay] = birthDate.split("-").map(Number);
  const [raceYear, raceMonth, raceDay] = raceDate.split("-").map(Number);
  return raceYear - birthYear - (raceMonth < birthMonth || (raceMonth === birthMonth && raceDay < birthDay) ? 1 : 0);
}
function timeCentis(value: string) {
  return Math.round(seconds(value) * 100);
}
function gradeNumber(label: string) {
  return Number(label.replace(/[^0-9]/g, "")) || 0;
}
function qualificationForRace(race: Race, athlete: Athlete, standards: QualificationStandard[]) {
  const age = ageOnRaceDate(athlete.birthDate, race.date);
  const raceYear = Number(race.date.slice(0, 4));
  const selectedYear = standards.some((standard) => standard.effectiveYear === raceYear)
    ? raceYear
    : Math.max(...standards.map((standard) => standard.effectiveYear));
  return standards
    .filter((standard) => standard.system === "grade" && standard.gender === athlete.gender && standard.effectiveYear === selectedYear && standard.minAge <= age && age <= standard.maxAge && standard.course === race.course && standard.event === race.event && timeCentis(race.time) <= standard.targetCentis)
    .sort((a, b) => gradeNumber(b.label) - gradeNumber(a.label))[0];
}
function AthleteModal({
  athlete,
  close,
  save,
  remove,
}: {
  athlete?: Athlete;
  close: () => void;
  save: (a: Omit<Athlete, "id">) => Promise<void>;
  remove?: () => Promise<void>;
}) {
  const [v, set] = useState({
      name: athlete?.name ?? "",
      gender: athlete?.gender ?? "male" as Athlete["gender"],
      birthDate: athlete?.birthDate ?? "",
      club: athlete?.club ?? "",
      resultsAthleteId: athlete?.resultsAthleteId ?? "",
    }),
    [e, setE] = useState(""),
    [saving, setSaving] = useState(false),
    [confirmingDelete, setConfirmingDelete] = useState(false),
    [isDeleting, setIsDeleting] = useState(false),
    [deleteError, setDeleteError] = useState(false);
  const deleteAthlete = async () => {
    if (!remove) return;
    setIsDeleting(true);
    setDeleteError(false);
    try {
      await remove();
      close();
    } catch {
      setDeleteError(true);
      setIsDeleting(false);
    }
  };
  return (
    <Modal title={athlete ? "選手情報を編集" : "選手を登録"} close={close}>
      <form
        onSubmit={async (x) => {
          x.preventDefault();
          if (!v.name || !v.birthDate)
            return setE("名前と生年月日を入力してください");
          setSaving(true);
          setE("");
          try {
            await save(v);
          } catch {
            setE("更新できませんでした。もう一度お試しください。");
            setSaving(false);
          }
        }}
        className="space-y-4"
      >
        <Input
          label="名前"
          value={v.name}
          change={(x) => set({ ...v, name: x })}
        />
        <label className="block font-bold">
          性別
          <select
            value={v.gender}
            onChange={(x) =>
              set({ ...v, gender: x.target.value as Athlete["gender"] })
            }
            className="input"
          >
            <option value="male">男性</option>
            <option value="female">女性</option>
            <option value="other">その他</option>
          </select>
        </label>
        <Input
          label="生年月日"
          type="date"
          value={v.birthDate}
          change={(x) => set({ ...v, birthDate: x })}
        />
        <Input label="所属" value={v.club} placeholder="例: ○○スイミング" change={(x) => set({ ...v, club: x })} />
        <div><Input label="Results競技者ID" value={v.resultsAthleteId} placeholder="例: 58432728" change={(x) => set({ ...v, resultsAthleteId: x })} /><p className="mt-1 text-xs text-slate-500">個人成績URLの「/athletes/」以降の数字を入力します。</p></div>
        {e && <p className="text-sm text-rose-600">{e}</p>}
        {athlete && <div className="rounded-2xl border border-rose-100 bg-rose-50 p-4"><p className="font-bold text-rose-700">危険な操作</p><p className="mt-1 text-sm text-rose-700">削除すると関連するレース・練習記録にも影響します。</p><button type="button" onClick={() => setConfirmingDelete(true)} disabled={saving} className="mt-3 w-full rounded-xl bg-rose-600 px-4 py-3 font-bold text-white disabled:opacity-60">選手を削除</button></div>}
        <div className="grid grid-cols-2 gap-3 pt-2"><button type="button" onClick={close} disabled={saving} className="rounded-xl border border-slate-200 px-4 py-3 font-bold disabled:opacity-60">キャンセル</button><button type="submit" disabled={saving} className="rounded-xl bg-pool px-4 py-3 font-bold text-white disabled:opacity-60">{saving ? "保存中..." : athlete ? "更新" : "登録"}</button></div>
      </form>
      {confirmingDelete && athlete && <div className="fixed inset-0 z-30 flex items-end bg-slate-950/40 p-4"><div className="mx-auto w-full max-w-md rounded-2xl bg-white p-5"><p className="text-sm font-bold text-rose-600">危険な操作</p><h2 className="mt-1 text-lg font-black">本当に選手を削除しますか？</h2><p className="mt-3 font-bold">{athlete.name}</p><p className="mt-2 text-sm text-slate-600">関連するレース記録・練習記録にも影響する可能性があります。</p><p className="mt-1 text-sm text-rose-600">この操作は元に戻せません。</p>{deleteError && <p className="mt-3 text-sm font-bold text-rose-600">削除できませんでした</p>}<div className="mt-5 grid grid-cols-2 gap-3"><button type="button" onClick={() => { setConfirmingDelete(false); setDeleteError(false); }} disabled={isDeleting} className="rounded-xl border border-slate-200 px-4 py-3 font-bold">キャンセル</button><button type="button" onClick={deleteAthlete} disabled={isDeleting} className="rounded-xl bg-rose-600 px-4 py-3 font-bold text-white disabled:opacity-70">{isDeleting ? "削除中..." : "削除"}</button></div></div></div>}
    </Modal>
  );
}
type SplitTimeParts = { minute: string; second: string; centis: string };

const formatSplitTime = ({ minute, second, centis }: SplitTimeParts) =>
  `${minute ? `${minute}:` : ""}${second}.${centis}`;
const splitTimeParts = (time = ""): SplitTimeParts => {
  const [first, afterMinute] = time.split(":");
  const [second = "", centis = ""] = (afterMinute ?? first).split(".");
  return { minute: afterMinute === undefined ? "" : first, second, centis };
};
const splitTimeToCentis = (time: string) => {
  const [minutesOrSeconds, seconds] = time.split(":");
  return Math.round((seconds === undefined ? Number(minutesOrSeconds) : Number(minutesOrSeconds) * 60 + Number(seconds)) * 100);
};
const splitPointsForEvent = (event: string) => {
  const distance = Number(event.match(/^(\d+)m/)?.[1] ?? 0);
  if (!distance) return [];
  return Array.from({ length: Math.ceil(distance / 50) }, (_, index) => Math.min((index + 1) * 50, distance));
};

function RaceModal({
  athleteId,
  races,
  close,
  saved,
  editing,
}: {
  athleteId: string;
  races: Race[];
  close: () => void;
  saved: (r: Race) => void;
  editing?: EditableRace;
}) {
  const [v, set] = useState({
      date: editing?.date ?? new Date().toISOString().slice(0, 10),
      meetName: editing?.meetName ?? "",
      event: editing?.event ?? "",
      course: editing?.course ?? "SCM" as "SCM" | "LCM",
      time: editing?.time ?? "",
      rt: editing?.rt ?? "",
      rank: editing?.rank?.toString() ?? "",
    }),
    [e, setE] = useState<Record<string, string>>({}),
    [isSaving, setIsSaving] = useState(false),
    [splitParts, setSplitParts] = useState<Record<number, SplitTimeParts>>(() => Object.fromEntries((editing?.splits ?? []).map((split) => [split.distanceM, splitTimeParts(split.time)]))),
    [timeParts, setTimeParts] = useState(() => splitTimeParts(editing?.time));
  const splitPoints = splitPointsForEvent(v.event);
  const splitTimeStrings: Record<number, string> = Object.fromEntries(
    splitPoints.map((distanceM) => [distanceM, formatSplitTime(splitParts[distanceM] ?? { minute: "", second: "", centis: "" })]),
  );
  const recent = [...new Set(races.map((r) => r.event))].slice(0, 5);
  const put = async () => {
    if (isSaving) return;
    const errors: Record<string, string> = {};
    for (const k of ["date", "meetName", "event", "time"] as const)
      if (!v[k]) errors[k] = "必須項目です";
    if (v.time && !/^(?:\d{1,2}:)?\d{1,2}\.\d{2}$/.test(v.time))
      errors.time = "58.24 または 1:08.24 形式で入力";
    if (v.rt && !/^\d+(?:\.\d{1,2})?$/.test(v.rt))
      errors.rt = "RTは小数第2位までの数値で入力してください";
    if (v.rank && (!/^\d+$/.test(v.rank) || +v.rank < 1))
      errors.rank = "1以上の整数で入力";
    const enteredSplits = splitPoints
      .map((distanceM) => ({ distanceM, time: splitTimeStrings[distanceM] ?? "." }))
      .filter((split) => split.time !== ".");
    if (enteredSplits.length && enteredSplits.length !== splitPoints.length)
      errors.splits = "通過タイムをすべて入力してください";
    else if (enteredSplits.length === splitPoints.length && enteredSplits.length) {
      const splitCentis = enteredSplits.map((split) => splitTimeToCentis(split.time));
      if (splitCentis.some((time, index) => index > 0 && time <= splitCentis[index - 1]))
        errors.splits = "通過タイムは昇順で入力してください";
      else if (v.time && Number.isFinite(splitTimeToCentis(v.time)) && splitCentis.at(-1)! > splitTimeToCentis(v.time))
        errors.splits = "最終通過タイムが記録を超えています";
    }
    setE(errors);
    if (Object.keys(errors).length) return;
    setIsSaving(true);
    try {
      const r = await fetch(editing ? `/api/races/${editing.id}` : "/api/races", {
        method: editing ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...v, athleteId, ...(v.rt ? { rt: v.rt } : {}), rank: v.rank ? +v.rank : undefined, splits: splitPoints.map((distanceM) => ({ distanceM, time: splitTimeStrings[distanceM] ?? "." })).filter((split) => split.time !== ".") }),
      });
      if (!r.ok) { setE({ form: "保存できませんでした" }); return; }
      const result = (await r.json()) as {
      isPersonalBest: boolean;
      improvement: number | null;
      };
      if (!editing && result.isPersonalBest && result.improvement !== null) window.alert(`自己ベスト更新！\n前回ベストより${result.improvement.toFixed(2)}秒更新`);
      window.alert(editing ? "更新完了" : "登録完了");
      saved({ id: editing?.id ?? crypto.randomUUID(), ...v, rt: v.rt || undefined, rank: v.rank ? +v.rank : undefined });
    } catch { setE({ form: "保存できませんでした" }); } finally { setIsSaving(false); }
  };
  return (
    <Modal title={editing ? "レースを編集" : "レースを登録"} close={close}>
      <div className="space-y-4">
        <div>
          <b>最近使用した種目</b>
          <div className="mt-2 flex flex-wrap gap-2">
            {recent.map((x) => (
              <button
                key={x}
                onClick={() => set({ ...v, event: x })}
                className="rounded-full bg-sky-50 px-3 py-2 text-sm text-pool"
              >
                {x}
              </button>
            ))}
          </div>
        </div>
        <Input
          label="開催日"
          type="date"
          value={v.date}
          error={e.date}
          change={(x) => set({ ...v, date: x })}
        />
        <Input
          label="大会名"
          value={v.meetName}
          error={e.meetName}
          change={(x) => set({ ...v, meetName: x })}
        />
        <label className="block font-bold">
          水路種別
          <select
            value={v.course}
            onChange={(x) =>
              set({ ...v, course: x.target.value as "SCM" | "LCM" })
            }
            className="input"
          >
            <option value="SCM">短水路 (SCM)</option>
            <option value="LCM">長水路 (LCM)</option>
          </select>
        </label>
        <label className="block font-bold">
          種目
          <select
            value={v.event}
            onChange={(x) => set({ ...v, event: x.target.value })}
            className="input"
          >
            <option value="">選択してください</option>
            {Object.entries(groups).map(([g, items]) => (
              <optgroup key={g} label={g}>
                {items.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </optgroup>
            ))}
          </select>
          {e.event && <Err t={e.event} />}
        </label>
        <div><p className="font-bold">記録</p><div className="mt-1 grid grid-cols-3 gap-2 text-xs text-slate-500"><span>分</span><span>秒</span><span>1/100秒</span></div><div className="grid grid-cols-3 gap-2"><input className="input" inputMode="numeric" placeholder="0" value={timeParts.minute} onChange={(x)=>{const n={...timeParts,minute:x.target.value};setTimeParts(n);set({...v,time:`${n.minute?`${n.minute}:`:""}${n.second}.${n.centis}`})}} /><input className="input" inputMode="numeric" placeholder="20" value={timeParts.second} onChange={(x)=>{const n={...timeParts,second:x.target.value};setTimeParts(n);set({...v,time:`${n.minute?`${n.minute}:`:""}${n.second}.${n.centis}`})}} /><input className="input" inputMode="numeric" placeholder="31" value={timeParts.centis} onChange={(x)=>{const n={...timeParts,centis:x.target.value};setTimeParts(n);set({...v,time:`${n.minute?`${n.minute}:`:""}${n.second}.${n.centis}`})}} /></div>{e.time&&<Err t={e.time}/>}</div>
        {(() => {
          const points = splitPoints;
          return points.length ? (
            <div className="space-y-3">
              <p className="font-bold">通過タイム</p>
              {points.map((point) => {
                const parts = splitParts[point] ?? { minute: "", second: "", centis: "" };
                return (
                  <div key={point}>
                    <p className="mb-1 text-sm font-bold">{point}m</p>
                    <div className="grid grid-cols-3 gap-2">
                      <input className="input" inputMode="numeric" placeholder={"\u5206"} value={parts.minute} onChange={(event) => setSplitParts((current) => ({ ...current, [point]: { ...(current[point] ?? { minute: "", second: "", centis: "" }), minute: event.target.value } }))} />
                      <input className="input" inputMode="numeric" placeholder={"\u79d2"} value={parts.second} onChange={(event) => setSplitParts((current) => ({ ...current, [point]: { ...(current[point] ?? { minute: "", second: "", centis: "" }), second: event.target.value } }))} />
                      <input className="input" inputMode="numeric" placeholder="1/100" value={parts.centis} onChange={(event) => setSplitParts((current) => ({ ...current, [point]: { ...(current[point] ?? { minute: "", second: "", centis: "" }), centis: event.target.value } }))} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null;
        })()}
        {e.splits && <Err t={e.splits} />}
        <Input
          label="リアクションタイム（任意）"
          value={v.rt}
          error={e.rt}
          placeholder="例: 0.68"
          change={(x) => set({ ...v, rt: x })}
        />
        <Input
          label="順位（任意）"
          type="number"
          min="1"
          step="1"
          value={v.rank}
          error={e.rank}
          change={(x) => set({ ...v, rank: x })}
        />
        {e.form && <Err t={e.form} />}
        <Save onClick={put} disabled={isSaving} label={isSaving ? "保存中..." : editing ? "更新" : "保存"} />
      </div>
    </Modal>
  );
}
function Modal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-20 bg-slate-950/40">
      <div className="absolute inset-x-0 bottom-0 mx-auto max-h-[92dvh] max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 pb-28">
        <div className="mb-5 flex justify-between">
          <h2 className="text-xl font-black">{title}</h2>
          <button onClick={close}>
            <X />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
function Input(p: {
  label: string;
  value: string;
  change: (v: string) => void;
  type?: string;
  error?: string;
  min?: string;
  step?: string;
  placeholder?: string;
}) {
  return (
    <label className="block font-bold">
      {p.label}
      <input
        type={p.type ?? "text"}
        min={p.min}
          step={p.step}
          placeholder={p.placeholder}
        value={p.value}
        onChange={(e) => p.change(e.target.value)}
        className="input"
      />
      {p.error && <Err t={p.error} />}
    </label>
  );
}
function Err({ t }: { t: string }) {
  return <span className="mt-1 block text-xs text-rose-600">{t}</span>;
}
function Save({ onClick, disabled = false, label = "保存する" }: { onClick?: () => void; disabled?: boolean; label?: string }) {
  return (
    <button
      type={onClick ? "button" : "submit"}
      onClick={onClick}
      disabled={disabled}
      className="fixed bottom-0 left-0 right-0 mx-auto max-w-md bg-pool p-4 pb-[max(1rem,env(safe-area-inset-bottom))] font-bold text-white disabled:cursor-not-allowed disabled:opacity-70"
    >
      {label}
    </button>
  );
}
