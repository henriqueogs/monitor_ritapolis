# Plano de divulgação gratuita — Monitor Ritápolis

Custo zero em dinheiro; o custo é tempo (~3–4 h/semana). Público principal: moradores
de Ritápolis (~5 mil habitantes). Públicos secundários: imprensa regional, jornalistas
de dados, vereadores/servidores, comunidade de transparência e dev.

## Princípios

1. **Divulgar fatos com fonte, nunca acusação.** Todo post aponta para a origem oficial
   (regra 11.3). Linguagem: "foi publicado", "consta no portal". Sem adjetivos.
2. **Apartidário e explícito.** Sem conteúdo que favoreça grupo político; a credibilidade
   é o ativo. Se houver lançamento perto de eleição, avisar neutralidade na página Sobre.
3. **Valores sempre com período** (regra 11.1) em qualquer print/post.
4. **Mensagens a terceiros e posts só saem com sua aprovação.** Este plano só prepara.

## Fase 0 — Base (semana 1, antes de divulgar)

- [ ] Publicar metadados SEO pendentes e validar em produção (ver `docs/SEO_RITAPOLIS.md`).
- [ ] Search Console: verificar `ritapolis.com`, enviar `sitemap.xml`, pedir indexação da home.
- [ ] Imagem de compartilhamento (og:image) por página: ao colar o link no WhatsApp deve
      aparecer título + resumo + imagem. Testar com um link real.
- [ ] Página "Sobre" com: quem mantém, fontes, neutralidade, e-mail de contato/correção.
- [ ] Analytics sem custo e sem cookie (Vercel Analytics já disponível ou Cloudflare Web
      Analytics) para medir de onde vem a visita. Links com `?utm_source=` por canal.
- [ ] Botão "compartilhar no WhatsApp" nas páginas de empenho/licitação/Na Lupa.

## Fase 1 — Canal nº 1: WhatsApp e redes locais (semanas 1–4)

Em cidade pequena, WhatsApp e Facebook vencem qualquer outro canal.

- Entrar/pedir para postar em grupos de Ritápolis (comunidade, bairros, comércio,
  igrejas, associações). Pedir permissão ao admin; 1 post, sem spam.
- Formato semanal fixo, **"Resumo da semana"** (card de imagem + link): 3–5 itens publicados
  pela prefeitura/câmara (licitações abertas, contratos, leis novas). Dia/horário constante.
- Página no Instagram/Facebook "Monitor Ritápolis" com o mesmo card. Reaproveitar um
  gerador único de imagem (1 template, dados do banco).
- Canal de transmissão do WhatsApp (broadcast channel) para quem quer receber o resumo.
  Link de convite fixo na home e no rodapé.
- Pedir a 5 pessoas conhecidas e respeitadas na cidade para compartilhar de primeira mão.

## Fase 2 — Busca orgânica (contínuo, efeito em 2–3 meses)

- Metas de consulta: `ritápolis`, `licitações ritápolis`, `prefeitura de ritápolis`,
  `vereadores ritápolis`, `leis ritápolis`, `gastos prefeitura ritápolis`.
- Uma URL indexável por documento/empenho/licitação já existe (sitemap ~615 URLs). Garantir
  título único e descrição com número do processo + objeto + ano.
- Dados estruturados (JSON-LD `Dataset`/`GovernmentOrganization`) nas páginas principais.
- Wikidata/Wikipédia de Ritápolis: adicionar o site como link externo **só se** a
  política deles permitir (fonte útil e neutra); sem autopromoção insistente.
- Google Business Profile não se aplica (não é negócio local); ignorar.

## Fase 3 — Imprensa e instituições (semanas 3–8)

Pitch curto (5 linhas) + 1 achado concreto e verificável, não "lançamos um site".

- Jornais/rádios/portais da região (São João del-Rei, Campo das Vertentes, Tiradentes):
  oferecer o acervo como fonte de pauta.
- UFSJ (jornalismo, ciência da computação, administração pública): extensão, TCC, projeto.
- Redes de transparência e jornalismo de dados: Open Knowledge Brasil, Transparência
  Brasil, Abraji (comunidade), Fiquem Sabendo, Operação Serenata de Amor/Rosie.
  Pedem pouco: um e-mail e um link. Citar como "caso de município pequeno".
- Câmara e prefeitura: avisar de forma cordial que a ferramenta existe e como corrigir
  erros. Gestão que usa o site = divulgação interna e credibilidade.
- Ministério Público/CGU/TCE-MG: não divulgar como "denúncia"; apenas disponibilizar.

## Fase 4 — Comunidade dev / tech (1 semana, impacto de nicho)

- Post técnico: "Como monitoramos 1 prefeitura de 5 mil habitantes com IA e SQLite"
  (dev.to, LinkedIn, Hacker News "Show HN", r/brdev). Foco no aprendizado, não no pedido.
- Repositório com README bom e licença (se for tornar público), tópicos GitHub:
  `transparencia`, `dados-abertos`, `brasil`, `licitacoes`.
- Listar em diretórios gratuitos: awesome-dados-abertos-br, Dados Abertos / Brasil.IO
  (comunidade), Product Hunt (opcional).

## Cadência semanal (≈3–4 h)

| Dia | Tarefa | Tempo |
|---|---|---|
| Seg | Gerar card "Resumo da semana" e publicar nos grupos + redes | 45 min |
| Ter | Responder comentários/mensagens, corrigir erros reportados | 30 min |
| Qui | 1 conteúdo evergreen (ex.: "como ler um edital", "o que é dispensa") com link | 1 h |
| Sex | Ver métricas (Search Console + analytics), anotar o que funcionou | 30 min |
| Mensal | 1 pitch para imprensa/instituição com achado novo | 1–2 h |

## Ideias de conteúdo reaproveitável

- "Quanto a prefeitura contratou este mês" (com período e fonte).
- "Edital aberto agora": o que é, prazo, quem pode participar.
- "Lei nova sancionada" em linguagem simples.
- Explicadores: dispensa x pregão, o que é empenho, como ler a execução da despesa.
- Selo de utilidade: "Verifique na fonte" (link oficial em todo card).

## Métricas (revisar mensalmente)

| Métrica | Fonte | Meta 90 dias |
|---|---|---|
| Visitantes únicos / mês | analytics | crescimento mês a mês |
| % tráfego por canal (WhatsApp, Google, direto) | UTM | Google > 25% |
| Impressões/cliques "ritápolis" | Search Console | registrar linha de base |
| Inscritos no canal de transmissão | WhatsApp | 100+ |
| Menções/links externos | busca manual, Search Console | 3 sites regionais |
| Correções recebidas | e-mail | >0 (sinal de uso real) |

## Riscos

- **Reputacional/jurídico:** alerta (Na Lupa) mal interpretado vira acusação. Divulgar
  só itens ancorados e revisados; texto neutro; canal de correção visível.
- **Dependência de um canal:** WhatsApp muda regras; manter e-mail/RSS como alternativa.
- **Carga no servidor:** pico após menção em rádio/grupo. VM tem 954 MB; confirmar cache
  CDN nas páginas públicas antes de grandes pushes.
- **Percepção política:** não repostar comentários eleitorais; não aceitar patrocínio de
  partido ou gestão.

## Primeiros 7 dias (checklist mínimo)

1. Publicar SEO + og:image + botão WhatsApp.
2. Search Console + sitemap.
3. Montar template do card "Resumo da semana".
4. Listar 5–10 grupos locais e pedir permissão.
5. Primeira postagem + canal de transmissão.
6. Rascunhar o pitch de imprensa (você aprova antes de enviar).
