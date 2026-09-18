import { NextRequest, NextResponse } from "next/server";
import { DayRecord, DiscountType, PriceEntry } from "@/lib/types";
import { FIXED_PLAN_NAME } from "@/lib/constants";
import { deleteRecordsByDate, getKvDiagnostics, getServerState, mergeIncomingRecords } from "@/lib/server-store";

export const dynamic = "force-dynamic";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET() {
  const [state, kv] = await Promise.all([getServerState(), getKvDiagnostics()]);
  return NextResponse.json({ ...state, kv }, { headers: CORS_HEADERS });
}

interface IncomingRow {
  otaId?: string;
  otaName?: string;
  price?: number;
  discountType?: string;
  discountValue?: number;
  note?: string;
  bookingUrl?: string;
  /** "FULL"（大文字小文字は問わない）の場合、価格ではなく満室（空室なし）として保存する */
  status?: string;
}

/** ダッシュボード側で <a href> として描画するため、http(s) の妥当なURLだけ通す */
function sanitizeBookingUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 2000) return undefined;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;
    return value;
  } catch {
    return undefined;
  }
}

interface IncomingDay {
  date?: string;
  rows?: IncomingRow[];
}

interface IncomingBody {
  source?: string;
  days?: IncomingDay[];
}

export async function POST(request: NextRequest) {
  let body: IncomingBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400, headers: CORS_HEADERS });
  }

  const days = Array.isArray(body.days) ? body.days : [];
  if (!days.length) {
    return NextResponse.json({ ok: false, error: "days is empty" }, { status: 400, headers: CORS_HEADERS });
  }

  const records: DayRecord[] = [];
  const otaNames: Record<string, string> = {};
  const datesAffected: string[] = [];

  for (const day of days) {
    const date = (day.date || "").trim();
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Array.isArray(day.rows)) continue;

    const prices: Record<string, PriceEntry> = {};
    for (const row of day.rows) {
      const otaId = (row.otaId || "").trim();
      if (!otaId) continue;

      const isFull = typeof row.status === "string" && row.status.trim().toUpperCase() === "FULL";
      if (isFull) {
        prices[otaId] = {
          price: 0,
          discountType: "fixed",
          discountValue: 0,
          status: "full",
          ...(row.note ? { note: row.note } : {})
        };
        if (row.otaName) otaNames[otaId] = row.otaName;
        continue;
      }

      const price = Number(row.price);
      if (Number.isNaN(price)) continue;

      const discountType: DiscountType = row.discountType === "percent" ? "percent" : "fixed";
      const discountValueRaw = Number(row.discountValue ?? 0);
      const bookingUrl = sanitizeBookingUrl(row.bookingUrl);
      prices[otaId] = {
        price,
        discountType,
        discountValue: Number.isNaN(discountValueRaw) ? 0 : discountValueRaw,
        ...(row.note ? { note: row.note } : {}),
        ...(bookingUrl ? { bookingUrl } : {})
      };
      if (row.otaName) otaNames[otaId] = row.otaName;
    }

    if (Object.keys(prices).length === 0) continue;
    records.push({ date, planName: FIXED_PLAN_NAME, prices });
    datesAffected.push(date);
  }

  if (!records.length) {
    return NextResponse.json({ ok: false, error: "no valid rows in payload" }, { status: 400, headers: CORS_HEADERS });
  }

  const state = await mergeIncomingRecords(records, otaNames, body.source || "unknown");

  return NextResponse.json(
    {
      ok: true,
      recordsReceived: records.length,
      datesAffected,
      totalStored: state.records.length
    },
    { headers: CORS_HEADERS }
  );
}

/** 指定した日付のレコードだけを削除する（他の日付には影響しない）。body: { dates: ["YYYY-MM-DD", ...] } */
export async function DELETE(request: NextRequest) {
  let body: { dates?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400, headers: CORS_HEADERS });
  }

  const dates = Array.isArray(body.dates) ? body.dates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)) : [];
  if (!dates.length) {
    return NextResponse.json({ ok: false, error: "dates is empty" }, { status: 400, headers: CORS_HEADERS });
  }

  const state = await deleteRecordsByDate(dates);

  return NextResponse.json(
    { ok: true, deletedDates: dates, totalStored: state.records.length },
    { headers: CORS_HEADERS }
  );
}
