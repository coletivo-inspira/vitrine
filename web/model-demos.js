// Demonstrações dos modelos: troca o PNG pelo SVG animado e controla a reprodução.
(() => {
  const demos = [...document.querySelectorAll('.model-demo[data-svg]')];
  if (!demos.length || !('IntersectionObserver' in window) || !('DOMParser' in window)) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const STORAGE_KEY = 'vitrine-demos-pausadas';
  let pausedByPerson;
  try { pausedByPerson = new Set(JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '[]')); } catch { pausedByPerson = new Set(); }
  const states = new Map(demos.map(demo => [demo, { svg: null, picture: demo.querySelector('picture'), visible: false, loading: null }]));

  function remember() {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...pausedByPerson])); } catch { /* Choice lasts for this visit only. */ }
  }

  function sync(demo) {
    const state = states.get(demo);
    const button = demo.querySelector('.model-demo-toggle');
    const name = demo.querySelector('.model-demo-name')?.textContent ?? '';
    const paused = pausedByPerson.has(demo.dataset.demo);
    if (button) {
      button.setAttribute('aria-pressed', String(paused));
      button.setAttribute('aria-label', `${paused ? 'Retomar' : 'Pausar'} demonstração ${name}`);
      button.querySelector('span').textContent = paused ? 'Retomar' : 'Pausar';
      button.querySelector('path').setAttribute('d', paused ? 'M8 5v14l11-7Z' : 'M8 5v14M16 5v14');
    }
    if (state.svg) state.svg.classList.toggle('is-paused', paused || !state.visible || document.hidden);
  }

  async function load(demo) {
    const state = states.get(demo);
    const source = new URL(demo.dataset.svg, document.baseURI);
    if (source.origin !== location.origin) throw new Error('Demo must be local');
    const response = await fetch(source);
    if (!response.ok) throw new Error('Demo unavailable');
    const parsed = new DOMParser().parseFromString(await response.text(), 'image/svg+xml');
    const svg = parsed.documentElement;
    if (svg.localName !== 'svg' || parsed.querySelector('parsererror, script, foreignObject')) throw new Error('Invalid demo');
    for (const image of svg.querySelectorAll('image')) {
      const href = new URL(image.getAttribute('href'), source);
      if (href.origin !== location.origin) throw new Error('Demo image must be local');
      image.setAttribute('href', href.href);
    }
    svg.removeAttribute('width');
    svg.removeAttribute('height');
    svg.classList.add('is-paused');
    state.svg = document.importNode(svg, true);
  }

  function show(demo) {
    const state = states.get(demo);
    if (reduced.matches) return;
    if (!state.svg) {
      state.loading ??= load(demo).then(() => show(demo)).catch(() => { state.loading = null; });
      return;
    }
    const media = demo.querySelector('.model-demo-media');
    if (state.svg.parentNode !== media) media.replaceChildren(state.svg);
    demo.querySelector('.model-demo-toggle').hidden = false;
    sync(demo);
  }

  // Com movimento reduzido, volta ao PNG estático e esconde o controle.
  function showStatic(demo) {
    const state = states.get(demo);
    const media = demo.querySelector('.model-demo-media');
    if (state.picture && state.picture.parentNode !== media) media.replaceChildren(state.picture);
    demo.querySelector('.model-demo-toggle').hidden = true;
  }

  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      const state = states.get(entry.target);
      state.visible = entry.isIntersecting;
      if (state.visible) show(entry.target);
      sync(entry.target);
    }
  }, { threshold: 0.15 });

  for (const demo of demos) {
    observer.observe(demo);
    demo.querySelector('.model-demo-toggle')?.addEventListener('click', () => {
      const id = demo.dataset.demo;
      if (pausedByPerson.has(id)) pausedByPerson.delete(id); else pausedByPerson.add(id);
      remember();
      sync(demo);
    });
  }
  document.addEventListener('visibilitychange', () => demos.forEach(sync));
  reduced.addEventListener('change', () => demos.forEach(demo => (reduced.matches ? showStatic(demo) : states.get(demo).visible && show(demo))));
})();
