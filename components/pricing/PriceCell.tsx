"use client";

import { useState } from "react";
import { DiscountType, PriceEntry } from "@/lib/types";
import { calcEffectivePrice, formatYen } from "@/lib/pricing";
import { cn } from "@/lib/utils";

interface PriceCellProps {
  entry?: PriceEntry;
  isCheapest: boolean;
  isLosingCell: boolean;
  onSave: (entry: PriceEntry) => void;
}

export function PriceCell({ entry, isCheapest, isLosingCell, onSave }: PriceCellProps) {
  const [editing, setEditing] = useState(false);
  const [price, setPrice] = useState(String(entry?.price ?? 0));
  const [discountType, setDiscountType] = useState<DiscountType>(entry?.discountType ?? "fixed");
  const [discountValue, setDiscountValue] = useState(String(entry?.discountValue ?? 0));
  const [isFull, setIsFull] = useState(entry?.status === "full");

  function startEditing() {
    setPrice(String(entry?.price ?? 0));
    setDiscountType(entry?.discountType ?? "fixed");
    setDiscountValue(String(entry?.discountValue ?? 0));
    setIsFull(entry?.status === "full");
    setEditing(true);
  }

  function save() {
    if (isFull) {
      onSave({ price: 0, discountType: "fixed", discountValue: 0, status: "full" });
      setEditing(false);
      return;
    }
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

  if (editing) {
    return (
      <td className="border border-slate-200 bg-white p-2 align-top">
        <div className="flex flex-col gap-1">
          <label className="flex items-center gap-1.5 text-[11px] font-medium text-slate-600">
            <input
              type="checkbox"
              checked={isFull}
              onChange={(e) => setIsFull(e.target.checked)}
              className="h-3.5 w-3.5"
            />
            満室（空室なし）
          </label>
          <input
            type="number"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
            className="h-7 w-24 rounded border border-slate-300 px-1.5 text-xs disabled:bg-slate-100 disabled:text-slate-400"
            placeholder="表示価格"
            disabled={isFull}
            autoFocus={!isFull}
          />
          <div className="flex gap-1">
            <select
              value={discountType}
              onChange={(e) => setDiscountType(e.target.value as DiscountType)}
              className="h-7 rounded border border-slate-300 text-xs disabled:bg-slate-100 disabled:text-slate-400"
              disabled={isFull}
            >
              <option value="fixed">円引</option>
              <option value="percent">%還元</option>
            </select>
            <input
              type="number"
              value={discountValue}
              onChange={(e) => setDiscountValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && save()}
              className="h-7 w-16 rounded border border-slate-300 px-1.5 text-xs disabled:bg-slate-100 disabled:text-slate-400"
              placeholder="割引"
              disabled={isFull}
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
      {entry ? entry.status === "full" ? (
        <div className="flex flex-col gap-0.5">
          <span className="inline-flex w-fit items-center rounded bg-slate-500 px-2 py-0.5 text-xs font-semibold text-white">
            満室
          </span>
          <span className="text-[11px] text-slate-400">空室なし（クリックで編集）</span>
        </div>
      ) : (
        <div className="flex flex-col gap-0.5">
          <div
            className={cn(
              "flex items-center gap-1 text-sm font-semibold",
              isCheapest ? "text-emerald-700" : isLosingCell ? "text-red-700" : "text-slate-900"
            )}
          >
            {formatYen(effective)}
            {isCheapest && (
              <span className="rounded bg-emerald-600 px-1 py-0.5 text-[10px] font-medium text-white">
                最安
              </span>
            )}
          </div>
          {entry.discountValue > 0 ? (
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
          {entry.bookingUrl && (
            <a
              href={entry.bookingUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              title="この日付・条件で予約ページを開く"
              className="mt-0.5 inline-flex w-fit items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium text-slate-600 no-underline ring-1 ring-inset ring-slate-300 transition-colors hover:bg-slate-900 hover:text-white hover:ring-slate-900"
            >
              予約サイトへ 🛒
            </a>
          )}
        </div>
      ) : (
        <span className="text-xs text-slate-300">未入力（クリックで入力）</span>
      )}
    </td>
  );
}
