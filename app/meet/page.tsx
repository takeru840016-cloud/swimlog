"use client";

import { useEffect, useState } from "react";

type Race = {
  id: string;
  date: string;
  meetName: string;
  event: string;
  course: "SCM" | "LCM";
  time: string;
  rt?: string;
  rank?: number;
};
type MeetRace = Race & { isPersonalBest: boolean };

type Meet = {
  date: string;
  meetName: string;
  races: MeetRace[];
};

export default function MeetDetail() {
  const [meet, setMeet] = useState<Meet | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const key = new URLSearchParams(location.search).get("id");
    const separator = key?.indexOf("::") ?? -1;
    const athleteId = localStorage.getItem("swimlog:active-athlete");
    if (!key || separator < 0 || !athleteId) return setError(true);
    const date = key.slice(0, separator);
    const meetName = key.slice(separator + 2);
    fetch(`/api/races?athleteId=${athleteId}`)
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((races: Race[]) => {
        const bestTimes = races.reduce<Record<string, number>>((all, race) => {
          const key = `${race.event}::${race.course}`;
          const time = seconds(race.time);
          if (all[key] === undefined || time < all[key]) all[key] = time;
          return all;
        }, {});
        const meetRaces = races.filter((race) => race.date === date && race.meetName === meetName).map((race) => ({ ...race, isPersonalBest: seconds(race.time) === bestTimes[`${race.event}::${race.course}`] }));
        if (!meetRaces.length) return setError(true);
        setMeet({ date, meetName, races: meetRaces });
      })
      .catch(() => setError(true));
  }, []);

  const goBack = () => {
    if (history.length > 1) history.back();
    else location.href = "/";
  };

  if (error) return <main className="mx-auto max-w-md p-5">大会詳細を取得できませんでした。</main>;
  if (!meet) return <main className="mx-auto max-w-md p-5">読み込み中...</main>;
  const highestRank = meet.races.reduce<number | null>((best, race) => race.rank && (best === null || race.rank < best) ? race.rank : best, null);
  const bestRaces = Array.from(new Map(meet.races.filter((race) => race.isPersonalBest).map((race) => [`${race.event}::${race.course}`, race])).values());

  return <main className="mx-auto min-h-dvh max-w-md bg-slate-50 px-4 pb-4 pt-[max(2.5rem,calc(env(safe-area-inset-top)+1.25rem))]">
    <button onClick={goBack} className="text-sm font-bold text-pool">← 戻る</button>
    <section className="card mt-4"><h1 className="text-2xl font-black">{meet.meetName}</h1><p className="mt-2 text-slate-500">{meet.date}</p><h2 className="mt-4 font-black">大会サマリー</h2><div className="mt-2 grid grid-cols-3 gap-2"><div className="rounded-xl bg-sky-50 p-3"><p className="text-xs text-slate-500">出場種目</p><p className="mt-1 text-xl font-black text-pool">{meet.races.length}</p></div><div className="rounded-xl bg-sky-50 p-3"><p className="text-xs text-slate-500">最高順位</p><p className="mt-1 text-xl font-black text-pool">{highestRank ? `${highestRank}位` : "—"}</p></div><div className="rounded-xl bg-sky-50 p-3"><p className="text-xs text-slate-500">ベスト更新</p><p className="mt-1 text-xl font-black text-pool">{bestRaces.length}種目</p></div></div></section>
    <section className="card mt-4"><h2 className="font-black">ベスト更新</h2>{bestRaces.length ? <div className="mt-2 space-y-1">{bestRaces.map((race) => <p key={race.id} className="text-sm font-bold">★ {race.event}（{race.course}）</p>)}</div> : <p className="mt-2 text-sm text-slate-400">ベスト更新なし</p>}</section>
    <section className="card mt-4 overflow-hidden p-0">{meet.races.map((race) => <a key={race.id} href={`/race/?id=${race.id}`} className="flex items-center justify-between border-b px-4 py-3 last:border-b-0"><div><p className="font-bold">{race.event}{race.isPersonalBest && <span className="ml-2 text-xs text-amber-500">★ BEST</span>}</p>{race.rt && <p className="mt-1 text-xs text-slate-400">RT {race.rt}</p>}</div><div className="text-right"><p className="text-xl font-black text-pool">{race.time}</p>{race.rank && <p className="text-xs text-slate-400">{race.rank}位</p>}</div></a>)}</section>
  </main>;
}

function seconds(value: string) {
  const [minutes, secondsPart] = value.split(":");
  return secondsPart === undefined ? Number(minutes) : Number(minutes) * 60 + Number(secondsPart);
}
