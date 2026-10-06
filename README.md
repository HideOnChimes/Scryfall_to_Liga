# Conversor de coleção → LigaMagic

Site estático que converte o CSV de coleção do ManaBox, Scryfall, Moxfield, Deckbox, Dragon Shield ou TCGplayer (ou uma lista de cartas em texto) para o CSV de importação de coleção da LigaMagic. A conversão roda inteira no navegador, então o arquivo do usuário nunca vai para um servidor.

## Como funciona

- `docs/` é o site publicado no GitHub Pages.
  - `conv.js` tem a lógica de conversão (é a porta do `conv.py` original).
  - `app.js` cuida da interface.
  - `data/edicoes.json` lista as edições da Liga. O campo `s` indica a data em que as cartas daquela edição foram baixadas.
  - `data/cards/<id>.json` guarda as cartas de cada edição.
- `scripts/build_data.py` raspa a LigaMagic e gera `docs/data`. O GitHub Actions roda esse script uma vez por dia.
- O Scryfall é consultado direto do navegador, pelo endpoint `/cards/collection`, com até 75 cartas por requisição.
- As colunas do CSV são reconhecidas pelo nome (veja `COLS` em `conv.js`). A carta é procurada pelo melhor dado disponível, nesta ordem: Scryfall ID, edição + número, nome + edição e, por último, só o nome. Siglas da Liga que o Scryfall não conhece (ex.: `schob`) são procuradas direto nos dados da Liga.

### Ritmo do scraping

O `robots.txt` da LigaMagic pede `Crawl-delay: 360`. Por isso o script espera 6 minutos entre requisições e baixa no máximo 12 edições por execução.

A fila de cada execução segue esta ordem:
1. Edições recentes (lançadas nos últimos 90 dias) cujos dados têm mais de 3 dias.
2. Edições que nunca foram indexadas, das mais novas para as mais antigas.

Quando uma carta cai numa edição ainda não indexada, o site marca a linha com `VERIFICAR`.

## Publicar no GitHub Pages

1. Crie um repositório público no GitHub, por exemplo `conversor-liga`.
2. Dentro desta pasta, rode:
   ```bash
   git init -b main
   git add .
   git commit -m "MVP"
   git remote add origin https://github.com/SEU_USUARIO/conversor-liga.git
   git push -u origin main
   ```
3. No repositório, vá em **Settings → Pages → Source** e escolha **GitHub Actions**.
4. O push dispara a publicação. O site fica em `https://SEU_USUARIO.github.io/conversor-liga/`.
5. Para indexar uma edição na hora: **Actions → Atualizar dados e publicar → Run workflow**, preenchendo o campo `only` (exemplo: `hob tla`).

## Rodar localmente

```bash
python -m http.server 8000 -d docs
```

Depois abra http://localhost:8000.

Para testar a conversão contra os CSVs gerados pelo `conv.py`:

```bash
node scripts/test_node.mjs ../Coleções
```

Para testar os formatos dos outros apps (gerados a partir de um CSV do ManaBox):

```bash
node scripts/test_formats.mjs ../Coleções/Hobbit.csv
```

Para importar o cache do `conv.py` sem acessar a Liga:

```bash
python scripts/build_data.py --seed ../.cache_liga
```
