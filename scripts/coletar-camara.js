const { setupDatabase } = require('../src/db/setup');
const ColetorCamara = require('../src/coletores/camara');

async function main() {
  setupDatabase();
  const coletor = new ColetorCamara();
  const resultado = await coletor.run();
  console.log(JSON.stringify(resultado, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
