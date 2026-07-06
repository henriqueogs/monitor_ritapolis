'use strict';

const { test, expect } = require('@playwright/test');

test.describe('Busca unificada (caminho feliz)', () => {
  test('caixa na navbar leva a /busca com as 3 seções e "Ver todos" funcional', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('.topbar-search input');
    await expect(input).toBeVisible();
    await input.fill('merenda');
    await input.press('Enter');

    await expect(page).toHaveURL(/\/busca\?q=merenda/);
    await expect(page.getByRole('heading', { name: 'Documentos e licitações' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Empenhos' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Fornecedores e pessoas' })).toBeVisible();

    // Pelo menos uma seção com resultado real e "Ver todos" navegável
    const verTodos = page.getByRole('link', { name: /Ver todos \(\d+\)/ }).first();
    await expect(verTodos).toBeVisible();
    await verTodos.click();
    await expect(page).toHaveURL(/(acervo\?q=|transparencia\/empenhos\?q=|credores\?busca=)/);
  });

  test('busca por nome de pessoa encontra o perfil PF', async ({ page }) => {
    await page.goto('/busca?q=adilson');
    const linkPf = page.locator('a[href^="/credores/pf-"]').first();
    await expect(linkPf).toBeVisible();
  });

  test('sem termo mostra instrução, não erro', async ({ page }) => {
    await page.goto('/busca');
    await expect(page.getByText(/pelo menos 2 caracteres/)).toBeVisible();
  });
});
