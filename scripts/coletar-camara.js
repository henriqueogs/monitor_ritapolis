const { setupDatabase } = require('../src/db/setup');
const ColetorCamaraLegislacao = require('../src/coletores/camara-legislacao');
const ColetorCamaraProjetos = require('../src/coletores/camara-projetos');

// ColetorCamara antigo ("cadastro generico") foi removido (superado pelo
// modulo SGC) -- este script roda os dois coletores atuais da Camara:
// legislacao promulgada (fonte='camara' em documentos) e projetos em
// tramitacao + vereadores (dominio proprio, camara_projetos/vereadores).
async function main() {
  setupDatabase();
  const legislacao = await new ColetorCamaraLegislacao().run();
  const projetos = await new ColetorCamaraProjetos().run();
  console.log(JSON.stringify({ legislacao, projetos }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
