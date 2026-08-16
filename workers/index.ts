export interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  ASSETS: Fetcher;
  PIN_LOCKS: KVNamespace;
  ADMIN_PIN_HASH: string;
  ENTRY_PIN_HASH: string;
  DISCORD_WEBHOOK_URL: string;
  ENVIRONMENT?: string;
}
type Course = "SCM" | "LCM";
type RaceInput = {
  id?: string;
  athleteId: string;
  date: string;
  meetName: string;
  course: Course;
  event: string;
  time: string;
  rt?: string;
  rank?: number;
  splits?: { distanceM: number; time: string }[];
};
type AthleteInput = {
  name: string;
  gender: "male" | "female" | "other";
  birthDate: string;
  club?: string;
  resultsAthleteId?: string;
};
type PracticeInput = {
  id?: string;
  athleteId: string;
  date: string;
  event: string;
  course: Course;
  time: string;
  rt?: string;
  splits?: { distanceM: number; time: string }[];
  note?: string;
};
type StandardInput = {
  id?: string;
  effectiveYear: number;
  system: "JO" | "grade";
  gender: "male" | "female" | "other";
  minAge: number;
  maxAge: number;
  course: Course;
  event: string;
  label: string;
  targetCentis: number;
};
const json = (body: unknown, status = 200, extraHeaders: HeadersInit = {}) =>
  Response.json(body, {
    status,
    headers: { "Access-Control-Allow-Origin": "*", ...extraHeaders },
  });
const adminSessionSeconds = 60 * 60 * 2;
const pinMaxFailures = 5;
const pinLockDurations = [15 * 60 * 1000, 60 * 60 * 1000, 24 * 60 * 60 * 1000, 7 * 24 * 60 * 60 * 1000];
type PinAttempt = { failures: number; lockedUntil: number; lockStage: number };
const encoder = new TextEncoder();
const toBase64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
const fromBase64Url = (value: string) => {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
};
const timingSafeEqual = (left: string, right: string) => {
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1)
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  return difference === 0;
};
const sha256 = async (value: string) => new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
const hmacKey = (secret: string) => crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
const signAdminPayload = async (payload: string, secret: string) =>
  toBase64Url(new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(payload))));
const hasValidAdminSession = async (request: Request, secret: string) => {
  const token = request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith("swimlog_admin="))?.slice("swimlog_admin=".length);
  if (!token) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;
  const expectedSignature = await signAdminPayload(payload, secret);
  if (!timingSafeEqual(signature, expectedSignature)) return false;
  try {
    return Number(new TextDecoder().decode(fromBase64Url(payload))) > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
};
const hasValidEntrySession = async (request: Request, secret: string) => {
  const token = request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith("swimlog_entry="))?.slice("swimlog_entry=".length);
  if (!token) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;
  const expectedSignature = await signAdminPayload(payload, secret);
  if (!timingSafeEqual(signature, expectedSignature)) return false;
  try { return Number(new TextDecoder().decode(fromBase64Url(payload))) > Math.floor(Date.now() / 1000); } catch { return false; }
};
const adminCookie = (token: string, secure: boolean) =>
  `swimlog_admin=${token}; Path=/; Max-Age=${adminSessionSeconds}; HttpOnly; SameSite=Strict${secure ? "; Secure" : ""}`;
const entryCookie = (token: string, secure: boolean) =>
  `swimlog_entry=${token}; Path=/; Max-Age=${adminSessionSeconds}; HttpOnly; SameSite=Strict${secure ? "; Secure" : ""}`;
const expiredAdminCookie = (secure: boolean) =>
  `swimlog_admin=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict${secure ? "; Secure" : ""}`;
const expiredEntryCookie = (secure: boolean) =>
  `swimlog_entry=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict${secure ? "; Secure" : ""}`;
const sessionExpiresAt = (request: Request, cookieName: "swimlog_admin" | "swimlog_entry") => {
  const token = request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  const payload = token?.split(".")[0];
  if (!payload) return undefined;
  try { return Number(new TextDecoder().decode(fromBase64Url(payload))) * 1000 || undefined; } catch { return undefined; }
};
const deviceIdForRequest = (request: Request) => {
  const deviceId = request.headers.get("x-swimlog-device-id")?.trim();
  return deviceId && deviceId.length <= 128 ? deviceId : undefined;
};
const readPinAttempt = async (locks: KVNamespace, deviceId: string) => {
  const value = await locks.get(deviceId);
  if (!value) return undefined;
  try {
    const stored = JSON.parse(value) as Partial<PinAttempt>;
    if (typeof stored.failures !== "number" || typeof stored.lockedUntil !== "number") throw new Error("invalid PIN lock data");
    return { failures: stored.failures, lockedUntil: stored.lockedUntil, lockStage: typeof stored.lockStage === "number" ? stored.lockStage : 0 };
  } catch {
    await locks.delete(deviceId);
    return undefined;
  }
};
const lockForDevice = async (locks: KVNamespace, deviceId: string) => {
  const attempt = await readPinAttempt(locks, deviceId);
  if (!attempt || attempt.lockedUntil <= Date.now()) {
    if (attempt && attempt.lockedUntil) await locks.put(deviceId, JSON.stringify({ ...attempt, failures: 0, lockedUntil: 0 } satisfies PinAttempt));
    return undefined;
  }
  return attempt.lockedUntil;
};
const lockDurationForStage = (stage: number) => pinLockDurations[Math.min(Math.max(stage, 1), pinLockDurations.length) - 1];
const lockDurationLabel = (stage: number) => ["15分", "1時間", "24時間", "7日"][Math.min(Math.max(stage, 1), 4) - 1];
type ClientInfo = { device: string; os: string; browser: string; country?: string; environment: string };
const workerEnvironment = (request: Request, env: Env) => {
  const hostname = new URL(request.url).hostname;
  if (["localhost", "127.0.0.1", "::1"].includes(hostname)) return "\u{1F7E1} DEVELOPMENT";
  return env.ENVIRONMENT?.trim().toUpperCase() === "DEVELOPMENT" ? "\u{1F7E1} DEVELOPMENT" : "\u{1F7E2} PRODUCTION";
};
const clientInfoForRequest = (request: Request, env: Env): ClientInfo => {
  const userAgent = request.headers.get("user-agent") ?? "";
  const device = /iPhone/i.test(userAgent) ? "iPhone" : /iPad/i.test(userAgent) ? "iPad" : /Android/i.test(userAgent) ? "Android" : /Windows/i.test(userAgent) ? "Windows PC" : /Macintosh|Mac OS X/i.test(userAgent) ? "Mac" : "\u4e0d\u660e";
  const ios = userAgent.match(/(?:iPhone|CPU) OS ([\d_]+)/i)?.[1]?.replaceAll("_", ".");
  const android = userAgent.match(/Android ([\d.]+)/i)?.[1];
  const macos = userAgent.match(/Mac OS X ([\d_]+)/i)?.[1]?.replaceAll("_", ".");
  const os = ios ? `iOS ${ios}` : android ? `Android ${android}` : /Windows/i.test(userAgent) ? "Windows" : macos ? `macOS ${macos}` : "\u4e0d\u660e";
  const browser = /Edg\//i.test(userAgent) ? "Edge" : /Firefox\//i.test(userAgent) ? "Firefox" : /(?:Chrome|CriOS)\//i.test(userAgent) ? "Chrome" : /Safari\//i.test(userAgent) ? "Safari" : "\u4e0d\u660e";
  const country = typeof request.cf?.country === "string" ? request.cf.country : request.headers.get("cf-ipcountry") ?? undefined;
  return { device, os, browser, country, environment: workerEnvironment(request, env) };
};
const jstTimestamp = () => new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace("T", " ").slice(0, 16) + " JST";
const clientNotificationDetails = (deviceId: string, client: ClientInfo) =>
  `\u74b0\u5883: ${client.environment}\n\u7aef\u672b: ${client.device} / ${client.os} / ${client.browser}\n\u56fd: ${client.country ?? "-"}\n\u7aef\u672bID: ${deviceId}\n\u6642\u523b: ${jstTimestamp()}\n\n`;
const sendDiscordNotification = async (webhookUrl: string | undefined, content: string) => {
  if (!webhookUrl) return;
  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content }),
    });
  } catch {
    // PIN\u8a8d\u8a3c\u306e\u5fdc\u7b54\u306f\u901a\u77e5\u5931\u6557\u306e\u5f71\u97ff\u3092\u53d7\u3051\u306a\u3044\u3002
  }
};
const notifyPinLock = async (webhookUrl: string | undefined, mode: "\u7ba1\u7406" | "\u8ffd\u52a0", deviceId: string, lockStage: number, client: ClientInfo) =>
  sendDiscordNotification(webhookUrl, `\ud83d\udea8 PIN\u8a8d\u8a3c\u5931\u6557\n\u30e2\u30fc\u30c9: ${mode}\n\u5931\u6557: ${pinMaxFailures}\u56de\n\u6bb5\u968e: ${lockStage}\n\u30ed\u30c3\u30af: ${lockDurationLabel(lockStage)}\n${clientNotificationDetails(deviceId, client)}`);
const notifyPinSuccess = async (webhookUrl: string | undefined, mode: "\u7ba1\u7406" | "\u8ffd\u52a0", deviceId: string, client: ClientInfo) =>
  sendDiscordNotification(webhookUrl, `\u2705 ${mode}\u30e2\u30fc\u30c9\u8a8d\u8a3c\u6210\u529f\n${clientNotificationDetails(deviceId, client)}`);
const recordPinFailure = async (locks: KVNamespace, deviceId: string, mode: "管理" | "追加", request: Request, env: Env) => {
  const attempt = await readPinAttempt(locks, deviceId);
  const failures = attempt?.failures ?? 0;
  const nextFailures = failures + 1;
  if (nextFailures < pinMaxFailures) {
    await locks.put(deviceId, JSON.stringify({ failures: nextFailures, lockedUntil: 0, lockStage: attempt?.lockStage ?? 0 } satisfies PinAttempt));
    return undefined;
  }
  const lockStage = (attempt?.lockStage ?? 0) + 1;
  const lockedUntil = Date.now() + lockDurationForStage(lockStage);
  await locks.put(deviceId, JSON.stringify({ failures: nextFailures, lockedUntil, lockStage } satisfies PinAttempt));
  await notifyPinLock(env.DISCORD_WEBHOOK_URL, mode, deviceId, lockStage, clientInfoForRequest(request, env));
  return lockedUntil;
};
const lockedPinResponse = (lockedUntil: number) =>
  json({ error: "PIN認証は一時的にロックされています", retryAfterSeconds: Math.max(1, Math.ceil((lockedUntil - Date.now()) / 1000)) }, 429);
const toCentis = (v: string) => {
  const [m, s] = v.split(":");
  return Math.round(
    (s === undefined ? Number(m) : Number(m) * 60 + Number(s)) * 100,
  );
};
const formatTime = (n: number) =>
  `${Math.floor(n / 6000)}:${((n % 6000) / 100).toFixed(2).padStart(5, "0")}`.replace(
    /^0:/,
    "",
  );
const ageOnDate = (birthDate: string, date: string) => {
  const [birthYear, birthMonth, birthDay] = birthDate.split("-").map(Number);
  const [year, month, day] = date.split("-").map(Number);
  return year - birthYear - (month < birthMonth || (month === birthMonth && day < birthDay) ? 1 : 0);
};

class AthleteRepository {
  constructor(private readonly db: D1Database) {}
  async list() {
    const { results } = await this.db
      .prepare(
        "SELECT id, name, gender, birth_date as birthDate, club, results_athlete_id as resultsAthleteId, created_at as createdAt FROM athletes ORDER BY created_at DESC",
      )
      .all();
    return results;
  }
  async get(id: string) {
    return this.db.prepare("SELECT id, name, gender, birth_date as birthDate, club, results_athlete_id as resultsAthleteId, created_at as createdAt FROM athletes WHERE id=?").bind(id).first<{ id: string; name: string; gender: StandardInput["gender"]; birthDate: string; club: string | null; resultsAthleteId: string | null; createdAt: string }>();
  }
  async create(input: AthleteInput) {
    const id = crypto.randomUUID();
    await this.db
      .prepare(
          "INSERT INTO athletes(id,name,gender,birth_date,club,results_athlete_id) VALUES(?,?,?,?,?,?)",
        )
      .bind(id, input.name.trim(), input.gender, input.birthDate, input.club?.trim() || null, input.resultsAthleteId?.trim() || null)
      .run();
    return { id, name: input.name.trim(), gender: input.gender, birthDate: input.birthDate, club: input.club?.trim() || null, resultsAthleteId: input.resultsAthleteId?.trim() || null, createdAt: new Date().toISOString() };
  }
  async update(id: string, input: AthleteInput) {
    const result = await this.db
      .prepare("UPDATE athletes SET name=?, gender=?, birth_date=?, club=?, results_athlete_id=? WHERE id=?")
      .bind(input.name.trim(), input.gender, input.birthDate, input.club?.trim() || null, input.resultsAthleteId?.trim() || null, id)
      .run();
    if (!result.meta.changes) return null;
    return this.get(id);
  }
  async exists(id: string) {
    return Boolean(
      await this.db
        .prepare("SELECT 1 FROM athletes WHERE id=?")
        .bind(id)
      .first(),
    );
  }
  async remove(id: string) {
    if (!(await this.exists(id))) return false;
    await this.db.batch([
      this.db.prepare("DELETE FROM splits WHERE race_id IN (SELECT id FROM races WHERE athlete_id=?)").bind(id),
      this.db.prepare("DELETE FROM races WHERE athlete_id=?").bind(id),
      this.db.prepare("DELETE FROM athletes WHERE id=?").bind(id),
    ]);
    return true;
  }
}
class RaceRepository {
  constructor(
    private readonly db: D1Database,
    private readonly athletes: AthleteRepository,
  ) {}
  async list(athleteId: string, includeQualifications = false) {
    const { results } = await this.db
      .prepare("SELECT * FROM races WHERE athlete_id=? ORDER BY race_date DESC")
      .bind(athleteId)
      .all();
    const races = results.map((r: any) => ({
      id: r.id,
      date: r.race_date,
      meetName: r.meet_name,
      event: r.event,
      course: r.course,
      time: formatTime(r.record_centis),
      rt: r.rt_centis ? (r.rt_centis / 100).toFixed(2) : undefined,
      rank: r.rank,
      isPersonalBest: false,
    }));
    if (!includeQualifications) return races;
    const athlete = await this.athletes.get(athleteId);
    if (!athlete) return races;
    return Promise.all(races.map(async (race) => ({ ...race, qualification: await this.qualificationForRace(athlete, race, results.find((row: any) => row.id === race.id)!.record_centis) })));
  }
  private async qualificationForRace(athlete: { gender: StandardInput["gender"]; birthDate: string }, race: { date: string; event: string; course: string }, recordCentis: number) {
    const year = Number(race.date.split("-")[0]);
    const age = ageOnDate(athlete.birthDate, race.date);
    const { results } = await this.db.prepare(
      `SELECT label,target_centis as targetCentis FROM qualification_standards
       WHERE system='grade' AND gender=?
         AND effective_year=COALESCE((SELECT effective_year FROM qualification_standards WHERE effective_year=? LIMIT 1), (SELECT MAX(effective_year) FROM qualification_standards))
         AND min_age<=? AND max_age>=? AND course=? AND event=?
       ORDER BY CAST(label AS INTEGER) DESC`,
    ).bind(athlete.gender, year, age, age, race.course, race.event).all<{ label: string; targetCentis: number }>();
    const grade = (label: string) => Number(label.replace(/[^0-9]/g, "")) || 0;
    const current = results.find((standard) => recordCentis <= standard.targetCentis);
    if (!current) return undefined;
    const next = results.filter((standard) => grade(standard.label) > grade(current.label)).sort((left, right) => grade(left.label) - grade(right.label))[0];
    return { label: current.label, nextLabel: next?.label, nextGapCentis: next ? recordCentis - next.targetCentis : undefined, isHighest: !next };
  }
  async detail(id: string) {
    const race = await this.db.prepare("SELECT * FROM races WHERE id=?").bind(id).first<any>();
    if (!race) return null;
    const { results: splits } = await this.db.prepare("SELECT distance_m as distanceM,time_centis as timeCentis FROM splits WHERE race_id=? ORDER BY distance_m").bind(id).all();
    const athlete = await this.athletes.get(race.athlete_id);
    const qualification = athlete
      ? await this.qualificationForRace(athlete, { date: race.race_date, event: race.event, course: race.course }, race.record_centis)
      : undefined;
    return { id: race.id, athleteName: athlete?.name, date: race.race_date, meetName: race.meet_name, event: race.event, course: race.course, time: formatTime(race.record_centis), rt: race.rt_centis ? (race.rt_centis / 100).toFixed(2) : undefined, rank: race.rank, qualification, splits: splits.map((s:any) => ({ distanceM:s.distanceM, time:formatTime(s.timeCentis) })) };
  }
  async create(input: RaceInput) {
    if (!input.athleteId || !(await this.athletes.exists(input.athleteId)))
      throw new Error("ATHLETE_NOT_FOUND");
    const id = input.id ?? crypto.randomUUID(),
      record = toCentis(input.time);
    const best = await this.db
      .prepare(
        "SELECT MIN(record_centis) as best FROM races WHERE athlete_id=? AND event=? AND course=?",
      )
      .bind(input.athleteId, input.event, input.course)
      .first<{ best: number | null }>();
    const previousBest = best?.best ?? null,
      isPersonalBest = previousBest !== null && record < previousBest;
    const statements = [
      this.db
        .prepare(
          "INSERT INTO races(id,athlete_id,race_date,meet_name,course,event,record_centis,rt_centis,rank) VALUES(?,?,?,?,?,?,?,?,?)",
        )
        .bind(
          id,
          input.athleteId,
          input.date,
          input.meetName,
          input.course,
          input.event,
          record,
          input.rt ? toCentis(input.rt) : null,
          input.rank ?? null,
        ),
      ...(input.splits ?? []).map((s, i) =>
        this.db
          .prepare(
            "INSERT INTO splits(id,race_id,leg_number,distance_m,time_centis) VALUES(?,?,?,?,?)",
          )
          .bind(crypto.randomUUID(), id, i + 1, s.distanceM, toCentis(s.time)),
      ),
    ];
    await this.db.batch(statements);
    return {
      id,
      isPersonalBest,
      previousBest: previousBest === null ? null : previousBest / 100,
      improvement: isPersonalBest ? (previousBest - record) / 100 : null,
    };
  }
  async update(id: string, input: RaceInput) {
    if (!(await this.db.prepare("SELECT 1 FROM races WHERE id=?").bind(id).first()))
      return null;
    const statements = [
      this.db
        .prepare(
          "UPDATE races SET race_date=?,meet_name=?,course=?,event=?,record_centis=?,rt_centis=?,rank=? WHERE id=?",
        )
        .bind(
          input.date,
          input.meetName,
          input.course,
          input.event,
          toCentis(input.time),
          input.rt ? toCentis(input.rt) : null,
          input.rank ?? null,
          id,
        ),
      this.db.prepare("DELETE FROM splits WHERE race_id=?").bind(id),
      ...(input.splits ?? []).map((s, i) =>
        this.db
          .prepare(
            "INSERT INTO splits(id,race_id,leg_number,distance_m,time_centis) VALUES(?,?,?,?,?)",
          )
          .bind(crypto.randomUUID(), id, i + 1, s.distanceM, toCentis(s.time)),
      ),
    ];
    await this.db.batch(statements);
    return { id, isPersonalBest: false, improvement: null };
  }
  async remove(id: string) {
    if (!(await this.db.prepare("SELECT 1 FROM races WHERE id=?").bind(id).first()))
      return false;
    await this.db.batch([
      this.db.prepare("DELETE FROM splits WHERE race_id=?").bind(id),
      this.db.prepare("DELETE FROM races WHERE id=?").bind(id),
    ]);
    return true;
  }
}
class PracticeRepository {
  constructor(private readonly db: D1Database, private readonly athletes: AthleteRepository) {}
  async list(athleteId: string) {
    const { results } = await this.db.prepare(
      "SELECT p.id,p.athlete_id as athleteId,p.date,p.event,p.course,p.time,p.rt_centis as rtCentis,p.note,a.name as athleteName FROM practice_records p JOIN athletes a ON a.id=p.athlete_id WHERE p.athlete_id=? ORDER BY p.date DESC, p.created_at DESC",
    ).bind(athleteId).all();
    if (!results.length) return results;
    const ids = results.map((record: any) => record.id);
    const { results: splitRows } = await this.db.prepare(
      `SELECT practice_record_id as recordId,distance_m as distanceM,time_centis as timeCentis FROM practice_splits WHERE practice_record_id IN (${ids.map(() => "?").join(",")}) ORDER BY distance_m`,
    ).bind(...ids).all<any>();
    const splitsByRecord = splitRows.reduce<Record<string, { distanceM: number; time: string }[]>>((all, split) => {
      (all[split.recordId] ??= []).push({ distanceM: split.distanceM, time: formatTime(split.timeCentis) });
      return all;
    }, {});
    return results.map((record: any) => ({ ...record, rt: record.rtCentis ? formatTime(record.rtCentis) : undefined, splits: splitsByRecord[record.id] ?? [] }));
  }
  async create(input: PracticeInput) {
    if (!input.athleteId || !(await this.athletes.exists(input.athleteId))) throw new Error("ATHLETE_NOT_FOUND");
    const id = crypto.randomUUID();
    await this.db.batch([
      this.db.prepare(
        "INSERT INTO practice_records(id,athlete_id,date,event,course,time,time_centis,rt_centis,note) VALUES(?,?,?,?,?,?,?,?,?)",
      ).bind(id, input.athleteId, input.date, input.event, input.course, input.time, toCentis(input.time), input.rt ? toCentis(input.rt) : null, input.note?.trim() || null),
      ...(input.splits ?? []).map((split) => this.db.prepare(
        "INSERT INTO practice_splits(id,practice_record_id,distance_m,time_centis) VALUES(?,?,?,?)",
      ).bind(crypto.randomUUID(), id, split.distanceM, toCentis(split.time))),
    ]);
    return { id, ...input };
  }
  async update(id: string, input: PracticeInput) {
    if (!(await this.db.prepare("SELECT 1 FROM practice_records WHERE id=? AND athlete_id=?").bind(id, input.athleteId).first())) return null;
    await this.db.batch([
      this.db.prepare(
        "UPDATE practice_records SET date=?,event=?,course=?,time=?,time_centis=?,rt_centis=?,note=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND athlete_id=?",
      ).bind(input.date, input.event, input.course, input.time, toCentis(input.time), input.rt ? toCentis(input.rt) : null, input.note?.trim() || null, id, input.athleteId),
      this.db.prepare("DELETE FROM practice_splits WHERE practice_record_id=?").bind(id),
      ...(input.splits ?? []).map((split) => this.db.prepare(
        "INSERT INTO practice_splits(id,practice_record_id,distance_m,time_centis) VALUES(?,?,?,?)",
      ).bind(crypto.randomUUID(), id, split.distanceM, toCentis(split.time))),
    ]);
    return { id, ...input };
  }
  async remove(id: string) {
    if (!(await this.db.prepare("SELECT 1 FROM practice_records WHERE id=?").bind(id).first())) return false;
    await this.db.batch([
      this.db.prepare("DELETE FROM practice_splits WHERE practice_record_id=?").bind(id),
      this.db.prepare("DELETE FROM practice_records WHERE id=?").bind(id),
    ]);
    return true;
  }
}
class StandardRepository {
  constructor(private readonly db: D1Database) {}
  async list(year?: string) {
    const sql = `SELECT id,effective_year as effectiveYear,system,gender,min_age as minAge,max_age as maxAge,course,event,label,target_centis as targetCentis FROM qualification_standards${year ? " WHERE effective_year=?" : ""} ORDER BY effective_year DESC,system,event`;
    const r = year
      ? await this.db.prepare(sql).bind(Number(year)).all()
      : await this.db.prepare(sql).all();
    return r.results;
  }
  async save(v: StandardInput) {
    const id = v.id ?? crypto.randomUUID();
    await this.db
      .prepare(
        "INSERT INTO qualification_standards(id,effective_year,system,gender,min_age,max_age,course,event,label,target_centis) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET effective_year=excluded.effective_year,system=excluded.system,gender=excluded.gender,min_age=excluded.min_age,max_age=excluded.max_age,course=excluded.course,event=excluded.event,label=excluded.label,target_centis=excluded.target_centis",
      )
      .bind(
        id,
        v.effectiveYear,
        v.system,
        v.gender,
        v.minAge,
        v.maxAge,
        v.course,
        v.event,
        v.label,
        v.targetCentis,
      )
      .run();
    return { id, ...v };
  }
  async remove(id: string) {
    await this.db
      .prepare("DELETE FROM qualification_standards WHERE id=?")
      .bind(id)
      .run();
  }
  async import(rows: StandardInput[]) {
    await this.db.batch(
      rows.map((v) =>
        this.db
          .prepare(
            "INSERT INTO qualification_standards(id,effective_year,system,gender,min_age,max_age,course,event,label,target_centis) VALUES(?,?,?,?,?,?,?,?,?,?)",
          )
          .bind(
            v.id ?? crypto.randomUUID(),
            v.effectiveYear,
            v.system,
            v.gender,
            v.minAge,
            v.maxAge,
            v.course,
            v.event,
            v.label,
            v.targetCentis,
          ),
      ),
    );
    return { imported: rows.length };
  }
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "OPTIONS")
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
          "Access-Control-Allow-Headers": "content-type,x-swimlog-device-id",
        },
      });
    if (url.pathname === "/api/admin/session" && request.method === "GET") {
      const authenticated = Boolean(env.ADMIN_PIN_HASH) && await hasValidAdminSession(request, env.ADMIN_PIN_HASH);
      return json({ authenticated, expiresAt: authenticated ? sessionExpiresAt(request, "swimlog_admin") : undefined });
    }
    if (url.pathname === "/api/admin/session" && request.method === "DELETE")
      return json({ authenticated: false }, 200, { "Set-Cookie": expiredAdminCookie(url.protocol === "https:") });
    if (url.pathname === "/api/admin/session" && request.method === "POST") {
      const deviceId = deviceIdForRequest(request);
      if (!deviceId) return json({ error: "device ID is required" }, 400);
      const lockedUntil = await lockForDevice(env.PIN_LOCKS, deviceId);
      if (lockedUntil) return lockedPinResponse(lockedUntil);
      const { pin } = await request.json<{ pin?: string }>();
      if (!env.ADMIN_PIN_HASH) return json({ error: "admin authentication is unavailable" }, 503);
      const digest = await sha256(pin ?? "");
      const hex = Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
      const base64 = toBase64Url(digest);
      if (!timingSafeEqual(env.ADMIN_PIN_HASH.trim().toLowerCase(), hex) && !timingSafeEqual(env.ADMIN_PIN_HASH.trim(), base64)) {
        const lockUntil = await recordPinFailure(env.PIN_LOCKS, deviceId, "管理", request, env);
        if (lockUntil) return lockedPinResponse(lockUntil);
        return json({ error: "invalid PIN" }, 401);
      }
      await env.PIN_LOCKS.delete(deviceId);
      await notifyPinSuccess(env.DISCORD_WEBHOOK_URL, "管理", deviceId, clientInfoForRequest(request, env));
      const expiresAt = Math.floor(Date.now() / 1000) + adminSessionSeconds;
      const payload = toBase64Url(encoder.encode(String(expiresAt)));
      const token = `${payload}.${await signAdminPayload(payload, env.ADMIN_PIN_HASH)}`;
      return json({ authenticated: true, expiresAt: expiresAt * 1000 }, 200, { "Set-Cookie": adminCookie(token, url.protocol === "https:") });
    }
    if (url.pathname === "/api/entry/session" && request.method === "GET") {
      const authenticated = Boolean(env.ENTRY_PIN_HASH) && await hasValidEntrySession(request, env.ENTRY_PIN_HASH);
      return json({ authenticated, expiresAt: authenticated ? sessionExpiresAt(request, "swimlog_entry") : undefined });
    }
    if (url.pathname === "/api/entry/session" && request.method === "DELETE")
      return json({ authenticated: false }, 200, { "Set-Cookie": expiredEntryCookie(url.protocol === "https:") });
    if (url.pathname === "/api/entry/session" && request.method === "POST") {
      const deviceId = deviceIdForRequest(request);
      if (!deviceId) return json({ error: "device ID is required" }, 400);
      const lockedUntil = await lockForDevice(env.PIN_LOCKS, deviceId);
      if (lockedUntil) return lockedPinResponse(lockedUntil);
      const { pin } = await request.json<{ pin?: string }>();
      if (!env.ENTRY_PIN_HASH) return json({ error: "entry authentication is unavailable" }, 503);
      const digest = await sha256(pin ?? "");
      const hex = Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
      const base64 = toBase64Url(digest);
      if (!timingSafeEqual(env.ENTRY_PIN_HASH.trim().toLowerCase(), hex) && !timingSafeEqual(env.ENTRY_PIN_HASH.trim(), base64)) {
        const lockUntil = await recordPinFailure(env.PIN_LOCKS, deviceId, "追加", request, env);
        if (lockUntil) return lockedPinResponse(lockUntil);
        return json({ error: "invalid PIN" }, 401);
      }
      await env.PIN_LOCKS.delete(deviceId);
      await notifyPinSuccess(env.DISCORD_WEBHOOK_URL, "追加", deviceId, clientInfoForRequest(request, env));
      const expiresAt = Math.floor(Date.now() / 1000) + adminSessionSeconds;
      const payload = toBase64Url(encoder.encode(String(expiresAt)));
      const token = `${payload}.${await signAdminPayload(payload, env.ENTRY_PIN_HASH)}`;
      return json({ authenticated: true, expiresAt: expiresAt * 1000 }, 200, { "Set-Cookie": entryCookie(token, url.protocol === "https:") });
    }
    if (["POST", "PUT", "DELETE"].includes(request.method) && url.pathname.startsWith("/api/")) {
      const admin = Boolean(env.ADMIN_PIN_HASH) && await hasValidAdminSession(request, env.ADMIN_PIN_HASH);
      const entry = url.pathname === "/api/practice-records" && request.method === "POST" && Boolean(env.ENTRY_PIN_HASH) && await hasValidEntrySession(request, env.ENTRY_PIN_HASH);
      if (!admin && !entry) return json({ error: "admin authentication required" }, 401);
    }
    const athletes = new AthleteRepository(env.DB),
      races = new RaceRepository(env.DB, athletes),
      practices = new PracticeRepository(env.DB, athletes),
      standards = new StandardRepository(env.DB);
    try {
      if (url.pathname === "/api/athletes" && request.method === "GET")
        return json(await athletes.list());
      if (url.pathname === "/api/athletes" && request.method === "POST")
        return json(
          await athletes.create(await request.json<AthleteInput>()),
          201,
        );
      if (url.pathname.startsWith("/api/athletes/") && request.method === "DELETE") {
        const removed = await athletes.remove(url.pathname.split("/").pop()!);
        return removed ? new Response(null, { status: 204 }) : json({ error: "athlete not found" }, 404);
      }
      if (url.pathname.startsWith("/api/athletes/") && request.method === "PUT") {
        const athlete = await athletes.update(url.pathname.split("/").pop()!, await request.json<AthleteInput>());
        return athlete ? json(athlete) : json({ error: "athlete not found" }, 404);
      }
      if (url.pathname === "/api/races" && request.method === "GET") {
        const id = url.searchParams.get("athleteId");
        return id
          ? json(await races.list(id, url.searchParams.get("qualifications") === "1"))
          : json({ error: "athleteId is required" }, 400);
      }
      if (url.pathname.startsWith("/api/races/") && request.method === "GET") {
        const race = await races.detail(url.pathname.split("/").pop()!);
        return race ? json(race) : json({ error: "race not found" }, 404);
      }
      if (url.pathname === "/api/races" && request.method === "POST")
        return json(await races.create(await request.json<RaceInput>()), 201);
      if (url.pathname.startsWith("/api/races/") && request.method === "PUT") {
        const race = await races.update(
          url.pathname.split("/").pop()!,
          await request.json<RaceInput>(),
        );
        return race ? json(race) : json({ error: "race not found" }, 404);
      }
      if (url.pathname.startsWith("/api/races/") && request.method === "DELETE") {
        const removed = await races.remove(url.pathname.split("/").pop()!);
        return removed ? new Response(null, { status: 204 }) : json({ error: "race not found" }, 404);
      }
      if (url.pathname === "/api/practice-records" && request.method === "GET") {
        const athleteId = url.searchParams.get("athleteId");
        return athleteId ? json(await practices.list(athleteId)) : json({ error: "athleteId is required" }, 400);
      }
      if (url.pathname === "/api/practice-records" && request.method === "POST")
        return json(await practices.create(await request.json<PracticeInput>()), 201);
      if (url.pathname.startsWith("/api/practice-records/") && request.method === "PUT") {
        const practice = await practices.update(url.pathname.split("/").pop()!, await request.json<PracticeInput>());
        return practice ? json(practice) : json({ error: "practice record not found" }, 404);
      }
      if (url.pathname.startsWith("/api/practice-records/") && request.method === "DELETE") {
        const removed = await practices.remove(url.pathname.split("/").pop()!);
        return removed ? new Response(null, { status: 204 }) : json({ error: "practice record not found" }, 404);
      }
      if (url.pathname === "/api/standards" && request.method === "GET")
        return json(
          await standards.list(url.searchParams.get("year") ?? undefined),
        );
      if (url.pathname === "/api/standards" && request.method === "POST")
        return json(
          await standards.save(await request.json<StandardInput>()),
          201,
        );
      if (
        url.pathname.startsWith("/api/standards/") &&
        request.method === "PUT"
      )
        return json(
          await standards.save({
            ...(await request.json<StandardInput>()),
            id: url.pathname.split("/").pop(),
          }),
        );
      if (
        url.pathname.startsWith("/api/standards/") &&
        request.method === "DELETE"
      ) {
        await standards.remove(url.pathname.split("/").pop()!);
        return new Response(null, { status: 204 });
      }
      if (url.pathname === "/api/standards/import" && request.method === "POST")
        return json(
          await standards.import(await request.json<StandardInput[]>()),
          201,
        );
      if (
        url.pathname === "/api/standards/export" &&
        request.method === "GET"
      ) {
        const rows = (await standards.list(
          url.searchParams.get("year") ?? undefined,
        )) as any[];
        const headers = [
          "effectiveYear",
          "system",
          "gender",
          "minAge",
          "maxAge",
          "course",
          "event",
          "label",
          "targetCentis",
        ];
        return new Response(
          [
            headers.join(","),
            ...rows.map((r) =>
              headers.map((h) => JSON.stringify(r[h] ?? "")).join(","),
            ),
          ].join("\n"),
          {
            headers: {
              "content-type": "text/csv;charset=utf-8",
              "content-disposition":
                "attachment; filename=qualification-standards.csv",
            },
          },
        );
      }
    } catch {
      return json({ error: "request failed" }, 500);
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
