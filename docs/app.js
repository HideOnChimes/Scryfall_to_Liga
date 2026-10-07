import { Liga, scryfallClient } from "./conv.js";
import { SOURCES, TARGETS, label, detectFormat, convert, serialize } from "./formats.js";
import { makeZip } from "./zip.js";
import { GOOGLE } from "./config.js";

const $ = (id) => document.getElementById(id);
const loadJSON = async (p) => {
  const r = await fetch(p);
  if (!r.ok) throw new Error(`${p}: ${r.status}`);
  return r.json();
};

// lote: cada arquivo vira um item { name, text, detected, status, result, error }
let liga, items = [], running = false, shown = null;
const scryfall = scryfallClient(); // um cliente so: a lista de sets do Scryfall e baixada uma vez

function setStatus(msg) { $("status").textContent = msg; }
function setProgress(frac) {
  $("progress").hidden = frac == null;
  $("bar").style.width = `${Math.round((frac || 0) * 100)}%`;
}

// lista colada conta como mais um arquivo do lote
function jobs() {
  const paste = $("paste").value;
  const pasted = paste.trim() ? [{ name: "lista", text: paste, detected: detectFormat(paste), pasted: true }] : [];
  return [...items, ...pasted];
}
function refreshButton() {
  $("go").disabled = !liga || running || !jobs().length;
}

// ---------------------------------------------------------------- formatos
function fill(sel, list) {
  for (const [k, v] of list) sel.add(new Option(v, k));
}
fill($("from"), SOURCES);
fill($("to"), TARGETS);

const fromOf = (job) => ($("from").value === "auto" ? job.detected : $("from").value);

// "Detectar" mostra o que foi detectado; o destino so fica bloqueado se todos os arquivos ja estao nele
function syncFormats() {
  const list = jobs();
  const found = [...new Set(list.map((j) => j.detected))];
  $("from").options[0].text = found.length === 1 ? `${label(SOURCES, found[0])} (detectado)`
    : found.length > 1 ? "Detectar (vários)" : "Detectar";
  const froms = new Set(list.map(fromOf));
  for (const o of $("to").options) o.disabled = froms.size === 1 && froms.has(o.value) && o.value !== "lista";
  if ($("to").selectedOptions[0]?.disabled) $("to").value = froms.has("liga") ? "manabox" : "liga";
  renderFiles();
}
$("from").addEventListener("change", syncFormats);

// ---------------------------------------------------------------- lista de arquivos
const STATUS = { fila: "Na fila", rodando: "Convertendo…", ok: "Pronto", warn: "Pronto", err: "Erro" };

function renderFiles() {
  const ul = $("files");
  ul.replaceChildren();
  ul.hidden = !items.length;
  for (const it of items) {
    const li = document.createElement("li");
    const name = Object.assign(document.createElement("span"), { className: "fname", textContent: it.fullName });
    const fmt = Object.assign(document.createElement("span"), { className: "fmt", textContent: label(SOURCES, fromOf(it)) });
    const st = Object.assign(document.createElement("span"), { className: `st ${it.status || ""}` });
    st.textContent = it.status === "warn" ? `Pronto · ${it.result.notes.filter(Boolean).length} para conferir`
      : it.status === "err" ? `Erro: ${it.error}` : STATUS[it.status] || "";
    li.append(name, fmt, st);
    if (it.result) {
      const view = Object.assign(document.createElement("button"), { type: "button", textContent: "Ver" });
      view.addEventListener("click", () => show(it));
      const dl = Object.assign(document.createElement("button"), { type: "button", textContent: "Baixar" });
      dl.addEventListener("click", () => download(it));
      li.append(view, dl);
    }
    const rm = Object.assign(document.createElement("button"), { type: "button", className: "rm", textContent: "✕",
      title: "Remover", disabled: running });
    rm.addEventListener("click", () => {
      items = items.filter((x) => x !== it);
      if (shown === it) { shown = null; $("result").hidden = true; }
      syncFormats();
      refreshResults();
      refreshButton();
    });
    li.append(rm);
    ul.append(li);
  }
}

function addFile(text, fullName) {
  items.push({ fullName, name: fullName.replace(/\.[^.]+$/, ""), text, detected: detectFormat(text), status: "fila" });
  syncFormats();
  refreshButton();
}

async function addFiles(files) {
  for (const f of files) addFile(await f.text(), f.name);
  setStatus(`${items.length} ${items.length === 1 ? "arquivo" : "arquivos"} na lista.`);
}

$("file").addEventListener("change", async (e) => {
  await addFiles([...e.target.files]);
  e.target.value = ""; // permite escolher o mesmo arquivo de novo
});
const drop = $("drop");
drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
drop.addEventListener("dragleave", (e) => { if (!drop.contains(e.relatedTarget)) drop.classList.remove("over"); });
drop.addEventListener("drop", (e) => {
  e.preventDefault();
  drop.classList.remove("over");
  addFiles([...e.dataTransfer.files]);
});
$("paste").addEventListener("input", () => { syncFormats(); refreshButton(); });

// ---------------------------------------------------------------- google drive
const loadScript = (src) => new Promise((ok, fail) => {
  const s = Object.assign(document.createElement("script"), { src, async: true, onload: ok, onerror: fail });
  document.head.appendChild(s);
});
const driveReady = GOOGLE.clientId && GOOGLE.apiKey
  ? Promise.all([loadScript("https://apis.google.com/js/api.js"), loadScript("https://accounts.google.com/gsi/client")])
    .then(() => new Promise((ok) => gapi.load("picker", ok)))
  : null;
let tokenClient, token;

function driveToken() {
  return new Promise((ok, fail) => {
    tokenClient ||= google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE.clientId,
      scope: "https://www.googleapis.com/auth/drive.file", // so os arquivos que a pessoa escolher
      callback: () => {},
    });
    tokenClient.callback = (t) => (t.error ? fail(new Error(t.error)) : ok((token = t.access_token)));
    tokenClient.requestAccessToken({ prompt: token ? "" : "consent" });
  });
}

async function downloadFromDrive(doc) {
  const base = `https://www.googleapis.com/drive/v3/files/${doc.id}`;
  // Planilha do Google vira CSV; o resto e baixado como esta
  const sheet = doc.mimeType === "application/vnd.google-apps.spreadsheet";
  const url = sheet ? `${base}/export?mimeType=text/csv` : `${base}?alt=media`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`Google Drive respondeu ${r.status}`);
  addFile(await r.text(), sheet ? `${doc.name}.csv` : doc.name);
}

$("drive").addEventListener("click", async () => {
  if (!driveReady) {
    setStatus("O Google Drive ainda não foi configurado neste site.");
    return;
  }
  try {
    await driveReady;
    await driveToken();
    const view = new google.picker.DocsView(google.picker.ViewId.DOCS)
      .setMimeTypes("text/csv,text/plain,text/comma-separated-values,application/vnd.ms-excel,application/vnd.google-apps.spreadsheet")
      .setIncludeFolders(true);
    new google.picker.PickerBuilder()
      .addView(view)
      .enableFeature(google.picker.Feature.MULTISELECT_ENABLED)
      .setOAuthToken(token)
      .setDeveloperKey(GOOGLE.apiKey)
      .setAppId(GOOGLE.appId)
      .setLocale("pt-BR")
      .setCallback(async (data) => {
        if (data.action !== google.picker.Action.PICKED) return;
        setStatus("Baixando do Google Drive…");
        try {
          for (const doc of data.docs) await downloadFromDrive(doc);
          setStatus(`${data.docs.length} ${data.docs.length === 1 ? "arquivo carregado" : "arquivos carregados"} do Google Drive.`);
        } catch (e) {
          setStatus(`Erro: ${e.message}`);
        }
      })
      .build()
      .setVisible(true);
  } catch (e) {
    console.error(e);
    setStatus(`Não consegui abrir o Google Drive: ${e.message}`);
  }
});

// ---------------------------------------------------------------- conversao
$("go").addEventListener("click", async () => {
  const list = jobs();
  const pasted = list.find((j) => j.pasted);
  if (pasted) { // a lista colada passa a ser um item do lote
    items.push({ ...pasted, fullName: "lista colada", pasted: false });
    $("paste").value = "";
  }
  const to = $("to").value;
  running = true;
  refreshButton();
  $("result").hidden = true;
  shown = null;
  for (const it of items) Object.assign(it, { status: "fila", result: null, error: null });
  renderFiles();

  // um arquivo de cada vez: o Scryfall limita as requisicoes por segundo
  const n = items.length;
  for (let k = 0; k < n; k++) {
    const it = items[k];
    const prefix = n > 1 ? `Arquivo ${k + 1}/${n} · ` : "";
    it.status = "rodando";
    renderFiles();
    const onProgress = (stage, done, total, name) => {
      let frac;
      if (stage === "scryfall") {
        setStatus(`${prefix}Consultando Scryfall… ${done}/${total}`);
        frac = (to === "liga" ? 0.3 : 0.95) * done / total;
      } else {
        setStatus(`${prefix}Procurando na Liga… ${done}/${total}${name ? ` — ${name}` : ""}`);
        frac = 0.3 + 0.7 * done / total;
      }
      setProgress((k + frac) / n);
    };
    try {
      it.result = await convert(it.text, { from: fromOf(it), to, liga, scryfall, onProgress });
      it.status = it.result.notes.some(Boolean) ? "warn" : "ok";
      if (!shown) show(it);
    } catch (e) {
      console.error(e);
      it.status = "err";
      it.error = e.message;
    }
    renderFiles();
    refreshResults();
  }

  running = false;
  setProgress(null);
  const done = items.filter((it) => it.result).length;
  setStatus(n > 1 ? `Pronto: ${done} de ${n} arquivos convertidos.` : done ? "Pronto." : `Erro: ${items[0].error}`);
  renderFiles();
  refreshButton();
});

// ---------------------------------------------------------------- resultado
// para a Liga mostra so as colunas uteis, com nomes curtos
const LIGA_SHOW = [2, 4, 3, 5, 6, 7, 8, 9, 10, 11, 12];
const LIGA_LABEL = { 2: "Sigla", 4: "Carta (EN)", 3: "Carta (PT)", 5: "Qtd", 6: "Qual.", 7: "Idioma", 8: "Rar.",
  9: "Cor", 10: "Extras", 11: "#", 12: "Aviso" };

// [titulo, indice da coluna na linha | "note"]; o aviso so vai para o arquivo na saida da Liga (coluna 12)
function columns(result) {
  if (result.to === "liga") return LIGA_SHOW.map((i) => [LIGA_LABEL[i], i]);
  return [...result.header.map((h, i) => [h, i]), ["Aviso", "note"]];
}
const isNoteCol = (result, ci) => ci === "note" || (result.noteInFile && ci === 12);

// seletor de arquivo e botao do .zip aparecem quando ha mais de um resultado
function refreshResults() {
  const done = items.filter((it) => it.result);
  const sel = $("which");
  sel.replaceChildren(...done.map((it, i) => new Option(it.fullName, i)));
  sel.hidden = done.length < 2;
  $("zip").hidden = done.length < 2;
  if (shown) sel.value = done.indexOf(shown);
}
$("which").addEventListener("change", () => show(items.filter((it) => it.result)[$("which").value]));

function summarize() {
  const result = shown.result;
  const { rows, notes } = result;
  const warn = notes.filter(Boolean).length;
  const qty = result.to === "liga" ? rows.reduce((s, r) => s + (parseInt(r[5], 10) || 0), 0) : null;
  $("summary").textContent = `${label(SOURCES, result.from)} → ${label(TARGETS, result.to)}: ${rows.length} linhas` +
    (qty != null ? ` (${qty} cartas)` : "") + (warn ? ` · ${warn} para conferir` : " · tudo certo");
  shown.status = warn ? "warn" : "ok";
}

function show(it) {
  shown = it;
  const result = it.result;
  const { rows, notes } = result;
  summarize();
  $("download").textContent = `Baixar ${result.ext.toUpperCase()} ${label(TARGETS, result.to)}`;
  const only = $("onlyWarn").checked;
  const cols = columns(result);
  const table = $("table");
  table.replaceChildren();
  const head = table.createTHead().insertRow();
  for (const [name] of [...cols, [""]]) {
    const th = document.createElement("th");
    th.textContent = name;
    head.appendChild(th);
  }
  const tb = table.createTBody();
  rows.forEach((r, ri) => {
    if (only && !notes[ri]) return;
    const tr = tb.insertRow();
    tr.dataset.ri = ri;
    if (notes[ri]) tr.className = "warn";
    for (const [, ci] of cols) {
      const td = tr.insertCell();
      td.textContent = (ci === "note" ? notes[ri] : r[ci]) ?? "";
      td.dataset.ci = ci;
      td.contentEditable = "plaintext-only";
      td.spellcheck = false;
      if (isNoteCol(result, ci)) td.className = "comment";
      if (isEdited(result, ri, ci)) td.classList.add("edited");
    }
    const del = Object.assign(document.createElement("button"), { type: "button", className: "row-del",
      textContent: "✕", title: "Apagar linha" });
    tr.insertCell().append(del);
  });
  $("result").hidden = false;
  refreshResults();
}

// valor original de cada linha, guardado pela propria linha (nao pelo indice, que muda ao apagar linhas);
// linha adicionada a mao comeca vazia. Celula so fica marcada enquanto difere do original.
function original(result, ri) {
  result.orig ||= new WeakMap();
  const row = result.rows[ri];
  if (!result.orig.has(row)) result.orig.set(row, { cells: [...row], note: result.notes[ri] || "" });
  return result.orig.get(row);
}

function isEdited(result, ri, ci) {
  const o = original(result, ri);
  return ci === "note" ? (result.notes[ri] || "") !== o.note : (result.rows[ri][ci] ?? "") !== (o.cells[ci] ?? "");
}

// edicao direto na tabela: cada tecla atualiza a linha que vai para o arquivo baixado
function cellOf(e) {
  const td = e.target.closest?.("td[data-ci]");
  if (!td || !shown) return null;
  const ri = +td.parentElement.dataset.ri;
  const ci = td.dataset.ci === "note" ? "note" : +td.dataset.ci;
  return { td, ri, ci };
}

$("table").addEventListener("input", (e) => {
  const c = cellOf(e);
  if (!c) return;
  const { rows, notes } = shown.result;
  original(shown.result, c.ri);
  const v = c.td.textContent;
  if (c.ci !== "note") rows[c.ri][c.ci] = v;
  if (isNoteCol(shown.result, c.ci)) notes[c.ri] = v.trim();
  c.td.classList.toggle("edited", isEdited(shown.result, c.ri, c.ci));
  c.td.parentElement.classList.toggle("warn", !!notes[c.ri]);
  summarize();
});

$("table").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && cellOf(e)) { e.preventDefault(); e.target.blur(); }
});

// colar texto formatado (ex.: de uma planilha) entra como texto puro, numa linha so
$("table").addEventListener("paste", (e) => {
  if (!cellOf(e)) return;
  e.preventDefault();
  document.execCommand("insertText", false, e.clipboardData.getData("text/plain").replace(/\s*[\r\n\t]+\s*/g, " "));
});

$("table").addEventListener("focusout", () => renderFiles());

$("table").addEventListener("click", (e) => {
  if (!e.target.classList.contains("row-del")) return;
  const ri = +e.target.closest("tr").dataset.ri;
  shown.result.rows.splice(ri, 1);
  shown.result.notes.splice(ri, 1);
  show(shown);
  renderFiles();
});

$("addRow").addEventListener("click", () => {
  const { rows, notes, header } = shown.result;
  rows.push(header.map(() => ""));
  notes.push("");
  $("onlyWarn").checked = false;
  show(shown);
  const last = $("table").tBodies[0].lastElementChild;
  last.scrollIntoView({ block: "nearest" });
  last.querySelector("td[data-ci]").focus();
});

$("onlyWarn").addEventListener("change", () => shown && show(shown));

const outName = (it) => `${it.name} - ${label(TARGETS, it.result.to)}.${it.result.ext}`;

function save(blob, name) {
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function download(it) {
  const type = it.result.ext === "txt" ? "text/plain" : "text/csv";
  save(new Blob([serialize(it.result)], { type: `${type};charset=utf-8` }), outName(it));
}

$("download").addEventListener("click", () => shown && download(shown));
$("zip").addEventListener("click", () => {
  const used = new Map();
  const files = items.filter((it) => it.result).map((it) => {
    let name = outName(it);
    const k = (used.get(name) || 0) + 1; // dois arquivos com o mesmo nome: "x (2).csv"
    used.set(name, k);
    if (k > 1) name = name.replace(/(\.[^.]+)$/, ` (${k})$1`);
    return { name, text: serialize(it.result) };
  });
  save(makeZip(files), `colecoes - ${label(TARGETS, $("to").value)}.zip`);
});

// ---------------------------------------------------------------- boot
try {
  liga = await Liga.load(loadJSON);
  const indexed = liga.eds.filter((e) => e.s);
  const last = indexed.map((e) => e.s).sort().pop();
  $("dataInfo").textContent = `${indexed.length} de ${liga.eds.length} edições da Liga indexadas` +
    (last ? ` · última atualização ${last.split("-").reverse().join("/")}` : "") + ".";
  setStatus("Escolha arquivos ou cole uma lista.");
} catch (e) {
  setStatus(`Não consegui carregar as edições: ${e.message}`);
}
refreshButton();
