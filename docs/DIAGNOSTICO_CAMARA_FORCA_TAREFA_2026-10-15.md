# Histórico da Câmara: diagnóstico e força-tarefa local

Consulta em 15/10/2026, aproximadamente 20h58 (Brasília). Evidência: API pública de saúde e SQLite de produção aberto com `readOnly:true`. Nenhuma fila, configuração ou dado de produção foi alterado.

## Estado observado

- API saudável; pipeline `ok`, com aviso de documentos aguardando revisão.
- Os 11 documentos recentes com texto têm resumo; nenhum recente está sem texto.
- Campanha geral: 200 documentos/dia, orçamento de 240 minutos; 86 documentos trabalhados nas últimas 24 horas. Isso não significa 86 documentos integralmente concluídos.
- Acervo da Câmara: 1.023 documentos; 576 sem qualquer resumo com status `ok`; 498 desses já têm pelo menos 200 caracteres de texto. Quantidade de caracteres não comprova qualidade, integralidade nem elegibilidade no contrato atual.
- 80 documentos da Câmara possuem menos de 200 caracteres: 76 vazios e quatro curtos. Distribuição: 44 `erro_pdf`, 12 `imagem`, 20 `sem_pdf`, quatro `ok`.
- Esses recortes se sobrepõem: dois documentos com texto curto possuem resumo `ok` registrado. É necessário conferir hash e contrato antes de reutilizar qualquer resumo. A consulta de existência de resumo não certifica sua atualidade.
- 2021: 159 documentos, todos sem resumo `ok`, dos quais 44 com texto insuficiente. 2022: 127 documentos, 51 sem resumo `ok`.
- Não há anexos cadastrados para documentos da Câmara na tabela `documentos_anexos`.
- Dois downloads da Câmara estão em revisão por excederem 50 MiB: `Download=33455` e `Download=55879`. O segundo corresponde à Lei 1680/2024 (orçamento de 2025). Próxima checagem registrada: 31/10. Não remover a proteção para tentar novamente indiscriminadamente.

## Viabilidade local

O projeto já tem OCR em português com Tesseract.js e Poppler, e ambos os executáveis `pdftoppm` e `pdfinfo` estão disponíveis nesta máquina. A execução local evita disputar CPU e memória com a VM. A análise feita por nós nesta conversa pode produzir resultados locais; o comando atual de resumo utiliza o provedor de IA configurado, portanto executá-lo no PC não elimina automaticamente chamadas externas.

O script `ocr-documentos-imagem.js` atual não é adequado para iniciar a campanha diretamente: filtra apenas `imagem`, não restringe à Câmara, grava no banco configurado e limita a execução às primeiras 15 páginas por padrão. Os 44 erros de PDF exigem diagnóstico antes de serem classificados como scans. Os arquivos sem PDF exigem busca da fonte oficial.

## Execução proposta

1. Exportar um manifesto da Câmara com ID, URL, texto, hash, contrato e estado atual para uma pasta de trabalho isolada; manter o banco de produção apenas em leitura durante a preparação.
2. Fazer piloto de dez documentos: quatro com texto já extraído, três scans antigos, dois erros de PDF de 2021 e um arquivo grande. Medir duração, páginas completas e qualidade real antes de estimar prazo.
3. Separar dois fluxos: análise dos 498 textos candidatos e recuperação dos 60 documentos com texto insuficiente que não estão marcados `sem_pdf`. Conferir os 20 sem PDF na fonte; não gerar conteúdo a partir apenas da ementa.
4. Processar PDFs por página, com contagem real, checkpoint e hash do arquivo original. Arquivos grandes ficam em disco. Nenhum documento truncado pode ser marcado como concluído.
5. Gerar análise local com trechos verificáveis, observações de ilegibilidade e resultado no contrato do projeto. Priorizar 2021–2022 e os atos orçamentários; depois avançar para os demais anos.
6. Preparar importação idempotente e transacional, validando novamente os hashes de produção, o contrato e os resultados já produzidos pelo scheduler. Preservar proveniência, modelo/método e versão. Não substituir o banco de produção pela cópia local.
7. Medir redução por categoria: texto recuperado, análise validada, fonte ausente e revisão pendente. O encerramento depende de reconciliação final; alguns documentos podem permanecer indisponíveis na origem.

Este diagnóstico não iniciou a campanha de OCR nem publicou análises. Os números descrevem o acervo cadastrado, não comprovam que todas as publicações da fonte oficial foram coletadas.
