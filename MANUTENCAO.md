# Manutenção

Notas para quem mantém o site. Para usar o conversor, veja o [README](README.md).

## Como funciona

- `docs/` é o site publicado no GitHub Pages.
  - `conv.js` tem a lógica de conversão (é a porta do `conv.py` original).
  - `formats.js` detecta o formato de entrada e gera as saídas para os outros apps (inclusive LigaMagic → ManaBox).
  - `app.js` cuida da interface, do lote de arquivos e do Google Drive.
  - `i18n.js` tem os textos do site em português, inglês e espanhol.
  - `zip.js` gera o .zip para baixar vários arquivos convertidos de uma vez.
  - `config.js` guarda as credenciais do Google Drive.
  - `data/edicoes.json` lista as edições da Liga. O campo `s` indica a data em que as cartas daquela edição foram baixadas.
  - `data/cards/<id>.json` guarda as cartas de cada edição.
- `scripts/build_data.py` raspa a LigaMagic e gera `docs/data`. Ele roda no seu PC, via `scripts/atualizar_liga.ps1`, que também commita e publica os dados (veja [Atualizar os dados da Liga](#atualizar-os-dados-da-liga)).
- O Scryfall é consultado direto do navegador, pelo endpoint `/cards/collection`, com até 75 cartas por requisição.
- As colunas do CSV são reconhecidas pelo nome (veja `COLS` em `conv.js`). A carta é procurada pelo melhor dado disponível, nesta ordem: Scryfall ID, edição + número, nome + edição e, por último, só o nome. Siglas da Liga que o Scryfall não conhece (ex.: `schob`) são procuradas direto nos dados da Liga.

### Ritmo do scraping

O `robots.txt` da LigaMagic pede `Crawl-delay: 360`. Por isso o script espera 6 minutos entre requisições. A tarefa agendada roda 4 vezes por dia, com até 55 edições por execução (cerca de 5h30). São no máximo 240 edições por dia, então o catálogo inteiro leva uns 5 a 6 dias para ser indexado.

A fila de cada execução segue esta ordem:
1. Edições recentes (lançadas nos últimos 90 dias) cujos dados têm mais de 3 dias.
2. Edições que nunca foram indexadas, das mais novas para as mais antigas.

Quando uma carta cai numa edição ainda não indexada, o site marca a linha com `VERIFICAR`.

## Atualizar os dados da Liga

A LigaMagic fica atrás do Cloudflare e responde `HTTP 403` para os IPs do GitHub Actions. Por isso o scraping roda num PC comum e o Actions só publica o site.

`scripts/atualizar_liga.ps1` faz tudo: `git pull`, roda o `build_data.py`, commita `docs/data` e dá `git push` (o push dispara a publicação). Precisa de `git` com credencial salva para o repositório e `python` no PATH.

Para agendar a cada 6 horas no Agendador de Tarefas do Windows (roda como o seu usuário, só com o PC ligado):

```powershell
powershell -ExecutionPolicy Bypass -File scripts\atualizar_liga.ps1 -Instalar
```

Para rodar na hora, ou indexar edições específicas:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\atualizar_liga.ps1 -Only "hob tla"
```

O log fica em `scripts/atualizar_liga.log`.

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
5. Para indexar uma edição na hora, rode `scripts\atualizar_liga.ps1 -Only "hob tla"` no seu PC (veja acima). O **Run workflow** do Actions também tenta, mas a Liga bloqueia o runner do GitHub.

## Google Drive

O botão do Google Drive só funciona depois de criar credenciais no Google Cloud. Sem elas, o botão avisa que não está configurado e o resto do site funciona normalmente. É tudo grátis.

1. Acesse https://console.cloud.google.com e crie um projeto (exemplo: `Conversor Liga`).
2. No menu **APIs e serviços → Biblioteca**, ative a **Google Picker API** e a **Google Drive API**.
3. No menu **Google Auth Platform** (ou **Tela de permissão OAuth**):
   - Tipo de usuário: **Externo**. Preencha o nome do app e o seu e-mail.
   - Em **Público**, clique em **Publicar app**. O site só pede o escopo `drive.file` (acesso apenas aos arquivos que a pessoa escolher), que não exige verificação do Google.
4. Em **APIs e serviços → Credenciais → Criar credenciais → ID do cliente OAuth**:
   - Tipo: **Aplicativo da Web**.
   - Em **Origens JavaScript autorizadas**, adicione `https://hideonchimes.github.io` e `http://localhost:8000`.
   - Copie o **ID do cliente**.
5. Em **Criar credenciais → Chave de API**:
   - Clique na chave criada. Em **Restrições de aplicativos**, escolha **Referenciadores HTTP** e adicione `https://hideonchimes.github.io/*` e `http://localhost:8000/*`.
   - Em **Restrições de API**, escolha **Google Picker API**.
   - Copie a chave.
6. Na página inicial do projeto, copie o **Número do projeto**.
7. Preencha `docs/config.js` com os três valores (`apiKey`, `clientId`, `appId`) e faça o push.

Esses valores ficam visíveis no navegador de qualquer forma. A proteção vem das restrições dos passos 4 e 5, que só deixam o seu site usá-los.

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

Para testar a ida e volta (CSV da Liga → ManaBox, comparando com o original):

```bash
node scripts/test_reverse.mjs ../Coleções
```

Para importar o cache do `conv.py` sem acessar a Liga:

```bash
python scripts/build_data.py --seed ../.cache_liga
```
