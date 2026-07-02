'use strict';

const { test, expect } = require('@playwright/test');

test.describe('Pra onde vai o dinheiro (caminho feliz)', () => {
  test('painel → categoria → ranking → lista → empenho', async ({ page }) => {
    await page.goto('/transparencia');
    await expect(page.getByText(/Pra onde vai o dinheiro \(/)).toBeVisible();

    // Abre uma categoria
    const linkCategoria = page.locator('a[href^="/transparencia/categoria/"]').first();
    await expect(linkCategoria).toBeVisible();
    await linkCategoria.click();
    await expect(page).toHaveURL(/\/transparencia\/categoria\/[a-z0-9-]+/);
    await expect(page.getByText(/Quem mais recebe \(/)).toBeVisible();

    // Troca de período muda o rótulo
    await page.goto('/transparencia/categoria/diarias?exercicio=2024');
    await expect(page.getByText('Quem mais recebe (2024)')).toBeVisible();

    // Lista de empenhos da categoria
    await page.getByRole('link', { name: 'Ver todos os empenhos' }).click();
    await expect(page).toHaveURL(/\/transparencia\/empenhos\?categoria=diarias/);
    await expect(page.getByText(/empenhos? encontrados?/)).toBeVisible();

    // Linha abre a página do empenho
    const linkEmpenho = page.locator('a[href^="/empenho/"]').first();
    await expect(linkEmpenho).toBeVisible();
    await linkEmpenho.click();
    await expect(page).toHaveURL(/\/empenho\/\d+/);
    await expect(page.getByRole('heading', { name: /Empenho/ })).toBeVisible();
  });

  test('busca de empenhos encontra termo com e sem acento', async ({ page }) => {
    await page.goto('/transparencia/empenhos?q=diaria');
    await expect(page.getByText(/empenhos? encontrados?/)).toBeVisible();
    const totalSemAcento = await page.locator('h2').filter({ hasText: 'encontrado' }).textContent();
    expect(totalSemAcento).not.toContain('0 empenhos');

    await page.goto('/transparencia/empenhos?q=diária');
    const totalComAcento = await page.locator('h2').filter({ hasText: 'encontrado' }).textContent();
    expect(totalComAcento).toBe(totalSemAcento);
  });

  test('categoria desconhecida não quebra', async ({ page }) => {
    const resp = await page.goto('/transparencia/categoria/nao-existe');
    expect(resp.status()).toBeLessThan(500);
    await expect(page.getByRole('heading', { name: /Categoria não encontrada/i })).toBeVisible();
  });
});
