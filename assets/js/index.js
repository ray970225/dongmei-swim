/* ─── NAV ─── */
function toggleMenu() {
  document.getElementById('navLinks').classList.toggle('open');
}
document.querySelectorAll('#navLinks a[href^="#"]').forEach(link => {
  link.addEventListener('click', () => {
    document.getElementById('navLinks').classList.remove('open');
  });
});

/* ─── SCROLL REVEAL ─── */
const observer = new IntersectionObserver(
  entries => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); }),
  { threshold: 0.12 }
);
document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

/* ─── COACH DRAWER ─── */
const coachCards = [...document.querySelectorAll('.coach-card')];

if (coachCards.length) {
  document.body.classList.add('coach-drawer-ready');
  const drawerShell = document.createElement('div');
  drawerShell.className = 'coach-drawer-shell';
  drawerShell.setAttribute('aria-hidden', 'true');
  drawerShell.innerHTML = `
    <button class="coach-drawer-backdrop" type="button" tabindex="-1" aria-label="關閉教練介紹"></button>
    <aside class="coach-drawer" role="dialog" aria-modal="true" aria-labelledby="coachDrawerName">
      <button class="coach-drawer-close" type="button" aria-label="關閉教練介紹">×</button>
      <div class="coach-drawer-header">
        <div class="coach-drawer-avatar"></div>
        <div>
          <p class="coach-drawer-kicker">COACH PROFILE</p>
          <h3 class="coach-drawer-name" id="coachDrawerName"></h3>
          <p class="coach-drawer-role"></p>
        </div>
      </div>
      <div class="coach-drawer-scroll">
        <p class="coach-drawer-label">經歷與證照</p>
        <div class="coach-drawer-details"></div>
      </div>
    </aside>`;
  document.body.append(drawerShell);

  const drawer = drawerShell.querySelector('.coach-drawer');
  const closeButton = drawerShell.querySelector('.coach-drawer-close');
  const backdrop = drawerShell.querySelector('.coach-drawer-backdrop');
  const drawerAvatar = drawerShell.querySelector('.coach-drawer-avatar');
  const drawerName = drawerShell.querySelector('.coach-drawer-name');
  const drawerRole = drawerShell.querySelector('.coach-drawer-role');
  const drawerDetails = drawerShell.querySelector('.coach-drawer-details');
  let activeCard = null;
  let lastTrigger = null;

  const closeCoachDrawer = () => {
    if (!drawerShell.classList.contains('is-open')) return;
    drawerShell.classList.remove('is-open');
    drawerShell.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('coach-drawer-open');
    activeCard?.classList.remove('is-selected');
    activeCard = null;
    lastTrigger?.focus({ preventScroll: true });
  };

  const openCoachDrawer = (card, trigger) => {
    activeCard?.classList.remove('is-selected');
    activeCard = card;
    lastTrigger = trigger;
    card.classList.add('is-selected');

    const avatar = card.querySelector('.coach-avatar img');
    const bio = card.querySelector('.coach-bio');
    const certs = card.querySelector('.coach-certs');
    const links = card.querySelector('.coach-links');
    drawerAvatar.replaceChildren(avatar.cloneNode(true));
    drawerName.textContent = card.querySelector('.coach-name')?.textContent.trim() || '教練介紹';
    drawerRole.textContent = card.querySelector('.coach-role')?.textContent.trim() || '';
    drawerDetails.replaceChildren(...[bio, certs, links].filter(Boolean).map(item => item.cloneNode(true)));

    drawerShell.classList.add('is-open');
    drawerShell.setAttribute('aria-hidden', 'false');
    document.body.classList.add('coach-drawer-open');
    requestAnimationFrame(() => closeButton.focus({ preventScroll: true }));
  };

  coachCards.forEach(card => {
    const coachName = card.querySelector('.coach-name')?.textContent.trim() || '教練';
    const action = document.createElement('button');
    action.className = 'coach-card-action';
    action.type = 'button';
    action.textContent = '查看完整介紹';
    action.setAttribute('aria-haspopup', 'dialog');
    action.setAttribute('aria-label', `查看${coachName}完整介紹`);
    card.append(action);

    card.addEventListener('click', event => {
      if (event.target.closest('a')) return;
      openCoachDrawer(card, action);
    });
  });

  closeButton.addEventListener('click', closeCoachDrawer);
  backdrop.addEventListener('click', closeCoachDrawer);
  document.addEventListener('keydown', event => {
    if (!drawerShell.classList.contains('is-open')) return;
    if (event.key === 'Escape') {
      closeCoachDrawer();
      return;
    }
    if (event.key !== 'Tab') return;

    const focusable = [...drawer.querySelectorAll('button, a[href]')].filter(element => !element.hasAttribute('disabled'));
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
}
