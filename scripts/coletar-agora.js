const { setupDatabase } = require('../src/db/setup');
const ColetorSitePrefeitura = require('../src/coletores/site-prefeitura');
const ColetorCamara = require('../src/coletores/camara');

async function main() {
  setupDatabase();
  const coletores = [new ColetorSitePrefeitura(), new ColetorCamara()];
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
