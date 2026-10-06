import { Liga, scryfallClient } from "./conv.js";
import { SOURCES, TARGETS, label, detectFormat, convert, serialize } from "./formats.js";
import { GOOGLE } from "./config.js";

const $ = (id) => document.getElementById(id);
const loadJSON = async (p) => {
  const r = await fetch(p);
  if (!r.ok) throw new Error(`${p}: ${r.status}`);
  return r.json();
};

let liga, input = null, inputName = "colecao", result = null;

function setStatus(msg) { $("status").textContent = msg; }
function setProgress(frac) {
  $("progress").hidden = frac == null;
  $("bar").style.width = `${Math.round((frac || 0) * 100)}%`;
}
function currentText() { return input ?? $("paste").value; }
function refreshButton() {
  $("go").disabled = !liga || !currentText().trim();
}

// ---------------------------------------------------------------- formatos
function fill(sel, list) {
  for (const [k, v] of list) sel.add(new Option(v, k));
}
fill($("from"), SOURCES);
fill($("to"), TARGETS);

// origem "Detectar" mostra o que foi detectado; destino nao pode ser igual a origem
function syncFormats() {
  const text = currentText();
  const auto = $("from").options[0];
  const detected = text.trim() ? detectFormat(text) : null;
  auto.text = detected ? `${label(SOURCES, detected)} (detectado)` : "Detectar";
  const from = $("from").value === "auto" ? detected : $("from").value;
  for (const o of $("to").options) o.disabled = o.value === from && from !== "lista";
  if ($("to").selectedOptions[0]?.disabled) $("to").value = from === "liga" ? "manabox" : "liga";
}
$("from").addEventListener("change", syncFormats);

// ---------------------------------------------------------------- entrada
function setInput(text, name) {
  input = text;
  inputName = name.replace(/\.[^.]+$/, "");
  $("fname").textContent = name;
  $("fname").classList.add("file");
  $("paste").value = "";
  syncFormats();
  refreshButton();
}

async function pickFile(f) {
  if (f) setInput(await f.text(), f.name);
}

$("file").addEventListener("change", (e) => pickFile(e.target.files[0]));
const drop = $("drop");
drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
drop.addEventListener("dragleave", (e) => { if (!drop.contains(e.relatedTarget)) drop.classList.remove("over"); });
drop.addEventListener("drop", (e) => {
  e.preventDefault();
  drop.classList.remove("over");
  pickFile(e.dataTransfer.files[0]);
});
$("paste").addEventListener("input", () => {
  if ($("paste").value.trim()) {
    input = null;
    inputName = "lista";
    $("fname").textContent = "ou solte o arquivo aqui (.csv ou .txt)";
    $("fname").classList.remove("file");
  }
  syncFormats();
  refreshButton();
});

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
  const url = doc.mimeType === "application/vnd.google-apps.spreadsheet"
    ? `${base}/export?mimeType=text/csv` : `${base}?alt=media`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`Google Drive respondeu ${r.status}`);
  setInput(await r.text(), doc.name);
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
      .setOAuthToken(token)
      .setDeveloperKey(GOOGLE.apiKey)
      .setAppId(GOOGLE.appId)
      .setLocale("pt-BR")
      .setCallback((data) => {
        if (data.action !== google.picker.Action.PICKED) return;
        setStatus("Baixando do Google Drive…");
        downloadFromDrive(data.docs[0])
          .then(() => setStatus("Arquivo carregado do Google Drive."))
          .catch((e) => setStatus(`Erro: ${e.message}`));
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
  const text = currentText();
  const to = $("to").value;
  $("go").disabled = true;
  $("result").hidden = true;
  setProgress(0);
  const onProgress = (stage, done, total, name) => {
    if (stage === "scryfall") {
      setStatus(`Consultando Scryfall… ${done}/${total}`);
      setProgress((to === "liga" ? 0.3 : 0.95) * done / total);
    } else {
      setStatus(`Procurando na Liga… ${done}/${total}${name ? ` — ${name}` : ""}`);
      setProgress(0.3 + 0.7 * done / total);
    }
  };
  try {
    result = await convert(text, { from: $("from").value, to, liga, scryfall: scryfallClient(), onProgress });
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
// para a Liga mostra so as colunas uteis, com nomes curtos
const LIGA_SHOW = [2, 4, 3, 5, 6, 7, 8, 9, 10, 11, 12];
const LIGA_LABEL = { 2: "Sigla", 4: "Carta (EN)", 3: "Carta (PT)", 5: "Qtd", 6: "Qual.", 7: "Idioma", 8: "Rar.",
  9: "Cor", 10: "Extras", 11: "#", 12: "Aviso" };

function columns() {
  if (result.to === "liga") return LIGA_SHOW.map((i) => [LIGA_LABEL[i], (r) => r[i], i === 12]);
  return [...result.header.map((h, i) => [h, (r) => r[i], false]), ["Aviso", (r, n) => n, true]];
}

function render() {
  const { rows, notes } = result;
  const warn = notes.filter(Boolean).length;
  const qty = result.to === "liga" ? rows.reduce((s, r) => s + (parseInt(r[5], 10) || 0), 0) : null;
  $("summary").textContent = `${label(SOURCES, result.from)} → ${label(TARGETS, result.to)}: ${rows.length} linhas` +
    (qty != null ? ` (${qty} cartas)` : "") + (warn ? ` · ${warn} para conferir` : " · tudo certo");
  $("download").textContent = `Baixar ${result.ext.toUpperCase()} ${label(TARGETS, result.to)}`;
  const only = $("onlyWarn").checked;
  const cols = columns();
  const table = $("table");
  table.replaceChildren();
  const head = table.createTHead().insertRow();
  for (const [name] of cols) {
    const th = document.createElement("th");
    th.textContent = name;
    head.appendChild(th);
  }
  const tb = table.createTBody();
  rows.forEach((r, i) => {
    if (only && !notes[i]) return;
    const tr = tb.insertRow();
    if (notes[i]) tr.className = "warn";
    for (const [, get, isNote] of cols) {
      const td = tr.insertCell();
      td.textContent = get(r, notes[i]) ?? "";
      if (isNote) td.className = "comment";
    }
  });
  $("result").hidden = false;
}

$("onlyWarn").addEventListener("change", () => result && render());
$("download").addEventListener("click", () => {
  const type = result.ext === "txt" ? "text/plain" : "text/csv";
  const blob = new Blob([serialize(result)], { type: `${type};charset=utf-8` });
  const download = `${inputName} - ${label(TARGETS, result.to)}.${result.ext}`;
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download });
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
