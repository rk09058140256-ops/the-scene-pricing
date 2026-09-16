import { DayRecord, OtaConfig, PriceEntry } from "./types";

/** 実質販売価格 = 表示価格 - 即時割引 - ポイント還元相当額 */
export function calcEffectivePrice(entry: PriceEntry | undefined): number | null {
  if (!entry) return null;
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

/**
 * ユーザーが設定した「推定割引率」（会員ランク別ポイント・即時利用ポイント等、
 * Google Hotelsの画面には出てこない各OTA直サイト限定の還元）を実質価格に適用した参考値。
 * あくまで推計であり、最安値判定・価格逆転アラートの計算には使わない。
 */
export function calcEstimatedPrice(
  effectivePrice: number | null,
  assumedDiscountPercent: number
): number | null {
  if (effectivePrice === null || !assumedDiscountPercent) return null;
  return Math.max(0, Math.round(effectivePrice * (1 - assumedDiscountPercent / 100)));
}
