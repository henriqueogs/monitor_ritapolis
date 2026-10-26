# ADR 0005 — Respostas fundamentadas: citação obrigatória e recusa

**Status:** proposto

## Contexto
Plataforma de transparência pública: resposta errada ou sem fonte causa dano. A regra §11.3
exige origem rastreável em todo dado exibido. Textos coletados são não confiáveis
(prompt injection).

## Decisão
1. Toda afirmação da resposta referencia ≥1 trecho recuperado ou resultado de ferramenta;
   a API devolve `{resposta, citacoes[{doc_id, trecho, url_origem}], confianca}`.
2. Um verificador (estende `validate-summary`) checa que cada citação existe no contexto e
   sustenta a afirmação; falhou → recusa ("não encontrei evidência suficiente").
3. Documentos entram no prompt como dados delimitados; o agente não tem ferramentas de escrita.
4. Endpoint público: rate limit, teto de tokens por pergunta e orçamento diário.

## Consequências
+ Rastreável e defensável. − Mais latência/custo por resposta; recusas legítimas mais frequentes no início.
