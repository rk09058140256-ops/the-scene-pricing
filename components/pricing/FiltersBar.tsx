"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { OtaConfig } from "@/lib/types";

interface FiltersBarProps {
  alertOnly: boolean;
  onAlertOnlyChange: (value: boolean) => void;
  alertCount: number;
  onCsvUpload: (file: File) => void;
  onDownloadCsv: () => void;
  importErrors: string[];
  otas: OtaConfig[];
  assumedDiscounts: Record<string, number>;
  onAssumedDiscountsChange: (value: Record<string, number>) => void;
  estimateMode: boolean;
  onEstimateModeChange: (value: boolean) => void;
}

export function FiltersBar({
  alertOnly,
  onAlertOnlyChange,
  alertCount,
  onCsvUpload,
  onDownloadCsv,
  importErrors,
  otas,
  assumedDiscounts,
  onAssumedDiscountsChange,
  estimateMode,
  onEstimateModeChange,
}: FiltersBarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showSettings, setShowSettings] = useState(false);

  const competitorOtas = otas.filter((o) => !o.isTripla);

  function handleRateChange(otaId: string, rawValue: string) {
    const parsed = Number(rawValue);
    onAssumedDiscountsChange({
      ...assumedDiscounts,
      [otaId]: Number.isNaN(parsed) ? 0 : Math.min(100, Math.max(0, parsed)),
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => onAlertOnlyChange(!alertOnly)}
          className={`h-8 rounded-full border px-3 text-xs font-medium transition-colors ${
            alertOnly
              ? "border-red-300 bg-red-100 text-red-700"
              : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
          }`}
        >
          ⚠ 価格逆転日のみ表示{alertCount > 0 ? `（${alertCount}）` : ""}
        </button>

        <button
          onClick={() => onEstimateModeChange(!estimateMode)}
          className={`h-8 rounded-full border px-3 text-xs font-medium transition-colors ${
            estimateMode
              ? "border-indigo-300 bg-indigo-100 text-indigo-700"
              : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
          }`}
        >
          🔮 推定割引率を適用して表示
        </button>

        <button
          onClick={() => setShowSettings((v) => !v)}
          className="h-8 rounded-full border border-slate-300 bg-white px-3 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          ⚙ 推定割引率の設定
        </button>

        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onDownloadCsv}>
            この月のCSVを出力
          </Button>
          <Button size="sm" onClick={() => fileInputRef.current?.click()}>
            CSVアップロード
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onCsvUpload(file);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      {showSettings && (
        <div className="flex flex-col gap-2 rounded-md bg-slate-50 p-3">
          <p className="text-xs text-slate-500">
            各OTA直サイトの会員ポイント・即時利用ポイント等、Google
            Hotelsの画面には出てこない割引をパーセントで見積もっておくと、テーブルに「推計実質価格」が注記されます（最安値判定・アラートには影響しません）。
          </p>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {competitorOtas.map((ota) => (
              <label key={ota.id} className="flex items-center gap-1.5 text-xs text-slate-700">
                {ota.name}
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={assumedDiscounts[ota.id] ?? 0}
                  onChange={(e) => handleRateChange(ota.id, e.target.value)}
                  className="h-7 w-16 rounded border border-slate-300 px-1.5 text-xs"
                />
                %
              </label>
            ))}
          </div>
        </div>
      )}

      {importErrors.length > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-700">
          <p className="font-medium">CSV取り込み時の警告:</p>
          <ul className="ml-4 list-disc">
            {importErrors.slice(0, 5).map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
