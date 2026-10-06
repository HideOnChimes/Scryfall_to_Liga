import { Liga, scryfallClient, convertCSV, convertList, looksLikeCSV, toCSV, LIGA_HEADER } from "./conv.js";

const $ = (id) => document.getElementById(id);
const loadJSON = async (p) => {
  const r = await fetch(p);
  if (!r.ok) throw new Error(`${p}: ${r.status}`);
  return r.json();
};

let liga, input = null, rows = null, outName = "colecao - Liga.csv";

function setStatus(msg) { $("status").textContent = msg; }
function setProgress(frac) {
  $("progress").hidden = frac == null;
  $("bar").style.width = `${Math.round((frac || 0) * 100)}%`;
}
function refreshButton() {
  $("go").disabled = !liga || !(input || $("paste").value.trim());
}

// ---------------------------------------------------------------- entrada
async function pickFile(f) {
  if (!f) return;
  input = await f.text();
  outName = f.name.replace(/\.[^.]+$/, "") + " - Liga.csv";
  $("fname").textContent = f.name;
  refreshButton();
}

$("file").addEventListener("change", (e) => pickFile(e.target.files[0]));
const drop = $("drop");
drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
drop.addEventListener("dragleave", () => drop.classList.remove("over"));
drop.addEventListener("drop", (e) => {
  e.preventDefault();
  drop.classList.remove("over");
  pickFile(e.dataTransfer.files[0]);
});
$("paste").addEventListener("input", () => {
  if ($("paste").value.trim()) { input = null; $("fname").textContent = ""; outName = "lista - Liga.csv"; }
  refreshButton();
});

// ---------------------------------------------------------------- conversao
$("go").addEventListener("click", async () => {
  const text = input ?? $("paste").value;
  $("go").disabled = true;
  $("result").hidden = true;
  setProgress(0);
  const onProgress = (stage, done, total, name) => {
    if (stage === "scryfall") {
      setStatus(`Consultando Scryfall… ${done}/${total}`);
      setProgress(0.3 * done / total);
    } else {
      setStatus(`Procurando na Liga… ${done}/${total}${name ? ` — ${name}` : ""}`);
      setProgress(0.3 + 0.7 * done / total);
    }
  };
  try {
    const ctx = { liga, scryfall: scryfallClient(), onProgress };
    rows = looksLikeCSV(text) ? await convertCSV(text, ctx) : await convertList(text, ctx);
    render();
    setStatus("Pronto.");
  } catch (e) {
    console.error(e);
    setStatus(`Erro: ${e.message}`);
  } finally {
    setProgress(null);
    refreshButton();
  }
});

// ---------------------------------------------------------------- resultado
const SHOW = [2, 4, 3, 5, 6, 7, 8, 9, 10, 11, 12]; // colunas exibidas (indices de LIGA_HEADER)
const LABEL = { 2: "Sigla", 4: "Carta (EN)", 3: "Carta (PT)", 5: "Qtd", 6: "Qual.", 7: "Idioma", 8: "Rar.",
  9: "Cor", 10: "Extras", 11: "#", 12: "Comentário" };

function render() {
  const body = rows.slice(1);
  const warn = body.filter((r) => r[12]).length;
  const qty = body.reduce((s, r) => s + (parseInt(r[5], 10) || 0), 0);
  $("summary").textContent = `${body.length} linhas (${qty} cartas)` + (warn ? ` · ${warn} para conferir` : " · tudo certo");
  const only = $("onlyWarn").checked;
  const table = $("table");
  table.replaceChildren();
  const head = table.createTHead().insertRow();
  for (const i of SHOW) {
    const th = document.createElement("th");
    th.textContent = LABEL[i] || LIGA_HEADER[i];
    head.appendChild(th);
  }
  const tb = table.createTBody();
  for (const r of body) {
    if (only && !r[12]) continue;
    const tr = tb.insertRow();
    if (r[12]) tr.className = "warn";
    for (const i of SHOW) {
      const td = tr.insertCell();
      td.textContent = r[i];
      if (i === 12) td.className = "comment";
    }
  }
  $("result").hidden = false;
}

$("onlyWarn").addEventListener("change", () => rows && render());
$("download").addEventListener("click", () => {
  const blob = new Blob([toCSV(rows)], { type: "text/csv;charset=utf-8" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: outName });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

// ---------------------------------------------------------------- boot
try {
  liga = await Liga.load(loadJSON);
  const indexed = liga.eds.filter((e) => e.s);
  const last = indexed.map((e) => e.s).sort().pop();
  $("dataInfo").textContent = `${indexed.length} de ${liga.eds.length} edições da Liga indexadas` +
    (last ? ` · última atualização ${last.split("-").reverse().join("/")}` : "") + ".";
  setStatus("Escolha um arquivo ou cole uma lista.");
} catch (e) {
  setStatus(`Não consegui carregar as edições: ${e.message}`);
}
refreshButton();
