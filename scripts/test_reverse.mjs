// Ida e volta: converte cada "X - Liga.csv" para ManaBox e confere se a carta
// (Scryfall ID), quantidade e foil batem com o "X.csv" original do ManaBox.
// Uso: node scripts/test_reverse.mjs ../Colecoes
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Liga, parseCSV, scryfallClient } from "../docs/conv.js";
import { convert, detectFormat } from "../docs/formats.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "docs");
const dir = process.argv[2];
const ua = { "User-Agent": "conversor-liga-web-test/1.0" };
const scryfall = scryfallClient((url, o = {}) => fetch(url, { ...o, headers: { ...o.headers, ...ua } }));
const liga = await Liga.load(async (p) => JSON.parse(fs.readFileSync(path.join(root, p), "utf8")));

let total = 0, same = 0, sameCard = 0;
for (const f of fs.readdirSync(dir)) {
  const orig = path.join(dir, f.replace(" - Liga.csv", ".csv"));
  if (!f.endsWith(" - Liga.csv") || !fs.existsSync(orig)) continue;
  const text = fs.readFileSync(path.join(dir, f), "utf8");
  const res = await convert(text, { from: detectFormat(text), to: "manabox", liga, scryfall });
  const mb = parseCSV(fs.readFileSync(orig, "utf8"));
  let ok = 0, okCard = 0;
  res.rows.forEach((r, i) => {
    const o = mb[i];
    const card = r[7] === o["Scryfall ID"];
    const all = card && r[6] === o.Quantity && r[4] === o.Foil;
    okCard += card; ok += all;
    if (!card) console.log(`    ${f} #${i + 1}: ${o.Name} ${o["Set code"]} #${o["Collector number"]} -> ${r[0]} ${r[1]} #${r[3]} ${res.notes[i]}`);
  });
  total += res.rows.length; same += ok; sameCard += okCard;
  console.log(`${okCard === res.rows.length ? "OK " : "DIF"} ${f} (${res.from}): ${okCard}/${res.rows.length} mesma carta, ${ok} idênticas`);
}
console.log(`\n${sameCard}/${total} mesma impressão, ${same}/${total} com quantidade e foil iguais`);
