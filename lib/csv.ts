import Papa from "papaparse";
import { DayRecord, DiscountType, OtaConfig, PriceEntry } from "./types";

interface CsvRow {
  date: string;
  otaId: string;
  otaName?: string;
  price: string;
  discountType: string;
  discountValue: string;
  /** "full"（大文字小文字は問わない）の場合、price等は無視して満室として扱う */
  status?: string;
}

export interface CsvImportResult {
  records: DayRecord[];
  otas: OtaConfig[];
  errors: string[];
}

const ACCENTS = ["sky", "amber", "pink", "teal", "cyan", "lime", "fuchsia"];

/**
 * ロング形式CSV: date,otaId,otaName,price,discountType,discountValue
 * 1行 = 1日 x 1OTA。プランは固定（fixedPlanName）のため列には含めない。
 * 未知の otaId は自動で OTA 一覧に追加する。
 */
export function parseCsvText(
  text: string,
  existingOtas: OtaConfig[],
  fixedPlanName: string
): CsvImportResult {
  const parsed = Papa.parse<CsvRow>(text, { header: true, skipEmptyLines: true });
  const errors: string[] = parsed.errors.map((e) => `行${(e.row ?? 0) + 2}: ${e.message}`);

  const recordMap = new Map<string, DayRecord>();
  const otaMap = new Map(existingOtas.map((o) => [o.id, o]));
  let accentIndex = 0;

  parsed.data.forEach((row, idx) => {
    const date = (row.date || "").trim();
    const otaId = (row.otaId || "").trim();

    if (!date || !otaId) {
      const hasAnyValue = Object.values(row).some((v) => (v ?? "").toString().trim() !== "");
      if (hasAnyValue) {
        errors.push(`行${idx + 2}: date / otaId は必須です`);
      }
      return;
    }

    const isFull = (row.status || "").trim().toLowerCase() === "full";

    let entry: PriceEntry;
    if (isFull) {
      entry = { price: 0, discountType: "fixed", discountValue: 0, status: "full" };
    } else {
      const price = Number(row.price);
      if (Number.isNaN(price)) {
        errors.push(`行${idx + 2}: price(${row.price}) が数値ではありません`);
        return;
      }
      const discountValueRaw = Number(row.discountValue ?? 0);
      const discountType: DiscountType = row.discountType === "percent" ? "percent" : "fixed";
      entry = {
        price,
        discountType,
        discountValue: Number.isNaN(discountValueRaw) ? 0 : discountValueRaw,
      };
    }

    if (!otaMap.has(otaId)) {
      otaMap.set(otaId, {
        id: otaId,
        name: row.otaName?.trim() || otaId,
        accent: ACCENTS[accentIndex % ACCENTS.length],
      });
      accentIndex += 1;
    }

    const existing = recordMap.get(date);
    if (existing) {
      existing.prices[otaId] = entry;
    } else {
      recordMap.set(date, { date, planName: fixedPlanName, prices: { [otaId]: entry } });
    }
  });

  return {
    records: Array.from(recordMap.values()).sort((a, b) => a.date.localeCompare(b.date)),
    otas: Array.from(otaMap.values()),
    errors,
  };
}

export function mergeDayRecords(base: DayRecord[], incoming: DayRecord[]): DayRecord[] {
  const map = new Map(base.map((r) => [`${r.date}__${r.planName}`, r]));
  for (const rec of incoming) {
    const key = `${rec.date}__${rec.planName}`;
    const existing = map.get(key);
    if (existing) {
      map.set(key, { ...existing, prices: { ...existing.prices, ...rec.prices } });
    } else {
      map.set(key, rec);
    }
  }
  return Array.from(map.values()).sort(
    (a, b) => a.date.localeCompare(b.date) || a.planName.localeCompare(b.planName)
  );
}

/** 表示中の月の全日程を、現在の価格データのままCSVとして書き出す（未入力のOTAは行を省略） */
export function buildCsvFromRecords(records: DayRecord[], otas: OtaConfig[]): string {
  const header = "date,otaId,otaName,price,discountType,discountValue,status";
  const rows: string[] = [];
  for (const rec of records) {
    for (const ota of otas) {
      const entry = rec.prices[ota.id];
      if (!entry) continue;
      if (entry.status === "full") {
        rows.push(`${rec.date},${ota.id},${ota.name},,,,full`);
      } else {
        rows.push(`${rec.date},${ota.id},${ota.name},${entry.price},${entry.discountType},${entry.discountValue},`);
      }
    }
  }
  return [header, ...rows].join("\n");
}

export function downloadCsv(filename: string, content: string) {
  const blob = new Blob([`﻿${content}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
