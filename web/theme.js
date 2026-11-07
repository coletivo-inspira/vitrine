// Run before styles so a saved preference is applied before the first paint.
(() => {
  const root = document.documentElement;
  const system = matchMedia('(prefers-color-scheme: dark)');
  let preference = null;
  try {
    const saved = localStorage.getItem('vitrine-theme');
    if (saved === 'light' || saved === 'dark') preference = saved;
  } catch { /* A blocked storage still allows switching for this visit. */ }
  function apply() {
    const theme = preference || (system.matches ? 'dark' : 'light');
    root.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#171e1a' : '#F7F7F4');
    const button = document.querySelector('.theme-toggle');
    if (button) {
      button.hidden = false;
      button.setAttribute('aria-label', theme === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro');
      button.setAttribute('title', theme === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro');
    }
  }
  apply();
  system.addEventListener('change', () => { if (!preference) apply(); });
  document.addEventListener('DOMContentLoaded', () => {
    apply();
    document.querySelector('.theme-toggle')?.addEventListener('click', () => {
      preference = root.dataset.theme === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem('vitrine-theme', preference); } catch { /* Session only. */ }
      apply();
    });
  });
})();
