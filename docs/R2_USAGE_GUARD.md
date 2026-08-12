# Protecao de consumo do Cloudflare R2

O bucket `monitor-ritapolis-private` permanece privado e usa a classe Standard, que recebe a franquia gratuita do R2.

O monitor consulta o Cloudflare GraphQL Analytics a cada 6 horas e usa tetos preventivos de 80% da franquia mensal:

- 8 GB de armazenamento;
- 800 mil operacoes Classe A;
- 8 milhoes de operacoes Classe B.

Ao atingir 75% de qualquer teto preventivo, o relatorio muda para `warning`. Ao atingir o teto, o comando termina com erro e a rotina de backup bloqueia novas escritas quando `R2_USAGE_GUARD_REQUIRED=true`.

Variaveis necessarias:

- `CLOUDFLARE_API_TOKEN`: token somente leitura com `Account Analytics: Read`;
- `CLOUDFLARE_ACCOUNT_ID`;
- `R2_BUCKET`;
- `R2_BILLING_CYCLE_DAY`;
- `R2_USAGE_GUARD_REQUIRED=true` no servico de producao.

O backup compactado tambem tem limite individual de 1 GB (`R2_MAX_BACKUP_BYTES`) e sempre substitui a chave `backups/latest/ritapolis.db.gz`, impedindo crescimento ilimitado por historico.

Alertas sao uma protecao adicional, nao um limite de faturamento imposto pelo Cloudflare. O disjuntor da aplicacao e a privacidade do bucket sao as camadas que interrompem novas gravacoes do sistema.
