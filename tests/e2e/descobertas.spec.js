'use strict';

const { test, expect } = require('@playwright/test');

test.describe('Descobertas (caminho feliz)', () => {
  test('navbar usa "Descobertas", não "Alertas"', async ({ page }) => {
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: 'Principal' }).first();
    await expect(nav.getByRole('link', { name: 'Descobertas' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Alertas', exact: true })).toHaveCount(0);
  });

  test('lista de descobertas abre o detalhe com documentos e fonte', async ({ page }) => {
    await page.goto('/descobertas');
    await expect(page.getByRole('heading', { name: /Descobertas nos dados/i })).toBeVisible();

    // Tom de curiosidade — sem rótulos alarmistas
    await expect(page.locator('body')).not.toContainText('Crítico');
    await expect(page.locator('body')).not.toContainText('Sinais de atenção');

    const primeiro = page.locator('.citizen-card').first();
    await expect(primeiro).toBeVisible();
    await primeiro.click();

    await expect(page).toHaveURL(/\/descobertas\/\d+/);
    await expect(page.locator('h1')).toBeVisible();
    // Detalhe traz a seção de documentos vinculados com link de fonte (§11.3)
    await expect(page.getByText(/Documentos vinculados/i)).toBeVisible();
  });

  test('detalhe inexistente não quebra a aplicação', async ({ page }) => {
    const resp = await page.goto('/descobertas/999999');
    expect(resp.status()).toBeLessThan(500);
    await expect(page.getByRole('heading', { name: /Descoberta não encontrada/i })).toBeVisible();
  });
});
