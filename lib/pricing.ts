import { DayRecord, OtaConfig, PriceEntry } from "./types";

/** 実質販売価格 = 表示価格 - 即時割引 - ポイント還元相当額 */
export function calcEffectivePrice(entry: PriceEntry | undefined): number | null {
  if (!entry) return null;
  if (entry.status === "full") return null; // 満室セルは最安値・逆転判定の対象外
  const discount =
    entry.discountType === "percent"
      ? entry.price * (entry.discountValue / 100)
      : entry.discountValue;
  return Math.max(0, Math.round(entry.price - discount));
}

export interface DayAnalysis {
  effectivePrices: Record<string, number | null>;
  cheapestOtaIds: string[];
  cheapestPrice: number | null;
  triplaEffective: number | null;
  competitorCheapest: number | null;
  /** tripla実質価格 - 他社最安実質価格。正の値は tripla が高い（要確認） */
  diff: number | null;
  isTriplaLosing: boolean;
}

export function analyzeDayRecord(day: DayRecord, otas: OtaConfig[]): DayAnalysis {
  const effectivePrices: Record<string, number | null> = {};
  for (const ota of otas) {
    effectivePrices[ota.id] = calcEffectivePrice(day.prices[ota.id]);
  }

  const validEntries = otas
    .map((o) => ({ id: o.id, price: effectivePrices[o.id] }))
    .filter((e): e is { id: string; price: number } => e.price !== null);

  const cheapestPrice =
    validEntries.length > 0 ? Math.min(...validEntries.map((e) => e.price)) : null;
  const cheapestOtaIds =
    cheapestPrice === null
      ? []
      : validEntries.filter((e) => e.price === cheapestPrice).map((e) => e.id);

  const triplaOta = otas.find((o) => o.isTripla);
  const triplaEffective = triplaOta ? effectivePrices[triplaOta.id] ?? null : null;

  const competitorEntries = validEntries.filter((e) => e.id !== triplaOta?.id);
  const competitorCheapest =
    competitorEntries.length > 0 ? Math.min(...competitorEntries.map((e) => e.price)) : null;

  const diff =
    triplaEffective !== null && competitorCheapest !== null
      ? triplaEffective - competitorCheapest
      : null;
  const isTriplaLosing = diff !== null && diff > 0;

  return {
    effectivePrices,
    cheapestOtaIds,
    cheapestPrice,
    triplaEffective,
    competitorCheapest,
    diff,
    isTriplaLosing,
  };
}

export function formatYen(value: number | null | undefined): string {
  if (value === null || value === undefined) return "-";
  return `¥${value.toLocaleString("ja-JP")}`;
}
