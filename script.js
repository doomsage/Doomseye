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

function initSmoothScroll() {
  if (!window.LocomotiveScroll) return null;

  return new window.LocomotiveScroll({
    el: document.querySelector('main'),
    smooth: true,
    smartphone: { smooth: false },
    tablet: { smooth: false },
  });
}

function initGsapStory(scroller) {
  if (!window.gsap || !window.ScrollTrigger) return;

  window.gsap.registerPlugin(window.ScrollTrigger);

  if (scroller) {
    scroller.on('scroll', window.ScrollTrigger.update);
    window.ScrollTrigger.scrollerProxy('main', {
      scrollTop(value) {
        if (arguments.length) scroller.scrollTo(value, { duration: 0, disableLerp: true });
        return scroller.scroll.instance.scroll.y;
      },
      getBoundingClientRect() {
        return { top: 0, left: 0, width: window.innerWidth, height: window.innerHeight };
      },
    });
  }

  window.gsap.fromTo('.hero-copy', { y: 80, opacity: 0 }, { y: 0, opacity: 1, duration: 1.1, ease: 'power3.out' });
  window.gsap.fromTo('.hero-orb', { scale: .86, rotate: -8, opacity: 0 }, { scale: 1, rotate: 0, opacity: 1, duration: 1.2, ease: 'expo.out' });

  window.gsap.utils.toArray('.story-card').forEach((card, index) => {
    window.gsap.fromTo(card,
      { autoAlpha: .28, y: 120, scale: .9, rotate: index % 2 ? 4 : -4 },
      {
        autoAlpha: 1,
        y: 0,
        scale: 1,
        rotate: 0,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: card,
          scroller: scroller ? 'main' : window,
          start: 'top 78%',
          end: 'bottom 42%',
          scrub: true,
        },
      });
  });

  window.ScrollTrigger.addEventListener('refresh', () => scroller?.update());
  window.ScrollTrigger.refresh();
}

function initThreeScene() {
  const canvas = document.getElementById('premium-canvas');
  if (!canvas || !window.THREE) return;

  const scene = new window.THREE.Scene();
  const camera = new window.THREE.PerspectiveCamera(55, 1, 0.1, 100);
  camera.position.z = 7;

  const renderer = new window.THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const geometry = new window.THREE.TorusKnotGeometry(1.35, 0.36, 180, 24);
  const material = new window.THREE.MeshStandardMaterial({
    color: 0xf6d36b,
    metalness: .72,
    roughness: .22,
    emissive: 0x2a1800,
  });
  const knot = new window.THREE.Mesh(geometry, material);
  scene.add(knot);

  const particles = new window.THREE.Points(
    new window.THREE.BufferGeometry().setAttribute('position', new window.THREE.Float32BufferAttribute(
      Array.from({ length: 420 }, () => (Math.random() - .5) * 12), 3,
    )),
    new window.THREE.PointsMaterial({ color: 0xffefaa, size: .025, transparent: true, opacity: .72 }),
  );
  scene.add(particles);

  scene.add(new window.THREE.AmbientLight(0xfff2c2, .82));
  const light = new window.THREE.PointLight(0xf4a261, 2.4, 20);
  light.position.set(3, 4, 5);
  scene.add(light);

  function resize() {
    const bounds = canvas.getBoundingClientRect();
    renderer.setSize(bounds.width, bounds.height, false);
    camera.aspect = bounds.width / Math.max(bounds.height, 1);
    camera.updateProjectionMatrix();
  }

  function animate() {
    const progress = Math.min(window.scrollY / Math.max(document.body.scrollHeight - window.innerHeight, 1), 1);
    knot.rotation.x += .004 + progress * .01;
    knot.rotation.y += .007 + progress * .015;
    particles.rotation.y -= .0015;
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }

  resize();
  animate();
  window.addEventListener('resize', resize);
}

const smoothScroller = initSmoothScroll();
initGsapStory(smoothScroller);
initThreeScene();

window.addEventListener('scroll', () => {
  const offset = window.scrollY * 0.08;
  document.documentElement.style.setProperty('--scroll-shift', `${offset}px`);
}, { passive: true });
