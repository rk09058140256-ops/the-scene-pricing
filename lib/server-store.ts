import { createClient } from "@vercel/kv";
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

/**
 * Vercelの「Storage」タブから作成したRedis/KVを接続すると、通常は KV_REST_API_URL /
 * KV_REST_API_TOKEN が注入されるが、Marketplace経由の接続方法によっては
 * ストア名がプレフィックスされた変数名（例: MYSTORE_KV_REST_API_URL）になることがある。
 * どちらのパターンでも拾えるように探索する。
 */
function findKvCredentials(): { url: string; token: string; source: string } | null {
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    return { url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN, source: "KV_REST_API_URL" };
  }
  const urlKey = Object.keys(process.env).find((k) => k.endsWith("_KV_REST_API_URL"));
  if (urlKey) {
    const prefix = urlKey.slice(0, -"_KV_REST_API_URL".length);
    const tokenKey = `${prefix}_KV_REST_API_TOKEN`;
    const url = process.env[urlKey];
    const token = process.env[tokenKey];
    if (url && token) return { url, token, source: urlKey };
  }
  return null;
}

const kvCredentials = findKvCredentials();
const kvClient = kvCredentials ? createClient({ url: kvCredentials.url, token: kvCredentials.token }) : null;

// Next.js の dev サーバーはファイル変更のたびにモジュールを再評価するため、
// globalThis に持たせて再評価をまたいで状態を保持する（Prisma クライアント等と同じ定石）。
// KV未接続の環境（ローカル開発等）でのフォールバックとしても使う。
const globalStore = globalThis as unknown as { __priceServerStoreFallback?: ServerState };

function getMemoryStore(): ServerState {
  if (!globalStore.__priceServerStoreFallback) {
    globalStore.__priceServerStoreFallback = { ...EMPTY_STATE };
  }
  return globalStore.__priceServerStoreFallback;
}

async function readState(): Promise<ServerState> {
  if (!kvClient) return getMemoryStore();
  const state = await kvClient.get<ServerState>(KV_KEY);
  return state ?? EMPTY_STATE;
}

async function writeState(state: ServerState): Promise<void> {
  if (!kvClient) {
    Object.assign(getMemoryStore(), state);
    return;
  }
  await kvClient.set(KV_KEY, state);
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

/** 接続診断用。実際の値は含めず、どの環境変数が見つかったか（名前のみ）を返す。 */
export function getKvDiagnostics() {
  return {
    connected: Boolean(kvClient),
    resolvedFrom: kvCredentials?.source ?? null,
    matchingEnvKeys: Object.keys(process.env).filter((k) =>
      /KV_REST_API|UPSTASH_REDIS|^REDIS_URL$|^KV_URL$/i.test(k)
    )
  };
}
