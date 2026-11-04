(function(){
  const body = document.body;
  const device = document.getElementById('device');
  const buttons = document.querySelectorAll('.mode-btn');
  const modeTag = document.getElementById('modeTag');
  const MODE_LABEL = {1:'SOLO VS AI', 2:'2 PLAYERS', 3:'3 PLAYERS', 4:'4 PLAYERS'};

  function setMode(mode){
    // clean revert: remove all state before applying new
    body.setAttribute('data-mode', String(mode));
    device.classList.remove('mode-4p');
    buttons.forEach(b => b.classList.remove('active'));

    document.querySelector('.mode-btn[data-mode="'+mode+'"]').classList.add('active');
    modeTag.textContent = MODE_LABEL[mode];

    // update card subtitles (no stacked prefixes — rebuild from pristine data-desc)
    document.querySelectorAll('.gsub').forEach(el => {
      const base = el.getAttribute('data-desc');
      el.textContent = mode === 1 ? '[Solo vs AI Mode] ' + base : base;
    });

    // 4P: corner borders on the dashboard frame
    if (mode === 4) device.classList.add('mode-4p');
  }

  buttons.forEach(btn => {
    btn.addEventListener('click', () => setMode(+btn.dataset.mode));
  });

  // tap feedback glow for touch devices (mirrors hover state)
  document.querySelectorAll('.gcard').forEach(card => {
    card.addEventListener('touchstart', () => {
      card.style.transform = 'scale(1.04)';
      card.style.borderColor = 'var(--p1)';
    }, {passive:true});
    card.addEventListener('touchend', () => {
      setTimeout(() => { card.style.transform = ''; card.style.borderColor = ''; }, 260);
    }, {passive:true});
  });

  // trophy counter (global match wins)
  let wins = 0;
  const winCount = document.getElementById('winCount');
  document.getElementById('trophy').addEventListener('click', () => {
    winCount.textContent = ++wins;
  });

  setMode(1);
})();
