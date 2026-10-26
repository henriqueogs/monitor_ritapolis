# ADR 0001 — Ports & Adapters; core agnóstico de município

**Status:** proposto

## Contexto
O projeto será referência para outras cidades. Hoje CNPJs, domínios, parsers do CMS da
Prefeitura e regras editoriais estão misturados ao domínio. Abstrair antes de ter um caso
real de IA funcionando arrisca generalizar errado.

## Decisão
Arquitetura hexagonal. O domínio e a camada de IA dependem apenas de **portas**
(interfaces); tudo específico de município/fonte/fornecedor é **adaptador**.
Portas iniciais: `LLMProvider`, `EmbeddingProvider`, `VectorStore`, `Coletor` (fase 3).
Contratos documentados em `src/ai/ports/` com testes de contrato reutilizáveis por qualquer
implementação. Extração do core para pacote próprio só na Fase 3, depois da fatia vertical de IA.

## Consequências
+ Trocar provider/índice/cidade não toca o domínio. Testes com fakes triviais.
− Custo de indireção; por isso só se cria porta onde há variação real (2+ implementações plausíveis).
