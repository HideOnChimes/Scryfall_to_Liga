# Bug: "A chave de desenvolvedor da API é inválida" no Google Drive (Helium)

Data: 13/10/2026 · Branch: `bugfix_othersBrowser`

## Sintoma

No navegador **Helium**, ao clicar em **Google Drive**, o Google Picker abria e mostrava:

> Ocorreu um erro! A chave de desenvolvedor da API é inválida.

No Chrome normal funcionava. O convertio.co também não funcionava no Helium.

## Causa

São dois fatores juntos:

1. **O Helium bloqueia cookies de terceiros por padrão.** O Picker é um iframe em `docs.google.com` dentro do nosso site, então para o navegador é "terceiro" e fica sem a sessão do Google.
2. Por causa disso o Picker faz um fluxo em **duas cargas**:
   - **1ª carga**: `Referer: http://localhost:8000/` (ou o site publicado), `Sec-Fetch-Storage-Access: inactive` → responde **401**. O Google mostra a tela "Permita que o Google acesse os cookies necessários" (Storage Access API) ou ativa sozinho se já foi permitido antes.
   - **2ª carga** (o iframe se recarrega com `&storage_access_granted=true`): `Sec-Fetch-Storage-Access: active`, sessão funcionando (200), mas agora o **`Referer` é `https://docs.google.com/picker?...`**.
3. A chave de API estava restrita por site (referenciadores HTTP) **sem `https://docs.google.com/*`**. Na 2ª carga o referenciador é o próprio Google → chave rejeitada → "chave inválida".

No Chrome os cookies funcionam na 1ª carga, não existe a 2ª, por isso o erro nunca aparecia lá.

A [documentação oficial do Picker](https://developers.google.com/workspace/drive/picker/guides/web-picker) já manda incluir `https://docs.google.com/*` nas restrições de site da chave.

## Correção

**Google Cloud** (APIs e serviços → Credenciais → chave de API):

- Restrições de aplicativos: **Sites**, com exatamente:
  ```
  https://hideonchimes.github.io/*
  http://localhost:8000/*
  https://docs.google.com/*
  ```
- `https://docs.google.com/picker/*` **não serve**: não cobre `/picker?...` (URL com parâmetros).
- Restrições de API: só **Google Picker API**.
- A mudança leva de 5 a 15 minutos para propagar.

**Repositório:**

- `MANUTENCAO.md`, passo 5: incluído `https://docs.google.com/*` com a explicação.
- `MANUTENCAO.md`, "Rodar localmente": comando alternativo para o erro de MIME no Windows (veja abaixo).
- `docs/app.js` e `docs/index.html`: alterações de diagnóstico (log `[picker]` e `<meta name="referrer">`) foram testadas e **removidas**. Não eram necessárias.

## Resultado

Testado no Helium em `http://localhost:8000`: o Picker abre e lista os arquivos.
O **401 no console continua aparecendo e é normal**: é a 1ª carga, antes de liberar os cookies.

Falta testar no site publicado (`https://hideonchimes.github.io`) no Helium.

## Segurança do `docs.google.com/*`

Não é um risco relevante:

- Só páginas servidas por `docs.google.com` (código do próprio Google) passam a poder usar a chave.
- O `Referer` pode ser falsificado com `curl`, então essa restrição nunca foi uma proteção forte. A chave não é segredo.
- O que protege de verdade:
  - **Restrição de API = só Google Picker API.** Nunca remover.
  - **Origens JavaScript autorizadas** do OAuth Client ID (só o site e o localhost).
  - Escopo `drive.file`: acesso só aos arquivos que o usuário escolher.
- Pior caso: alguém usa a chave no próprio Picker e gasta cota gratuita. Basta gerar uma chave nova e atualizar `docs/config.js`.

## Coisas descobertas no caminho

- **Erro de MIME no servidor local (Windows):** `python -m http.server` pode servir `.js` como `text/plain` (vem do registro do Windows), e o módulo não carrega. Use:
  ```bash
  python -c "import http.server as h, mimetypes, functools; mimetypes.add_type('text/javascript', '.js'); h.test(HandlerClass=functools.partial(h.SimpleHTTPRequestHandler, directory='docs'), port=8000)"
  ```
- **Não há como pedir por JavaScript para liberar cookies de terceiros.** A Storage Access API só pode ser chamada de dentro do iframe (código do Google, que já faz isso). `requestStorageAccessFor` só vale para Related Website Sets.
- **Convertio:** abre o Picker **sem chave de API** (`setDeveloperKey` ausente no JS deles), então o motivo da falha deles no Helium é outro. Não foi investigado a fundo. Suspeitas: o Picker exigir a chave na 2ª carga, popup de login bloqueado ou o uBlock embutido no Helium.
- **Permissão de cookies guardada:** depois de clicar "Permitir cookies", o Helium guarda a permissão e a tela não aparece mais. Para resetar: `helium://settings/content/storageAccess` (ou `chrome://...`).
- **Ao copiar headers do DevTools**, apagar `oauth_token`, `cookie` e `set-cookie`: são credenciais da conta Google.
