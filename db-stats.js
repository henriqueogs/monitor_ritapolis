const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.resolve('data/ritapolis.db');
const db = new Database(dbPath);

console.log('--- Document Types ---');
const types = db.prepare('SELECT tipo, COUNT(*) as count FROM documentos GROUP BY tipo').all();
console.log(types);

console.log('--- Fontes ---');
const fontes = db.prepare('SELECT fonte, COUNT(*) as count FROM documentos GROUP BY fonte').all();
console.log(fontes);

console.log('--- Multi-document Groups ---');
const groups = db.prepare('SELECT id, processo_chave, total_documentos, titulo_resumo FROM licitacoes_grupos WHERE total_documentos > 1 LIMIT 10').all();
console.log(groups);

console.log('--- 2026 Documents ---');
const docs2026 = db.prepare("SELECT id, tipo, numero, ano, titulo, fonte FROM documentos WHERE ano = 2026 LIMIT 10").all();
console.log(docs2026);
