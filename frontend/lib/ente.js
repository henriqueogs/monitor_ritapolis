'use strict';

// CommonJS de propósito (mesmo padrão de lib/perguntar.js): testável pelo Jest da raiz.
//
// Espelho, para o frontend, da identidade do município definida em src/config.js (o frontend não
// importa código do backend). tests/ente-sem-literal.test.js garante que estes valores não
// divergem dos padrões do backend. Trocar de município = trocar aqui e nas variáveis do backend.

const CNPJ_PREFEITURA = '18557553000105';
const IBGE_CODE = '3156106';

module.exports = { CNPJ_PREFEITURA, IBGE_CODE };
