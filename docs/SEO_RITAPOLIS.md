# Busca por Ritápolis

Objetivo: conquistar uma posição entre os dez primeiros resultados orgânicos
do Google para `Ritápolis`. Ainda não há evidência de que esse objetivo foi atingido.

## Auditoria de 01/10/2026

- Home, `/sobre`, `/licitacoes` e `/sitemap.xml`: HTTP 200 em consulta pública.
- Sitemap: 615 URLs na consulta; esse número muda com os dados.
- Googlebot permitido pelo robots.txt; sem meta robots de bloqueio na home.
- Canonicals da home, Sobre e Licitações apontam para suas próprias URLs.
- Home, Sobre e Licitações repetiam o título da marca em produção.
- Busca web `site:ritapolis.com` sem resultados nesta ferramenta. Isso não
  substitui a inspeção de URL do Google Search Console nem comprova desindexação.
- Títulos e descrições específicos publicados para home, Sobre, Licitações e
  Transparência pelo PR #101. Deploy de produção confirmado no commit
  `644300c7b4393493213369de9ba6ea3750b1673a`, com os quatro títulos conferidos
  no HTML público.

## Contexto da cidade na home

Uma seção estática apresenta Ritápolis como município de Minas Gerais, com
4.994 habitantes no Censo 2022, gentílico ritapolitano e código IBGE 3156106.
A fonte está visível no conteúdo: https://www.ibge.gov.br/cidades-e-estados/mg/ritapolis.html.
A referência temporal do censo fica explícita; não confundir com população
estimada atual. Links internos levam a gastos, licitações e legislação.
O conteúdo não depende da disponibilidade da API para renderizar.

## Medição e próximos passos

1. Confirmar propriedade de `ritapolis.com` no Search Console. Se necessário,
   usar o registro TXT exato fornecido pelo Google; não inventar um token.
2. Inspecionar `https://ritapolis.com/`: conferir indexação, canonical escolhido
   pelo Google e teste ao vivo. Submeter `https://ritapolis.com/sitemap.xml`.
3. Após publicação dos metadados, conferir HTML em produção e solicitar
   indexação da home pela ferramenta de inspeção.
4. No relatório Desempenho, filtrar consulta exata `ritápolis`, tipo Web e
   país Brasil. Registrar período, impressões, cliques, CTR e posição média.
   Comparar janelas de 28 dias; posição média não garante uma posição fixa.
5. Conferir também `ritapolis`, `licitações ritápolis` e `gastos ritápolis`.
6. Desenvolver conteúdo útil sobre a cidade somente com fontes verificadas e
   compatível com o projeto. A busca ampla tem intenções além de transparência.
7. Buscar referências e links editoriais legítimos de projetos e entidades
   locais. Contatos e mensagens exigem autorização do usuário.

Não há acompanhamento recorrente configurado por este trabalho. Não declarar
o objetivo concluído com base apenas em testes, deploy ou metadados.

Referência: https://developers.google.com/search/docs/fundamentals/seo-starter-guide

## Evidência no Search Console em 01/10/2026

Propriedade de domínio já acessível na conta conectada. Resumo: 6.819 páginas
indexadas e 2.203 não indexadas. Desempenho Web, seletor de 3 meses, gráfico
com dados de 01/09 a 28/09/2026: 33 cliques, 1,08 mil impressões, CTR 3,1%
e posição média geral 9,2. Isso não representa a consulta alvo.

Sitemap já enviado em 05/09/2026, última leitura 30/09/2026, status Success,
615 páginas descobertas. Não é necessário duplicar o envio agora.

Consulta exata `ritápolis`: 0 cliques, 3 impressões, CTR 0%, posição média
36,3. A única página listada é `/sobre`. Sem filtro de país aplicado.
Busca Google sem personalização, localização exibida Belo Horizonte:
ritapolis.com ausente dos resultados da primeira página observada.

Home: última visita registrada em 30/09/2026, 22:33:08 conforme interface,
erro de servidor 5xx e URL fora do índice. Teste ao vivo em 01/10/2026
às 17:20 também falhou com 5xx; Google Inspection Tool smartphone, rastreamento
permitido. Requisições locais de navegador e com User-Agent Googlebot retornam
200; trocar o User-Agent não reproduz a origem de rede do Google.

DNS público retorna dois registros A, ambos com HTTP 200 em teste local,
e não publica AAAA. A janela de logs de aplicação consultada (16:52–17:22)
não mostra a tentativa de 17:20:19 do teste ao vivo.

## Bloqueio de Googlebot confirmado no firewall

O painel da Vercel, filtro da regra `rule_cliente_tls_sem_alpn_UPNb6D`,
mostra 123 requisições com Googlebot Chrome 153 e 6 com Chrome 152 sujeitas
a Challenge no intervalo exibido. IPs atingidos incluem 66.249.79.196.
DNS reverso desse IP: `crawl-66-249-79-196.googlebot.com`; DNS direto
do hostname retorna o mesmo IP. Assim, ao menos esse bloqueio envolve
Googlebot legítimo. Isso é um problema confirmado, embora não prove que
todo 5xx da ferramenta de inspeção tenha a mesma causa.

Regra atual: JA4 casa `^[tqd]\d\d[di]\d{4}00_` E caminho não casa
`^/(robots\.txt|sitemap.*\.xml|favicon\.ico)$`; ação Challenge.
Há também a regra `rule_datacenter_na_cauda_longa_2kfVZA` com Challenge.

### Proposta concreta, ainda não aplicada

Criar uma regra anterior às duas regras de desafio:

- Nome: Google Search em páginas públicas.
- IP: pertence às faixas oficiais de common-crawlers.json ou
  user-triggered-fetchers-google.json publicadas pelo Google.
- User-Agent: casa `Googlebot|Google-InspectionTool`.
- Método: GET ou HEAD.
- Caminho: não casa `^/(admin|login|api)(/|$)`.
- Ação: Bypass das regras WAF customizadas seguintes e rulesets gerenciados.
  As mitigações de sistema não são desativadas.

Todos os critérios são combinados com E. A origem por IP é obrigatória;
User-Agent sozinho pode ser falsificado. A proposta amplia a exceção de
segurança para robôs do Google, podendo aumentar consumo de requisições.
Autenticação do app permanece necessária nas rotas protegidas; essas rotas
também estão fora da proposta. Não habilitar bypass das mitigações de sistema.

Snapshot de faixas para revisão: `SEO_GOOGLE_EXCEPTION_2026-10-01.json`.
As 819 faixas oficiais foram compactadas em 148 CIDRs equivalentes usando
`ipaddress.collapse_addresses`, sem incluir endereços adicionais. O campo
`vercelRule` contém o formato da proposta completa de condições e ação.
A aplicação efetiva descrita abaixo usa apenas os 75 CIDRs IPv4.
Atualizar a lista oficial antes de aplicar e periodicamente depois; não
liberar toda a rede Google Cloud. Aplicação requer confirmação explícita
por alterar o alcance de uma proteção de segurança na interface.

A autorização explícita do usuário foi recebida e o acesso autenticado ao
painel foi restaurado. A exceção foi criada, publicada e reordenada para a
primeira posição em 01/10/2026. ID: `rule_google_search_em_paginas_publicas_wL0SCP`.
Todos os quatro critérios permanecem combinados com E. O formulário recusou
os 73 CIDRs IPv6 como Invalid Option; somente os 75 IPv4 oficiais foram
aplicados. O domínio não publica AAAA, e os Googlebots bloqueados confirmados
usavam IPv4. Nenhuma regra de desafio foi desativada, e as mitigações de
sistema permanecem ativas.

O teste ao vivo da home pelo Search Console, exibido como 01/10/2026 às
23:31 no painel, passou: URL is available to Google e Page can be indexed.
A solicitação de indexação foi aceita: Indexing requested, URL adicionada
à fila prioritária de rastreamento. Isso confirma a remoção do impedimento
de acesso nesse teste; ainda não comprova indexação nem primeira página
para a consulta Ritápolis.

Validação após aplicar: teste ao vivo da home pelo Search Console, conferir
acesso do Google nos eventos, solicitar indexação apenas se o teste passar,
e confirmar posteriormente que a home efetivamente entrou no índice.
Se falhar, investigar outros motivos; não presumir que a exceção resolveu.

Referências:
- https://developers.google.com/crawling/docs/crawlers-fetchers/verify-google-requests
- https://vercel.com/docs/vercel-firewall/vercel-waf/rule-configuration

## Análises e documentos: revisão de 02/10/2026

### Lighthouse e autoria: 02/10/2026

PageSpeed Insights da home em produção às 11h23 BRT: celular 90/96/96/100
e computador 99/96/96/100 (desempenho/acessibilidade/boas práticas/SEO).
LCP 2,7 s e 0,7 s; TBT 0 ms nos dois. Não havia dados CrUX disponíveis.
Relatório: https://pagespeed.web.dev/analysis/https-ritapolis-com/ylcr3fnpjp

Correções: contraste do rodapé com texto #526277 sobre branco; retirada
da chamada administrativa de sincronização ao abrir a home, que retornava
401 para visitantes; fonte Inter hospedada pelo Next.js em vez do @import
externo. A coleta continua sendo responsabilidade dos agendamentos e do
painel administrativo, sem disparo por visitantes.

Autoria: Henrique, com https://github.com/henriqueogs no rodapé, na página
Sobre, nos metadados e no creator do WebSite. A atribuição descreve o
desenvolvedor do projeto; não atribui a ele a autoria dos documentos oficiais.

Build e 14 testes de SEO/robots/sitemap/títulos aprovados. Verificação local
confirmou fonte Inter, cor do rodapé, metadado author e console sem o 401.
Esses resultados não substituem uma nova medição Lighthouse de produção.

Outras melhorias já publicadas nesta data: sitemap com paginação (1.500
documentos e 2.015 URLs na verificação), título de documento preservando o
assunto antes da instituição e filtro de deploy do backend para alterações
exclusivas de frontend/documentação/testes do frontend. Home confirmada
indexada no Search Console; primeira página para Ritápolis ainda não confirmada.

Amostra pública: /analises, /na-lupa, /na-lupa/57 e documentos 2440, 691 e
692 responderam HTTP 200. Os resumos e links internos já estão no HTML
renderizado no servidor, com canonical próprio. Não foi necessário criar
um segundo acervo nem mover os textos para o cliente.

/analises herdava o título genérico da marca. Os documentos usavam títulos
oficiais muito longos e algumas descrições terminavam no meio de palavras.
A revisão dá título e descrição específicos ao catálogo de análises e
padroniza os metadados de documentos e descobertas: título legível com
número do documento e referência ao município, descrição baseada no resumo
visível, canonical e metadados de compartilhamento próprios. Valores que
sejam objetos não viram texto "[object Object]". Não altera os dados nem
as regras de validação dos resumos.

Validação local: build de produção Next.js aprovado; nove testes SEO/robots
aprovados; servidor de produção local com a API pública confirmou HTTP 200,
títulos, descrições, canonical, conteúdo e links em /analises,
/documento/691, /documento/692 e /na-lupa/57. Isso verifica a implementação,
não comprova que o Google já processou a mudança.

Agendamento ativo nesta conversa: "Validar indexação e busca do Ritápolis",
diariamente às 10h de São Paulo. Usa leitura, diferencia erros históricos
de novos rastreamentos, não repete solicitações de indexação e comunica
mudanças relevantes ou acesso necessário. O cadastro de palavras-chave
e negativas pertence ao Google Ads; não foi criada campanha paga.
