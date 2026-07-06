'use strict';

const { test, expect } = require('@playwright/test');

const ADMIN_STORAGE_KEY = 'monitor-ritapolis-admin-mode';

async function ativarModoInterno(page) {
  await page.addInitScript((key) => window.localStorage.setItem(key, 'true'), ADMIN_STORAGE_KEY);
}

// Documento 178: registro de preços por lote, coberto pela reextração via IA
// (backfill 512/512). A UI nunca pode: (a) estampar totais derivados
// inventados nem (b) apresentar teto homologado como gasto sem contexto.
test.describe('Valores de itens: teto homologado com contexto (doc 178, via IA)', () => {
  test('teto homologado aparece público com contexto e link pra fonte', async ({ page }) => {
    await page.goto('/documento/178');
    await expect(page.getByRole('heading', { name: 'Itens deste processo' }).first()).toBeVisible();

    // Teto homologado com contexto honesto, direto ao público (origem IA)
    await expect(page.getByText(/teto homologado/i).first()).toBeVisible();
    await expect(page.getByText(/não é gasto realizado/i).first()).toBeVisible();

    // §11.3 — toda linha oferece link de origem (fonte oficial)
    await expect(page.getByText(/ver na fonte|ver na ata/i).first()).toBeVisible();
  });

  test('documento sem inconsistência não ganha aviso nem contexto (regressão)', async ({ page }) => {
    await ativarModoInterno(page);
    // Doc 321: 425 produtos com valor final, zero validações de plausibilidade
    await page.goto('/documento/321');
    await expect(page.getByRole('heading', { name: 'Itens deste processo' }).first()).toBeVisible();
    await expect(page.locator('body')).not.toContainText('Valor não confiável');
    await expect(page.locator('body')).not.toContainText('teto homologado');
  });
});
