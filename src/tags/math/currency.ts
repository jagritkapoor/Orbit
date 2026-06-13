import { create, all } from "mathjs";
import type { MathJsInstance } from "mathjs";
import * as db from "../../lib/db";

const FRANKFURTER_API = "https://api.frankfurter.dev/v1/latest";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface RateCache {
  base: string;
  /** Keys are currency codes. Value is "how many of this currency = 1 base unit".
   *  e.g. base=USD, rates.EUR=0.93 means 1 USD = 0.93 EUR. */
  rates: Record<string, number>;
  fetchedAt: number;
}

let rateCache: RateCache | null = null;
let mathInstance: MathJsInstance = create(all);
let updateListeners: Array<() => void> = [];

export function getMathInstance() {
  return mathInstance;
}

export function isRatesStale(): boolean {
  if (!rateCache) return false;
  return Date.now() - rateCache.fetchedAt > CACHE_TTL_MS;
}

export function getKnownCurrencies(): Set<string> {
  if (!rateCache) return new Set();
  return new Set(Object.keys(rateCache.rates));
}

export function addRatesUpdateListener(fn: () => void): () => void {
  updateListeners.push(fn);
  return () => { updateListeners = updateListeners.filter((l) => l !== fn); };
}

/**
 * Rebuild the shared mathjs instance with currency units injected.
 *
 * The API gives rates as "N target per 1 base", e.g. rates.EUR = 0.93 means
 * 1 USD = 0.93 EUR, so 1 EUR = 1/0.93 ≈ 1.075 USD.
 * mathjs createUnit definition "X base" means "1 unit = X base", so we pass 1/rate.
 */
function rebuildMathWithRates(base: string, rates: Record<string, number>) {
  const m = create(all);

  try {
    m.createUnit(base);
  } catch {
    return;
  }

  for (const [code, rate] of Object.entries(rates)) {
    if (code === base || rate === 0) continue;
    try {
      m.createUnit(code, { definition: `${(1 / rate).toFixed(10)} ${base}` });
    } catch {
      // skip unsupported currency codes silently
    }
  }

  mathInstance = m;
}

function notifyUpdate() {
  updateListeners.forEach((fn) => fn());
}

async function fetchAndCacheRates(base: string): Promise<void> {
  const res = await fetch(`${FRANKFURTER_API}?from=${base}`);
  if (!res.ok) throw new Error(`frankfurter responded with HTTP ${res.status}`);

  const json = (await res.json()) as { rates: Record<string, number> };
  const rates = { ...json.rates, [base]: 1 };
  const fetchedAt = Date.now();

  rateCache = { base, rates, fetchedAt };
  rebuildMathWithRates(base, rates);

  await db.setSetting("currency_rates_json", JSON.stringify(json.rates));
  await db.setSetting("currency_rates_updated_at", String(fetchedAt));
  notifyUpdate();
}

export async function initCurrencyRates(): Promise<void> {
  const base = (await db.getSetting("currency_base").catch(() => null)) ?? "USD";
  const cachedJson = await db.getSetting("currency_rates_json").catch(() => null);
  const cachedAt = parseInt(
    (await db.getSetting("currency_rates_updated_at").catch(() => null)) ?? "0",
    10
  );

  const age = Date.now() - cachedAt;
  const isFresh = cachedJson !== null && age < CACHE_TTL_MS;

  if (cachedJson !== null) {
    const rates = JSON.parse(cachedJson) as Record<string, number>;
    rates[base] = 1;
    rateCache = { base, rates, fetchedAt: cachedAt };
    rebuildMathWithRates(base, rates);
    notifyUpdate();

    if (!isFresh) {
      fetchAndCacheRates(base).catch(() => {});
    }
  } else {
    fetchAndCacheRates(base).catch(() => {});
  }
}
