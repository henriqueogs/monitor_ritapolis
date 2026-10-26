'use strict';

/**
 * Documentos fictícios para subir o projeto sem coleta e sem chave de IA (docker compose, ADR 0007).
 * Funções puras: quem grava no banco é scripts/seed-exemplo.js, pelo repositório.
 *
 * Tudo aqui é inventado e se identifica como tal: título começa com MARCA_EXEMPLO e a origem usa o
 * domínio reservado `.invalid` (RFC 2606), que nunca resolve. Mesmo assim cada documento tem
 * `url_origem` e data de publicação, como exigem as regras de produto (CLAUDE.md §11.2 e §11.3).
 */

const SLUG_EXEMPLO = '_exemplo';
const MARCA_EXEMPLO = '[EXEMPLO]';
const ORIGEM_PREFEITURA = 'https://prefeitura.exemplo.invalid/publicacoes';
const ORIGEM_CAMARA = 'https://camara.exemplo.invalid/legislacao';

const FONTES = Object.freeze({ PREFEITURA: 'site_prefeitura', CAMARA: 'camara' });
const TIPOS = Object.freeze({
  EDITAL: 'edital',
  CONTRATO: 'contrato',
  DECRETO: 'decreto',
  PORTARIA: 'portaria',
  LEI: 'lei',
});

// [fonte, tipo, numero, data_publicacao, assunto, valor_estimado]
const MODELOS = Object.freeze([
  [
    FONTES.PREFEITURA,
    TIPOS.EDITAL,
    '012/2026',
    '2026-09-15',
    'aquisição de merenda escolar',
    184500,
  ],
  [
    FONTES.PREFEITURA,
    TIPOS.EDITAL,
    '009/2026',
    '2026-07-02',
    'manutenção da frota municipal',
    92300,
  ],
  [
    FONTES.PREFEITURA,
    TIPOS.EDITAL,
    '021/2025',
    '2025-11-20',
    'reforma da unidade de saúde',
    410000,
  ],
  [
    FONTES.PREFEITURA,
    TIPOS.CONTRATO,
    '045/2026',
    '2026-08-28',
    'fornecimento de combustível',
    156000,
  ],
  [FONTES.PREFEITURA, TIPOS.CONTRATO, '038/2025', '2025-12-10', 'transporte escolar rural', 238800],
  [FONTES.PREFEITURA, TIPOS.DECRETO, '1.204/2026', '2026-10-01', 'horário de funcionamento', null],
  [FONTES.PREFEITURA, TIPOS.PORTARIA, '310/2026', '2026-09-30', 'comissão de licitação', null],
  [FONTES.CAMARA, TIPOS.LEI, '1.587/2026', '2026-06-18', 'diretrizes orçamentárias de 2027', null],
  [FONTES.CAMARA, TIPOS.LEI, '1.552/2025', '2025-12-15', 'orçamento anual de 2026', null],
]);

const NOMES_TIPO = Object.freeze({
  [TIPOS.EDITAL]: 'Edital de licitação',
  [TIPOS.CONTRATO]: 'Extrato de contrato',
  [TIPOS.DECRETO]: 'Decreto',
  [TIPOS.PORTARIA]: 'Portaria',
  [TIPOS.LEI]: 'Lei municipal',
});

function slugDoNumero(numero) {
  return numero.replace(/\D+/g, '-');
}

function montarTexto({ municipio, nomeTipo, numero, assunto, data }) {
  const orgao = nomeTipo === NOMES_TIPO[TIPOS.LEI] ? 'Câmara Municipal' : 'Prefeitura Municipal';
  return [
    `${orgao} de ${municipio.nome} (${municipio.uf}).`,
    `${nomeTipo} nº ${numero}, publicado em ${data}, sobre ${assunto}.`,
    'Documento fictício gerado para demonstração do sistema; não corresponde a nenhum ato real.',
  ].join('\n');
}

function montarDocumento(modelo, municipio) {
  const [fonte, tipo, numero, data, assunto, valor] = modelo;
  const nomeTipo = NOMES_TIPO[tipo];
  const origem = fonte === FONTES.CAMARA ? ORIGEM_CAMARA : ORIGEM_PREFEITURA;
  return {
    fonte,
    tipo,
    numero,
    ano: Number(data.slice(0, 4)),
    titulo: `${MARCA_EXEMPLO} ${nomeTipo} nº ${numero} — ${assunto}`,
    resumo: `${nomeTipo} fictício sobre ${assunto}.`,
    data_publicacao: data,
    valor_estimado: valor,
    url_origem: `${origem}/${tipo}-${slugDoNumero(numero)}`,
    texto_completo: montarTexto({ municipio, nomeTipo, numero, assunto, data }),
    dados_extras: { exemplo: true },
  };
}

/** Lista de documentos fictícios do município (mesmo conteúdo a cada chamada). */
function montarDocumentosExemplo({ municipio }) {
  return MODELOS.map(modelo => montarDocumento(modelo, municipio));
}

/** Só semeia o município de exemplo, salvo pedido explícito (--forcar). */
function podeSemearExemplo({ slug, forcar = false }) {
  if (slug === SLUG_EXEMPLO || forcar) {
    return { pode: true };
  }
  return {
    pode: false,
    motivo: `MUNICIPIO=${slug} não é o de exemplo; dados fictícios só entram em "${SLUG_EXEMPLO}" (use --forcar em banco de teste)`,
  };
}

module.exports = {
  montarDocumentosExemplo,
  podeSemearExemplo,
  MARCA_EXEMPLO,
  SLUG_EXEMPLO,
};
