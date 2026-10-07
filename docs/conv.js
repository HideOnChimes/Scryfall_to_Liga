// Conversao CSV de colecao (ManaBox, Scryfall, Moxfield...) ou lista -> CSV de importacao da LigaMagic.
// Porta do conv.py. Roda no navegador e no Node (para testes): quem usa injeta
// `loadJSON(path)` (dados estaticos em docs/data) e `scryfall` (consultas a API).

export const LIGA_HEADER = ["Edicao (PTBR)", "Edicao (EN)", "Edicao (Sigla)", "Card (PT)", "Card (EN)", "Quantidade",
  "Qualidade (M NM SP MP HP D)", "Idioma (BR EN DE ES FR IT JP KO RU TW)", "Raridade (M R U C)",
  "Cor (W U B R G M A L)", "Extras", "Card #", "Comentario"];

export const LANG = { en: "EN", pt: "PT", de: "DE", es: "ES", fr: "FR", it: "IT", ja: "JP", ko: "KO",
  ru: "RU", zht: "TW", zhs: "CS", ph: "PH" };
const RARITY = { mythic: "M", rare: "R", uncommon: "U", common: "C", special: "S", bonus: "S" };
// codigos internos da Liga (descobertos comparando com um export real)
const LIGA_RARITY = { 1: "C", 2: "U", 3: "R", 4: "M" };
const LIGA_COLOR = { 2: "B", 3: "G", 4: "L", 5: "M", 6: "R", 7: "U", 8: "W", 9: "C", 10: "S" };
const PROMO_TYPES = new Set(["prerelease", "promopack", "playpromo", "datestamped", "stamped", "buyabox", "bundle",
  "storechampionship", "gameday", "release", "openhouse", "planeswalkerstamped"]);

// ---------------------------------------------------------------- texto
const ascii = (s) => (s || "").normalize("NFKD").replace(/[^\x00-\x7f]/g, "");

export function norm(s) {
  return ascii(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function normNum(n) {
  n = (n || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  n = n.replace(/^t(?=\d)/, ""); // tokens na Liga: T01 -> 01
  return n.replace(/^0+/, "") || "0";
}

const ligaText = ascii; // o export da Liga usa texto sem acento
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function namesMatch(ligaName, scry) {
  const ln = norm(ligaName);
  const cands = new Set([norm(scry.name)]);
  if (scry.flavor_name) cands.add(norm(scry.flavor_name));
  for (const f of scry.faces || []) cands.add(norm(f));
  // nome da Liga pode ter sufixo ("Cadet 2/2", "A // B"), mas nunca o contrario
  // ("Goblin" nao pode casar com "Goblin Tinkerer")
  for (const c of cands) {
    if (c && (c === ln || new RegExp("(^|\\W)" + escRe(c) + "($|\\W)").test(ln))) return true;
  }
  return false;
}

function colorFromScry(scry) {
  const t = (scry.type_line || "").toLowerCase();
  const ci = scry.color_identity || [];
  if (t.includes("land") && !ci.length) return "L";
  if (ci.length > 1) return "M";
  return ci[0] || "C";
}

// ---------------------------------------------------------------- liga
export class Liga {
  constructor(eds, loadJSON) {
    this.eds = eds;
    this.loadJSON = loadJSON;
    this.cache = new Map();
    this.byAcr = new Map();
    this.byName = new Map();
    this.tokens = new Map();
    for (const e of eds) {
      if (!this.byAcr.has(e.acronym.toLowerCase())) this.byAcr.set(e.acronym.toLowerCase(), e);
      const toks = new Set();
      for (const n of [e.name, e.nameen]) {
        if (!n) continue;
        if (!this.byName.has(norm(n))) this.byName.set(norm(n), e);
        for (const t of norm(n).split(" ")) if (t) toks.add(t);
      }
      this.tokens.set(e.id, toks);
    }
  }

  static async load(loadJSON) {
    return new Liga(await loadJSON("data/edicoes.json"), loadJSON);
  }

  async cards(ed) {
    if (!ed.s) return []; // edicao ainda nao indexada
    if (!this.cache.has(ed.id)) {
      this.cache.set(ed.id, this.loadJSON(`data/cards/${ed.id}.json`)
        .then((rows) => rows.map(([nEN, nPT, sN, pF, iR, iC]) => ({ nEN, nPT, sN, pF, iR, iC })))
        .catch(() => []));
    }
    return this.cache.get(ed.id);
  }

  fuzzy(setName, minScore = 0.5) {
    const want = new Set(norm(setName).split(" ").filter(Boolean));
    const scored = [];
    for (const e of this.eds) {
      const toks = this.tokens.get(e.id);
      if (!toks.size || !want.size) continue;
      let inter = 0;
      for (const t of want) if (toks.has(t)) inter++;
      const score = inter / (want.size + toks.size - inter);
      if (score >= minScore) scored.push([score, e]);
    }
    scored.sort((a, b) => b[0] - a[0]);
    return scored.slice(0, 6).map((x) => x[1]);
  }

  group(base) {
    const seen = new Set(), out = [];
    const add = (e) => { if (e && !seen.has(e.id)) { seen.add(e.id); out.push(e); } };
    const main = this.byAcr.get(base);
    add(main);
    if (main) for (const e of this.eds) if (e.idgrouped === main.id) add(e);
    if (base.length >= 3) {
      for (const e of this.eds) { // rfspg, tkfinjp, ...
        const a = e.acronym.toLowerCase();
        if (a.endsWith(base) || a.startsWith(base)) add(e);
      }
    }
    return out;
  }

  candidates(scry) {
    const s = scry.set.toLowerCase();
    const bases = [s];
    if (s.startsWith("p") && this.byAcr.has(s.slice(1))) bases.push(s.slice(1)); // promos -> set principal
    if (s.startsWith("t") && this.byAcr.has("tk" + s.slice(1))) bases.push("tk" + s.slice(1)); // tokens
    if (s.startsWith("a") && this.byAcr.has("as" + s.slice(1))) bases.push("as" + s.slice(1)); // art series
    // sets antigos usam siglas diferentes (exo -> ex, mir -> mr...), entao o nome tambem entra
    const e = this.byName.get(norm(scry.set_name));
    if (e) bases.push(e.acronym.toLowerCase());
    const out = [], seen = new Set();
    for (const b of bases) for (const g of this.group(b)) if (!seen.has(g.id)) { seen.add(g.id); out.push(g); }
    return out;
  }

  async search(cands, scry, num, numClean) {
    const byNum = [], byName = [];
    for (const e of cands) {
      for (const c of await this.cards(e)) {
        if (!namesMatch(c.nEN, scry)) continue;
        byName.push([e, c]);
        const n = normNum(c.sN);
        if (n === num || n === numClean) byNum.push([e, c]);
      }
    }
    return [byNum, byName];
  }

  async find(scry, foil) {
    const num = normNum(scry.collector_number);
    const numClean = num.replace(/[a-z]+$/, ""); // 191s -> 191
    const cands = this.candidates(scry);
    let [byNum, byName] = await this.search(cands, scry, num, numClean);
    if (!byNum.length && !byName.length) {
      // nome do set parecido ("30th Anniversary Play Promos" -> "30th Anniversary Promos")
      const extra = this.fuzzy(scry.set_name).filter((e) => !cands.includes(e));
      if (extra.length) {
        cands.push(...extra);
        [byNum, byName] = await this.search(extra, scry, num, numClean);
      }
    }
    const hits = this.rank(byNum.length ? byNum : byName, foil, num);
    const missing = cands.filter((e) => !e.s).map((e) => e.acronym);
    if (!hits.length) return { hit: null, cands, note: "nao encontrada", missing };
    if (byNum.length) return { hit: hits[0], cands, note: "", missing };
    // so o nome bateu: normal em sets antigos (Liga numera do proprio jeito)
    const eds = new Set(byName.map((h) => h[0].id));
    return { hit: hits[0], cands, missing,
      note: eds.size > 1 ? "numero diferente, mais de uma edicao possivel" : "numero da Liga difere do Scryfall" };
  }

  rank(hits, foil, num) {
    if (hits.length > 1) {
      // prefere flag foil compativel, depois numero exato, depois set principal
      const key = (h) => [((h[1].pF || 0) !== (foil ? 1 : 0)) | 0, (normNum(h[1].sN) !== num) | 0,
        (h[0].idgrouped !== "0") | 0];
      hits.sort((a, b) => { const ka = key(a), kb = key(b); return ka[0] - kb[0] || ka[1] - kb[1] || ka[2] - kb[2]; });
    }
    return hits;
  }

  // Promos que o Scryfall agrupa num set generico (pw25 "Wizards Play Network 2025", plst "The List"...)
  // a Liga guarda na edicao "(Promo)" do set de origem: Gran-Gran pw25 #14 -> prtla #1. Descobre o set
  // de origem pelas outras impressoes da carta (a de data mais proxima) e procura no grupo dele,
  // primeiro nas edicoes "(Promo)", depois no set principal (que recebe Extras = Promo).
  async findViaPrints(scry, foil, scryfall) {
    if (!scry.promo || !scryfall?.prints) return null;
    const prints = await scryfall.prints(scry);
    const t0 = Date.parse(scry.released_at || "") || 0;
    const dist = (p) => Math.abs((Date.parse(p.released_at || "") || 0) - t0);
    const others = prints
      .filter((p) => p.set !== scry.set && !["promo", "token", "memorabilia"].includes(p.set_type))
      .sort((a, b) => dist(a) - dist(b)).slice(0, 3);
    for (const p of others) {
      const alt = { ...scry, set: p.set, set_name: p.set_name, collector_number: p.collector_number };
      const num = normNum(alt.collector_number);
      const group = this.candidates(alt);
      const promoEds = group.filter((e) => /promo/i.test(e.name || ""));
      for (const cands of [promoEds, group]) {
        if (!cands.length) continue;
        const [byNum, byName] = await this.search(cands, alt, num, num);
        const hits = this.rank(byNum.length ? byNum : byName, foil, num);
        if (hits.length) return { hit: hits[0], cands, note: "", missing: [] };
      }
    }
    return null;
  }

  // lista de texto com sigla da Liga ("1 Bolg's Company [SCHOB]"): procura direto na edicao
  async findDirect(acr, name, number) {
    const ed = this.byAcr.get(acr.toLowerCase());
    if (!ed) return null;
    const fake = { name };
    const hits = (await this.cards(ed)).filter((c) => namesMatch(c.nEN, fake));
    if (!hits.length) return null;
    const exact = number && hits.find((c) => normNum(c.sN) === normNum(number));
    return [ed, exact || hits[0]];
  }
}

// ---------------------------------------------------------------- scryfall
const SCRY = "https://api.scryfall.com";
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

function slim(j) {
  const keep = ["id", "name", "set", "set_name", "set_type", "collector_number", "rarity", "lang", "promo",
    "promo_types", "color_identity", "type_line", "flavor_name", "oracle_id", "released_at"];
  const o = {};
  for (const k of keep) o[k] = j[k] ?? null;
  if (j.card_faces) o.faces = j.card_faces.map((f) => f.name);
  return o;
}

export const sameName = (c, n) => norm(c.name) === norm(n) || (c.faces || []).some((f) => norm(f) === norm(n));

// a API nao garante a ordem da resposta, entao cada identificador e casado de volta pelo conteudo
function matches(c, idf) {
  if (idf.id) return c.id === idf.id;
  if (idf.set && c.set !== idf.set) return false;
  if (idf.collector_number) return c.collector_number.toLowerCase() === idf.collector_number.toLowerCase();
  return sameName(c, idf.name);
}

// /cards/collection e /cards/named aceitam ~2 requisicoes por segundo; 429 = espera e tenta de novo
const GAP = 550;

export function scryfallClient(fetchFn = fetch) {
  let sets = null;
  const call = async (url, opts) => {
    for (let i = 0; ; i++) {
      const r = await fetchFn(url, opts);
      if (r.status !== 429 || i === 4) return r;
      await pause(3000 * (i + 1));
    }
  };
  return {
    // identificadores {id} | {set, collector_number} | {name, set} | {name}; ate 75 por requisicao.
    // Devolve um array alinhado com a entrada (null = nao encontrada).
    async collection(idents, onProgress) {
      const out = idents.map(() => null);
      const todo = idents.map((idf, i) => [idf, i]).filter(([idf]) => idf);
      for (let i = 0; i < todo.length; i += 75) {
        const batch = todo.slice(i, i + 75);
        const r = await call(`${SCRY}/cards/collection`, {
          method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ identifiers: batch.map(([idf]) => idf) }),
        });
        if (!r.ok) throw new Error(`Scryfall respondeu ${r.status}`);
        const cards = (await r.json()).data.map(slim);
        for (const [idf, k] of batch) out[k] = cards.find((c) => matches(c, idf)) || null;
        onProgress?.(Math.min(i + 75, todo.length), todo.length);
        await pause(GAP);
      }
      return out;
    },
    async byIds(ids, onProgress) {
      const found = await this.collection(ids.map((id) => ({ id })), onProgress);
      return new Map(found.filter(Boolean).map((c) => [c.id, c]));
    },
    // lista de sets do Scryfall, para traduzir nome do set (Deckbox, TCGplayer) em codigo
    async sets() {
      if (!sets) {
        const r = await fetchFn(`${SCRY}/sets`, { headers: { Accept: "application/json" } });
        if (!r.ok) throw new Error(`Scryfall respondeu ${r.status}`);
        const data = (await r.json()).data;
        sets = { codes: new Set(data.map((s) => s.code)), byName: new Map(data.map((s) => [norm(s.name), s.code])) };
      }
      return sets;
    },
    // todas as impressoes de uma carta (para achar o set de origem de uma promo generica)
    async prints(card) {
      const q = card.oracle_id ? `oracleid:${card.oracle_id}` : `!"${card.name}"`;
      const url = `${SCRY}/cards/search?${new URLSearchParams({ q, unique: "prints", order: "released" })}`;
      await pause(GAP);
      const r = await call(url, { headers: { Accept: "application/json" } });
      return r.ok ? ((await r.json()).data || []).map(slim) : [];
    },
    async named(name, set) {
      const q = new URLSearchParams({ exact: name });
      if (set) q.set("set", set);
      await pause(GAP);
      const r = await call(`${SCRY}/cards/named?${q}`, { headers: { Accept: "application/json" } });
      return r.ok ? slim(await r.json()) : null;
    },
  };
}

// ---------------------------------------------------------------- entrada
function delimiter(text) {
  const sep = text.match(/^"?sep=(.)"?\r?\n/i); // Dragon Shield (e Excel) comecam com "sep=,"
  if (sep) return [sep[1], text.slice(sep[0].length)];
  const first = text.split(/\r?\n/, 1)[0];
  const count = (ch) => first.split(ch).length;
  const best = [",", ";", "\t"].sort((a, b) => count(b) - count(a))[0]; // Excel em PT-BR salva com ";"
  return [best, text];
}

export function parseCSV(text) {
  const rows = [];
  let row = [], field = "", q = false, delim;
  [delim, text] = delimiter(text.replace(/^﻿/, ""));
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [head, ...body] = rows.filter((r) => r.some((c) => c.trim()));
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), r[i] ?? ""])));
}

export function toCSV(rows) {
  const esc = (v) => { v = String(v ?? ""); return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; };
  return rows.map((r) => r.map(esc).join(",")).join("\r\n") + "\r\n";
}

// "1 Nome (SET) 123", "1 Nome [SET]", "1 [SET] Nome", "1x Nome", "1 Nome *F*"
export function parseList(text) {
  const out = [];
  for (let line of text.split(/\r?\n/)) {
    line = line.trim();
    if (!line || /^(\/\/|#)/.test(line)) continue;
    const m = line.match(/^(\d+)\s*x?\s+(.+)$/i);
    let qty = "1", rest = line;
    if (m) { qty = m[1]; rest = m[2]; }
    let foil = false;
    rest = rest.replace(/\s*\*(F|E)\*\s*$/i, () => { foil = true; return ""; });
    let name = rest, set = "", number = "", r;
    if ((r = rest.match(/^\[([^\]]+)\]\s*(.+)$/))) [, set, name] = r;
    else if ((r = rest.match(/^(.+?)\s*\[([^\]]+)\]\s*(\S+)?$/))) [, name, set, number = ""] = r;
    else if ((r = rest.match(/^(.+?)\s*\(([A-Za-z0-9]{2,8})\)\s*(\S+)?$/))) [, name, set, number = ""] = r;
    out.push({ qty, name: name.trim(), set: set.trim(), number: number.trim(), foil });
  }
  return out;
}

// ---------------------------------------------------------------- CSV de qualquer app
// colunas reconhecidas (nome normalizado: minusculo, sem acento, so letras e numeros), em ordem de
// preferencia. ManaBox, Scryfall, Moxfield, Deckbox, Dragon Shield, TCGplayer, planilhas em PT...
const COLS = {
  id: ["scryfallid"],
  qty: ["quantity", "count", "qty", "amount", "quantidade", "qtd"],
  name: ["simplename", "name", "cardname", "card", "nome", "carta"], // TCGplayer: "Simple Name" vem sem "(Showcase)"
  setCode: ["setcode", "editioncode"],
  setName: ["setname"],
  setAny: ["set", "edition", "expansion", "edicao", "colecao"], // codigo ou nome, depende do app
  number: ["collectornumber", "cardnumber", "number", "cn", "numero"],
  foil: ["foil", "printing", "finish"],
  cond: ["condition", "condicao", "qualidade"],
  lang: ["language", "lang", "idioma"],
};
export const COND = { mint: "M", m: "M", nearmint: "NM", nm: "NM", quasenovo: "NM", excellent: "SP", ex: "SP", good: "SP",
  lightplayed: "SP", lightlyplayed: "SP", goodlightlyplayed: "SP", lp: "SP", sp: "SP", played: "MP",
  moderatelyplayed: "MP", mp: "MP", poor: "HP", heavilyplayed: "HP", hp: "HP", damaged: "D", d: "D" };
const LANG_NAMES = { english: "EN", ingles: "EN", portuguese: "PT", portugues: "PT", portuguesebrazil: "PT", brazilianportuguese: "PT", br: "PT",
  german: "DE", spanish: "ES", french: "FR", italian: "IT", japanese: "JP", jp: "JP", korean: "KO", russian: "RU",
  tw: "TW", cs: "CS", chinesetraditional: "TW", traditionalchinese: "TW", chinesesimplified: "CS", simplifiedchinese: "CS", phyrexian: "PH" };

export const colKey = (h) => norm(h).replace(/ /g, "");

export function mapLang(v) {
  v = (v || "").trim().toLowerCase();
  return LANG[v] || LANG_NAMES[colKey(v)] || null;
}

export const isFoil = (v) => /foil|etched|^(true|yes|sim|s|1)$/i.test(v || "") && !/non.?foil|normal/i.test(v);

export function readRow(row) {
  const pick = (aliases) => { for (const a of aliases) if (row[a]?.trim()) return row[a].trim(); return ""; };
  return {
    id: pick(COLS.id), name: pick(COLS.name), number: pick(COLS.number),
    setCode: pick(COLS.setCode).toLowerCase(), setName: pick(COLS.setName), setAny: pick(COLS.setAny),
    qty: String(parseInt(pick(COLS.qty), 10) || 1),
    foil: isFoil(pick(COLS.foil)),
    quality: COND[colKey(pick(COLS.cond))] || "NM",
    lang: mapLang(pick(COLS.lang)),
  };
}

// "Edition"/"Set" e codigo no Moxfield/Scryfall e nome no Deckbox/TCGplayer
export function resolveSet(r, sets) {
  if (r.setCode) return r.setCode;
  if (!sets) return "";
  for (const v of [r.setAny, r.setName]) {
    if (!v) continue;
    if (sets.codes.has(v.toLowerCase())) return v.toLowerCase();
    const code = sets.byName.get(norm(v));
    if (code) return code;
  }
  return "";
}

export function looksLikeCSV(text) {
  const rows = parseCSV(text.split(/\r?\n/).slice(0, 3).join("\n") + "\n");
  if (!rows.length) return false;
  const keys = new Set(Object.keys(rows[0]).map(colKey));
  return COLS.id.some((k) => keys.has(k)) || COLS.name.some((k) => keys.has(k));
}

// ---------------------------------------------------------------- conversao
function rowFromHit(ed, c, scry) {
  return {
    ed_pt: ligaText(ed.namept), ed_en: ligaText(ed.nameen || ed.name), sigla: ed.acronym,
    card_pt: ligaText(c.nPT), card_en: ligaText(c.nEN), num: c.sN,
    rar: LIGA_RARITY[c.iR] || (scry && RARITY[scry.rarity]) || "",
    col: LIGA_COLOR[c.iC] || (scry ? colorFromScry(scry) : ""),
  };
}

function rowFromMiss(cands, scry) {
  const main = cands[0];
  return {
    ed_pt: main ? ligaText(main.namept) : "", ed_en: main ? ligaText(main.name) : scry.set_name,
    sigla: main ? main.acronym : scry.set, card_pt: "", card_en: scry.name, num: scry.collector_number,
    rar: RARITY[scry.rarity] || "", col: colorFromScry(scry),
  };
}

function emit(b, qty, quality, lang, extras, comment) {
  return [b.ed_pt, b.ed_en, b.sigla, b.card_pt, b.card_en, qty, quality, lang, b.rar, b.col,
    extras.join(", "), b.num, comment];
}

async function convertScry(liga, scry, { qty, quality, lang, foil, scryfall }) {
  let promo = (scry.promo_types || []).some((p) => PROMO_TYPES.has(p)) ||
    (scry.set.toLowerCase().startsWith("p") && liga.byAcr.has(scry.set.toLowerCase().slice(1)));
  let found = await liga.find(scry, foil);
  if (!found.hit) found = (await liga.findViaPrints(scry, foil, scryfall)) || found;
  const { hit, cands, note, missing } = found;
  if (hit && (hit[0].name || "").toLowerCase().includes("promo")) promo = false; // ja e edicao "(Promos)"
  const extras = [foil && "Foil", promo && "Promo"].filter(Boolean);
  const ref = `Scryfall ${scry.set} #${scry.collector_number}`;
  if (hit) {
    const comment = note ? `VERIFICAR: ${note} (${ref})` : "";
    return emit(rowFromHit(hit[0], hit[1], scry), qty, quality, lang, extras, comment);
  }
  const why = missing.length ? `edicao ainda nao indexada no site: ${missing.join(", ")}` : "nao encontrada na Liga";
  return emit(rowFromMiss(cands, scry), qty, quality, lang, extras, `VERIFICAR: ${why} (${ref})`);
}

// identificador mais preciso disponivel; cada falha cai para o proximo
export function identifiers(r) {
  const out = [];
  if (r.id) out.push({ id: r.id });
  if (r.set && r.number) out.push({ set: r.set, collector_number: r.number });
  if (r.set && r.name) out.push({ name: r.name, set: r.set });
  if (r.name) out.push({ name: r.name });
  return out;
}

export async function convertCSV(text, { liga, scryfall, onProgress }) {
  const recs = parseCSV(text).map((row) =>
    readRow(Object.fromEntries(Object.entries(row).map(([k, v]) => [colKey(k), v]))));
  const needSets = recs.some((r) => !r.id && !r.setCode && (r.setAny || r.setName));
  const sets = needSets ? await scryfall.sets() : null;
  for (const r of recs) {
    r.set = resolveSet(r, sets);
    r.tries = identifiers(r);
    r.scry = null;
  }
  // rodadas: todas as cartas pelo melhor identificador; as que falharem tentam o seguinte
  for (let round = 0; round < 4; round++) {
    const pending = recs.filter((r) => !r.scry && r.tries[round]);
    if (!pending.length) break;
    const found = await scryfall.collection(pending.map((r) => r.tries[round]),
      (d, t) => onProgress?.("scryfall", d, t));
    pending.forEach((r, i) => { if (found[i]) { r.scry = found[i]; r.via = r.tries[round]; } });
  }

  const out = [LIGA_HEADER];
  for (let i = 0; i < recs.length; i++) {
    const r = recs[i], s = r.scry;
    onProgress?.("liga", i + 1, recs.length, r.name);
    const lang = r.lang || LANG[(s?.lang || "en").toLowerCase()] || "EN";
    const opts = { qty: r.qty, quality: r.quality, lang, foil: r.foil, scryfall };
    // sigla da Liga que o Scryfall nao conhece (ex.: "schob"): procura direto na edicao da Liga
    const rawSet = r.setCode || r.setAny;
    if (rawSet && (!s || !(r.via.id || r.via.set))) {
      const direct = await liga.findDirect(rawSet, r.name, r.number);
      if (direct) {
        out.push(emit(rowFromHit(direct[0], direct[1], s), r.qty, r.quality, lang, r.foil ? ["Foil"] : [], ""));
        continue;
      }
    }
    if (!s) {
      out.push(["", r.setName || r.setAny, r.set || r.setCode, "", r.name, r.qty, r.quality, lang, "", "",
        r.foil ? "Foil" : "", r.number, "VERIFICAR: carta nao encontrada no Scryfall"]);
      continue;
    }
    const row = await convertScry(liga, s, opts);
    // achou so pelo nome: a impressao pode nao ser a que a pessoa tem
    if (!row[12] && r.via.name && !r.via.set) {
      row[12] = r.set || r.setAny || r.setName
        ? `VERIFICAR: edicao/numero nao encontrados (${[r.set || r.setAny || r.setName, r.number].filter(Boolean).join(" #")}), usada ${row[2]}`
        : `VERIFICAR: edicao nao informada, usada ${row[2]}`;
    } else if (!row[12] && r.via.name && r.number) {
      row[12] = `VERIFICAR: numero ${r.number} nao encontrado no Scryfall, usada ${row[2]} #${row[11]}`;
    }
    out.push(row);
  }
  return out;
}

export async function convertList(text, { liga, scryfall, onProgress }) {
  const items = parseList(text);
  const out = [LIGA_HEADER];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    onProgress?.("liga", i + 1, items.length, it.name);
    const opts = { qty: it.qty, quality: "NM", lang: "EN", foil: it.foil, scryfall };
    const extras = it.foil ? ["Foil"] : [];
    if (it.set) {
      const direct = await liga.findDirect(it.set, it.name, it.number);
      if (direct) {
        out.push(emit(rowFromHit(direct[0], direct[1], null), it.qty, "NM", "EN", extras, ""));
        continue;
      }
    }
    const s = (it.set && await scryfall.named(it.name, it.set.toLowerCase())) || await scryfall.named(it.name);
    if (!s) {
      out.push(["", "", it.set, "", it.name, it.qty, "NM", "EN", "", "", extras.join(", "), it.number,
        "VERIFICAR: carta nao encontrada"]);
      continue;
    }
    const row = await convertScry(liga, s, opts);
    if (!it.set && !row[12]) row[12] = `VERIFICAR: edicao nao informada, usada ${row[2]}`;
    out.push(row);
  }
  return out;
}
