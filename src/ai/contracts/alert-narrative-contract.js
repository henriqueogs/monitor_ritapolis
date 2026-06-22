'use strict';

const { z } = require('zod');

// Contrato da narrativa de alerta gerada por IA.
const AlertNarrativeContract = z.object({
  titulo: z.string().trim().min(1).max(120),
  narrativa: z.string().trim().min(1),
  questionamentos: z.array(z.string().trim().min(1)).default([]),
});

module.exports = { AlertNarrativeContract };
