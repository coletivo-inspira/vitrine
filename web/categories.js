(() => {
  const choices = document.querySelector('.area-choices');
  if (!choices) return;
  const buttons = [...choices.querySelectorAll('[data-area]')];
  const panels = [...document.querySelectorAll('.area-panel')];
  function select(area) {
    buttons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.area === area)));
    panels.forEach(panel => { panel.hidden = panel.id !== `area-${area}`; });
  }
  choices.hidden = false;
  choices.addEventListener('click', event => {
    const button = event.target.closest('button[data-area]');
    if (button) select(button.dataset.area);
  });
  select('food');
})();
