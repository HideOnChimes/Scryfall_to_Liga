"""
Converte um export do ManaBox (CSV) para o CSV de importacao da LigaMagic.

Uso:
    python conv.py "Final Fantasey.csv"                 -> gera "Final Fantasey - Liga.csv"
    python conv.py entrada.csv -o saida.csv
    python conv.py entrada.csv --refresh                -> rebaixa a lista de edicoes da Liga
    python conv.py entrada.csv --db                     -> tambem grava no PostgreSQL (banco EstoqueTeste)
    python conv.py entrada.csv --db postgres --schema t_loja  -> plataforma: banco/schema do cliente
    python conv.py entrada.csv --db --substituir        -> desfaz as entradas desse CSV e grava de novo

Como funciona:
  1. Para cada carta, consulta o Scryfall pelo "Scryfall ID" do ManaBox (set, numero,
     nome, promo, foil, etc.).
  2. Baixa a lista de edicoes da Liga e descobre todas as sub-edicoes do set
     (ex.: fra -> fra, eafra, befra, epfra, prfra, ...).
  3. Baixa a lista de cartas de cada sub-edicao candidata e procura a carta pelo
     numero + nome. Assim "Reality Fracture #299 borderless" cai em "befra", e nao em "fra".
  4. Promos de pre-release / promo pack (set "pXXX" no Scryfall, numero 191s/191p)
     viram a carta normal do set principal com Extras = "Promo", que e como a Liga trata.
  5. Promos que o Scryfall agrupa num set generico (pw25 "Wizards Play Network 2025", plst...)
     sao procuradas na edicao "(Promo)" do set de origem, descoberto pelas outras impressoes
     da carta (ex.: Gran-Gran pw25 #14 -> prtla #1).

Tudo que e baixado fica em cache na pasta .cache_liga (ao lado deste script), entao
rodar de novo e rapido.
"""
import argparse
import csv
import html
import json
import os
import re
import sys
import time
import unicodedata
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, ".cache_liga")
HDR = {"User-Agent": "conv-liga/1.0 (manabox -> ligamagic)", "Accept": "application/json"}

LIGA_HEADER = ["Edicao (PTBR)", "Edicao (EN)", "Edicao (Sigla)", "Card (PT)", "Card (EN)", "Quantidade",
               "Qualidade (M NM SP MP HP D)", "Idioma (BR EN DE ES FR IT JP KO RU TW)", "Raridade (M R U C)",
               "Cor (W U B R G M A L)", "Extras", "Card #", "Comentario"]

QUALITY = {"mint": "M", "near_mint": "NM", "excellent": "SP", "good": "SP", "light_played": "SP",
           "played": "MP", "poor": "HP", "damaged": "D"}
LANG = {"en": "EN", "pt": "BR", "de": "DE", "es": "ES", "fr": "FR", "it": "IT", "ja": "JP", "ko": "KO",
        "ru": "RU", "zht": "TW", "zhs": "CS", "ph": "PH"}
# ManaBox usa codigos proprios para alguns idiomas; normaliza para o codigo do Scryfall
MANABOX_LANG = {"zh_cn": "zhs", "zh_tw": "zht", "pt_br": "pt", "jp": "ja", "kr": "ko"}


def lang_code(r, scry):
    """codigo Scryfall do idioma da linha (ManaBox > Scryfall > en)"""
    code = (r.get("Language") or scry.get("lang") or "en").lower()
    return MANABOX_LANG.get(code, code)
RARITY = {"mythic": "M", "rare": "R", "uncommon": "U", "common": "C", "special": "S", "bonus": "S"}
# codigos internos da Liga (descobertos comparando com um export real e com o cache de cards):
# 5 special, 6 token/theme card, 11 emblema, 13 art card. A letra do CSV para 6/11/13 nao e
# documentada (o cabecalho so lista M R U C), entao vao como "S" igual ao special.
LIGA_RARITY = {1: "C", 2: "U", 3: "R", 4: "M", 5: "S", 6: "S", 11: "S", 13: "S"}
# layouts do Scryfall que a Liga trata como raridade/cor especial (o Scryfall poe rarity "common")
SPECIAL_LAYOUTS = {"token", "double_faced_token", "emblem", "art_series", "front_card"}
LIGA_COLOR = {2: "B", 3: "G", 4: "L", 5: "M", 6: "R", 7: "U", 8: "W", 9: "C", 10: "S"}
PROMO_TYPES = {"prerelease", "promopack", "playpromo", "datestamped", "stamped", "buyabox", "bundle",
               "storechampionship", "gameday", "release", "openhouse", "planeswalkerstamped"}


# ---------------------------------------------------------------- http + cache
def _cache_path(name):
    os.makedirs(CACHE, exist_ok=True)
    return os.path.join(CACHE, name)


def _load(name, default):
    p = _cache_path(name)
    if os.path.exists(p):
        with open(p, encoding="utf-8") as f:
            return json.load(f)
    return default


def _save(name, data):
    with open(_cache_path(name), "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)


def _get(url, retries=3):
    for i in range(retries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=HDR), timeout=40) as r:
                return r.read().decode("utf-8", "ignore")
        except Exception as e:  # noqa
            if i == retries - 1:
                raise
            time.sleep(2 * (i + 1))


# ---------------------------------------------------------------- scryfall
_scry = _load("scryfall.json", {})


def _stale(card_id):
    # cache antigo nao tinha oracle_id / campos do banco (finishes, ids externos...)
    return card_id not in _scry or "finishes" not in _scry[card_id]


def scryfall(card_id):
    if _stale(card_id):
        time.sleep(0.1)  # limite de cortesia da API
        j = json.loads(_get("https://api.scryfall.com/cards/" + card_id))
        _scry[card_id] = _slim(j)
        _save("scryfall.json", _scry)
    return _scry[card_id]


def scryfall_many(ids):
    """pre-carrega o cache em lotes de 75 (/cards/collection) em vez de uma chamada por carta"""
    missing = [i for i in dict.fromkeys(ids) if i and _stale(i)]
    for k in range(0, len(missing), 75):
        chunk = missing[k:k + 75]
        print(f"Scryfall: {k + len(chunk)}/{len(missing)} cartas", file=sys.stderr)
        req = urllib.request.Request("https://api.scryfall.com/cards/collection", method="POST",
                                     data=json.dumps({"identifiers": [{"id": i} for i in chunk]}).encode(),
                                     headers={**HDR, "Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=60) as r:
            res = json.loads(r.read().decode("utf-8"))
        for j in res.get("data", []):
            _scry[j["id"]] = _slim(j)
        _save("scryfall.json", _scry)
        time.sleep(0.1)


def _face(j, key, join=False):
    """campo da carta ou, em dupla-face/art series, das faces"""
    if j.get(key) is not None:
        return j[key]
    vals = [f.get(key) for f in j.get("card_faces") or [] if f.get(key) is not None]
    if not vals:
        return None
    return " // ".join(vals) if join else vals[0]


def _slim(j):
    keep = ["id", "name", "set", "set_name", "set_type", "collector_number", "rarity", "lang", "promo",
            "promo_types", "frame_effects", "border_color", "color_identity", "type_line", "flavor_name",
            "layout", "oracle_id", "released_at", "finishes", "tcgplayer_id", "tcgplayer_etched_id",
            "cardmarket_id"]
    out = {k: j.get(k) for k in keep}
    out["oracle_id"] = _face(j, "oracle_id")
    out["type_line"] = _face(j, "type_line", join=True)
    out["image_uri"] = (_face(j, "image_uris") or {}).get("normal")
    if "card_faces" in j:
        out["faces"] = [f.get("name") for f in j["card_faces"]]
    return out


_sets = _load("scryfall_sets.json", {})


def scryfall_set(code):
    if code not in _sets:
        time.sleep(0.1)
        _sets[code] = json.loads(_get("https://api.scryfall.com/sets/" + code))
        _save("scryfall_sets.json", _sets)
    return _sets[code]


_prints = _load("prints.json", {})


def scryfall_prints(scry):
    """todas as impressoes de uma carta (para achar o set de origem de uma promo generica)"""
    key = scry.get("oracle_id") or scry["name"]
    if key not in _prints:
        time.sleep(0.1)
        q = f"oracleid:{key}" if scry.get("oracle_id") else f'!"{scry["name"]}"'
        url = "https://api.scryfall.com/cards/search?" + urllib.parse.urlencode(
            {"q": q, "unique": "prints", "order": "released"})
        try:
            data = json.loads(_get(url)).get("data") or []
        except Exception:  # noqa - 404 = nenhuma impressao
            data = []
        _prints[key] = [_slim(c) for c in data]
        _save("prints.json", _prints)
    return _prints[key]


# ---------------------------------------------------------------- liga
def liga_editions(refresh=False):
    eds = None if refresh else _load("edicoes.json", None)
    if eds is None:
        html = _get("https://www.ligamagic.com.br/?view=cards/edicoes")
        eds = [json.loads(m) for m in re.findall(r'\{"id":"\d+","acronym":.*?"icon":"[^"]*"\}', html)]
        if not eds:
            sys.exit("Nao consegui ler a lista de edicoes da Liga (layout mudou?)")
        _save("edicoes.json", eds)
    return eds


_liga_cards = _load("liga_cards.json", {})


def liga_cards(ed):
    key = str(ed["id"])
    if key not in _liga_cards:
        time.sleep(0.4)
        q = urllib.parse.quote(f"edid={ed['id']} ed={ed['acronym']}")
        html = _get("https://www.ligamagic.com.br/?view=cards/search&card=" + q)
        dec, out = json.JSONDecoder(), []
        for m in re.finditer(r'\{"precoMenor"', html):
            try:
                o, _ = dec.raw_decode(html, m.start())
                out.append({k: o.get(k) for k in ("id", "nEN", "nPT", "sN", "pF", "iR", "iC", "idE")})
            except ValueError:
                pass
        _liga_cards[key] = out
        _save("liga_cards.json", _liga_cards)
    return _liga_cards[key]


# ---------------------------------------------------------------- matching
def norm(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()


def norm_num(n):
    n = re.sub(r"[^a-z0-9]", "", (n or "").lower())
    n = re.sub(r"^t(?=\d)", "", n)  # tokens na Liga: T01 -> 01
    return n.lstrip("0") or "0"


def liga_text(s):
    """nomes em PT vem com entidades HTML; o export da Liga usa texto sem acento"""
    s = html.unescape(s or "")
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()


def names_match(liga_name, scry):
    ln = norm(liga_name)
    cands = {norm(scry["name"])}
    if scry.get("flavor_name"):
        cands.add(norm(scry["flavor_name"]))
    for f in scry.get("faces") or []:
        cands.add(norm(f))
    ln_first = ln.split(" // ")[0] if " // " in ln else ln
    # nome da Liga pode ter sufixo ("Cadet 2/2", "Dawn Warriors' Legacy // Mizzix's Mastery"),
    # mas nunca o contrario ("Goblin" nao pode casar com "Goblin Tinkerer")
    for c in cands:
        if c and (c == ln or c == ln_first or re.search(r"(^|\W)" + re.escape(c) + r"($|\W)", ln)):
            return True
    return False


class Liga:
    def __init__(self, refresh=False):
        self.eds = liga_editions(refresh)
        self.by_acr = {e["acronym"].lower(): e for e in self.eds}
        self.by_id = {e["id"]: e for e in self.eds}
        self.by_name, self.tokens = {}, {}
        for e in self.eds:
            toks = set()
            for n in (e.get("name"), e.get("nameen")):
                if n:
                    self.by_name.setdefault(norm(n), e)
                    toks |= set(norm(n).split())
            self.tokens[e["id"]] = toks

    def fuzzy(self, set_name, min_score=0.5):
        """edicoes da Liga cujo nome se parece com o nome do set no Scryfall"""
        want = set(norm(set_name).split())
        scored = []
        for e in self.eds:
            toks = self.tokens[e["id"]]
            if toks and want:
                score = len(want & toks) / len(want | toks)
                if score >= min_score:
                    scored.append((score, e))
        scored.sort(key=lambda x: -x[0])
        return [e for _, e in scored[:6]]

    def group(self, base):
        """todas as edicoes da Liga relacionadas ao codigo 'base' do Scryfall"""
        seen, out = set(), []

        def add(e):
            if e and e["id"] not in seen:
                seen.add(e["id"])
                out.append(e)

        main = self.by_acr.get(base)
        add(main)
        if main:
            for e in self.eds:
                if e.get("idgrouped") == main["id"]:
                    add(e)
        if len(base) >= 3:
            for e in self.eds:  # rfspg, tkfinjp, ...
                if e["acronym"].lower().endswith(base) or e["acronym"].lower().startswith(base):
                    add(e)
        return out

    def candidates(self, scry):
        s = scry["set"].lower()
        bases = [s]
        if s.startswith("p") and s[1:] in self.by_acr:
            bases.append(s[1:])  # promos -> set principal
        if s.startswith("t") and ("tk" + s[1:]) in self.by_acr:
            bases.append("tk" + s[1:])  # tokens
        if s.startswith("a") and ("as" + s[1:]) in self.by_acr:
            bases.append("as" + s[1:])  # art series
        # sigla identica na Liga tem prioridade, mas o nome do set tambem entra
        # (sets antigos usam siglas diferentes: exo -> ex, mir -> mr, usg -> us...)
        e = self.by_name.get(norm(scry["set_name"]))
        if e:
            bases.append(e["acronym"].lower())
        out, seen = [], set()
        for b in bases:
            for e in self.group(b):
                if e["id"] not in seen:
                    seen.add(e["id"])
                    out.append(e)
        return out

    def _search(self, cands, scry, num, num_clean):
        by_num, by_name = [], []
        for e in cands:
            for c in liga_cards(e):
                if not names_match(c["nEN"], scry):
                    continue
                by_name.append((e, c))
                if norm_num(c["sN"]) in (num, num_clean):
                    by_num.append((e, c))
        return by_num, by_name

    def find(self, scry, foil):
        num = norm_num(scry["collector_number"])
        num_clean = re.sub(r"[a-z]+$", "", num)  # 191s -> 191
        cands = self.candidates(scry)
        by_num, by_name = self._search(cands, scry, num, num_clean)
        if not by_num and not by_name:
            # nome do set parecido (ex.: "30th Anniversary Play Promos" -> "30th Anniversary Promos")
            extra = [e for e in self.fuzzy(scry["set_name"]) if e not in cands]
            if extra:
                cands += extra
                by_num, by_name = self._search(extra, scry, num, num_clean)
        hits = self._rank(by_num or by_name, foil, num)
        if not hits:
            return None, cands, "nao encontrada"
        if by_num:
            return hits[0], cands, ""
        # so o nome bateu: normal em sets antigos (Liga numera do proprio jeito),
        # mas se ha mais de uma sub-edicao candidata vale conferir
        eds_with_name = {h[0]["id"] for h in by_name}
        return hits[0], cands, ("VERIFICAR: numero diferente, mais de uma edicao possivel"
                                if len(eds_with_name) > 1 else "numero da Liga difere do Scryfall")


    @staticmethod
    def _rank(hits, foil, num):
        if len(hits) > 1:
            # prefere entrada com flag foil compativel, depois numero exato, depois set principal
            hits.sort(key=lambda h: ((h[1].get("pF") or 0) != (1 if foil else 0),
                                     norm_num(h[1]["sN"]) != num,
                                     h[0].get("idgrouped") != "0"))
        return hits

    def find_via_prints(self, scry, foil):
        """Promos que o Scryfall agrupa num set generico (pw25 "Wizards Play Network 2025", plst "The List"...)
        a Liga guarda na edicao "(Promo)" do set de origem: Gran-Gran pw25 #14 -> prtla #1. Descobre o set
        de origem pelas outras impressoes da carta (a de data mais proxima) e procura no grupo dele,
        primeiro nas edicoes "(Promo)", depois no set principal (que recebe Extras = Promo)."""
        if not scry.get("promo"):
            return None

        def ts(c):
            try:
                return time.mktime(time.strptime(c.get("released_at") or "", "%Y-%m-%d"))
            except ValueError:
                return 0

        t0 = ts(scry)
        others = [p for p in scryfall_prints(scry)
                  if p["set"] != scry["set"] and p.get("set_type") not in ("promo", "token", "memorabilia")]
        others.sort(key=lambda p: abs(ts(p) - t0))
        for p in others[:3]:
            alt = dict(scry, set=p["set"], set_name=p["set_name"], collector_number=p["collector_number"])
            num = norm_num(alt["collector_number"])
            group = self.candidates(alt)
            promo_eds = [e for e in group if "promo" in (e.get("name") or "").lower()]
            for cands in (promo_eds, group):
                if not cands:
                    continue
                by_num, by_name = self._search(cands, alt, num, num)
                hits = self._rank(by_num or by_name, foil, num)
                if hits:
                    return hits[0], cands, ""
        return None


# ---------------------------------------------------------------- conversao
def rarity_from_scry(scry):
    if scry.get("layout") in SPECIAL_LAYOUTS:
        return "S"
    return RARITY.get(scry.get("rarity"), "")


def color_from_scry(scry):
    if scry.get("layout") in ("emblem", "art_series", "front_card"):
        return "S"  # cor 10 da Liga
    t = (scry.get("type_line") or "").lower()
    ci = scry.get("color_identity") or []
    if "land" in t and not ci:
        return "L"
    if len(ci) > 1:
        return "M"
    return ci[0] if ci else "C"


def convert(src, dst, refresh=False, db=None, replace=False, schema=None):
    liga = Liga(refresh)
    with open(src, encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))
    scryfall_many([r.get("Scryfall ID") for r in rows])
    out, warn, matched = [], [], []
    for i, r in enumerate(rows, 1):
        name = r.get("Name", "")
        print(f"[{i}/{len(rows)}] {name}", file=sys.stderr)
        scry = scryfall(r["Scryfall ID"])
        foil = (r.get("Foil") or "normal") != "normal"
        promo = bool(set(scry.get("promo_types") or []) & PROMO_TYPES) or \
            (scry["set"].lower().startswith("p") and scry["set"].lower()[1:] in liga.by_acr)
        hit, cands, note = liga.find(scry, foil)
        if not hit:
            hit, cands, note = liga.find_via_prints(scry, foil) or (hit, cands, note)
        if hit and "promo" in (hit[0].get("name") or "").lower():
            promo = False  # ja esta numa edicao "(Promos)" da Liga, nao precisa do extra
        extras = [x for x in (("Foil" if foil else ""), ("Promo" if promo else "")) if x]
        comment = ""
        if hit:
            ed, c = hit
            ed_pt, ed_en, sigla = liga_text(ed.get("namept")), liga_text(ed.get("nameen") or ed["name"]), ed["acronym"]
            card_pt, card_en, num = liga_text(c.get("nPT")), liga_text(c["nEN"]), c["sN"]
            rar = LIGA_RARITY.get(c.get("iR")) or rarity_from_scry(scry)
            col = LIGA_COLOR.get(c.get("iC")) or color_from_scry(scry)
            if note:
                comment = f"VERIFICAR: {note} (Scryfall {scry['set']} #{scry['collector_number']})"
                warn.append(f"{name}: {note} -> {sigla} #{num}")
        else:
            main = cands[0] if cands else None
            ed_pt = liga_text(main.get("namept")) if main else ""
            ed_en = liga_text(main["name"]) if main else scry["set_name"]
            sigla = main["acronym"] if main else scry["set"]
            card_pt, card_en, num = "", scry["name"], scry["collector_number"]
            rar, col = rarity_from_scry(scry), color_from_scry(scry)
            comment = f"VERIFICAR: nao encontrada na Liga (Scryfall {scry['set']} #{scry['collector_number']})"
            warn.append(f"{name}: nao encontrada na Liga ({scry['set']} #{scry['collector_number']})")
        matched.append((r, scry, hit, note))
        out.append([ed_pt, ed_en, sigla, card_pt, card_en, r.get("Quantity", "1"),
                    QUALITY.get(r.get("Condition", ""), "NM"),
                    LANG.get(lang_code(r, scry), "EN"),
                    rar, col, ", ".join(extras), num, comment])
    with open(dst, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(LIGA_HEADER)
        w.writerows(out)
    print(f"\n{len(out)} cartas -> {dst}", file=sys.stderr)
    if warn:
        print(f"{len(warn)} para conferir (coluna Comentario):", file=sys.stderr)
        for w in warn:
            print("  - " + w, file=sys.stderr)
    if db:
        db_import(db, os.path.basename(src), matched, liga, replace, schema)


# ---------------------------------------------------------------- banco (PostgreSQL, db/schema.sql)
# Modelo de lotes (estoque.dbml): inventory = N cartas identicas (print + idioma + qualidade + extras);
# toda entrada/saida e um inventory_movement; inventory.quantity e cache da soma.
def db_connect(dbname, schema=None):
    """conexao pelas variaveis padrao do PostgreSQL (PGHOST, PGPORT, PGUSER, PGPASSWORD);
    sem PGPASSWORD a senha e pedida no terminal. schema: t_<slug> do cliente (plataforma)"""
    import getpass
    import psycopg
    kw = {"host": os.environ.get("PGHOST", "localhost"), "port": os.environ.get("PGPORT", "5432"),
          "user": os.environ.get("PGUSER", "postgres"), "dbname": dbname}
    if not os.environ.get("PGPASSWORD"):
        pw = getpass.getpass(f"Senha do {kw['user']}@{kw['host']}/{dbname}: ")
        # Ctrl+V no console do Windows entra como caractere de controle, nao como colar
        pw = "".join(ch for ch in pw if ch.isprintable()).strip()
        # via ambiente a libpq le a senha como esta, sem escapar = ' \ espacos na connection string
        os.environ["PGPASSWORD"] = pw
    if schema:
        if not re.fullmatch(r"[a-z0-9_]+", schema):
            sys.exit(f"schema invalido: {schema!r} (so a-z, 0-9 e _)")
        kw["options"] = f"-c search_path={schema}"
    return psycopg.connect(**kw)


def _js(v):
    return json.dumps(v, ensure_ascii=False) if v else None


def _db_set(cur, code, liga, cache):
    if code in cache:
        return cache[code]
    s = scryfall_set(code)
    parent = _db_set(cur, s["parent_set_code"], liga, cache) if s.get("parent_set_code") else None
    le = liga.by_acr.get(code) or {}  # dados da Liga so quando a sigla bate 1:1
    name_pt = html.unescape(le["namept"]) if le.get("namept") else None
    cur.execute("""
        INSERT INTO card_set (code, name_en, name_pt, set_type, released_at, parent_set_id,
                              tcgplayer_id, liga_id, liga_acronym, liga_name_pt, icon_url)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        ON CONFLICT (code) DO UPDATE SET
            name_en = EXCLUDED.name_en, name_pt = COALESCE(EXCLUDED.name_pt, card_set.name_pt),
            set_type = EXCLUDED.set_type, released_at = EXCLUDED.released_at,
            parent_set_id = EXCLUDED.parent_set_id, tcgplayer_id = EXCLUDED.tcgplayer_id,
            liga_id = COALESCE(EXCLUDED.liga_id, card_set.liga_id),
            liga_acronym = COALESCE(EXCLUDED.liga_acronym, card_set.liga_acronym),
            liga_name_pt = COALESCE(EXCLUDED.liga_name_pt, card_set.liga_name_pt),
            icon_url = EXCLUDED.icon_url
        RETURNING id""",
        (code, s["name"], name_pt, s.get("set_type"), s.get("released_at"), parent,
         s.get("tcgplayer_id"), int(le["id"]) if le else None, le.get("acronym"), name_pt,
         s.get("icon_svg_uri")))
    cache[code] = cur.fetchone()[0]
    return cache[code]


def _db_card(cur, scry):
    cur.execute("""
        INSERT INTO card (oracle_id, name_en, type_line, color_identity)
        VALUES (%s,%s,%s,%s)
        ON CONFLICT (oracle_id) DO UPDATE SET
            name_en = EXCLUDED.name_en, type_line = EXCLUDED.type_line,
            color_identity = EXCLUDED.color_identity
        RETURNING id""",
        (scry["oracle_id"], scry["name"], scry.get("type_line"), "".join(scry.get("color_identity") or [])))
    return cur.fetchone()[0]


def _db_print(cur, scry, hit, note, card_id, set_id):
    c = hit[1] if hit else {}
    # ids da Liga so com casamento pelo numero (note vazio) e se nenhuma outra impressao ja tem esse
    # liga_card_id (unique): variantes casadas so pelo nome ficam sem, como o "VERIFICAR" do CSV
    liga = c
    if c and note:
        liga = {}
    elif c:
        cur.execute("SELECT 1 FROM card_print WHERE liga_card_id = %s AND scryfall_id <> %s", (c["id"], scry["id"]))
        if cur.fetchone():
            liga = {}
    rarity = "special" if scry.get("layout") in SPECIAL_LAYOUTS else scry.get("rarity")
    color = LIGA_COLOR.get(c.get("iC")) or color_from_scry(scry)
    cur.execute("""
        INSERT INTO card_print (card_id, card_set_id, collector_number, name_en, name_pt, rarity, color,
            layout, border_color, frame_effects, promo, promo_types, finishes, image_uri, released_at,
            scryfall_id, tcgplayer_id, tcgplayer_etched_id, cardmarket_id, liga_card_id,
            liga_rarity_code, liga_color_code, liga_has_foil, updated_at)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s, now())
        ON CONFLICT (scryfall_id) DO UPDATE SET
            name_pt = COALESCE(EXCLUDED.name_pt, card_print.name_pt), rarity = EXCLUDED.rarity,
            color = EXCLUDED.color, image_uri = EXCLUDED.image_uri, finishes = EXCLUDED.finishes,
            liga_card_id = COALESCE(EXCLUDED.liga_card_id, card_print.liga_card_id),
            liga_rarity_code = COALESCE(EXCLUDED.liga_rarity_code, card_print.liga_rarity_code),
            liga_color_code = COALESCE(EXCLUDED.liga_color_code, card_print.liga_color_code),
            liga_has_foil = COALESCE(EXCLUDED.liga_has_foil, card_print.liga_has_foil),
            updated_at = now()
        RETURNING id""",
        (card_id, set_id, scry["collector_number"], scry["name"],
         html.unescape(c["nPT"]) if c.get("nPT") else None, rarity, color, scry.get("layout"),
         scry.get("border_color"), _js(scry.get("frame_effects")), bool(scry.get("promo")),
         _js(scry.get("promo_types")), _js(scry.get("finishes")), scry.get("image_uri"),
         scry.get("released_at"), scry["id"], scry.get("tcgplayer_id"), scry.get("tcgplayer_etched_id"),
         scry.get("cardmarket_id"), liga.get("id"), liga.get("iR"), liga.get("iC"),
         bool(liga["pF"]) if "pF" in liga else None))
    return cur.fetchone()[0]


def db_extras(r, scry, hit, extras_tbl, liga):
    """codes da tabela extra que se aplicam a esta linha do ManaBox (ver seed em db/schema.sql).
    extras_tbl: {code: (scryfall_source, scryfall_value)}"""
    out = set()
    foil = (r.get("Foil") or "normal").lower()
    if foil in ("foil", "etched") and foil in extras_tbl:
        out.add(foil)
    ptypes = set(scry.get("promo_types") or [])
    for code, (src, val) in extras_tbl.items():
        if src == "promo_types" and val in ptypes:
            out.add(code)
        elif src == "set_type" and val == scry.get("set_type"):
            out.add(code)
    # "Promo" generico: mesma regra do CSV (promo da Liga sem extra proprio e fora de edicao "(Promo)")
    sset = scry["set"].lower()
    promo = bool(ptypes & PROMO_TYPES) or (sset.startswith("p") and sset[1:] in liga.by_acr)
    in_promo_ed = bool(hit) and "promo" in (hit[0].get("name") or "").lower()
    if "promo" in extras_tbl and promo and not in_promo_ed and not (out & {"prerelease", "buyabox", "fnm", "dci"}):
        out.add("promo")
    for col, code in (("Misprint", "misprint"), ("Signed", "signed"), ("Altered", "altered")):
        if r.get(col) == "true" and code in extras_tbl:
            out.add(code)
    return sorted(out)


def db_import(dbname, source, matched, liga, replace=False, schema=None):
    """grava as cartas ja casadas pelo convert(): upsert card_set/card/card_print, lote em inventory
    (+ inventory_extra) e um inventory_movement 'purchase' por linha do CSV.
    reference = nome do CSV evita importar o mesmo arquivo duas vezes."""
    with db_connect(dbname, schema) as db, db.cursor() as cur:
        cur.execute("SELECT count(*) FROM inventory_movement WHERE reference = %s AND type = 'purchase'",
                    (source,))
        if cur.fetchone()[0]:
            if not replace:
                print(f"\nBanco: {source} ja importado, nada gravado (use --substituir para reimportar)",
                      file=sys.stderr)
                return
            # desfaz as entradas desse CSV (vendas feitas depois continuam; quantity nunca fica negativa)
            cur.execute("""
                WITH m AS (DELETE FROM inventory_movement WHERE reference = %s AND type = 'purchase'
                           RETURNING inventory_id, quantity)
                UPDATE inventory i SET quantity = i.quantity - s.q, updated_at = now()
                FROM (SELECT inventory_id, sum(quantity) q FROM m GROUP BY 1) s
                WHERE i.id = s.inventory_id
                RETURNING s.q""", (source,))
            print(f"\nBanco: {sum(q for (q,) in cur.fetchall())} unidades de {source} removidas", file=sys.stderr)
        cur.execute("SELECT code, id FROM language")
        langs = dict(cur.fetchall())
        cur.execute("SELECT code, id, scryfall_source, scryfall_value FROM extra")
        extra_id, extras_tbl = {}, {}
        for code, eid, src, val in cur.fetchall():
            extra_id[code] = eid
            extras_tbl[code] = (src, val)
        sets, total, lotes = {}, 0, set()
        for r, scry, hit, note in matched:
            print_id = _db_print(cur, scry, hit, note, _db_card(cur, scry), _db_set(cur, scry["set"], liga, sets))
            lang = lang_code(r, scry)
            if lang not in langs:
                sys.exit(f"Idioma '{lang}' nao existe na tabela language ({r.get('Name')})")
            qty = int(r.get("Quantity") or 1)
            price = r.get("Purchase price") or None
            cur_ = r.get("Purchase price currency") or "BRL"
            codes = db_extras(r, scry, hit, extras_tbl, liga)
            key = ",".join(codes)
            cond = QUALITY.get(r.get("Condition", ""), "NM")
            # lote: cria se nao existe; purchase_cost so em lote novo (depois e do usuario)
            cur.execute("""
                INSERT INTO inventory (card_print_id, language_id, condition, extras_key, quantity,
                                       purchase_cost, currency)
                VALUES (%s,%s,%s,%s,0,%s,%s)
                ON CONFLICT (card_print_id, language_id, condition, extras_key) DO UPDATE
                    SET updated_at = now()
                RETURNING id, (xmax = 0) AS novo""", (print_id, langs[lang], cond, key, price, cur_))
            inv_id, novo = cur.fetchone()
            if novo and codes:
                cur.executemany("INSERT INTO inventory_extra (inventory_id, extra_id) VALUES (%s,%s)",
                                [(inv_id, extra_id[c]) for c in codes])
            cur.execute("""
                INSERT INTO inventory_movement (inventory_id, type, quantity, unit_price, currency, reference,
                                                created_at)
                VALUES (%s,'purchase',%s,%s,%s,%s, COALESCE(%s::timestamp, now()))""",
                (inv_id, qty, price, cur_, source, r.get("Added") or None))
            cur.execute("UPDATE inventory SET quantity = quantity + %s, updated_at = now() WHERE id = %s",
                        (qty, inv_id))
            total += qty
            lotes.add(inv_id)
        db.commit()
    onde = f"{dbname}" + (f" (schema {schema})" if schema else "")
    print(f"\nBanco: {total} unidades em {len(lotes)} lotes de {source} gravados em {onde}", file=sys.stderr)


if __name__ == "__main__":
    for stream in (sys.stdout, sys.stderr):  # nomes com acento no cmd do Windows
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(errors="replace")
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("-o", "--out")
    ap.add_argument("--refresh", action="store_true", help="rebaixa lista de edicoes e cartas da Liga")
    ap.add_argument("--db", nargs="?", const="EstoqueTeste", metavar="BANCO",
                    help="tambem grava no PostgreSQL (padrao: EstoqueTeste)")
    ap.add_argument("--substituir", action="store_true",
                    help="com --db: desfaz as entradas deste CSV antes de gravar de novo")
    ap.add_argument("--schema", metavar="T_SLUG", help="com --db: schema do cliente na plataforma (t_<slug>)")
    a = ap.parse_args()
    dst = a.out or os.path.splitext(a.src)[0] + " - Liga.csv"
    if a.refresh:
        for n in ("edicoes.json", "liga_cards.json"):
            p = _cache_path(n)
            if os.path.exists(p):
                os.remove(p)
        _liga_cards.clear()
    convert(a.src, dst, a.refresh, a.db, a.substituir, a.schema)
