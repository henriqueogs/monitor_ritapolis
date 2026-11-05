'use strict';

// Publicação é uma data civil da fonte, não a atualização/coleta do registro.
// Não interpretar YYYY-MM-DD em horário local: UTC-3 mudaria 01/01 para 31/12.
function publicationLabel(documento = {}) {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:$|T\d)/.exec(String(documento.data_publicacao || ''));
  const ausente = 'Data de publicação não informada';
  if (!match) return ausente;
  const [, ano, mes, dia] = match;
  const date = new Date(`${ano}-${mes}-${dia}T12:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== `${ano}-${mes}-${dia}`) {
    return ausente;
  }
  return `Publicação: ${dia}/${mes}/${ano}`;
}

module.exports = { publicationLabel };
