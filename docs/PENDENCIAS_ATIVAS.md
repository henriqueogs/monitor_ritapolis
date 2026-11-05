# Pendências e evidências de conclusão

Objetivo do mantenedor: **terminar todas as pendências do projeto**.
Este registro inclui as pendências técnicas, de dados, de produto e de operação
encontradas nos planos. Não substitui itens difíceis por uma definição menor de
conclusão. Atualizar cada linha com evidência atual; marcações antigas não bastam.

Fontes: `CURRENT_WORK.md`, `DEVELOPMENT_PLAN.md` §6,
`docs/PLANO_PROXIMAS_ATIVIDADES_2026-10-29.md`, `docs/PLANO_IA_RAG.md`,
`docs/PLANO_DIVULGACAO_GRATUITA.md`, PRs/issue abertos e produção.

Estados: **verificado**, **em execução**, **a fazer**, **decisão pendente**,
**dependência externa**. Só marcar verificado depois do aceite completo.

## Operação, qualidade e recuperação

| ID | Entrega / aceite | Estado e evidência |
|---|---|---|
| OP01 | Assinaturas de fatos estáveis, contagem integral de falhas, saúde eficiente | Verificado no código/CI e amostra de produção: #220–224, `d449c26`; GET público 569 ms após aquecimento. Desempenho sustentado em OP02 |
| OP02 | Medir I/O/CPU por dez minutos e progresso em 24 h, sem queda de cobertura | Em execução; aceite A11: leitura pelo menos 5× menor e limite de trabalho útil mantido |
| OP03 | Drenagem efetiva de facts, source-check e despesas históricas | A fazer; comprovar redução da fila sem reprocessamento de entradas iguais |
| OP04 | Alerta de ritmo A6 com medida de avanço útil | A fazer; não tratar repetição de execução como progresso |
| OP05 | Backup e restauração real verificáveis | Em execução: restauração isolada do snapshot R2, checksum, integridade e hash lógico; não sobrescreve a base ativa |
| OP06 | Deep-links monitorados de uma origem que consiga acessar o portal | A fazer; diferenciar bloqueio de datacenter de link quebrado; monitor recorrente e evidência de execução |
| OP07 | Resiliência do cache frontend (#218) e observabilidade de falhas | Em integração: fallback só de rede, máximo 30 minutos desde o sucesso, eventos de degradação/recuperação sem consulta nos logs. 2.585 testes / 246 suítes e build passaram; falta CI/deploy e comportamento em produção |
| OP08 | Cinco timeouts persistentes de itens | Em execução; retomadas limitadas não resolveram. Ultra excedeu 30 s até em prompt mínimo e 120 s nos três resumos com raciocínio desativado; não aplicar essa hipótese. Lightning acessível em teste mínimo, avaliação real pendente |
| OP09 | Três resumos faltantes (992, 1566, 1860) | Em execução; só conclui com registro ok pelo hash e contrato atuais; enfileiramento não basta |
| OP10 | Arquivos grandes retidos A3 | A fazer; recuperação integral por disco/páginas com limites e checkpoints, ou indisponibilidade de origem comprovada |
| OP11 | Contratos rejeitados A4 e erros de JSON de anexos | A fazer; corrigir origem/parser/prompt sem truncar ou afrouxar evidência |
| OP12 | Revisão de 490 etapas, manifesto por documento e motivo, SLA | Em execução; 489 etapas documentais em 366 docs + uma coleta; piloto de dez ainda não executado |
| OP13 | OCR Câmara/Prefeitura e anexos sem texto | A fazer; texto integral, qualidade por página, hash, proveniência e importação idempotente |
| OP14 | Unidades e preços estruturados | A fazer; zero strings undefined já verificado, 7.779 unidades nulas na fotografia inicial; normalizar apenas com suporte da fonte |
| OP15 | PNCP coleta e vencedores homologados atuais | Parcial: coleta 41716 concluída ok; conferir sincronização de vencedores e projeção pública por estágio/ano |

## Na Lupa v4

| ID | Entrega / aceite | Estado |
|---|---|---|
| NL01 | Avaliar N1: contrato, orquestrador, persistência, dois detectores, proteção do legado | Código integrado; aceites editoriais e runtime ainda a verificar |
| NL02 | N2: dossiês de credor, processo e legislação; analista e verificador; lote de vinte | A fazer; zero evidência inventada aceita; medir utilidade e custo; fila interna |
| NL03 | N3: compras repetidas com cruzamento documental | A fazer; período, unidade e vínculo; pelo menos três casos úteis revisados |
| NL04 | N3: divergências entre documentos de um processo | A fazer; valores/quantidades por estágio e unidade equivalentes; fontes verificáveis |
| NL05 | N4: seleção por sinais e amostra aleatória, dedupe e teto medido | A fazer; fila interna e rastreabilidade do orçamento |
| NL06 | Preço por referência equivalente | A fazer; depende da recuperação de unidades e fontes confiáveis |
| NL07 | Diárias por destino/período, concentração e lacunas de finalidade | A fazer; separar diária de servidor de serviço de show/som |
| NL08 | Execução contratual, vigência, aditivos e gasto atípico | Parcial: dois detectores migrados; ampliar e validar casos previstos |
| NL09 | Datas/processos/objetos incoerentes entre fontes | A fazer; sem confundir lacuna do acervo com inexistência do ato |
| NL10 | Normas citadas, projetos versus leis e créditos suplementares | A fazer; fonte, cronologia e LOA do exercício corretos |
| NL11 | Folha agregada por secretaria/mandato | A fazer; recorte e privacidade verificáveis |
| NL12 | N6: precisão medida e decisão sobre scheduler | Decisão pendente; não habilitar publicação de suspeitas internas sem a aprovação prevista |
| NL13 | Detector interno sócio/servidor (#192) | A fazer; resolver conflitos, revisar homônimos/ano/privacidade e impedir publicação/IA |

## Produto, repositório e alcance

| ID | Entrega / aceite | Estado |
|---|---|---|
| FE01 | Fonte de recurso: visão dedicada de dependência de transferências | A fazer |
| FE02 | Cruzamento emendas × empenhos | A fazer; relação baseada em dado, sem vínculo inventado |
| FE03 | Acompanhamento TCE-MG por coTce | A fazer; fonte e rota oficial verificadas |
| FE04 | Busca unificada documentos + empenhos | Código integrado: `/busca` e `/api/busca/unificada` consultam documentos, empenhos e credores; verificar aceites reais de navegação, origem e dados, sem refazer a funcionalidade |
| FE05 | Admin de OCR: revisar/reverter marcação e disparar processamento | A fazer; APIs protegidas e UI real verificadas |
| FE06 | Admin de correspondências PNCP intermediárias | A fazer; decisões humanas e histórico preservados |
| GE01 | Textos de página do frontend via identidade do município | A fazer; preservar textos padrão e verificar município de exemplo |
| GE02 | Contrato Coletor, modelo canônico e testes dos adapters | A fazer; cobertura dos coletores atuais sem regressões |
| GE03 | Parâmetros por porte, fronteiras do específico de Ritápolis e organização de pacotes | A fazer; separar migração de estrutura de mudança funcional |
| GE04 | Guia de município, comunidade, privacidade e relato de segurança (#199) | Em integração: conflito resolvido preservando API explícita; guia ajustado para NVIDIA, fork/upstream e cobertura parcial. Relato privado GitHub habilitado e relido como `enabled=true`; contato henriqueogs@gmail.com autorizado pelo mantenedor. Canal de correções não substitui auditoria de logs, cookies e retenção, ainda pendente |
| GE05 | OpenAPI e documentação operacional atual | A fazer; contratos e comandos executáveis verificados |
| GE06 | PRs antigos #182/#132 e issue #133 | Verificado: #182 e #133 encerrados; conteúdo de #132 integrado via #225 e PR original encerrado. Histórico em `docs/archive/CACHE_VM_2026-10-08.md` |
| SEO01 | Metadados, og:image, compartilhamento e Sobre | Parcial; código integrado, aceites reais em produção pendentes de auditoria |
| SEO02 | Search Console, sitemap e indexação | Parcial; histórico aponta verificações anteriores; auditar estado atual |
| SEO03 | Analytics ativo e linha de base | Verificado em produção pela API Vercel: 335 visitantes / 392 pageviews na janela retornada 01/11–05/11 UTC; PR #182 redundante encerrado |
| FE07 | Data pública do cabeçalho do documento | Falha confirmada no navegador em `/documento/1194`: cabeçalho mostra 27/09/2026 por `atualizado_em`, enquanto publicação está ausente. Remover fallback técnico e rotular ausência; regressão e fiscais de datas/proveniência antes da integração |
| FE08 | Revisar consistência da página Sobre | Auditoria visual: soma estimada sem período e badges Câmara/PNCP desatualizados; reconciliar com dados reais e critérios de publicação |
| DIV01 | Template Resumo da semana, primeiro conteúdo e pitch revisáveis | A fazer; preparar artefatos com dados e fontes reais |
| DIV02 | Canal, grupos locais, postagem e contato com instituições | Dependência de instrução explícita para envio/publicação; preparar rascunhos e destinos sem enviar mensagens |
| NOT01 | Assinatura e notificações de novos documentos/alertas | A fazer; opt-in, confirmação e controle de envio/descadastro |

## Decisões anteriores que afetam a extensão do objetivo

| ID | Tema | Estado |
|---|---|---|
| DEC01 | IA pública estacionada, indexação e dataset; IA suspeita somente interna | Mantenedor confirmou em 04/11: manter as decisões anteriores. Não habilitar IA pública nem publicar suspeitas |
| DEC02 | RAG fases 0–2, ferramentas tipadas, dataset 30–50 e limites por visitante | Roadmap preservado e estacionado pela decisão confirmada; não executar como parte da conclusão das pendências ativas |
| DEC03 | Multi-tenant/Postgres/pgvector e eventual monorepo | Roadmap futuro preservado; manter SQLite operacional e decisões anteriores confirmadas. Contrato de coletores, configuração e textos de município continuam nas pendências ativas GE01–03 |

## Auditoria de encerramento

Para cada linha: conferir fonte que originou o requisito, implementação, testes
apropriados, CI/deploy quando aplicável, comportamento real e limitações de
origem. Registros de fila, testes isolados e intenções não provam conclusão.
O objetivo global permanece ativo enquanto houver requisito incompleto,
evidência insuficiente ou decisão necessária.
