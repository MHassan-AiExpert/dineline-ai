import type { MenuItem } from "./types";

const ALIASES: Record<string, string> = {
  coke: "Soft Drink",
  "diet coke": "Soft Drink",
  sprite: "Soft Drink",
  soda: "Soft Drink",
  "ginger ale": "Soft Drink",
  pop: "Soft Drink",
  lassi: "Mango Lassi",
  "mango shake": "Mango Lassi",
  tea: "Karak Chai",
  chai: "Karak Chai",
  lemonade: "Mint Lemonade",
  "seekh kebab": "Lamb Seekh Kebab",
  kebab: "Lamb Seekh Kebab",
  kabab: "Lamb Seekh Kebab",
  "seekh kabab": "Lamb Seekh Kebab",
  "tikka masala": "Butter Chicken",
  "chicken tikka masala": "Butter Chicken",
  "murgh makhani": "Butter Chicken",
  karahi: "Chicken Karahi",
  biryani: "Chicken Biryani",
  "biriyani": "Chicken Biryani",
  "veg biryani": "Vegetable Biryani",
  samosa: "Vegetable Samosa",
  samosas: "Vegetable Samosa",
  pakora: "Chicken Pakora",
  "fish fry": "Amritsari Fish",
  fish: "Amritsari Fish",
  dal: "Dal Makhani",
  daal: "Dal Makhani",
  chana: "Chana Masala",
  chole: "Chana Masala",
  palak: "Saag Paneer",
  "palak paneer": "Saag Paneer",
  naan: "Butter Naan",
  nan: "Butter Naan",
  roti: "Tandoori Roti",
  rice: "Jeera Rice",
  salad: "Kachumber Salad",
  raita: "Cucumber Raita",
  kheer: "Saffron Kheer",
  "rice pudding": "Saffron Kheer",
  "gulab jamun": "Gulab Jamun",
  jamun: "Gulab Jamun",
  "mixed grill": "Saffron Mixed Grill",
  "lamb chops": "Saffron Mixed Grill",
};

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(the|a|an|some|of|please|order|orders|plate|plates|portion|portions)\b/g, " ")
    .replace(/s\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(s: string): string[] {
  return normalize(s).split(" ").filter(Boolean);
}

/** Edit distance, used to forgive typos like "lamp biryani" or "biriani". */
function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

/** Two words match if equal, or close enough for their length (1 typo from 4 letters, 2 from 8). */
function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  const len = Math.min(a.length, b.length);
  if (len < 4) return false;
  return editDistance(a, b) <= (len >= 8 ? 2 : 1);
}

export interface MenuMatch {
  item: MenuItem;
  score: number;
}

/** Fuzzy-matches what a caller said to menu items, best first. */
export function matchMenu(query: string, menu: MenuItem[]): MenuMatch[] {
  const q = normalize(query);
  if (!q) return [];
  const aliasTarget = Object.entries(ALIASES)
    .sort((a, b) => b[0].length - a[0].length)
    .find(([alias]) => new RegExp(`(^|\\s)${normalize(alias)}(\\s|$)`).test(q));

  const qt = tokens(query);
  const results: MenuMatch[] = menu.map((item) => {
    const n = normalize(item.name);
    let score = 0;
    if (n === q) score = 1;
    else if (n.includes(q) && q.length >= 4) score = 0.9;
    else if (q.includes(n)) score = 0.92;
    else {
      const it = tokens(item.name);
      const exact = qt.filter((t) => it.includes(t)).length;
      const fuzzy = it.filter((w) => qt.some((t) => sameWord(t, w))).length;
      const overlap = Math.max(exact, fuzzy);
      // every word of the dish name heard (allowing typos) counts almost like an exact match
      score = overlap === it.length && overlap > exact ? 0.96 : overlap ? (overlap / Math.max(it.length, qt.length)) * 0.85 : 0;
    }
    if (aliasTarget && item.name === aliasTarget[1]) score = Math.max(score, 0.95);
    return { item, score };
  });
  return results.filter((r) => r.score >= 0.4).sort((a, b) => b.score - a.score);
}

export function bestMatch(query: string, menu: MenuItem[]): MenuItem | null {
  const m = matchMenu(query, menu);
  if (!m.length) return null;
  // ambiguous ties (e.g. "biryani" when lamb/chicken score equal) still resolve to the top match
  return m[0].score >= 0.5 ? m[0].item : null;
}
