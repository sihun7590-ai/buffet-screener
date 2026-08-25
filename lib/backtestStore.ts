import fs from "node:fs";
import path from "node:path";
import type { BacktestResult } from "./backtest";

// Same idea as lib/store.ts's readScores/writeScores for data/scores.json: a
// single cached JSON file the page reads on every request, kept separate from
// lib/backtest.ts so that file can stay pure (no fs, no I/O).
const DATA_FILE = path.join(process.cwd(), "data", "backtest.json");

export function readBacktest(): BacktestResult | null {
  if (!fs.existsSync(DATA_FILE)) return null;
  const raw = fs.readFileSync(DATA_FILE, "utf-8");
  return JSON.parse(raw) as BacktestResult;
}

export function writeBacktest(result: BacktestResult) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(result, null, 2), "utf-8");
}
