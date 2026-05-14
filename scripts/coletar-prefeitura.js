const { setupDatabase } = require('../src/db/setup');
const ColetorSitePrefeitura = require('../src/coletores/site-prefeitura');

async function main() {
  setupDatabase();
  const coletor = new ColetorSitePrefeitura();
  const resultado = await coletor.run();
  console.log(JSON.stringify(resultado, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
