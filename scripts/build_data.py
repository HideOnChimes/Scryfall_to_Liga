"""
Gera os dados estaticos que o site usa (docs/data):

  docs/data/edicoes.json        lista de edicoes da Liga (+ campo "s" = data em que as cartas foram baixadas)
  docs/data/cards/<id>.json     cartas de cada edicao: [[nome EN, nome PT, numero, foil, raridade, cor], ...]
  docs/data/state.json          controle interno: quando cada edicao foi baixada

O robots.txt da LigaMagic pede Crawl-delay de 360s, entao cada execucao baixa poucas
edicoes (prioridade: lancamentos recentes e edicoes ainda nao indexadas).

Uso:
    python scripts/build_data.py                         # execucao normal (GitHub Actions, 1x/dia)
    python scripts/build_data.py --max 5 --delay 360
    python scripts/build_data.py --seed ../.cache_liga   # importa o cache do conv.py, sem acessar a Liga
    python scripts/build_data.py --only hob tla          # forca edicoes especificas
"""
import argparse
import datetime as dt
import html
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "docs", "data")
CARDS = os.path.join(DATA, "cards")
HDR = {"User-Agent": "conversor-liga-web/1.0 (+github pages; ManaBox -> LigaMagic)"}
ED_KEYS = ("id", "acronym", "name", "nameen", "namept", "idgrouped", "dtrelease")
RECENT_DAYS = 90       # edicoes lancadas ha menos que isso sao re-baixadas periodicamente
REFRESH_DAYS = 3       # intervalo minimo entre re-downloads de uma edicao recente
FUTURE_DAYS = 30       # pre-venda: edicoes que saem em ate N dias ja entram na fila


def get(url, retries=3):
    for i in range(retries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=HDR), timeout=60) as r:
                return r.read().decode("utf-8", "ignore")
        except Exception:  # noqa
            if i == retries - 1:
                raise
            time.sleep(30 * (i + 1))


def load(path, default):
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    return default


def save(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))


def fetch_editions():
    page = get("https://www.ligamagic.com.br/?view=cards/edicoes")
    eds = [json.loads(m) for m in re.findall(r'\{"id":"\d+","acronym":.*?"icon":"[^"]*"\}', page)]
    if not eds:
        sys.exit("Nao consegui ler a lista de edicoes da Liga (layout mudou?)")
    return eds


def fetch_cards(ed):
    q = urllib.parse.quote(f"edid={ed['id']} ed={ed['acronym']}")
    page = get("https://www.ligamagic.com.br/?view=cards/search&card=" + q)
    dec, out = json.JSONDecoder(), []
    for m in re.finditer(r'\{"precoMenor"', page):
        try:
            o, _ = dec.raw_decode(page, m.start())
            out.append(o)
        except ValueError:
            pass
    return [compact(o) for o in out]


def compact(o):
    return [html.unescape(o.get("nEN") or ""), html.unescape(o.get("nPT") or ""), o.get("sN") or "",
            o.get("pF") or 0, o.get("iR") or 0, o.get("iC") or 0]


def release(ed):
    try:
        return dt.date.fromisoformat((ed.get("dtrelease") or "")[:10])
    except ValueError:
        return dt.date(1990, 1, 1)


def write_editions(eds, state):
    out = []
    for e in eds:
        row = {k: html.unescape(e.get(k) or "") for k in ED_KEYS}
        if e["id"] in state:
            row["s"] = state[e["id"]][:10]
        out.append(row)
    save(os.path.join(DATA, "edicoes.json"), out)


def queue(eds, state, today):
    never, stale = [], []
    for e in eds:
        r = release(e)
        if r > today + dt.timedelta(days=FUTURE_DAYS):
            continue
        last = state.get(e["id"])
        if not last:
            never.append(e)
        elif (today - r).days <= RECENT_DAYS and \
                (today - dt.date.fromisoformat(last[:10])).days >= REFRESH_DAYS:
            stale.append(e)
    never.sort(key=release, reverse=True)
    stale.sort(key=lambda e: state[e["id"]])
    # alterna: recentes desatualizadas primeiro (mudam mais), depois as nunca baixadas
    return stale + never


def seed(cache_dir, state):
    eds = load(os.path.join(cache_dir, "edicoes.json"), None)
    cards = load(os.path.join(cache_dir, "liga_cards.json"), {})
    if eds is None:
        sys.exit(f"edicoes.json nao encontrado em {cache_dir}")
    stamp = dt.datetime.fromtimestamp(os.path.getmtime(os.path.join(cache_dir, "liga_cards.json")))
    for ed_id, lst in cards.items():
        save(os.path.join(CARDS, f"{ed_id}.json"), [compact(o) for o in lst])
        state[ed_id] = stamp.isoformat(timespec="seconds")
    print(f"seed: {len(eds)} edicoes, {len(cards)} com cartas")
    return eds


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--max", type=int, default=12, help="maximo de edicoes baixadas nesta execucao")
    ap.add_argument("--delay", type=float, default=360, help="segundos entre requisicoes (robots.txt pede 360)")
    ap.add_argument("--seed", help="pasta .cache_liga do conv.py para importar sem acessar a Liga")
    ap.add_argument("--only", nargs="*", help="siglas especificas para baixar agora")
    ap.add_argument("--minutes", type=float, default=0,
                    help="para antes de passar desse tempo (0 = sem limite); evita estourar o timeout do Actions")
    a = ap.parse_args()

    state_path = os.path.join(DATA, "state.json")
    state = load(state_path, {})
    today = dt.date.today()
    start = time.monotonic()

    if a.seed:
        eds = seed(a.seed, state)
        save(state_path, state)
        write_editions(eds, state)
        return

    eds = fetch_editions()
    write_editions(eds, state)  # lista nova ja fica disponivel mesmo se algo falhar depois
    if a.only:
        want = {s.lower() for s in a.only}
        todo = [e for e in eds if e["acronym"].lower() in want]
    else:
        todo = queue(eds, state, today)
    todo = todo[:a.max]
    print(f"{len(eds)} edicoes; baixando {len(todo)}: {', '.join(e['acronym'] for e in todo)}")

    for e in todo:
        if a.minutes and (time.monotonic() - start + a.delay + 60) / 60 > a.minutes:
            print("tempo esgotado, o resto fica para a proxima execucao")
            break
        time.sleep(a.delay)
        try:
            cards = fetch_cards(e)
        except Exception as ex:  # noqa
            print(f"  {e['acronym']}: erro {ex}")
            continue
        save(os.path.join(CARDS, f"{e['id']}.json"), cards)
        state[e["id"]] = dt.datetime.now().isoformat(timespec="seconds")
        save(state_path, state)
        write_editions(eds, state)
        print(f"  {e['acronym']} ({e['name']}): {len(cards)} cartas")


if __name__ == "__main__":
    main()
