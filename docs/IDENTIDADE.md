# Identidade — Ritápolis.com

Estudo de naming, logo e SEO. Decisões tomadas em 07/07/2026.

---

## 1. Naming

### Decisão: **Ritápolis.com** — tagline **"A cidade em dados abertos"**

A marca é o próprio domínio. Racional:

- **SEO máximo pra query "Ritápolis"**: a marca começa com a palavra-chave exata; o domínio é exact-match (`ritapolis.com`). Toda menção à marca (título de página, backlink, boca a boca) reforça exatamente o termo que queremos ranquear.
- **Escopo aberto**: "portal da cidade" comporta crescer além de transparência (notícias, história, turismo — futuros) sem trocar de marca de novo.
- **Memorável e digitável**: quem ouve o nome já sabe o endereço. Em cidade de ~4,5 mil habitantes, isso vale mais que qualquer campanha.
- **Neutro**: não soa órgão de governo nem oposição — importante pra credibilidade dos dados.

### Candidatos avaliados e rejeitados

| Nome | Pró | Contra |
|---|---|---|
| Monitor Ritápolis (atual) | — | Genérico ("monitor" não diz nada ao cidadão), tom vigilantista, keyword em 2º lugar |
| Ritápolis Transparente | Keyword primeiro, propósito claro | Limita o escopo percebido a dinheiro público; adjetivo soa institucional |
| De Olho em Ritápolis | Popular, tom watchdog memorável | Keyword no fim (pior pra SEO); tom combativo pode afastar fontes oficiais |
| Portal Ritápolis | Neutro | "Portal" é palavra morta dos anos 2000; keyword em 2º |

### Taglines (alternativas à recomendada)

1. **"A cidade em dados abertos"** ← recomendada (diz o quê + o diferencial)
2. "Ritápolis, às claras"
3. "Tudo sobre Ritápolis, com fonte"

Uso: wordmark sempre `ritápolis.com` em minúsculas (estilo domínio); tagline abaixo ou ao lado em texto secundário.

---

## 2. Logo — prompt de criação

### Conceito

Pictograma que una **dado público** e **identidade local**, sem parecer site de governo. Duas direções (gerar as duas, escolher depois):

- **A (local)**: silhueta minimalista do tricorne (chapéu de três pontas de Tiradentes, nascido em Ritápolis) formada por barras de gráfico ascendentes.
- **B (abstrata)**: letra "R" construída de blocos/barras de dados, com um ponto de destaque (o "pixel" da cidade no mapa).

### Prompt (colar em Midjourney / Ideogram / DALL-E — EN funciona melhor)

```
Minimalist flat vector logo for "ritápolis.com", a civic open-data portal for a
small Brazilian town. Concept: [A] the silhouette of a colonial tricorne hat
subtly formed by ascending bar-chart columns / [B] a bold letter "R" built from
clean data bars with a single accent dot. Style: modern flat design, geometric,
single-weight strokes, generous negative space, works at 16px favicon size.
Colors: deep blue #2563EB as primary on white background, one light-blue accent
#60A5FA, no gradients. Horizontal lockup with lowercase wordmark "ritápolis.com"
in a humanist sans-serif (like Inter), tagline space below. Flat white
background, no mockup, no 3D, no shadows.
Negative: no coat of arms, no official government seal, no Brazilian flag, no
map of Brazil, no magnifying glass cliché, no eye symbol, no photorealism.
```

Pedir 4 variações por direção; iterar na melhor com "same logo, icon only, centered, for app icon".

### Formatos necessários (entregáveis do designer/gerador)

| Arquivo | Formato | Tamanho | Uso |
|---|---|---|---|
| `logo-horizontal.svg` | SVG (master) | vetor | Site (TopNav), documentos |
| `logo-horizontal-dark.svg` | SVG | vetor | Fundo escuro (dark mode) |
| `logo-mono.svg` | SVG 1 cor | vetor | Impressos, carimbo, favicon fallback |
| `icon.svg` | SVG só ícone | vetor | `frontend/app/icon.svg` (favicon moderno) |
| `icon-512.png`, `icon-192.png` | PNG | 512², 192² | PWA / manifest |
| `apple-icon.png` | PNG | 180² | `frontend/app/apple-icon.png` |
| `favicon.ico` | ICO multi | 32+16 | Navegadores antigos |
| `opengraph-image.png` | PNG | 1200×630 | `frontend/app/opengraph-image.png` — cartão de compartilhamento (ícone + "ritápolis.com — A cidade em dados abertos") |

Enquanto a logo final não existe, o site usa `frontend/app/icon.svg` placeholder tipográfico (já no código).

---

## 3. Análise SEO

### Cenário (verificado em 07/07/2026)

SERP de "Ritápolis": Wikipedia, prefeitura (ritapolis.mg.gov.br), IBGE (2 posições), cidade-brasil.com.br, Estrada Real, câmara. **Nenhum concorrente tem conteúdo vivo/atualizado** — são fichas estáticas. Um exact-match domain com conteúdo real atualizado diariamente tem chance concreta de topo 3.

### Diagnóstico técnico do site (antes deste trabalho)

- Sem `metadataBase`, canonical, Open Graph, Twitter card → compartilhamentos sem cartão, sinais fracos.
- Sem `sitemap.xml` nem `robots.txt` → Google descobre páginas só por links.
- Sem favicon/ícones → SERP sem marca visual.
- Sem JSON-LD → nenhum dado estruturado.
- `/documento/[id]` (centenas de páginas de cauda longa — "edital X ritápolis", "pregão Y ritápolis") **sem título próprio** → todas apareciam como o título genérico do site.
- Títulos inconsistentes (3 separadores diferentes, 2 sem acento).

### Estratégia em 3 camadas

**(a) Técnica** — implementada neste trabalho (ver commits):
metadataBase + template de título, OG/Twitter, canonical, robots.js, sitemap.js dinâmico (~2k URLs: estáticas + documentos + top credores + descobertas; empenhos de fora por crawl budget), `generateMetadata` nas páginas de documento/anexo/descoberta, JSON-LD (`WebSite`+`SearchAction` na home; `Article` nos documentos), favicon placeholder.

**(b) Conteúdo** — a alavanca real pra query principal:
- Cauda longa já existe: cada documento/licitação/credor é uma página indexável com título real agora.
- A home carrega "Ritápolis" no H1 e descrição com "Ritápolis, Minas Gerais".
- **Futuro registrado (fora do escopo atual por decisão de 07/07)**: página de conteúdo sobre a cidade (história/Tiradentes/Flona) — é o que mais competiria com Wikipedia/IBGE pela query informacional.

**(c) Off-page / operacional** — checklist manual pós-deploy:
1. Apontar DNS de `ritapolis.com` pro deploy (Cloudflare — frente de publicação).
2. **Google Search Console**: verificar propriedade (DNS TXT), submeter `sitemap.xml`, pedir indexação da home.
3. Bing Webmaster Tools: idem.
4. Backlinks honestos: pedir inclusão nos "links úteis" da câmara/prefeitura; grupos de Facebook/WhatsApp da cidade; imprensa regional (São João del-Rei — jornais cobrem Campo das Vertentes).
5. Monitorar mensalmente no GSC: impressões/cliques da query "ritapolis" e variações.

### Expectativa realista

Indexação: dias após GSC. Ranking pra cauda longa ("pregão 006/2026 ritápolis"): semanas — pouca ou nenhuma concorrência. Topo pra "Ritápolis" seco: meses — depende de backlinks locais e cliques recorrentes; o exact-match domain ajuda, mas Wikipedia/prefeitura têm autoridade antiga. Meta intermediária honesta: **primeira página em 3-6 meses**, subindo conforme uso local.
