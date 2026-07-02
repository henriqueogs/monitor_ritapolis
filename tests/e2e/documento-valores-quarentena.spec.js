'use strict';

const { test, expect } = require('@playwright/test');

// Documento 5: processo de R$ 176.186,20 cuja ata registra itens em milhões
// (erro na própria fonte). A UI nunca pode estampar esses números como "Final".
test.describe('Quarentena de valores implausíveis (doc 5)', () => {
  test('não exibe totais inventados e mostra aviso honesto com link pra fonte', async ({ page }) => {
    await page.goto('/documento/5');
    await expect(page.getByText('Itens deste processo')).toBeVisible();

    // O total inventado (4.815.000 × 8) não aparece em lugar nenhum
    await expect(page.locator('body')).not.toContainText('38.520.000');

    // Item quarentenado: aviso no lugar do valor
    await expect(page.getByText('Valor não confiável').first()).toBeVisible();
    await expect(page.getByText(/inconsistente com o valor final do processo/).first()).toBeVisible();

    // §11.3 — link pra conferir na ata original
    await expect(page.getByRole('link', { name: /Conferir na fonte oficial/ }).first()).toBeVisible();
  });

  test('documento sem inconsistência não ganha aviso (regressão)', async ({ page }) => {
    // Doc 321: 425 produtos com valor final, zero validações implausíveis
    await page.goto('/documento/321');
    await expect(page.getByText('Itens deste processo')).toBeVisible();
    await expect(page.locator('body')).not.toContainText('Valor não confiável');
  });
});
