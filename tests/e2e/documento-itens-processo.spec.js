'use strict';

const { test, expect } = require('@playwright/test');

const ADMIN_STORAGE_KEY = 'monitor-ritapolis-admin-mode';

async function ativarModoInterno(page) {
  await page.addInitScript((key) => window.localStorage.setItem(key, 'true'), ADMIN_STORAGE_KEY);
}

// Doc 5: bug original (edital com "Final total R$ 38.520.000,00" pra um
// processo de R$ 176.186,20) — corrigido de vez pela reextração via IA
// (Fase F/G). A IA já processou este documento com confiança aceitável,
// então a estrutura agora é `origem_estrutura: 'ia'` e fica visível direto
// ao público, sem precisar de modo interno.
test.describe('Itens do processo — reextração via IA pública (doc 5)', () => {
  test('público vê os 3 blocos direto, sem precisar de modo interno', async ({ page }) => {
    await page.goto('/documento/5');

    await expect(page.getByRole('heading', { name: 'Itens deste processo' })).toBeVisible();
    await expect(page.getByRole('heading', { name: /quem venceu \(por lote\)/i })).toBeVisible();

    // Lote real do bug original (EQUIPE DE APOIO / HYAGO / R$ 195.000), sem o
    // total inventado de R$ 38.520.000
    await expect(page.locator('body')).toContainText('195.000,00');
    await expect(page.locator('body')).toContainText('HYAGO');
    await expect(page.locator('body')).not.toContainText('38.520.000');

    // Nota honesta de que a extração foi assistida por IA
    await expect(page.getByText(/assistida por ia/i)).toBeVisible();
  });
});

// Doc 46: a IA declarou que o texto não tem tabela de itens estruturável
// (resultado vazio, confiança baixa). O gate vazio-honesto usa a resposta da
// IA mesmo assim — vazio não expõe dado incerto, e é melhor que o placeholder
// eterno "em revisão". O público vê a lacuna explícita (§11).
test.describe('Itens do processo — vazio honesto via IA (doc 46)', () => {
  test('público vê a lacuna explícita, não os itens heurísticos nem placeholder eterno', async ({ page }) => {
    await page.goto('/documento/46');

    await expect(page.getByRole('heading', { name: 'Itens deste processo' })).toBeVisible();
    await expect(page.getByText(/Não foi possível identificar itens/i)).toBeVisible();

    // Nem detalhamento heurístico, nem "em revisão de qualidade"
    await expect(page.getByRole('heading', { name: 'O que foi solicitado' })).toBeHidden();
    await expect(page.getByText(/em revisão de qualidade/i)).toBeHidden();
  });

  test('modo interno tem botão de reestruturação via IA', async ({ page }) => {
    await ativarModoInterno(page);
    await page.goto('/documento/46');

    await expect(page.getByRole('button', { name: /Reestruturar itens via IA/i })).toBeVisible();
  });

  test('doc 321 (mesmo caso) não vaza total inventado (regressão)', async ({ page }) => {
    await page.goto('/documento/321');
    await expect(page.getByRole('heading', { name: 'Itens deste processo' })).toBeVisible();
    await expect(page.locator('body')).not.toContainText('38.520.000');
  });
});
