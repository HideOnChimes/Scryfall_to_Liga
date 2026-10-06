// Compara a conversao em JS com os CSVs gerados pelo conv.py.
// Uso: node scripts/test_node.mjs <pasta com X.csv e "X - Liga.csv"> [--live]
// Sem --live usa o cache do Scryfall do conv.py (.cache_liga/scryfall.json) em vez da API.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Liga, convertCSV, convertList, parseCSV, scryfallClient } from "../docs/conv.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "docs");
const dir = process.argv[2] || path.join(root, "..", "..");
const live = process.argv.includes("--live");
const loadJSON = async (p) => JSON.parse(fs.readFileSync(path.join(root, p), "utf8"));

// Scryfall recusa o User-Agent padrao do Node (o navegador manda o dele)
const ua = { "User-Agent": "conversor-liga-web-test/1.0" };
let scryfall = scryfallClient((url, o = {}) => fetch(url, { ...o, headers: { ...o.headers, ...ua } }));
if (!live) {
  const cacheFile = [dir, path.join(dir, "..")].map((d) => path.join(d, ".cache_liga", "scryfall.json")).find(fs.existsSync);
  const cache = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
  const real = scryfall.collection.bind(scryfall);
  // ids saem do cache do conv.py; buscas por edicao/nome continuam indo na API
  scryfall.collection = async (idents, cb) => {
    const out = idents.map((idf) => (idf?.id && cache[idf.id] ? { id: idf.id, ...cache[idf.id] } : null));
    const rest = idents.map((idf, i) => (out[i] ? null : idf));
    if (rest.some(Boolean)) (await real(rest, cb)).forEach((c, i) => { if (c) out[i] = c; });
    return out;
  };
}

const liga = await Liga.load(loadJSON);
let total = 0, diff = 0;
for (const f of fs.readdirSync(dir)) {
  const m = f.match(/^(.+?)( - Colecao \(.+)?\.(csv|txt)$/);
  if (!m || f.includes(" - Liga")) continue;
  const expected = path.join(dir, m[2] ? "Hobbit Colecao - Liga.csv" : `${m[1]} - Liga.csv`);
  if (!fs.existsSync(expected)) continue;
  const text = fs.readFileSync(path.join(dir, f), "utf8");
  const rows = f.endsWith(".csv") ? await convertCSV(text, { liga, scryfall }) : await convertList(text, { liga, scryfall });
  const got = rows.slice(1).map((r) => r.slice(0, 12).join("|"));
  const exp = parseCSV(fs.readFileSync(expected, "utf8")).map((r) => Object.values(r).slice(0, 12).join("|"));
  let bad = 0;
  for (let i = 0; i < Math.max(got.length, exp.length); i++) {
    if (got[i] !== exp[i]) {
      bad++;
      if (bad <= 5) console.log(`  ${f} linha ${i + 1}\n    js: ${got[i]}\n    py: ${exp[i]}`);
    }
  }
  total += exp.length; diff += bad;
  console.log(`${bad ? "DIF" : "OK "} ${f}: ${got.length} linhas, ${bad} diferentes`);
}
console.log(`\n${total - diff}/${total} linhas iguais`);
