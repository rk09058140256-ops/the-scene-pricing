import { DayRecord, OtaConfig } from "./types";
import { FIXED_PLAN_NAME } from "./constants";

export const defaultOtas: OtaConfig[] = [
  { id: "tripla", name: "TRIPLA（自社予約）", isTripla: true, accent: "emerald" },
  { id: "rakuten", name: "楽天トラベル", accent: "red" },
  { id: "jalan", name: "じゃらん", accent: "orange" },
  { id: "ikyu", name: "一休.com", accent: "purple" },
];

/** シード固定の疑似乱数（対象月ごとに再現性のあるデモデータを生成するため） */
function seedRandom(seed: number) {
  let value = seed;
  return () => {
    value = (value * 9301 + 49297) % 233280;
    return value / 233280;
  };
}

/** 指定した年月（1日〜末日）分の、固定プラン・大人2名朝食付きの実質価格デモデータを生成する */
export function generateSampleMonth(year: number, month: number): DayRecord[] {
  const rand = seedRandom(year * 100 + month);
  const days = new Date(year, month, 0).getDate();
  const records: DayRecord[] = [];

  for (let d = 1; d <= days; d++) {
    const date = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const base = 22000 + Math.round(rand() * 6000);
    const isWeekend = [0, 6].includes(new Date(`${date}T00:00:00`).getDay());
    const weekendBump = isWeekend ? 3500 : 0;

    records.push({
      date,
      planName: FIXED_PLAN_NAME,
      prices: {
        tripla: {
          price: base + weekendBump,
          discountType: "fixed",
          discountValue: 0,
        },
        rakuten: {
          price: base + weekendBump + Math.round(rand() * 800) - 200,
          discountType: "percent",
          discountValue: Math.round(rand() * 3) + 1,
        },
        jalan: {
          price: base + weekendBump + Math.round(rand() * 800) - 300,
          discountType: "percent",
          discountValue: Math.round(rand() * 2) + 1,
        },
        ikyu: {
          price: base + weekendBump + Math.round(rand() * 900) - 100,
          discountType: "fixed",
          discountValue: rand() > 0.5 ? 500 : 0,
        },
      },
    });
  }

  return records;
}
