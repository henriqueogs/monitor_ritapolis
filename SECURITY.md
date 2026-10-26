# Segurança

## Como relatar uma vulnerabilidade

**Não abra issue pública para falha de segurança.** Use o relato privado do GitHub: aba
**Security** do repositório → **Report a vulnerability**. Só os mantenedores veem o relato.

Inclua, se puder:

- o que encontrou e onde (rota, arquivo, tela);
- como reproduzir, passo a passo;
- o impacto que você enxerga (o que um atacante consegue ver ou fazer).

Respondemos o recebimento em até 7 dias e combinamos com você o prazo de correção e de divulgação.
Pedimos que não divulgue a falha antes da correção publicada.

## O que entra no escopo

- Acesso indevido à área administrativa (`/admin`, rotas `/api/admin/*`) ou às sessões.
- Vazamento de segredos (chaves de IA, tokens do Worker, credenciais de banco ou de backup).
- Exposição de dado pessoal além do que a fonte oficial já publica (LGPD): folha, credores pessoa
  física, diárias.
- Injeção de instruções (prompt injection) que faça a IA inventar fato, esconder fonte ou acusar
  alguém sem critério.
- Uso da API como proxy aberto (preview de PDF, coletores) para endereços fora das fontes oficiais.
- Falhas de CSP, XSS ou injeção de SQL.

## O que não entra

- Erro em dado publicado: abra uma issue com o modelo **Dado errado ou sem fonte**.
- Indisponibilidade do portal oficial da Prefeitura ou da Câmara: não é deste projeto.
- Ataques de negação de serviço e testes automatizados de carga contra a instalação em produção.

## Para quem instala em outro município

Cada instalação tem seus próprios segredos e seu próprio banco. Nunca versione o `.env`, troque as
chaves que vierem de exemplo e mantenha o `ADMIN_BOOTSTRAP_TOKEN` fora de qualquer arquivo commitado. O
[`docs/ADICIONAR_MUNICIPIO.md`](docs/ADICIONAR_MUNICIPIO.md) tem a lista do que configurar.
