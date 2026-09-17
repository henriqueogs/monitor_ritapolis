const { setupDatabase } = require('../src/db/setup');
const ColetorSitePrefeitura = require('../src/coletores/site-prefeitura');
const ColetorCamaraLegislacao = require('../src/coletores/camara-legislacao');
const ColetorCamaraProjetos = require('../src/coletores/camara-projetos');

async function main() {
  setupDatabase();
  const coletores = [new ColetorSitePrefeitura(), new ColetorCamaraLegislacao(), new ColetorCamaraProjetos()];
  const resultados = [];

  for (const coletor of coletores) {
    resultados.push(await coletor.run());
  }

  console.log(JSON.stringify(resultados, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
