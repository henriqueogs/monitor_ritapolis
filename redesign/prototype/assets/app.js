// =====================================================
// Monitor Ritapolis — Redesign protótipo
// =====================================================

// Tab switching com animação
function bindTabs() {
  document.querySelectorAll('[data-tabs]').forEach(group => {
    const tabs = group.querySelectorAll('[role="tab"]');
    const panels = document.querySelectorAll(`[data-tabpanel-group="${group.dataset.tabs}"]`);

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const target = tab.dataset.target;
        tabs.forEach(t => {
          t.classList.toggle('is-active', t === tab);
          t.setAttribute('aria-selected', t === tab);
        });
        panels.forEach(p => {
          const active = p.dataset.tabpanel === target;
          p.style.display = active ? '' : 'none';
          if (active) {
            // re-trigger animation
            p.style.animation = 'none';
            p.offsetHeight; // reflow
            p.style.animation = '';
          }
        });
        // update URL hash
        try { history.replaceState(null, '', `#${target}`); } catch (e) {}
      });
    });

    // initial state from hash
    const hash = window.location.hash.slice(1);
    if (hash) {
      const initial = group.querySelector(`[data-target="${hash}"]`);
      if (initial) initial.click();
    }
  });
}

// Theme toggle
function bindTheme() {
  const btn = document.querySelector('[data-theme-toggle]');
  if (!btn) return;
  const stored = localStorage.getItem('mr-theme');
  if (stored) document.documentElement.dataset.theme = stored;

  btn.addEventListener('click', () => {
    const current = document.documentElement.dataset.theme || 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('mr-theme', next);
  });
}

// Filter chip pseudo-dropdown (only visual demo)
function bindFilterChips() {
  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', (e) => {
      e.preventDefault();
      const pressed = chip.getAttribute('aria-pressed') === 'true';
      chip.setAttribute('aria-pressed', !pressed);
    });
  });
}

// Applied filter chip remove
function bindAppliedFilters() {
  document.querySelectorAll('.applied-pill button').forEach(btn => {
    btn.addEventListener('click', () => {
      const pill = btn.closest('.applied-pill');
      pill.style.animation = 'fadeUp var(--motion-base) reverse';
      setTimeout(() => pill.remove(), 180);
    });
  });
  const clear = document.querySelector('.applied-clear');
  if (clear) {
    clear.addEventListener('click', () => {
      document.querySelectorAll('.applied-pill').forEach(p => p.remove());
    });
  }
}

// Search bar suggestions reveal
function bindSearch() {
  const input = document.querySelector('.search-input');
  if (!input) return;
  input.addEventListener('focus', () => input.closest('.search-shell')?.classList.add('is-focused'));
  input.addEventListener('blur',  () => input.closest('.search-shell')?.classList.remove('is-focused'));
}

// Smooth scroll for in-page anchors
function bindSmoothLinks() {
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', (e) => {
      const href = a.getAttribute('href');
      if (href.length > 1) {
        const target = document.querySelector(href);
        if (target) { e.preventDefault(); target.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      }
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  bindTabs();
  bindTheme();
  bindFilterChips();
  bindAppliedFilters();
  bindSearch();
  bindSmoothLinks();
});
