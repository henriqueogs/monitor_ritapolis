'use strict';

const { z } = require('zod');

// Contrato do que a IA extrai de uma ata de sessão da Câmara. Subir a versão faz o script
// reextrair as atas já processadas.
const VERSAO_EXTRATOR = 'sessao_ata_v1';

const VOTOS = ['favoravel', 'contrario', 'abstencao'];
const RESULTADOS = ['aprovado', 'rejeitado', 'retirado', 'adiado', 'outro'];
const TRECHO_MIN = 20;
const TRECHO_MAX = 900;
const MATERIA_MAX = 200;
const DESCRICAO_MAX = 400;

const nome = z.string().trim().min(1);
const placar = z.number().int().nonnegative().nullable().default(null);

const VotacaoContract = z.object({
  materia: z.string().trim().min(1).max(MATERIA_MAX),
  descricao: z.string().trim().max(DESCRICAO_MAX).nullable().default(null),
  resultado: z.enum(RESULTADOS),
  votos_favoraveis: placar,
  votos_contrarios: placar,
  abstencoes: placar,
  nominais: z.array(z.object({ nome, voto: z.enum(VOTOS) })).default([]),
  trecho: z.string().trim().min(TRECHO_MIN).max(TRECHO_MAX),
});

const SessaoAtaContract = z.object({
  data_sessao: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .default(null),
  presidente: nome.nullable().default(null),
  presentes: z.array(nome).default([]),
  ausentes: z.array(z.object({ nome, justificada: z.boolean().default(false) })).default([]),
  votacoes: z.array(VotacaoContract).default([]),
});

module.exports = { VERSAO_EXTRATOR, VOTOS, RESULTADOS, SessaoAtaContract };
