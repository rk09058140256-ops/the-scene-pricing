"use client";

import { useState } from "react";
import { DiscountType, PriceEntry } from "@/lib/types";
import { calcEffectivePrice, calcEstimatedPrice, formatYen } from "@/lib/pricing";
import { cn } from "@/lib/utils";

interface PriceCellProps {
  entry?: PriceEntry;
  isCheapest: boolean;
  isLosingCell: boolean;
  onSave: (entry: PriceEntry) => void;
  /** このOTAに設定された推定割引率（%）。0またはundefinedなら推定なし */
  assumedPercent?: number;
  /** ONのときはテーブル全体の主表示を推定実質価格に切り替える（最安値判定には使わない） */
  estimateMode: boolean;
}

export function PriceCell({
  entry,
  isCheapest,
  isLosingCell,
  onSave,
  assumedPercent,
  estimateMode,
}: PriceCellProps) {
  const [editing, setEditing] = useState(false);
  const [price, setPrice] = useState(String(entry?.price ?? 0));
  const [discountType, setDiscountType] = useState<DiscountType>(entry?.discountType ?? "fixed");
  const [discountValue, setDiscountValue] = useState(String(entry?.discountValue ?? 0));

  function startEditing() {
    setPrice(String(entry?.price ?? 0));
    setDiscountType(entry?.discountType ?? "fixed");
    setDiscountValue(String(entry?.discountValue ?? 0));
    setEditing(true);
  }

  function save() {
    const parsedPrice = Number(price);
    const parsedDiscount = Number(discountValue);
    onSave({
      price: Number.isNaN(parsedPrice) ? 0 : parsedPrice,
      discountType,
      discountValue: Number.isNaN(parsedDiscount) ? 0 : parsedDiscount,
    });
    setEditing(false);
  }

  const effective = calcEffectivePrice(entry);
  const estimated = calcEstimatedPrice(effective, assumedPercent ?? 0);
  const showEstimateAsPrimary = estimateMode && estimated !== null;
  const primaryPrice = showEstimateAsPrimary ? estimated : effective;

  if (editing) {
    return (
      <td className="border border-slate-200 bg-white p-2 align-top">
        <div className="flex flex-col gap-1">
          <input
            type="number"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
            className="h-7 w-24 rounded border border-slate-300 px-1.5 text-xs"
            placeholder="表示価格"
            autoFocus
          />
          <div className="flex gap-1">
            <select
              value={discountType}
              onChange={(e) => setDiscountType(e.target.value as DiscountType)}
              className="h-7 rounded border border-slate-300 text-xs"
            >
              <option value="fixed">円引</option>
              <option value="percent">%還元</option>
            </select>
            <input
              type="number"
              value={discountValue}
              onChange={(e) => setDiscountValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && save()}
              className="h-7 w-16 rounded border border-slate-300 px-1.5 text-xs"
              placeholder="割引"
            />
          </div>
          <div className="flex gap-1">
            <button
              onClick={save}
              className="h-6 flex-1 rounded bg-slate-900 text-[11px] text-white hover:bg-slate-700"
            >
              保存
            </button>
            <button
              onClick={() => setEditing(false)}
              className="h-6 flex-1 rounded border border-slate-300 text-[11px] hover:bg-slate-50"
            >
              取消
            </button>
          </div>
        </div>
      </td>
    );
  }

  return (
    <td
      onClick={startEditing}
      className={cn(
        "cursor-pointer border border-slate-200 p-2 align-top transition-colors hover:brightness-95",
        isCheapest && "bg-emerald-50",
        isLosingCell && !isCheapest && "bg-red-50"
      )}
    >
      {entry ? (
        <div className="flex flex-col gap-0.5">
          <div
            className={cn(
              "flex items-center gap-1 text-sm font-semibold",
              isCheapest ? "text-emerald-700" : isLosingCell ? "text-red-700" : "text-slate-900"
            )}
          >
            {formatYen(primaryPrice)}
            {isCheapest && (
              <span className="rounded bg-emerald-600 px-1 py-0.5 text-[10px] font-medium text-white">
                最安
              </span>
            )}
            {showEstimateAsPrimary && (
              <span className="rounded border border-indigo-300 px-1 py-0.5 text-[9px] font-medium text-indigo-600">
                推定
              </span>
            )}
          </div>

          {showEstimateAsPrimary ? (
            <div className="flex flex-wrap items-baseline gap-x-1.5 text-[11px] text-slate-400">
              <span>実測 {formatYen(effective)}</span>
              {entry.discountValue > 0 && (
                <span className="text-emerald-600">
                  {entry.note ??
                    (entry.discountType === "percent"
                      ? `${entry.discountValue}%還元`
                      : `-¥${entry.discountValue.toLocaleString("ja-JP")}`)}
                </span>
              )}
            </div>
          ) : entry.discountValue > 0 ? (
            <div className="flex flex-wrap items-baseline gap-x-1.5 text-[11px] text-slate-400">
              <span className="line-through decoration-slate-300">{formatYen(entry.price)}</span>
              <span className="text-emerald-600">
                {entry.note ??
                  (entry.discountType === "percent"
                    ? `${entry.discountValue}%還元`
                    : `-¥${entry.discountValue.toLocaleString("ja-JP")}`)}
              </span>
            </div>
          ) : (
            <div className="text-[11px] text-slate-400">表示 {formatYen(entry.price)}</div>
          )}

          {!estimateMode && estimated !== null && (
            <div className="text-[10.5px] text-indigo-500">
              推計実質 {formatYen(estimated)}（-{assumedPercent}%適用時）
            </div>
          )}
        </div>
      ) : (
        <span className="text-xs text-slate-300">未入力（クリックで入力）</span>
      )}
    </td>
  );
}
