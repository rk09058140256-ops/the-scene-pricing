import { kv } from "@vercel/kv";
import { DayRecord } from "./types";
import { mergeDayRecords } from "./csv";

interface ServerState {
  records: DayRecord[];
  otaNames: Record<string, string>;
  lastUpdated: string | null;
  lastSource: string | null;
}

const EMPTY_STATE: ServerState = { records: [], otaNames: {}, lastUpdated: null, lastSource: null };
const KV_KEY = "tripla-price-store:v1";

// Vercel KV（Upstash Redis）の接続情報が無い環境（ローカル開発等）では、
// globalThis を使ったインメモリ保存にフォールバックする。
// Next.js の dev サーバーはファイル変更のたびにモジュールを再評価するため、
// globalThis に持たせて再評価をまたいで状態を保持する（Prisma クライアント等と同じ定石）。
const hasKv = Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

const globalStore = globalThis as unknown as { __priceServerStoreFallback?: ServerState };

function getMemoryStore(): ServerState {
  if (!globalStore.__priceServerStoreFallback) {
    globalStore.__priceServerStoreFallback = { ...EMPTY_STATE };
  }
  return globalStore.__priceServerStoreFallback;
}

async function readState(): Promise<ServerState> {
  if (!hasKv) return getMemoryStore();
  const state = await kv.get<ServerState>(KV_KEY);
  return state ?? EMPTY_STATE;
}

async function writeState(state: ServerState): Promise<void> {
  if (!hasKv) {
    Object.assign(getMemoryStore(), state);
    return;
  }
  await kv.set(KV_KEY, state);
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
