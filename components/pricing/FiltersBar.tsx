"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/button";

interface FiltersBarProps {
  alertOnly: boolean;
  onAlertOnlyChange: (value: boolean) => void;
  alertCount: number;
  onCsvUpload: (file: File) => void;
  onDownloadCsv: () => void;
  importErrors: string[];
}

export function FiltersBar({
  alertOnly,
  onAlertOnlyChange,
  alertCount,
  onCsvUpload,
  onDownloadCsv,
  importErrors,
}: FiltersBarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

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
