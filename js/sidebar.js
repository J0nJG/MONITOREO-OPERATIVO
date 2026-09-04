/*
 * MENÚ LATERAL — navegación consistente en todas las páginas.
 * - Compacto por defecto: conserva los iconos.
 * - Abierto: muestra texto y desplaza el contenido en PC/tablet.
 * - En móvil: se superpone de forma cómoda sin romper el contenido.
 * - El estado se conserva entre páginas y NO se cierra por hacer clic fuera.
 * - Solo el usuario puede plegarlo/desplegarlo con el botón o Escape.
 */
(function () {
    'use strict';

    const shell = document.querySelector('.app-shell');

    // Navegación móvil: cinco accesos fijos, solo iconos.
    // Se crea aquí para mantener una sola fuente de navegación en todas las páginas.
    function ensureMobileNav() {
        if (!shell || document.querySelector('.mobile-bottom-nav')) return;
        const items = [
            ['monitoreo.html', '📡', 'MONITOREO'],
            ['concluidos.html', '✓', 'CONCLUIDOS'],
            ['operadores.html', '👤', 'OPERADORES'],
            ['unidades.html', '🚚', 'UNIDADES'],
            ['rutas.html', '🛣️', 'RUTAS']
        ];
        const current = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
        const nav = document.createElement('nav');
        nav.className = 'mobile-bottom-nav';
        nav.setAttribute('aria-label', 'Navegación principal móvil');
        nav.innerHTML = items.map(([href, icon, label]) => {
            const active = current === href;
            return `<a class="mobile-bottom-nav-item${active ? ' is-active' : ''}" href="${href}" aria-label="${label}" title="${label}"${active ? ' aria-current="page"' : ''}><span aria-hidden="true">${icon}</span></a>`;
        }).join('');
        shell.appendChild(nav);
    }

    ensureMobileNav();
    const sidebar = document.querySelector('.sidebar');
    const button = document.getElementById('btnSidebarToggle');
    if (!shell || !sidebar || !button) return;

    const STORAGE_KEY = 'sistemaMonitoreoTAG.sidebarOpen';
    const readState = () => {
        try { return window.localStorage.getItem(STORAGE_KEY) === '1'; }
        catch (_) { return false; }
    };
    const saveState = (open) => {
        try { window.localStorage.setItem(STORAGE_KEY, open ? '1' : '0'); }
        catch (_) { /* El menú sigue funcionando aunque localStorage esté bloqueado. */ }
    };

    // Mejora de accesibilidad: cada icono conserva el texto de su pestaña como tooltip.
    sidebar.querySelectorAll('.menu-item').forEach((item) => {
        const label = item.textContent.replace(/\s+/g, ' ').trim();
        if (label) {
            item.setAttribute('title', label);
            item.setAttribute('aria-label', label);
        }
        const icon = item.querySelector('span');
        if (icon) icon.setAttribute('aria-hidden', 'true');
    });

    const setState = (open, persist = true) => {
        document.documentElement.dataset.sidebarState = open ? 'open' : 'closed';
        shell.classList.toggle('sidebar-open', open);
        shell.classList.toggle('sidebar-collapsed', !open);
        button.setAttribute('aria-expanded', String(open));
        button.setAttribute('aria-label', open ? 'Plegar menú lateral' : 'Desplegar menú lateral');
        button.title = open ? 'Plegar menú' : 'Desplegar menú';
        button.innerHTML = open
            ? '<span aria-hidden="true">‹</span>'
            : '<span aria-hidden="true">☰</span>';
        if (persist) saveState(open);
    };

    // El estado visual ya fue aplicado en el HTML antes del primer pintado.
    // Aquí solo sincronizamos el botón; no cambiamos las clases al cargar.
    const initialOpen = document.documentElement.dataset.sidebarState === 'open' || shell.classList.contains('sidebar-open');
    document.documentElement.dataset.sidebarState = initialOpen ? 'open' : 'closed';
    button.setAttribute('aria-expanded', String(initialOpen));
    button.setAttribute('aria-label', initialOpen ? 'Plegar menú lateral' : 'Desplegar menú lateral');
    button.title = initialOpen ? 'Plegar menú' : 'Desplegar menú';
    button.innerHTML = initialOpen ? '<span aria-hidden="true">‹</span>' : '<span aria-hidden="true">☰</span>';
    saveState(initialOpen);

    button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        setState(!shell.classList.contains('sidebar-open'));
    });

    // Animación mínima de clic para los iconos, sin desplazar ni cambiar la navegación.
    sidebar.querySelectorAll('.menu-item span').forEach((icon) => {
        icon.addEventListener('pointerdown', () => {
            icon.classList.remove('icon-click');
            void icon.offsetWidth;
            icon.classList.add('icon-click');
            window.setTimeout(() => icon.classList.remove('icon-click'), 120);
        }, { passive: true });
    });

    // Escape es un cierre manual y accesible; hacer clic fuera NO cierra el menú.
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && shell.classList.contains('sidebar-open')) {
            setState(false);
            button.focus({ preventScroll: true });
        }
    });
})();
