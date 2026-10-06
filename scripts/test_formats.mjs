// Gera o mesmo export em formato de varios apps a partir de um CSV do ManaBox
// e confere se todos convertem igual ao "X - Liga.csv" de referencia.
// Uso: node scripts/test_formats.mjs ../Colecoes/Hobbit.csv
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Liga, convertCSV, parseCSV, toCSV, scryfallClient, looksLikeCSV } from "../docs/conv.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "docs");
const src = process.argv[2];
const ref = parseCSV(fs.readFileSync(src.replace(/\.csv$/, " - Liga.csv"), "utf8")).map(Object.values);
const mb = parseCSV(fs.readFileSync(src, "utf8"));
const ua = { "User-Agent": "conversor-liga-web-test/1.0" };
const scryfall = scryfallClient((url, o = {}) => fetch(url, { ...o, headers: { ...o.headers, ...ua } }));
const liga = await Liga.load(async (p) => JSON.parse(fs.readFileSync(path.join(root, p), "utf8")));
const setName = (r) => r["Set name"];
const cond = { near_mint: ["Near Mint", "NearMint"] };
const foil = (r) => r.Foil !== "normal";

const formats = {
  scryfall: { ignore: [5, 10], rows: [["multiverse_id", "set", "collector_number", "lang", "rarity", "name", "scryfall_id"],
    ...mb.map((r) => ["", r["Set code"], r["Collector number"], r.Language, "R", r.Name, r["Scryfall ID"]])] },
  moxfield: { rows: [["Count", "Tradelist Count", "Name", "Edition", "Condition", "Language", "Foil", "Tags", "Last Modified", "Collector Number"],
    ...mb.map((r) => [r.Quantity, "0", r.Name, r["Set code"].toLowerCase(), cond[r.Condition][0], "English", foil(r) ? "foil" : "", "", "", r["Collector number"]])] },
  deckbox: { rows: [["Count", "Tradelist Count", "Name", "Edition", "Card Number", "Condition", "Language", "Foil", "Signed"],
    ...mb.map((r) => [r.Quantity, "0", r.Name, setName(r), r["Collector number"], cond[r.Condition][0], "English", foil(r) ? "foil" : "", ""])] },
  dragonshield: { prefix: '"sep=,"\r\n', rows: [["Folder Name", "Quantity", "Trade Quantity", "Card Name", "Set Code", "Set Name", "Card Number", "Condition", "Printing", "Language"],
    ...mb.map((r) => ["Pasta", r.Quantity, "0", r.Name, r["Set code"], setName(r), r["Collector number"], cond[r.Condition][1], foil(r) ? "Foil" : "Normal", "English"])] },
  tcgplayer: { rows: [["Quantity", "Name", "Simple Name", "Set", "Card Number", "Set Code", "Printing", "Condition", "Language"],
    ...mb.map((r) => [r.Quantity, r.Name + " (Variant)", r.Name, setName(r), r["Collector number"], r["Set code"], foil(r) ? "Foil" : "Normal", "Near Mint", "English"])] },
  "excel-br (;)": { sep: ";", rows: [["Quantidade", "Name", "Set Code", "Collector Number", "Foil"],
    ...mb.map((r) => [r.Quantity, r.Name, r["Set code"], r["Collector number"], foil(r) ? "sim" : ""])] },
};

for (const [name, f] of Object.entries(formats)) {
  let text = (f.prefix || "") + toCSV(f.rows);
  if (f.sep) text = f.rows.map((r) => r.join(f.sep)).join("\n");
  if (!looksLikeCSV(text)) { console.log(`FALHA ${name}: nao reconhecido como CSV`); continue; }
  const got = (await convertCSV(text, { liga, scryfall })).slice(1);
  const ign = new Set(f.ignore || []);
  const show = (r) => r.slice(0, 12).map((v, i) => (ign.has(i) ? "*" : v)).join("|");
  const bad = got.filter((r, i) => show(r) !== show(ref[i]));
  console.log(`${bad.length ? "DIF " : "OK  "} ${name}: ${got.length - bad.length}/${ref.length}`);
  for (const r of bad.slice(0, 3)) {
    const i = got.indexOf(r);
    console.log(`    js:  ${show(r)} ${r[12]}\n    ref: ${show(ref[i])}`);
  }
}
