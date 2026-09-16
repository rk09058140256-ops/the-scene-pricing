"use client";

import { DayRecord, OtaConfig, PriceEntry } from "@/lib/types";
import { analyzeDayRecord, formatYen } from "@/lib/pricing";
import { getAccentStyle } from "@/lib/accent";
import { PriceCell } from "./PriceCell";
import { cn } from "@/lib/utils";

interface PriceTableProps {
  otas: OtaConfig[];
  records: DayRecord[];
  onUpdateEntry: (date: string, planName: string, otaId: string, entry: PriceEntry) => void;
  assumedDiscounts: Record<string, number>;
  estimateMode: boolean;
}

const WEEKDAY_JA = ["日", "月", "火", "水", "木", "金", "土"];

// 左端の日付列は横スクロールでも常に見えるよう sticky にする。
// ヘッダー行との交差部分（コーナーセル）は縦横どちらのstickyにも勝つよう z-indexを最上位にする。
const STICKY_DATE_CELL =
  "sticky left-0 shadow-[2px_0_4px_-2px_rgba(15,23,42,0.12)]";

export function PriceTable({
  otas,
  records,
  onUpdateEntry,
  assumedDiscounts,
  estimateMode,
}: PriceTableProps) {
  if (records.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-400">
        表示できるデータがありません。CSVをアップロードするか、対象月を変更してください。
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {estimateMode && (
        <p className="rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-700">
          推定モード: セルの数値は設定した推定割引率を適用した参考値です。最安値ハイライトと価格逆転アラートは、これまで通りGoogle
          Hotelsから取得した実測データのみで判定しています。
        </p>
      )}
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[860px] border-collapse text-sm">
        <thead>
          <tr>
            <th
              className={cn(
                STICKY_DATE_CELL,
                "top-0 z-30 border border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs font-semibold text-slate-500"
              )}
            >
              日付
            </th>
            {otas.map((ota) => {
              const accent = getAccentStyle(ota.accent);
              return (
                <th
                  key={ota.id}
                  className="sticky top-0 z-20 border border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs font-semibold text-slate-500"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <span className={cn("h-2 w-2 rounded-full", accent.dot)} />
                    {ota.name}
                  </span>
                </th>
              );
            })}
            <th className="sticky top-0 z-20 border border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs font-semibold text-slate-500">
              差額（TRIPLA − 他社最安値）
            </th>
          </tr>
        </thead>
        <tbody>
          {records.map((record) => {
            const analysis = analyzeDayRecord(record, otas);
            const date = new Date(`${record.date}T00:00:00`);
            const weekday = WEEKDAY_JA[date.getDay()];
            const isWeekend = date.getDay() === 0 || date.getDay() === 6;

            return (
              <tr key={record.date} className={cn(analysis.isTriplaLosing && "bg-red-50/40")}>
                <td
                  className={cn(
                    STICKY_DATE_CELL,
                    "z-10 border border-slate-200 px-3 py-2 align-top",
                    analysis.isTriplaLosing ? "bg-red-50" : "bg-white"
                  )}
                >
                  <div className={cn("font-medium", isWeekend && "text-red-500")}>
                    {record.date}（{weekday}）
                  </div>
                </td>
                {otas.map((ota) => (
                  <PriceCell
                    key={ota.id}
                    entry={record.prices[ota.id]}
                    isCheapest={analysis.cheapestOtaIds.includes(ota.id)}
                    isLosingCell={ota.isTripla === true && analysis.isTriplaLosing}
                    onSave={(entry) => onUpdateEntry(record.date, record.planName, ota.id, entry)}
                    assumedPercent={assumedDiscounts[ota.id]}
                    estimateMode={estimateMode}
                  />
                ))}
                <td className="border border-slate-200 px-3 py-2 align-top">
                  {analysis.diff === null ? (
                    <span className="text-xs text-slate-400">データ不足</span>
                  ) : (
                    <div className="flex flex-col gap-1">
                      <span
                        className={cn(
                          "text-sm font-semibold",
                          analysis.diff > 0 ? "text-red-600" : "text-emerald-600"
                        )}
                      >
                        {analysis.diff > 0 ? "+" : ""}
                        {formatYen(analysis.diff)}
                      </span>
                      {analysis.isTriplaLosing ? (
                        <span className="inline-flex w-fit items-center rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700">
                          ⚠ 価格逆転
                        </span>
                      ) : (
                        <span className="inline-flex w-fit items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                          ✓ 最安値維持
                        </span>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
        </table>
      </div>
    </div>
  );
}
