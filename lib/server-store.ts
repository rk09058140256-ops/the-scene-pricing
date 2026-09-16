import { DayRecord } from "./types";
import { mergeDayRecords } from "./csv";

interface ServerState {
  records: DayRecord[];
  otaNames: Record<string, string>;
  lastUpdated: string | null;
  lastSource: string | null;
}

// Next.js dev サーバーはファイル変更のたびにモジュールを再評価するため、
// globalThis に持たせて再評価をまたいで状態を保持する（Prisma クライアント等と同じ定石）。
const globalStore = globalThis as unknown as { __priceServerStore?: ServerState };

function getStore(): ServerState {
  if (!globalStore.__priceServerStore) {
    globalStore.__priceServerStore = { records: [], otaNames: {}, lastUpdated: null, lastSource: null };
  }
  return globalStore.__priceServerStore;
}

export function getServerState() {
  var store = getStore();
  return {
    records: store.records,
    otaNames: store.otaNames,
    lastUpdated: store.lastUpdated,
    lastSource: store.lastSource
  };
}

export function mergeIncomingRecords(
  records: DayRecord[],
  otaNames: Record<string, string>,
  source: string
) {
  var store = getStore();
  store.records = mergeDayRecords(store.records, records);
  store.otaNames = { ...store.otaNames, ...otaNames };
  store.lastUpdated = new Date().toISOString();
  store.lastSource = source;
  return store;
}
