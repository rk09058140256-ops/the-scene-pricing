export type DiscountType = "percent" | "fixed";

export interface OtaConfig {
  id: string;
  name: string;
  isTripla?: boolean;
  accent: string;
}

export interface PriceEntry {
  /** 表示料金（税込・定価） */
  price: number;
  /** 即時割引・ポイント還元の種別 */
  discountType: DiscountType;
  /** percent の場合は %、fixed の場合は円 */
  discountValue: number;
  /** 割引・ポイント還元の元表記（例: "メンバー価格、4% オフ" "楽天ポイント 225 pt (1%)"）。手入力/CSV由来の場合はなし */
  note?: string;
}

export interface DayRecord {
  date: string; // YYYY-MM-DD
  planName: string;
  prices: Record<string, PriceEntry>;
}
