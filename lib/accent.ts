export const ACCENT_STYLES: Record<string, { dot: string; badge: string }> = {
  emerald: { dot: "bg-emerald-500", badge: "bg-emerald-100 text-emerald-700" },
  red: { dot: "bg-red-500", badge: "bg-red-100 text-red-700" },
  orange: { dot: "bg-orange-500", badge: "bg-orange-100 text-orange-700" },
  purple: { dot: "bg-purple-500", badge: "bg-purple-100 text-purple-700" },
  sky: { dot: "bg-sky-500", badge: "bg-sky-100 text-sky-700" },
  amber: { dot: "bg-amber-500", badge: "bg-amber-100 text-amber-700" },
  pink: { dot: "bg-pink-500", badge: "bg-pink-100 text-pink-700" },
  teal: { dot: "bg-teal-500", badge: "bg-teal-100 text-teal-700" },
  cyan: { dot: "bg-cyan-500", badge: "bg-cyan-100 text-cyan-700" },
  lime: { dot: "bg-lime-500", badge: "bg-lime-100 text-lime-700" },
  fuchsia: { dot: "bg-fuchsia-500", badge: "bg-fuchsia-100 text-fuchsia-700" },
  slate: { dot: "bg-slate-500", badge: "bg-slate-100 text-slate-700" },
};

export function getAccentStyle(accent: string) {
  return ACCENT_STYLES[accent] ?? ACCENT_STYLES.slate;
}
