const menuToggle = document.querySelector('.menu-toggle');
const navLinks = document.querySelector('.nav-links');
const cursorGlow = document.querySelector('.cursor-glow');
const revealEls = document.querySelectorAll('.reveal');
const sections = document.querySelectorAll('.page');
const navAnchors = document.querySelectorAll('.nav-links a[href^="#"]');

menuToggle?.addEventListener('click', () => {
  const isOpen = navLinks.classList.toggle('open');
  menuToggle.setAttribute('aria-expanded', String(isOpen));
});

navAnchors.forEach((anchor) => {
  anchor.addEventListener('click', () => {
    navLinks.classList.remove('open');
    menuToggle?.setAttribute('aria-expanded', 'false');
  });
});

window.addEventListener('pointermove', (event) => {
  if (!cursorGlow) return;
  cursorGlow.style.left = `${event.clientX}px`;
  cursorGlow.style.top = `${event.clientY}px`;
});

const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) entry.target.classList.add('visible');
  });
}, { threshold: 0.16 });

revealEls.forEach((el) => revealObserver.observe(el));

const activeObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    const id = entry.target.id || 'home';
    navAnchors.forEach((anchor) => anchor.classList.toggle('active', anchor.getAttribute('href') === `#${id}`));
  });
}, { rootMargin: '-42% 0px -48% 0px' });

sections.forEach((section) => activeObserver.observe(section));

window.addEventListener('scroll', () => {
  const offset = window.scrollY * 0.08;
  document.documentElement.style.setProperty('--scroll-shift', `${offset}px`);
}, { passive: true });
