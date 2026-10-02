# Fechamento de consistência — 02/10/2026

Medições em produção (somente leitura) em 02/10/2026 ~14:00 UTC, VM em `8681f0b`.

## 1. Falhas de itens (2433, 2434, 694)

A validação de nomes, referências e valores não foi alterada. Cada folha foi reexecutada com uma chamada
de diagnóstico, sem gravar, e a saída comparada com o texto oficial:

- **2433** (folha 31986–37755): `lote_numero` "I" vinha do cabeçalho "LOTE I - PNEUS", fora da citação.
  Agora o prompt exige citação contínua a partir do cabeçalho (ou `lote_numero` null). Folha válida (10 itens).
- **694** (folha 0–9982): a IA uniu nome/CNPJ (parágrafo inicial) ao valor (cláusula 3), sem citação contínua
  possível. Agora o prompt manda preencher só o que cabe numa citação. Folha válida, sem resultado global inventado.
  Além disso, a linha é validada antes da flag `tem_tabela_itens`, então a causa real aparece e entra na recuperação.
- **2434** (folha 18475–24108): especificações longas; o provedor leva ~51 s para 1.300 caracteres e estoura o
  tempo em folhas de 2,8–5,6 mil. O caminho de produção já subdivide em timeout. Sem reprocessamento ainda.

Reprocessar = devolver os jobs 2713 (2434), 2720 (2433) e 3159 (694) à fila: os checkpoints válidos permanecem,
só as folhas sem checkpoint são refeitas.

## 2. PDFs grandes (2153, 2424, 1416)

O planner enfileira `extract` com `largePdf: true` (versão `3:large-1`) para documento sem texto cujo arquivo
tem limite de tamanho registrado. Download em disco (limite 128 MiB), OCR por página, retomada por checkpoint,
limpeza ao fim. Na VM: `prlimit`, `pdfinfo`, `pdftotext`, `pdftoppm` e `por.traineddata` presentes.

## 3. Reconciliação histórica (394 janelas pendentes)

Das 17 janelas históricas já concluídas, nenhuma trouxe registro novo ou alterado (~110 s cada, ~1,4 s por
empenho). O CSV da janela já traz tipo, datas de empenho/liquidação/pagamento e valor; o detalhe é estático.
Agora o detalhe só é buscado para empenho novo, alterado no CSV ou sem detalhe armazenado. Janelas
inalteradas passam a custar só o download do CSV. Limite conhecido: correção silenciosa de detalhe na fonte
sem mudança no CSV não é vista nesta verificação.

## 4. Leitura integrada e saúde

Das 536 licitações com texto, **12** têm leitura integrada atual pelo hash do próprio app, **489** estão
desatualizadas e **35** não têm. Causa dominante: itens re-extraídos (487) e resumos regenerados (356) depois
da leitura. O payload não inclui anexos nem seus resumos e limita produtos a 40 (com amostras e contagem
total): "fontes completas" ainda não vale para a leitura integrada. A fila refaz ~9–12 por dia.

O indicador de saúde passa a separar falha real (alerta), documento aguardando revisão (aviso) e espera
(`waiting.retry`, `historical_budget`, `ready_recent`).

## 5. Validação econômica

R2, ciclo iniciado em 12/09 (próximo em 12/10). Fonte: relatórios do guard (a cada ~6 h; o token de
Analytics só existe no GitHub, então não há granularidade horária):

- Classe A: 842.727 (30/09 02:40) → 845.013 (02/10 12:20) = ~39/h (antes da correção: ~1.700/h).
  Projeção ao fim do ciclo: ~854 mil (teto preventivo 900 mil, franquia 1 milhão).
- Classe B: ~208/h; projeção ~1,82 M (teto 8 M).
- Armazenamento: 1,41 GB (teto 8 GB), +~70 MB/dia enquanto a retenção (7 diários + 4 semanais) enche.
- Backup diário confirmado em 01/10 06:03 e 02/10 06:01 UTC (gz 69–70 MB, SHA-256, 2–3 cópias).
  Restauração isolada não foi repetida nesta medição.
- Disco da VM 25%; memória disponível ~550 MB.

Legado (Litestream, `backups/latest`) preservado; limpeza exige aprovação específica.
