## O que muda

<!-- Uma ou duas frases: o problema e o que este PR faz. -->

## Como verificar

<!-- Comandos rodados e o resultado. Ex.: npm test, npm run lint, npm run build (frontend). -->

## Checklist (CLAUDE.md §8)

- [ ] Nova lógica de domínio tem teste, escrito antes da implementação
- [ ] Código na camada certa (sem regra de negócio em rota, sem SQL em parser ou coletor)
- [ ] Arquivos com até 300 linhas (ou exceção explicada)
- [ ] Sem `console.log`, sem literal de município (CNPJ, UF, IBGE, domínio) fora de `municipios/`
- [ ] Se exibe dado ao cidadão: período explícito em somas (§11.1), recência por publicação (§11.2),
      fonte visível (§11.3) e fiscais aplicáveis rodados (§12)
- [ ] README ou docs atualizados se o comportamento externo mudou
