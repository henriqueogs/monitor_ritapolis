# Deploy: Cloudflare + Render

Arquitetura escolhida para publicacao segura:

- Cloudflare na borda: DNS proxied, WAF, TLS, rate limiting e protecao DDoS.
- Frontend em Cloudflare Workers/Pages.
- API Node/Express no Render, atras de dominio proxied pela Cloudflare.
- SQLite em disco persistente do Render, sem expor arquivos do banco ao publico.

## API no Render

O arquivo `render.yaml` cria um Web Service para a API:

- build: `npm ci`
- start: `npm run api`
- health check: `/api/health`
- disco persistente: `/var/data`
- banco: `/var/data/ritapolis.db`
- logs: `/var/data/logs`

Variaveis obrigatorias no Render:

```bash
ADMIN_BOOTSTRAP_TOKEN=<token-longo-para-criar-primeiro-admin>
NVIDIA_API_KEY=<chave-nvidia>
NEXT_PUBLIC_API_URL=https://api.seu-dominio.com/api
ALLOWED_ORIGINS=https://seu-dominio.com,https://www.seu-dominio.com
```

`ADMIN_AUTH_USER` e `ADMIN_AUTH_PASSWORD` continuam aceitos como fallback operacional Basic Auth, mas o acesso normal
do painel usa `/login`, senha armazenada com hash `scrypt` e cookie de sessao `HttpOnly`. Em producao, o primeiro
usuario so pode ser criado com `ADMIN_BOOTSTRAP_TOKEN`; depois que existir um admin, o endpoint de bootstrap passa a
responder conflito e nao cria novos usuarios.

Variaveis ja definidas pelo blueprint:

```bash
NODE_ENV=production
API_HOST=0.0.0.0
DB_PATH=/var/data/ritapolis.db
LOG_DIR=/var/data/logs
```

O codigo tambem respeita `PORT`, que e a porta injetada pelo Render.

## Cloudflare DNS e borda

Criar estes registros:

```text
api.seu-dominio.com      CNAME  <servico-render>.onrender.com      Proxied
www.seu-dominio.com      CNAME  <frontend-cloudflare>              Proxied
seu-dominio.com          CNAME  <frontend-cloudflare>              Proxied
```

No Cloudflare:

- SSL/TLS em `Full` ou `Full (strict)` quando o certificado da origem estiver validado.
- WAF Managed Rules habilitado.
- Rate limiting para `/api/auth/*`, `/api/admin/*`, `/api/*/resumir`, `/api/coletas/*`, `/api/alertas/gerar`.
- Cache somente para rotas publicas `GET`; nunca cachear `/api/admin/*`, `/api/coletas/*`, `/api/ia/*`, `/api/scheduler/*` ou respostas autenticadas.
- A API tambem aplica CORS por `ALLOWED_ORIGINS`, sessao admin nas rotas operacionais, fallback Basic Auth opcional e limites por classe de rota.

No Render:

- adicionar `api.seu-dominio.com` como custom domain;
- remover qualquer registro `AAAA` conflitante no Cloudflare, se existir;
- manter deploy automatico a partir do branch de producao.

## Frontend no Cloudflare

O frontend atual usa Next.js `14.2.x`, App Router, middleware e fetch server-side para a API. Por isso, o caminho mais seguro e publicar como Next full-stack no Cloudflare Workers via OpenNext, mas isso exige atualizar o frontend para uma versao de Next compatível com o `@opennextjs/cloudflare` atual.

O frontend precisa receber `NEXT_PUBLIC_API_URL`. Se `ADMIN_AUTH_USER` e `ADMIN_AUTH_PASSWORD` tambem forem configurados no frontend, o proxy interno `/api/admin-proxy/*` pode usar Basic Auth como fallback servidor-servidor; caso contrario, ele encaminha o cookie `HttpOnly` criado pelo login.

Proximo passo recomendado:

1. Criar uma branch so para o frontend Cloudflare.
2. Atualizar Next/React conforme exigido pelo OpenNext atual.
3. Adicionar `@opennextjs/cloudflare`, `wrangler`, `wrangler.toml` e `open-next.config.ts`.
4. Configurar `NEXT_PUBLIC_API_URL=https://api.seu-dominio.com/api` no Cloudflare.
5. Configurar `ADMIN_BOOTSTRAP_TOKEN` no Render e criar o primeiro admin em `/login`.
6. Validar `npm run build` e deploy de preview antes de trocar DNS.

Alternativa de menor mudanca: manter o frontend em um host Node/Next tradicional e usar Cloudflare apenas como borda. Essa alternativa reduz risco de upgrade, mas nao cumpre o objetivo de rodar o frontend no Cloudflare.

## Checklist de publicacao

- [ ] API criada no Render pelo `render.yaml`.
- [ ] Disco persistente montado em `/var/data`.
- [ ] Variaveis secretas configuradas no Render.
- [ ] `https://api.seu-dominio.com/api/health` responde via Cloudflare.
- [ ] Primeiro admin criado via `/login` usando `ADMIN_BOOTSTRAP_TOKEN`.
- [ ] Frontend aponta `NEXT_PUBLIC_API_URL` para o dominio Cloudflare da API.
- [ ] Login, logout e uma rota `/admin` testados com cookie de sessao.
- [ ] WAF/rate limits ativos antes de divulgar URL publica.
- [ ] `npm run dados:status` executado apos primeira carga/restauracao do banco.
