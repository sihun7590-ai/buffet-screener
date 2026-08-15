import fs from "node:fs";
import path from "node:path";
import type { StockScore } from "./types";

// Small local universe → a single cached JSON file is simpler and just as
// fast as a database here, and avoids native-module build issues entirely.
const DATA_FILE = path.join(process.cwd(), "data", "scores.json");

export interface ScoresFile {
  generatedAt: string;
  source: "live" | "fixture";
  scores: StockScore[];
}

export function readScores(): ScoresFile {
  if (!fs.existsSync(DATA_FILE)) {
    return { generatedAt: "", source: "fixture", scores: [] };
  }
  const raw = fs.readFileSync(DATA_FILE, "utf-8");
  return JSON.parse(raw) as ScoresFile;
}

export function writeScores(scores: StockScore[], source: "live" | "fixture") {
  const payload: ScoresFile = {
    generatedAt: new Date().toISOString(),
    source,
    scores,
  };
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(payload, null, 2), "utf-8");
}

export function getScoreByTicker(ticker: string): StockScore | undefined {
  const { scores } = readScores();
  return scores.find((s) => s.ticker.toUpperCase() === ticker.toUpperCase());
}
