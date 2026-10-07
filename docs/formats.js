// Escolha de formato de entrada/saida. A conversao para a Liga continua em conv.js;
// aqui ficam a deteccao do formato de entrada e as saidas para os outros apps
// (inclusive LigaMagic -> ManaBox/Moxfield/Scryfall/lista).
import { parseCSV, parseList, toCSV, readRow, colKey, resolveSet, mapLang, sameName, norm,
  convertCSV, convertList, LANG, COND } from "./conv.js";

export const SOURCES = [
  ["auto", "Detectar"], ["manabox", "ManaBox"], ["scryfall", "Scryfall"], ["moxfield", "Moxfield"],
  ["deckbox", "Deckbox"], ["dragonshield", "Dragon Shield"], ["tcgplayer", "TCGplayer"], ["liga", "LigaMagic"],
  ["csv", "Outro CSV"], ["lista", "Lista de texto"],
];
export const TARGETS = [
  ["liga", "LigaMagic"], ["manabox", "ManaBox"], ["moxfield", "Moxfield"], ["scryfall", "Scryfall"],
  ["lista", "Lista de texto"],
];
export const label = (list, key) => (list.find(([k]) => k === key) || [, key])[1];

// ---------------------------------------------------------------- deteccao
function headerKeys(text) {
  const rows = parseCSV(text.split(/\r?\n/).slice(0, 3).join("\n") + "\n");
  return rows.length ? new Set(Object.keys(rows[0]).map(colKey)) : new Set();
}

export function detectFormat(text) {
  const k = headerKeys(text);
  const has = (...names) => names.some((n) => k.has(n));
  if (has("edicaosigla")) return "liga";
  if (has("manaboxid")) return "manabox";
  if (has("scryfallid") && has("multiverseid", "mtgoid", "scryfalluri")) return "scryfall";
  if (has("scryfallid")) return "manabox";
  if (has("foldername")) return "dragonshield";
  if (has("simplename", "productid", "sku")) return "tcgplayer";
  if (has("tradelistcount") && has("cardnumber")) return "deckbox";
  if (has("tradelistcount")) return "moxfield";
  if (has("name", "cardname", "card", "nome", "carta")) return "csv";
  return "lista";
}

// ---------------------------------------------------------------- leitura
function csvRecs(text) {
  return parseCSV(text).map((row) => readRow(Object.fromEntries(Object.entries(row).map(([k, v]) => [colKey(k), v]))));
}

function ligaRecs(text) {
  return parseCSV(text).map((row) => {
    const r = Object.fromEntries(Object.entries(row).map(([k, v]) => [colKey(k), (v || "").trim()]));
    const starts = (p) => Object.keys(r).find((k) => k.startsWith(p) && r[k]);
    const val = (p) => r[starts(p)] || "";
    return {
      id: "", name: r.carden || r.cardpt || "", number: r.card || "", ligaSet: r.edicaosigla || "",
      setCode: "", setAny: "", setName: r.edicaoen || "",
      qty: String(parseInt(r.quantidade, 10) || 1), foil: /foil/i.test(r.extras || ""), promo: /promo/i.test(r.extras || ""),
      quality: COND[colKey(val("qualidade"))] || "NM", lang: mapLang(val("idioma")),
    };
  });
}

function listRecs(text) {
  return parseList(text).map((it) => ({
    id: "", name: it.name, number: it.number, setCode: it.set.toLowerCase(), setAny: "", setName: "",
    qty: it.qty, foil: it.foil, quality: "NM", lang: null,
  }));
}

// sigla da Liga -> codigos candidatos no Scryfall, do mais provavel ao menos: nome da edicao, sigla,
// e o mesmo para a edicao-mae ("schob" = The Hobbit (Scene Card) -> agrupada em "hob")
function ligaToScry(liga, sets, acr) {
  const out = [];
  const add = (c) => { if (c && sets.codes.has(c) && !out.includes(c)) out.push(c); };
  let ed = liga?.byAcr.get(acr.toLowerCase());
  const seen = new Set();
  while (ed && !seen.has(ed.id)) {
    seen.add(ed.id);
    for (const n of [ed.nameen, ed.name]) add(n && sets.byName.get(norm(n)));
    const a = ed.acronym.toLowerCase();
    for (const c of [a, a.replace(/^tk/, "t"), a.replace(/^as/, "a")]) add(c);
    const parent = ed.idgrouped;
    ed = liga.eds.find((e) => e.id === parent);
  }
  add(acr.toLowerCase());
  return out;
}

// nome do arquivo e do Scryfall podem diferir: "A // B" na Liga para uma carta "B", flavor name,
// ou erro de digitacao numa das faces ("Whiplash Wordsmith // Viciour Verse")
function looseName(c, n) {
  if (sameName(c, n)) return true;
  const ln = norm(n);
  const cands = [c.name, c.flavor_name, ...(c.faces || [])].filter(Boolean).map(norm);
  const within = (a, b) => (" " + b + " ").includes(" " + a + " ");
  return cands.some((x) => x && (within(x, ln) || within(ln, x)));
}

// identificadores em ordem de precisao: id, depois edicao+numero em cada edicao candidata,
// depois nome+edicao, por ultimo so o nome
function tries(r) {
  const out = r.id ? [{ id: r.id }] : [];
  if (r.promo && r.number) {
    for (const s of r.sets) {
      out.push({ set: "p" + s, collector_number: r.number + "p" }, { set: "p" + s, collector_number: r.number + "s" });
    }
  }
  if (r.number) for (const s of r.sets) out.push({ set: s, collector_number: r.number });
  if (r.name) for (const s of r.sets) out.push({ name: r.name, set: s });
  if (r.name) out.push({ name: r.name });
  return out;
}

async function resolveAll(recs, { liga, scryfall, onProgress }) {
  const sets = recs.some((r) => !r.id) ? await scryfall.sets() : null;
  for (const r of recs) {
    const direct = resolveSet(r, sets);
    r.sets = sets && direct && !sets.codes.has(direct) ? [] : [direct].filter(Boolean); // sigla que so existe na Liga
    const raw = r.ligaSet || r.setCode || r.setAny;
    if (sets && raw) for (const c of ligaToScry(liga, sets, raw)) if (!r.sets.includes(c)) r.sets.push(c);
    r.tries = tries(r);
    r.scry = null;
  }
  const rounds = Math.max(0, ...recs.map((r) => r.tries.length));
  for (let round = 0; round < rounds; round++) {
    const pending = recs.filter((r) => !r.scry && r.tries[round]);
    if (!pending.length) continue;
    const found = await scryfall.collection(pending.map((r) => r.tries[round]),
      (d, t) => onProgress?.("scryfall", d, t));
    pending.forEach((r, i) => {
      const c = found[i];
      // numero bate mas o nome nao: a Liga numera sets antigos do proprio jeito, entao nao confia
      if (c && (!r.name || r.tries[round].id || looseName(c, r.name))) { r.scry = c; r.via = r.tries[round]; }
    });
  }
}

function note(r) {
  const s = r.scry;
  if (!s) return "VERIFICAR: carta nao encontrada no Scryfall";
  const where = `${s.set.toUpperCase()} #${s.collector_number}`;
  if (r.via.name && !r.via.set) {
    const asked = [r.ligaSet || r.setCode || r.setAny || r.setName, r.number].filter(Boolean).join(" #");
    return asked ? `VERIFICAR: ${asked} nao encontrado, usada ${where}` : `VERIFICAR: edicao nao informada, usada ${where}`;
  }
  if (r.via.name && r.number) return `VERIFICAR: numero ${r.number} nao encontrado, usada ${where}`;
  return "";
}

// ---------------------------------------------------------------- saidas
const LANG_CODE = { EN: "en", PT: "pt", DE: "de", ES: "es", FR: "fr", IT: "it", JP: "ja", KO: "ko", RU: "ru",
  TW: "zht", CS: "zhs", PH: "ph" };
const LANG_NAME = { EN: "English", PT: "Portuguese", DE: "German", ES: "Spanish", FR: "French", IT: "Italian",
  JP: "Japanese", KO: "Korean", RU: "Russian", TW: "Chinese Traditional", CS: "Chinese Simplified", PH: "Phyrexian" };
const MB_COND = { M: "mint", NM: "near_mint", SP: "light_played", MP: "played", HP: "poor", D: "damaged" };
const MOX_COND = { M: "Mint", NM: "Near Mint", SP: "Lightly Played", MP: "Moderately Played", HP: "Heavily Played",
  D: "Damaged" };

// dados da carta: do Scryfall quando achou, senao o que veio no arquivo
function card(r) {
  const s = r.scry;
  return {
    name: s?.name || r.name, set: s?.set || r.set || r.ligaSet || r.setCode || r.setAny || "",
    setName: s?.set_name || r.setName || "", number: s?.collector_number || r.number || "",
    rarity: s?.rarity || "", id: s?.id || "", lang: r.lang || LANG[(s?.lang || "en").toLowerCase()] || "EN",
  };
}

const WRITERS = {
  manabox: {
    header: ["Name", "Set code", "Set name", "Collector number", "Foil", "Rarity", "Quantity", "Scryfall ID",
      "Condition", "Language"],
    row: (r, c) => [c.name, c.set.toUpperCase(), c.setName, c.number, r.foil ? "foil" : "normal", c.rarity, r.qty,
      c.id, MB_COND[r.quality] || "near_mint", LANG_CODE[c.lang] || "en"],
  },
  moxfield: {
    header: ["Count", "Tradelist Count", "Name", "Edition", "Condition", "Language", "Foil", "Tags", "Last Modified",
      "Collector Number", "Alter", "Proxy", "Purchase Price"],
    row: (r, c) => [r.qty, "0", c.name, c.set.toLowerCase(), MOX_COND[r.quality] || "Near Mint",
      LANG_NAME[c.lang] || "English", r.foil ? "foil" : "", "", "", c.number, "False", "False", ""],
  },
  scryfall: {
    header: ["scryfall_id", "name", "set", "collector_number", "lang", "rarity", "quantity", "foil", "condition"],
    row: (r, c) => [c.id, c.name, c.set.toLowerCase(), c.number, LANG_CODE[c.lang] || "en", c.rarity, r.qty,
      r.foil ? "foil" : "nonfoil", r.quality],
  },
  lista: {
    header: ["Linha"],
    row: (r, c) => [`${r.qty} ${c.name}${c.set ? ` (${c.set.toUpperCase()})` : ""}${c.number ? ` ${c.number}` : ""}${r.foil ? " *F*" : ""}`],
  },
};

// ---------------------------------------------------------------- entrada principal
// erros conhecidos levam um codigo para a interface mostrar a mensagem no idioma escolhido
const sameFormat = (target) => Object.assign(
  new Error(`Esse arquivo já está no formato ${label(TARGETS, target)}. Escolha outro formato em "para".`),
  { code: "sameFormat", target });

// devolve { from, to, header, rows, notes, noteInFile, ext }
export async function convert(text, { from = "auto", to = "liga", liga, scryfall, onProgress }) {
  if (from === "auto") from = detectFormat(text);
  const ctx = { liga, scryfall, onProgress };
  if (to === "liga") {
    if (from === "liga") throw sameFormat("liga");
    const out = from === "lista" ? await convertList(text, ctx) : await convertCSV(text, ctx);
    const rows = out.slice(1);
    return { from, to, header: out[0], rows, notes: rows.map((r) => r[12]), noteInFile: true, ext: "csv" };
  }
  if (from === to && from !== "lista") {
    throw sameFormat(to);
  }
  const recs = from === "lista" ? listRecs(text) : from === "liga" ? ligaRecs(text) : csvRecs(text);
  if (!recs.length) throw Object.assign(new Error("Não encontrei cartas no arquivo."), { code: "noCards" });
  await resolveAll(recs, ctx);
  const w = WRITERS[to];
  return { from, to, header: w.header, rows: recs.map((r) => w.row(r, card(r))), notes: recs.map(note),
    noteInFile: false, ext: to === "lista" ? "txt" : "csv" };
}

// valores aceitos nas colunas de opcoes fechadas, por formato de destino: { indice da coluna: [valores] }.
// "" = vazio. Valor que vier no arquivo e nao estiver na lista continua aparecendo como opcao.
const LANGS_CODE = ["en", "pt", "de", "es", "fr", "it", "ja", "ko", "ru", "zhs", "zht", "ph"];
export const ENUMS = {
  liga: {
    6: ["M", "NM", "SP", "MP", "HP", "D"],
    7: ["BR", "PT", "EN", "DE", "ES", "FR", "IT", "JP", "KO", "RU", "TW", "CS", "PH"],
    8: ["M", "R", "U", "C", "S"],
    9: ["W", "U", "B", "R", "G", "M", "A", "L", "C", "S"],
    10: ["", "Foil", "Promo", "Foil, Promo"],
  },
  manabox: {
    4: ["normal", "foil", "etched"],
    5: ["common", "uncommon", "rare", "mythic", "special", "bonus"],
    8: ["mint", "near_mint", "excellent", "good", "light_played", "played", "poor", "damaged"],
    9: LANGS_CODE,
  },
  moxfield: {
    4: Object.values(MOX_COND),
    5: Object.values(LANG_NAME),
    6: ["", "foil", "etched"],
    10: ["False", "True"],
    11: ["False", "True"],
  },
  scryfall: {
    4: LANGS_CODE,
    5: ["common", "uncommon", "rare", "mythic", "special", "bonus"],
    7: ["nonfoil", "foil", "etched"],
    8: ["M", "NM", "SP", "MP", "HP", "D"],
  },
};

export function serialize(result) {
  if (result.ext === "txt") return result.rows.map((r) => r[0]).join("\r\n") + "\r\n";
  return toCSV([result.header, ...result.rows]);
}
