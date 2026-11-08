(() => {
  'use strict';

  const header = document.querySelector('.site-header');
  const menuButton = document.querySelector('.menu-toggle');
  const mobileMenu = document.querySelector('.mobile-menu');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Keep navigation accessible without taking attention away from the page.
  const updateHeader = () => {
    header.classList.toggle('is-scrolled', window.scrollY > 120);
  };
  updateHeader();
  window.addEventListener('scroll', updateHeader, { passive: true });

  function closeMenu() {
    menuButton.setAttribute('aria-expanded', 'false');
    menuButton.setAttribute('aria-label', 'Открыть меню');
    mobileMenu.hidden = true;
    document.body.classList.remove('menu-open');
  }

  menuButton.addEventListener('click', () => {
    const willOpen = menuButton.getAttribute('aria-expanded') !== 'true';
    menuButton.setAttribute('aria-expanded', String(willOpen));
    menuButton.setAttribute('aria-label', willOpen ? 'Закрыть меню' : 'Открыть меню');
    mobileMenu.hidden = !willOpen;
    document.body.classList.toggle('menu-open', willOpen);
  });
  mobileMenu.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
  window.addEventListener('resize', () => {
    if (window.innerWidth > 900) closeMenu();
  });

  // Reveal content once, when it enters the viewport.
  const reveals = document.querySelectorAll('.reveal');
  if (reduceMotion || !('IntersectionObserver' in window)) {
    reveals.forEach(element => element.classList.add('visible'));
  } else {
    const revealObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -30px' });
    reveals.forEach(element => revealObserver.observe(element));
  }

  // Device-specific control guide with keyboard navigation.
  const tabs = [...document.querySelectorAll('.control-tab')];
  const panels = [...document.querySelectorAll('.control-panel')];

  function selectTab(selectedTab, focus = false) {
    tabs.forEach(tab => {
      const isSelected = tab === selectedTab;
      tab.classList.toggle('active', isSelected);
      tab.setAttribute('aria-selected', String(isSelected));
      tab.tabIndex = isSelected ? 0 : -1;
    });
    panels.forEach(panel => {
      const isSelected = panel.id === selectedTab.getAttribute('aria-controls');
      panel.hidden = !isSelected;
      panel.classList.toggle('active', isSelected);
    });
    if (focus) selectedTab.focus();
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectTab(tab));
    tab.addEventListener('keydown', event => {
      let nextIndex;
      if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
      if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length;
      if (event.key === 'Home') nextIndex = 0;
      if (event.key === 'End') nextIndex = tabs.length - 1;
      if (nextIndex !== undefined) {
        event.preventDefault();
        selectTab(tabs[nextIndex], true);
      }
    });
  });

  // Quick-start dialog.
  const modal = document.getElementById('controls-modal');
  const openButtons = document.querySelectorAll('[data-open-controls]');
  const closeButton = modal.querySelector('.modal-close');
  let lastFocusedElement;

  openButtons.forEach(button => {
    button.addEventListener('click', () => {
      lastFocusedElement = button;
      closeMenu();
      if (typeof modal.showModal === 'function') {
        modal.showModal();
      } else {
        document.getElementById('controls').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
      }
    });
  });
  closeButton.addEventListener('click', () => modal.close());
  modal.addEventListener('click', event => {
    const box = modal.getBoundingClientRect();
    const outside = event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom;
    if (outside) modal.close();
  });
  modal.addEventListener('close', () => {
    if (lastFocusedElement) lastFocusedElement.focus();
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menuButton.getAttribute('aria-expanded') === 'true') {
      closeMenu();
      menuButton.focus();
    }
  });

  // A restrained pointer parallax gives the hero some depth on larger screens.
  const hero = document.querySelector('.hero');
  const planet = document.querySelector('.hero-planet');
  const cow = document.querySelector('.floating-cow');
  if (!reduceMotion && window.matchMedia('(pointer: fine)').matches) {
    hero.addEventListener('pointermove', event => {
      const x = (event.clientX / window.innerWidth - 0.5) * 12;
      const y = (event.clientY / window.innerHeight - 0.5) * 10;
      planet.style.translate = `${x * -1.4}px ${y * -1.4}px`;
      cow.style.translate = `${x}px ${y}px`;
    });
    hero.addEventListener('pointerleave', () => {
      planet.style.translate = '';
      cow.style.translate = '';
    });
  }
})();
