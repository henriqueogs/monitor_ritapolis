# Deploy

Arquitetura atual (migrado do Render em 28/08/2026 — estourou banda grátis):

- **API** (Node/Express + SQLite): VM Oracle Cloud Always Free (`VM.Standard.E2.1.Micro`,
  região `sa-saopaulo-1`), systemd (`monitor-ritapolis.service`), Caddy na frente
  fazendo TLS automático (Let's Encrypt) em `api.ritapolis.com`.
- **Frontend** (Next.js): Vercel, conectado ao GitHub, deploy automático.
- **Banco**: SQLite replicado continuamente pro Cloudflare R2 via litestream
  (`litestream.yml`, `scripts/render-start.js` — nome antigo, mas genérico:
  restaura do R2 se o banco não existir localmente, depois roda `litestream replicate`).
- **Preview de PDF oficial**: Worker Cloudflare (`infrastructure/production-heartbeat`),
  não passa pela API — evita consumir egress do host da API.
- **Borda/CDN**: Cloudflare (DNS, proxy do domínio).

## Deploy automático

Todo merge em `master` dispara os dois lados sozinho — ver `.github/workflows/deploy-backend.yml`.

- **Backend**: o workflow conecta via SSH numa chave restrita por
  `forced-command` (só executa `/opt/monitor-ritapolis/deploy.sh` na VM —
  `git fetch && reset --hard && npm ci --omit=dev && systemctl restart`,
  nada além disso mesmo que a chave vaze). `sudoers` com `NOPASSWD` escopado
  só pro restart desse serviço específico.
- **Frontend**: Vercel reage ao push via GitHub App. `rootDirectory` do
  projeto Vercel está setado pra `frontend` (o app não fica na raiz do repo).
  `productionBranch` é `master`.

Ignora mudanças só em `frontend/**` ou `*.md` (não redeploya o backend à toa).

## Disjuntor de uso do R2

`.github/workflows/r2-usage-guard.yml` roda de hora em hora, verifica a
franquia gratuita do R2 (`scripts/check-r2-usage.js`) e, se estourar, para o
serviço na VM preventivamente via outra chave SSH restrita (só executa
`/opt/monitor-ritapolis/circuit-breaker-stop.sh` — `systemctl stop`, nada mais).
Reativar depois é manual: `ssh ubuntu@<IP> "sudo systemctl start monitor-ritapolis"`.

## Deploy manual (se o automático falhar)

```bash
ssh -i ~/.ssh/monitor-ritapolis-oracle ubuntu@<IP-da-VM>
cd /opt/monitor-ritapolis
git pull
npm ci --omit=dev
sudo systemctl restart monitor-ritapolis
sudo systemctl status monitor-ritapolis
```

Logs: `/opt/monitor-ritapolis/logs/service.log` (aplicação) e
`sudo journalctl -u caddy` (TLS/proxy).

## Variáveis de ambiente da API (`/opt/monitor-ritapolis/.env` na VM)

Não versionado — segredos ficam só na VM. Ver `.env.example` na raiz do
repo pra lista de chaves; os segredos reais (R2, NVIDIA, tokens admin) vêm
de onde já estavam configurados antes da migração — nenhum rotacionado
na migração em si.

## Frontend (Vercel)

`NEXT_PUBLIC_API_URL=https://api.ritapolis.com/api` — configurado como
variável de ambiente de produção no projeto Vercel, não no repo.
