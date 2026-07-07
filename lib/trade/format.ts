export function formatUsd(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) return "N/A";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatNumber(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) return "N/A";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(value);
}

export function shortAddress(value: string | null | undefined) {
  if (!value) return "Not synced";
  if (value.length <= 16) return value;
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

export function formatAge(value: number | null | undefined) {
  if (value === null || value === undefined) return "N/A";
  if (value < 1000) return `${value}ms`;
  return `${Math.round(value / 1000)}s`;
}
