"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DayRecord, OtaConfig, PriceEntry } from "@/lib/types";
import { defaultOtas, generateSampleMonth } from "@/lib/sample-data";
import { FIXED_PLAN_NAME, OCCUPANCY_LABEL } from "@/lib/constants";
import { YearMonth, addMonths, buildMonthOptions, isDateInMonth, ymKey } from "@/lib/month";
import { analyzeDayRecord } from "@/lib/pricing";
import { buildCsvFromRecords, downloadCsv, mergeDayRecords, parseCsvText } from "@/lib/csv";
import { cn } from "@/lib/utils";
import { PriceTable } from "./PriceTable";
import { FiltersBar } from "./FiltersBar";
import { SummaryCards } from "./SummaryCards";

const today = new Date();
const CURRENT_YM: YearMonth = { year: today.getFullYear(), month: today.getMonth() + 1 };
const DEFAULT_YM: YearMonth = addMonths(CURRENT_YM, 1);
const POLL_INTERVAL_MS = 4000;
const NEW_OTA_ACCENTS = ["sky", "amber", "pink", "teal", "cyan", "lime", "fuchsia"];

interface LiveApiState {
  records: DayRecord[];
  otaNames: Record<string, string>;
  lastUpdated: string | null;
  lastSource: string | null;
}

interface SyncStatus {
  reachable: boolean;
  lastUpdated: string | null;
  lastSource: string | null;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function PriceDashboard() {
  const [otas, setOtas] = useState<OtaConfig[]>(defaultOtas);
  const [records, setRecords] = useState<DayRecord[]>(() =>
    generateSampleMonth(DEFAULT_YM.year, DEFAULT_YM.month)
  );
  const [selectedYm, setSelectedYm] = useState<YearMonth>(DEFAULT_YM);
  const [alertOnly, setAlertOnly] = useState(false);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    reachable: false,
    lastUpdated: null,
    lastSource: null
  });
  const [flash, setFlash] = useState(false);
  const lastSeenUpdateRef = useRef<string | null>(null);

  const monthOptions = useMemo(() => buildMonthOptions(CURRENT_YM, 3, 12), []);

  // 対象月を切り替えたとき、その月の1日〜末日がまだデータを持っていなければデモ値で自動補完する
  useEffect(() => {
    setRecords((prev) => {
      const existingDates = new Set(
        prev
          .filter((r) => r.planName === FIXED_PLAN_NAME && isDateInMonth(r.date, selectedYm))
          .map((r) => r.date)
      );
      const generated = generateSampleMonth(selectedYm.year, selectedYm.month).filter(
        (r) => !existingDates.has(r.date)
      );
      if (generated.length === 0) return prev;
      return [...prev, ...generated].sort((a, b) => a.date.localeCompare(b.date));
    });
  }, [selectedYm]);

  // Chrome拡張（Google Hotels連携）からのデータを /api/prices 経由でポーリング受信し、
  // 新着があればテーブルへマージして軽くハイライトする。
  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch("/api/prices", { cache: "no-store" });
        if (!res.ok) throw new Error("bad response");
        const data: LiveApiState = await res.json();
        if (cancelled) return;

        setSyncStatus({ reachable: true, lastUpdated: data.lastUpdated, lastSource: data.lastSource });

        if (data.lastUpdated && data.lastUpdated !== lastSeenUpdateRef.current) {
          lastSeenUpdateRef.current = data.lastUpdated;
          if (data.records.length > 0) {
            setRecords((prev) => mergeDayRecords(prev, data.records));
            setOtas((prev) => {
              const map = new Map(prev.map((o) => [o.id, o]));
              let changed = false;
              Object.entries(data.otaNames || {}).forEach(([id, name], idx) => {
                if (!map.has(id)) {
                  map.set(id, { id, name, accent: NEW_OTA_ACCENTS[idx % NEW_OTA_ACCENTS.length] });
                  changed = true;
                }
              });
              return changed ? Array.from(map.values()) : prev;
            });
            setFlash(true);
            setTimeout(() => setFlash(false), 900);
          }
        }
      } catch {
        if (!cancelled) setSyncStatus((prev) => ({ ...prev, reachable: false }));
      }
    }

    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const monthRecords = useMemo(
    () =>
      records
        .filter((r) => r.planName === FIXED_PLAN_NAME && isDateInMonth(r.date, selectedYm))
        .sort((a, b) => a.date.localeCompare(b.date)),
    [records, selectedYm]
  );

  const filteredRecords = useMemo(
    () => monthRecords.filter((r) => (alertOnly ? analyzeDayRecord(r, otas).isTriplaLosing : true)),
    [monthRecords, alertOnly, otas]
  );

  const alertCount = useMemo(
    () => monthRecords.filter((r) => analyzeDayRecord(r, otas).isTriplaLosing).length,
    [monthRecords, otas]
  );

  function handleUpdateEntry(date: string, planName: string, otaId: string, entry: PriceEntry) {
    setRecords((prev) =>
      prev.map((r) =>
        r.date === date && r.planName === planName
          ? { ...r, prices: { ...r.prices, [otaId]: entry } }
          : r
      )
    );
  }

  async function handleCsvUpload(file: File) {
    const text = await file.text();
    const result = parseCsvText(text, otas, FIXED_PLAN_NAME);
    setImportErrors(result.errors);
    setRecords((prev) => mergeDayRecords(prev, result.records));
    setOtas((prev) => {
      const map = new Map(prev.map((o) => [o.id, o]));
      for (const o of result.otas) {
        if (!map.has(o.id)) map.set(o.id, o);
      }
      return Array.from(map.values());
    });
  }

  function handleDownloadCsv() {
    downloadCsv(`price_${ymKey(selectedYm)}.csv`, buildCsvFromRecords(monthRecords, otas));
  }

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-6 p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            tripla 価格モニタリングダッシュボード
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            対象プラン：<span className="font-medium text-slate-700">{FIXED_PLAN_NAME}</span>
            {" ／ "}
            設定人数：<span className="font-medium text-slate-700">{OCCUPANCY_LABEL}</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium",
              syncStatus.reachable
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-slate-200 bg-slate-50 text-slate-400"
            )}
          >
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                syncStatus.reachable ? "bg-emerald-500" : "bg-slate-300"
              )}
            />
            {syncStatus.reachable
              ? syncStatus.lastUpdated
                ? `Google Hotelsから直接受信中（最終更新 ${formatTime(syncStatus.lastUpdated)}）`
                : "Google Hotels連携: 待機中"
              : "Google Hotels連携: 未接続"}
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="target-month" className="text-xs font-medium text-slate-500">
              対象月
            </label>
            <select
              id="target-month"
              value={ymKey(selectedYm)}
              onChange={(e) => {
                const [y, m] = e.target.value.split("-").map(Number);
                setSelectedYm({ year: y, month: m });
              }}
              className="h-9 rounded border border-slate-300 px-3 text-sm font-medium text-slate-900"
            >
              {monthOptions.map((ym) => (
                <option key={ymKey(ym)} value={ymKey(ym)}>
                  {ym.year}年{ym.month}月
                </option>
              ))}
            </select>
          </div>
        </div>
      </header>

      <SummaryCards records={monthRecords} otas={otas} />

      <FiltersBar
        alertOnly={alertOnly}
        onAlertOnlyChange={setAlertOnly}
        alertCount={alertCount}
        onCsvUpload={handleCsvUpload}
        onDownloadCsv={handleDownloadCsv}
        importErrors={importErrors}
      />

      <div
        className={cn(
          "rounded-lg transition-shadow duration-700",
          flash && "shadow-[0_0_0_3px_rgba(16,185,129,0.35)]"
        )}
      >
        <PriceTable otas={otas} records={filteredRecords} onUpdateEntry={handleUpdateEntry} />
      </div>
    </div>
  );
}
