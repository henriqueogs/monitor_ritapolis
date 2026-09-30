# Protecao de consumo do Cloudflare R2

O bucket `monitor-ritapolis-private` permanece privado e usa a classe Standard, que recebe a franquia gratuita do R2.

O workflow `R2 usage guard` agenda uma consulta horaria ao Cloudflare GraphQL Analytics. O heartbeat do Codex acompanha o resultado; ele nao e outro mecanismo de backup. GitHub e Analytics podem atrasar, portanto agendamento nao garante medicao em tempo real. Tetos preventivos:

- 8 GB de armazenamento;
- 900 mil operacoes Classe A (100 mil de margem antes da franquia gratuita de 1 milhao);
- 8 milhoes de operacoes Classe B.

Ao atingir 75% de qualquer teto preventivo, o relatorio muda para `warning`. Ao atingir o teto (ou falhar a verificacao), o workflow aciona o disjuntor da VM e para a unidade da API. O guard JavaScript protege o backup completo legado quando `R2_USAGE_GUARD_REQUIRED=true`; ele nao intercepta individualmente os uploads do Litestream.

Variaveis necessarias:

- `CLOUDFLARE_API_TOKEN`: token somente leitura com `Account Analytics: Read`;
- `CLOUDFLARE_ACCOUNT_ID`;
- `R2_BUCKET`;
- `R2_BILLING_CYCLE_DAY`;
- `R2_USAGE_GUARD_REQUIRED=true` no servico de producao.

## Politica de coleta e backup — 30/09/2026

Este e um acervo municipal, nao um sistema transacional que necessita replicacao a cada segundo. A VM mantem o SQLite em disco persistente; o R2 e a copia de recuperacao. O computador de desenvolvimento nao participa da operacao de producao.

- Documentos, despesas, receitas e folha: comparar todos os campos persistidos antes de gravar. Registro identico retorna `unchanged`, sem mudar timestamp, fonte, classificacao ou indice de busca. Mudancas reais continuam sendo salvas.
- JSON com chaves em outra ordem nao e mudanca. Valores, datas, tipos, NULL, referencias e ordem de arrays continuam significativos.
- Ano corrente: conferencia a cada 24h, antes do historico. Ano anterior: semanal. Anos mais antigos: a cada 30 dias, distribuindo no maximo um exercicio historico por dia por tipo de fonte. Sem abandonar retificacoes antigas.
- Falhas: nova tentativa a partir de 6h, em vez de cada tick; o historico tambem respeita o limite de um exercicio por dia. O mesmo planejamento e usado pelo scheduler e pelos coletores; reiniciar a API nao obriga a recoletar o acervo inteiro.
- Documentos/editais: manter conferencia de listagens a cada 12h. Repeticao da mesma informacao nao e contada como atualizacao nem gera nova gravacao.

Configuracao canonica: `litestream.yml`.

| Trabalho | Cadencia |
| --- | --- |
| Geracao de incrementais locais | 15 minutos, quando houver paginas alteradas |
| Envio dos arquivos gerados | 1 minuto |
| Compactacoes L1 / L2 / L3 | 1h / 6h / 24h |
| Limpeza L0 | Checagem a cada 15 minutos, retencao minima de 30 minutos e cobertura por compactacao |
| Snapshot completo | 24h, retencao de 72h |
| Validacao remota | 24h; verificacao das compactacoes mantida |

Janela nominal de recuperacao: ate 15 minutos mais envio/processamento/rede. Falhas ou filas podem ampliar essa janela. Uma edicao administrativa muito recente nao tem garantia de perda zero antes do envio remoto. Dados ja gravados permanecem na VM; mudar a cadencia nao remove registros nem referencias financeiras.

Na VM, `R2_FULL_BACKUP_ENABLED=false` desativa o segundo scheduler de backup completo JavaScript. O backup diario ativo e o snapshot do Litestream. As chaves `backups/latest/*` sao legado; nao confundir sua data com a copia atual em `replicas/ritapolis-v2`.

O comando manual de backup completo JavaScript continua disponivel para manutencao, com limite individual de 1 GB (`R2_MAX_BACKUP_BYTES`); nao habilitar dois schedulers automaticos para o mesmo banco.

Os logs distinguem novos, alterados e sem alteracao; a data de conferência da fonte deve ser consultada no log do lote, nao simulada regravando cada registro. A economia real deve ser medida por deltas de operacoes do R2, e nao pelo tamanho do banco.

Alertas sao uma protecao adicional, nao um limite financeiro imposto pelo Cloudflare. O guard cobre este bucket e usa um ciclo configurado: reconciliar com a conta e a fatura para confirmar gratuidade. Nao elevar o teto para compensar trabalho repetido.
