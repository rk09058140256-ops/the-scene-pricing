"use client";

import { DayRecord, OtaConfig } from "@/lib/types";
import { analyzeDayRecord, formatYen } from "@/lib/pricing";
import { Card, CardContent } from "@/components/ui/card";

interface SummaryCardsProps {
  records: DayRecord[];
  otas: OtaConfig[];
}

export function SummaryCards({ records, otas }: SummaryCardsProps) {
  const analyses = records.map((r) => analyzeDayRecord(r, otas));
  const total = analyses.length;
  const losing = analyses.filter((a) => a.isTriplaLosing).length;
  const winning = total - losing;
  const diffs = analyses.map((a) => a.diff).filter((d): d is number => d !== null);
  const avgDiff =
    diffs.length > 0 ? Math.round(diffs.reduce((sum, d) => sum + d, 0) / diffs.length) : null;

  const stats: { label: string; value: string; tone?: string }[] = [
    { label: "対象日数", value: `${total}日` },
    { label: "最安値を維持", value: `${winning}日`, tone: "text-emerald-600" },
    { label: "価格逆転あり", value: `${losing}日`, tone: losing > 0 ? "text-red-600" : "text-slate-900" },
    {
      label: "平均差額（tripla − 他社最安）",
      value: avgDiff === null ? "-" : `${avgDiff > 0 ? "+" : ""}${formatYen(avgDiff)}`,
      tone: avgDiff !== null && avgDiff > 0 ? "text-red-600" : "text-emerald-600",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {stats.map((stat) => (
        <Card key={stat.label}>
          <CardContent>
            <p className="text-xs font-medium text-slate-500">{stat.label}</p>
            <p className={`mt-1 text-xl font-bold ${stat.tone ?? "text-slate-900"}`}>{stat.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
