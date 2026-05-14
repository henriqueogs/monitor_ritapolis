class BaseProvider {
  constructor({ provider, model }) {
    this.provider = provider;
    this.model = model;
  }

  async generateJson() {
    throw new Error('Metodo generateJson nao implementado');
  }
}

module.exports = {
  BaseProvider
};
