/**
 * Who Is Alex Merced — Interactive Scripts
 * Scroll reveals, sticky nav, dark mode, back-to-top, active nav highlighting
 */

(function () {
    'use strict';

    // ============================================
    // 1. Scroll Reveal (IntersectionObserver)
    // ============================================
    const revealElements = document.querySelectorAll('.reveal');

    const revealObserver = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                    revealObserver.unobserve(entry.target); // animate once
                }
            });
        },
        { threshold: 0.12 }
    );

    revealElements.forEach((el) => revealObserver.observe(el));

    // ============================================
    // 2. Sticky Nav — Hide on scroll down, show on scroll up
    // ============================================
    const nav = document.querySelector('.site-nav');
    let lastScrollY = window.scrollY;
    let ticking = false;

    function updateNav() {
        const currentScrollY = window.scrollY;

        if (currentScrollY > lastScrollY && currentScrollY > 100) {
            nav.classList.add('nav-hidden');
        } else {
            nav.classList.remove('nav-hidden');
        }

        lastScrollY = currentScrollY;
        ticking = false;
    }

    window.addEventListener('scroll', () => {
        if (!ticking) {
            requestAnimationFrame(updateNav);
            ticking = true;
        }
    });

    // ============================================
    // 3. Mobile Hamburger Toggle
    // ============================================
    const hamburger = document.querySelector('.nav-hamburger');
    const navLinks = document.querySelector('.nav-links');

    hamburger.addEventListener('click', () => {
        const isOpen = navLinks.classList.toggle('nav-open');
        hamburger.setAttribute('aria-expanded', isOpen);
        hamburger.textContent = isOpen ? '✕' : '☰';
    });

    // Close mobile nav when a link is clicked
    navLinks.querySelectorAll('a').forEach((link) => {
        link.addEventListener('click', () => {
            navLinks.classList.remove('nav-open');
            hamburger.setAttribute('aria-expanded', 'false');
            hamburger.textContent = '☰';
        });
    });

    // ============================================
    // 4. Active Nav Highlighting
    // ============================================
    const sections = document.querySelectorAll('section[id]');
    const navAnchors = document.querySelectorAll('.nav-links a');

    const sectionObserver = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    const id = entry.target.getAttribute('id');
                    navAnchors.forEach((a) => {
                        a.classList.toggle('active', a.getAttribute('href') === `#${id}`);
                    });
                }
            });
        },
        { rootMargin: '-30% 0px -60% 0px' }
    );

    sections.forEach((s) => sectionObserver.observe(s));

    // ============================================
    // 5. Back-to-Top Button
    // ============================================
    const backToTop = document.getElementById('back-to-top');

    window.addEventListener('scroll', () => {
        backToTop.classList.toggle('visible', window.scrollY > 500);
    });

    backToTop.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // ============================================
    // 6. Dark / Light Mode Toggle
    // ============================================
    const themeToggle = document.querySelector('.theme-toggle');
    const STORAGE_KEY = 'alexmerced-theme';

    // Load saved preference
    const savedTheme = localStorage.getItem(STORAGE_KEY);
    if (savedTheme === 'light') {
        document.body.classList.add('light-mode');
        themeToggle.textContent = '☀️';
    }

    themeToggle.addEventListener('click', () => {
        const isLight = document.body.classList.toggle('light-mode');
        themeToggle.textContent = isLight ? '☀️' : '🌙';
        localStorage.setItem(STORAGE_KEY, isLight ? 'light' : 'dark');
    });
})();
