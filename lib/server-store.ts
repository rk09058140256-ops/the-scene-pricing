import Redis from "ioredis";
import { DayRecord } from "./types";
import { mergeDayRecords } from "./csv";

interface ServerState {
  records: DayRecord[];
  otaNames: Record<string, string>;
  lastUpdated: string | null;
  lastSource: string | null;
}

const EMPTY_STATE: ServerState = { records: [], otaNames: {}, lastUpdated: null, lastSource: null };
const REDIS_KEY = "tripla-price-store:v1";

/**
 * Vercelの「Storage」経由で接続したRedisは、REST API形式（KV_REST_API_URL/TOKEN、
 * @vercel/kv 向け）ではなく標準のRedis接続文字列（REDIS_URL、redis:// または rediss://）
 * を注入するタイプだった（実機で確認済み）。ioredisでそのまま接続する。
 * rediss:// の場合はioredisが自動でTLSを有効にする。
 */
const redisUrl = process.env.REDIS_URL;

const redisClient = redisUrl
  ? new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      connectTimeout: 5000,
      // サーバーレス関数が異常終了してもプロセス全体を巻き込んで再試行し続けないようにする
      retryStrategy: (times) => (times > 3 ? null : Math.min(times * 200, 1000))
    })
  : null;

if (redisClient) {
  redisClient.on("error", (err) => {
    console.error("[server-store] Redis connection error:", err.message);
  });
}

// Next.js の dev サーバーはファイル変更のたびにモジュールを再評価するため、
// globalThis に持たせて再評価をまたいで状態を保持する（Prisma クライアント等と同じ定石）。
// Redis未接続の環境（ローカル開発等）でのフォールバックとしても使う。
const globalStore = globalThis as unknown as { __priceServerStoreFallback?: ServerState };

function getMemoryStore(): ServerState {
  if (!globalStore.__priceServerStoreFallback) {
    globalStore.__priceServerStoreFallback = { ...EMPTY_STATE };
  }
  return globalStore.__priceServerStoreFallback;
}

async function readState(): Promise<ServerState> {
  if (!redisClient) return getMemoryStore();
  const raw = await redisClient.get(REDIS_KEY);
  if (!raw) return EMPTY_STATE;
  try {
    return JSON.parse(raw) as ServerState;
  } catch {
    return EMPTY_STATE;
  }
}

async function writeState(state: ServerState): Promise<void> {
  if (!redisClient) {
    Object.assign(getMemoryStore(), state);
    return;
  }
  await redisClient.set(REDIS_KEY, JSON.stringify(state));
}

export async function getServerState(): Promise<ServerState> {
  return readState();
}

/**
 * 受信したレコードを既存データへ upsert（日付+プラン名が一致すれば更新、無ければ追記）する。
 * 既存データを全削除して置き換えることはしない。
 */
export async function mergeIncomingRecords(
  records: DayRecord[],
  otaNames: Record<string, string>,
  source: string
): Promise<ServerState> {
  const current = await readState();
  const next: ServerState = {
    records: mergeDayRecords(current.records, records),
    otaNames: { ...current.otaNames, ...otaNames },
    lastUpdated: new Date().toISOString(),
    lastSource: source
  };
  await writeState(next);
  return next;
}

/** 指定した日付のレコードだけを削除する（誤投入したテストデータ等の掃除用）。他の日付には影響しない。 */
export async function deleteRecordsByDate(dates: string[]): Promise<ServerState> {
  const current = await readState();
  const dateSet = new Set(dates);
  const next: ServerState = {
    ...current,
    records: current.records.filter((r) => !dateSet.has(r.date))
  };
  await writeState(next);
  return next;
}

/** 接続診断用。実際の接続文字列は含めず、環境変数の有無と実際にPINGが通るかだけを返す。 */
export async function getKvDiagnostics() {
  const matchingEnvKeys = Object.keys(process.env).filter((k) =>
    /KV_REST_API|UPSTASH_REDIS|^REDIS_URL$|^KV_URL$/i.test(k)
  );

  if (!redisClient) {
    return { connected: false, resolvedFrom: null, matchingEnvKeys, pingOk: false };
  }

  try {
    const pong = await redisClient.ping();
    return { connected: true, resolvedFrom: "REDIS_URL", matchingEnvKeys, pingOk: pong === "PONG" };
  } catch (err) {
    return {
      connected: true,
      resolvedFrom: "REDIS_URL",
      matchingEnvKeys,
      pingOk: false,
      pingError: err instanceof Error ? err.message : String(err)
    };
  }
}
