// Textos do site em portugues, ingles e espanhol.
// No HTML: data-i18n (texto), data-i18n-html (texto com marcacao), data-i18n-title, data-i18n-aria,
// data-i18n-placeholder. No JS: t("chave", ...args); valores que sao funcoes recebem os args.

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

const STRINGS = {
  pt: {
    "doc.title": "Conversor de Coleção MTG",
    "hero.title": "Conversor de coleção de Magic",
    "hero.lead": "Converta sua coleção entre LigaMagic, ManaBox, Moxfield, Scryfall e outros apps",
    "pick.main": "Selecionar arquivos",
    "pick.pc": "Do computador",
    "pick.drive": "Do Google Drive",
    "pick.hint": "ou solte os arquivos aqui (.csv ou .txt)",
    "fmt.fromAria": "Formato de origem",
    "fmt.toAria": "Formato de destino",
    "fmt.to": "para",
    "fmt.auto": "Detectar",
    "fmt.autoMany": "Detectar (vários)",
    "fmt.detected": (name) => `${name} (detectado)`,
    "fmt.csv": "Outro CSV",
    "fmt.lista": "Lista de texto",
    "paste.summary": "…ou cole uma lista de cartas",
    "go": "Converter",
    "result.onlyWarn": "mostrar só as linhas para conferir",
    "result.whichAria": "Arquivo exibido",
    "result.zip": "Baixar todos (.zip)",
    "result.download": (ext, target) => `Baixar ${ext} ${target}`,
    "result.editHint": "Clique numa célula para editar. As alterações vão para o arquivo baixado. Apague o texto do aviso para marcar a linha como conferida. Converter de novo desfaz as edições.",
    "result.addRow": "+ Adicionar linha",
    "result.deleteRow": "Apagar linha",
    "result.summary": (from, to, lines, cards, warn) => `${from} → ${to}: ${plural(lines, "linha", "linhas")}` +
      (cards != null ? ` (${plural(cards, "carta", "cartas")})` : "") + (warn ? ` · ${warn} para conferir` : " · tudo certo"),
    "col.code": "Sigla", "col.cardEn": "Carta (EN)", "col.cardPt": "Carta (PT)", "col.qty": "Qtd", "col.cond": "Qual.",
    "col.lang": "Idioma", "col.rarity": "Rar.", "col.color": "Cor", "col.extras": "Extras", "col.note": "Aviso",
    "file.queued": "Na fila",
    "file.running": "Convertendo…",
    "file.ok": "Pronto",
    "file.warn": (n) => `Pronto · ${n} para conferir`,
    "file.err": (msg) => `Erro: ${msg}`,
    "file.view": "Ver",
    "file.download": "Baixar",
    "file.remove": "Remover",
    "file.pasted": "lista colada",
    "status.loading": "Carregando edições…",
    "status.ready": "Escolha arquivos ou cole uma lista.",
    "status.inList": (n) => `${plural(n, "arquivo", "arquivos")} na lista.`,
    "status.loadError": (msg) => `Não consegui carregar as edições: ${msg}`,
    "status.fileOf": (k, n) => `Arquivo ${k}/${n} · `,
    "status.scryfall": (done, total) => `Consultando Scryfall… ${done}/${total}`,
    "status.liga": (done, total, name) => `Procurando na Liga… ${done}/${total}${name ? ` — ${name}` : ""}`,
    "status.done": "Pronto.",
    "status.doneMany": (done, n) => `Pronto: ${done} de ${n} arquivos convertidos.`,
    "status.error": (msg) => `Erro: ${msg}`,
    "drive.notConfigured": "O Google Drive ainda não foi configurado neste site.",
    "drive.downloading": "Baixando do Google Drive…",
    "drive.loaded": (n) => `${n} ${n === 1 ? "arquivo carregado" : "arquivos carregados"} do Google Drive.`,
    "drive.openError": (msg) => `Não consegui abrir o Google Drive: ${msg}`,
    "err.sameFormat": (target) => `Esse arquivo já está no formato ${target}. Escolha outro formato em "para".`,
    "err.noCards": "Não encontrei cartas no arquivo.",
    "data.info": (n, total, date) => `${n} de ${total} edições da Liga indexadas` + (date ? ` · última atualização ${date}` : "") + ".",
    "help.title": "Como usar",
    "help.steps": `<li>Exporte a coleção em CSV do seu app (LigaMagic, ManaBox, Moxfield, Deckbox, Dragon Shield, TCGplayer…) ou de uma busca do Scryfall. Ou monte uma lista de texto, uma carta por linha.</li>
      <li>Selecione um ou vários arquivos (do computador ou do Google Drive). O formato de origem de cada um é detectado sozinho.</li>
      <li>Escolha o formato de destino e clique em <strong>Converter</strong>.</li>
      <li>Confira as linhas marcadas com <span class="tag">VERIFICAR</span>. Dá para editar a tabela antes de baixar os arquivos, um a um ou todos num .zip.</li>
      <li>Importe no app de destino. Na LigaMagic: <em>Minha Coleção → Importar</em>.</li>`,
    "help.csvTitle": "CSVs aceitos",
    "help.csvText": `O site reconhece as colunas automaticamente, inclusive em planilhas com cabeçalho em português e separadas por <code>;</code>.
      O melhor resultado vem de CSVs com <strong>Scryfall ID</strong> (ManaBox, Scryfall); nos demais a carta é encontrada por edição + número, ou pelo nome.`,
    "help.csvList": `<li><strong>ManaBox</strong>: completo (quantidade, foil, condição, idioma).</li>
      <li><strong>Moxfield, Deckbox, Dragon Shield, TCGplayer</strong>: completo, busca por edição + número.</li>
      <li><strong>Scryfall</strong> (export de busca): sem quantidade, foil e condição; usa 1, normal e NM.</li>
      <li><strong>LigaMagic</strong> (export da coleção): convertido de volta pela edição + número de cada carta.</li>`,
    "help.listTitle": "Formatos de lista aceitos",
    "help.listPre": `1 Nome da Carta (SIGLA) 123
1 Nome da Carta [SIGLA]
1 [SIGLA] Nome da Carta
1 Nome da Carta          ← sem edição: usa a impressão padrão do Scryfall
1 Nome da Carta *F*      ← foil`,
    "help.listNote": `A sigla pode ser a da Liga (ex.: <code>SCHOB</code>) ou a do Scryfall (ex.: <code>HOB</code>).`,
    "footer.disclaimer": `Site não oficial, sem vínculo com a LigaMagic ou a Wizards of the Coast.
      Dados de cartas: <a href="https://scryfall.com" rel="noopener">Scryfall</a>.
      Magic: The Gathering é marca da Wizards of the Coast; conteúdo de fã sob a
      <a href="https://company.wizards.com/pt-br/legal/fancontentpolicy" rel="noopener">Fan Content Policy</a>.`,
    "footer.privacy": "Política de privacidade",
  },

  en: {
    "doc.title": "MTG Collection Converter",
    "hero.title": "Magic collection converter",
    "hero.lead": "Convert your collection between LigaMagic, ManaBox, Moxfield, Scryfall and other apps",
    "pick.main": "Choose files",
    "pick.pc": "From your computer",
    "pick.drive": "From Google Drive",
    "pick.hint": "or drop the files here (.csv or .txt)",
    "fmt.fromAria": "Source format",
    "fmt.toAria": "Target format",
    "fmt.to": "to",
    "fmt.auto": "Detect",
    "fmt.autoMany": "Detect (several)",
    "fmt.detected": (name) => `${name} (detected)`,
    "fmt.csv": "Other CSV",
    "fmt.lista": "Text list",
    "paste.summary": "…or paste a card list",
    "go": "Convert",
    "result.onlyWarn": "show only rows to review",
    "result.whichAria": "File shown",
    "result.zip": "Download all (.zip)",
    "result.download": (ext, target) => `Download ${target} ${ext}`,
    "result.editHint": "Click a cell to edit it. Changes go into the downloaded file. Clear the warning text to mark a row as reviewed. Converting again discards your edits.",
    "result.addRow": "+ Add row",
    "result.deleteRow": "Delete row",
    "result.summary": (from, to, lines, cards, warn) => `${from} → ${to}: ${plural(lines, "row", "rows")}` +
      (cards != null ? ` (${plural(cards, "card", "cards")})` : "") + (warn ? ` · ${warn} to review` : " · all good"),
    "col.code": "Set", "col.cardEn": "Card (EN)", "col.cardPt": "Card (PT)", "col.qty": "Qty", "col.cond": "Cond.",
    "col.lang": "Lang.", "col.rarity": "Rar.", "col.color": "Color", "col.extras": "Extras", "col.note": "Warning",
    "file.queued": "Queued",
    "file.running": "Converting…",
    "file.ok": "Done",
    "file.warn": (n) => `Done · ${n} to review`,
    "file.err": (msg) => `Error: ${msg}`,
    "file.view": "View",
    "file.download": "Download",
    "file.remove": "Remove",
    "file.pasted": "pasted list",
    "status.loading": "Loading sets…",
    "status.ready": "Choose files or paste a list.",
    "status.inList": (n) => `${plural(n, "file", "files")} in the list.`,
    "status.loadError": (msg) => `Could not load the sets: ${msg}`,
    "status.fileOf": (k, n) => `File ${k}/${n} · `,
    "status.scryfall": (done, total) => `Querying Scryfall… ${done}/${total}`,
    "status.liga": (done, total, name) => `Searching LigaMagic… ${done}/${total}${name ? ` — ${name}` : ""}`,
    "status.done": "Done.",
    "status.doneMany": (done, n) => `Done: ${done} of ${n} files converted.`,
    "status.error": (msg) => `Error: ${msg}`,
    "drive.notConfigured": "Google Drive has not been set up on this site yet.",
    "drive.downloading": "Downloading from Google Drive…",
    "drive.loaded": (n) => `${plural(n, "file", "files")} loaded from Google Drive.`,
    "drive.openError": (msg) => `Could not open Google Drive: ${msg}`,
    "err.sameFormat": (target) => `This file is already in ${target} format. Choose another format under "to".`,
    "err.noCards": "No cards found in the file.",
    "data.info": (n, total, date) => `${n} of ${total} LigaMagic sets indexed` + (date ? ` · last updated ${date}` : "") + ".",
    "help.title": "How to use",
    "help.steps": `<li>Export your collection as CSV from your app (LigaMagic, ManaBox, Moxfield, Deckbox, Dragon Shield, TCGplayer…) or from a Scryfall search. Or write a text list, one card per line.</li>
      <li>Choose one or more files (from your computer or Google Drive). Each file's source format is detected automatically.</li>
      <li>Pick the target format and click <strong>Convert</strong>.</li>
      <li>Review the rows marked <span class="tag">VERIFICAR</span>. You can edit the table before downloading the files, one by one or all in a .zip.</li>
      <li>Import into the target app. On LigaMagic: <em>Minha Coleção → Importar</em>.</li>`,
    "help.csvTitle": "Supported CSVs",
    "help.csvText": `Columns are recognized automatically, including spreadsheets with Portuguese headers or separated by <code>;</code>.
      CSVs with a <strong>Scryfall ID</strong> (ManaBox, Scryfall) give the best results; otherwise cards are matched by set + collector number, or by name.`,
    "help.csvList": `<li><strong>ManaBox</strong>: full (quantity, foil, condition, language).</li>
      <li><strong>Moxfield, Deckbox, Dragon Shield, TCGplayer</strong>: full, matched by set + number.</li>
      <li><strong>Scryfall</strong> (search export): no quantity, foil or condition; uses 1, non-foil and NM.</li>
      <li><strong>LigaMagic</strong> (collection export): converted back using each card's set + number.</li>`,
    "help.listTitle": "Supported list formats",
    "help.listPre": `1 Card Name (SET) 123
1 Card Name [SET]
1 [SET] Card Name
1 Card Name          ← no set: uses Scryfall's default printing
1 Card Name *F*      ← foil`,
    "help.listNote": `The set code can be LigaMagic's (e.g. <code>SCHOB</code>) or Scryfall's (e.g. <code>HOB</code>).`,
    "footer.disclaimer": `Unofficial site, not affiliated with LigaMagic or Wizards of the Coast.
      Card data: <a href="https://scryfall.com" rel="noopener">Scryfall</a>.
      Magic: The Gathering is a trademark of Wizards of the Coast; fan content under the
      <a href="https://company.wizards.com/en/legal/fancontentpolicy" rel="noopener">Fan Content Policy</a>.`,
    "footer.privacy": "Privacy policy (Portuguese)",
  },

  es: {
    "doc.title": "Conversor de Colección MTG",
    "hero.title": "Conversor de colección de Magic",
    "hero.lead": "Convierte tu colección entre LigaMagic, ManaBox, Moxfield, Scryfall y otras apps",
    "pick.main": "Elegir archivos",
    "pick.pc": "Desde tu computadora",
    "pick.drive": "Desde Google Drive",
    "pick.hint": "o suelta los archivos aquí (.csv o .txt)",
    "fmt.fromAria": "Formato de origen",
    "fmt.toAria": "Formato de destino",
    "fmt.to": "a",
    "fmt.auto": "Detectar",
    "fmt.autoMany": "Detectar (varios)",
    "fmt.detected": (name) => `${name} (detectado)`,
    "fmt.csv": "Otro CSV",
    "fmt.lista": "Lista de texto",
    "paste.summary": "…o pega una lista de cartas",
    "go": "Convertir",
    "result.onlyWarn": "mostrar solo las filas para revisar",
    "result.whichAria": "Archivo mostrado",
    "result.zip": "Descargar todos (.zip)",
    "result.download": (ext, target) => `Descargar ${ext} ${target}`,
    "result.editHint": "Haz clic en una celda para editarla. Los cambios van al archivo descargado. Borra el texto del aviso para marcar la fila como revisada. Convertir de nuevo descarta las ediciones.",
    "result.addRow": "+ Agregar fila",
    "result.deleteRow": "Borrar fila",
    "result.summary": (from, to, lines, cards, warn) => `${from} → ${to}: ${plural(lines, "fila", "filas")}` +
      (cards != null ? ` (${plural(cards, "carta", "cartas")})` : "") + (warn ? ` · ${warn} para revisar` : " · todo bien"),
    "col.code": "Sigla", "col.cardEn": "Carta (EN)", "col.cardPt": "Carta (PT)", "col.qty": "Cant.", "col.cond": "Estado",
    "col.lang": "Idioma", "col.rarity": "Rar.", "col.color": "Color", "col.extras": "Extras", "col.note": "Aviso",
    "file.queued": "En cola",
    "file.running": "Convirtiendo…",
    "file.ok": "Listo",
    "file.warn": (n) => `Listo · ${n} para revisar`,
    "file.err": (msg) => `Error: ${msg}`,
    "file.view": "Ver",
    "file.download": "Descargar",
    "file.remove": "Quitar",
    "file.pasted": "lista pegada",
    "status.loading": "Cargando ediciones…",
    "status.ready": "Elige archivos o pega una lista.",
    "status.inList": (n) => `${plural(n, "archivo", "archivos")} en la lista.`,
    "status.loadError": (msg) => `No se pudieron cargar las ediciones: ${msg}`,
    "status.fileOf": (k, n) => `Archivo ${k}/${n} · `,
    "status.scryfall": (done, total) => `Consultando Scryfall… ${done}/${total}`,
    "status.liga": (done, total, name) => `Buscando en LigaMagic… ${done}/${total}${name ? ` — ${name}` : ""}`,
    "status.done": "Listo.",
    "status.doneMany": (done, n) => `Listo: ${done} de ${n} archivos convertidos.`,
    "status.error": (msg) => `Error: ${msg}`,
    "drive.notConfigured": "Google Drive todavía no está configurado en este sitio.",
    "drive.downloading": "Descargando de Google Drive…",
    "drive.loaded": (n) => `${n} ${n === 1 ? "archivo cargado" : "archivos cargados"} desde Google Drive.`,
    "drive.openError": (msg) => `No se pudo abrir Google Drive: ${msg}`,
    "err.sameFormat": (target) => `Este archivo ya está en formato ${target}. Elige otro formato en "a".`,
    "err.noCards": "No se encontraron cartas en el archivo.",
    "data.info": (n, total, date) => `${n} de ${total} ediciones de LigaMagic indexadas` + (date ? ` · última actualización ${date}` : "") + ".",
    "help.title": "Cómo usar",
    "help.steps": `<li>Exporta tu colección en CSV desde tu app (LigaMagic, ManaBox, Moxfield, Deckbox, Dragon Shield, TCGplayer…) o desde una búsqueda de Scryfall. O escribe una lista de texto, una carta por línea.</li>
      <li>Elige uno o varios archivos (desde tu computadora o Google Drive). El formato de origen de cada uno se detecta solo.</li>
      <li>Elige el formato de destino y haz clic en <strong>Convertir</strong>.</li>
      <li>Revisa las filas marcadas con <span class="tag">VERIFICAR</span>. Puedes editar la tabla antes de descargar los archivos, uno por uno o todos en un .zip.</li>
      <li>Importa en la app de destino. En LigaMagic: <em>Minha Coleção → Importar</em>.</li>`,
    "help.csvTitle": "CSVs aceptados",
    "help.csvText": `Las columnas se reconocen automáticamente, incluso en hojas con encabezados en portugués o separadas por <code>;</code>.
      Los CSVs con <strong>Scryfall ID</strong> (ManaBox, Scryfall) dan el mejor resultado; en los demás la carta se busca por edición + número, o por nombre.`,
    "help.csvList": `<li><strong>ManaBox</strong>: completo (cantidad, foil, estado, idioma).</li>
      <li><strong>Moxfield, Deckbox, Dragon Shield, TCGplayer</strong>: completo, búsqueda por edición + número.</li>
      <li><strong>Scryfall</strong> (exportación de búsqueda): sin cantidad, foil ni estado; usa 1, normal y NM.</li>
      <li><strong>LigaMagic</strong> (exportación de colección): se convierte de vuelta por la edición + número de cada carta.</li>`,
    "help.listTitle": "Formatos de lista aceptados",
    "help.listPre": `1 Nombre de la Carta (SIGLA) 123
1 Nombre de la Carta [SIGLA]
1 [SIGLA] Nombre de la Carta
1 Nombre de la Carta     ← sin edición: usa la impresión por defecto de Scryfall
1 Nombre de la Carta *F* ← foil`,
    "help.listNote": `La sigla puede ser la de LigaMagic (ej.: <code>SCHOB</code>) o la de Scryfall (ej.: <code>HOB</code>).`,
    "footer.disclaimer": `Sitio no oficial, sin vínculo con LigaMagic ni con Wizards of the Coast.
      Datos de cartas: <a href="https://scryfall.com" rel="noopener">Scryfall</a>.
      Magic: The Gathering es marca de Wizards of the Coast; contenido de fans bajo la
      <a href="https://company.wizards.com/es/legal/fancontentpolicy" rel="noopener">Fan Content Policy</a>.`,
    "footer.privacy": "Política de privacidad (en portugués)",
  },
};

export const LANGS = [["pt", "Português"], ["en", "English"], ["es", "Español"]];
const HTML_LANG = { pt: "pt-BR", en: "en", es: "es" };

function initial() {
  try {
    const saved = localStorage.getItem("lang");
    if (STRINGS[saved]) return saved;
  } catch { /* navegador sem localStorage: usa o idioma do navegador */ }
  const nav = (navigator.language || "pt").slice(0, 2).toLowerCase();
  return STRINGS[nav] ? nav : "en";
}

let lang = initial();
export const getLang = () => lang;

export function t(key, ...args) {
  const v = STRINGS[lang][key] ?? STRINGS.pt[key] ?? key;
  return typeof v === "function" ? v(...args) : v;
}

// aplica os textos nos elementos marcados com data-i18n*
export function applyStatic(root = document) {
  document.documentElement.lang = HTML_LANG[lang];
  document.title = t("doc.title");
  for (const el of root.querySelectorAll("[data-i18n]")) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll("[data-i18n-html]")) el.innerHTML = t(el.dataset.i18nHtml);
  for (const el of root.querySelectorAll("[data-i18n-title]")) el.title = t(el.dataset.i18nTitle);
  for (const el of root.querySelectorAll("[data-i18n-aria]")) el.setAttribute("aria-label", t(el.dataset.i18nAria));
}

export function setLang(next) {
  lang = STRINGS[next] ? next : "pt";
  try { localStorage.setItem("lang", lang); } catch { /* sem localStorage: vale so nesta visita */ }
  applyStatic();
}
