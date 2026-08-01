// Mount Olympus — A Security Saga
// Small progressive-enhancement script: nav toggle, scroll reveal, footer year, contact form.

document.addEventListener('DOMContentLoaded', () => {

  // Footer year
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // Mobile nav toggle
  const navToggle = document.getElementById('navToggle');
  const navLinks = document.getElementById('navLinks');
  if (navToggle && navLinks) {
    navToggle.addEventListener('click', () => {
      const isOpen = navLinks.classList.toggle('is-open');
      navToggle.setAttribute('aria-expanded', String(isOpen));
    });
    navLinks.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        navLinks.classList.remove('is-open');
        navToggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  // Scroll-reveal for chapter content
  const revealTargets = document.querySelectorAll(
    '.chapter-head, .origin-grid, .trials-source, .trial-card, .armory-case, .oracle-wrap'
  );
  revealTargets.forEach(el => el.classList.add('reveal'));

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -60px 0px' });

    revealTargets.forEach(el => observer.observe(el));
  } else {
    revealTargets.forEach(el => el.classList.add('is-visible'));
  }

  // Contact form — submits to Formspree via AJAX, stays in-page
  const form = document.getElementById('contactForm');
  const formNote = document.getElementById('formNote');
  if (form && formNote) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = form.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      formNote.textContent = 'Sending your words to Olympus…';

      try {
        const response = await fetch(form.action, {
          method: 'POST',
          body: new FormData(form),
          headers: { 'Accept': 'application/json' }
        });

        if (response.ok) {
          formNote.textContent = 'Your message has reached David — expect a reply soon.';
          form.reset();
        } else {
          formNote.textContent = 'Something went wrong. Please try again, or email davidmnovis@gmail.com directly.';
        }
      } catch (err) {
        formNote.textContent = 'Something went wrong. Please try again, or email davidmnovis@gmail.com directly.';
      } finally {
        submitBtn.disabled = false;
      }
    });
  }

});
