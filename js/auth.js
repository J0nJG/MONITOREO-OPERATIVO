// ============================================================
// AUTENTICACIÓN - SistemaMonitoreoTAG
// Sprint Seguridad — sesión estable y recuperación JWT
// ============================================================
(function () {
    'use strict';

    const LOGIN_PAGE = 'index.html';
    const APP_PAGE = 'monitoreo.html';
    let protectionPromise = null;

    function esPaginaLogin() {
        const nombre = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();
        return nombre === '' || nombre === LOGIN_PAGE;
    }

    // Lee únicamente el payload del JWT para detectar sesiones cacheadas
    // cuyo iat quedó por delante del reloj del navegador/servidor.
    function leerPayloadJWT(token) {
        try {
            const parte = token.split('.')[1];
            if (!parte) return null;
            const base64 = parte.replace(/-/g, '+').replace(/_/g, '/');
            const json = decodeURIComponent(
                atob(base64.padEnd(base64.length + (4 - base64.length % 4) % 4, '='))
                    .split('')
                    .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
                    .join('')
            );
            return JSON.parse(json);
        } catch (_) {
            return null;
        }
    }

    function tokenEmitidoEnElFuturo(session, margenSegundos = 90) {
        const payload = leerPayloadJWT(session?.access_token || '');
        if (!payload?.iat) return false;
        const ahora = Math.floor(Date.now() / 1000);
        return Number(payload.iat) > ahora + margenSegundos;
    }

    async function obtenerSesion() {
        const client = window.supabaseClient;
        if (!client?.auth) return null;

        let resultado = await client.auth.getSession();
        let session = resultado?.data?.session || null;
        let error = resultado?.error || null;

        // Si el token cacheado fue emitido "en el futuro", renovamos antes
        // de que cualquier SELECT/INSERT llegue a RLS/PostgREST.
        const mensaje = String(error?.message || '').toLowerCase();
        if (error || tokenEmitidoEnElFuturo(session)) {
            const refresh = await client.auth.refreshSession();
            if (!refresh.error && refresh.data?.session) {
                session = refresh.data.session;
                error = null;
            } else {
                console.warn('No fue posible renovar la sesión JWT.', refresh.error || error);
                session = null;
                error = refresh.error || error;
            }
        }

        if (error || !session) {
            if (mensaje.includes('issued at future') || String(error?.message || '').toLowerCase().includes('issued at future')) {
                try { await client.auth.signOut({ scope: 'local' }); } catch (_) {}
            }
            return null;
        }

        return session;
    }

    async function protegerPaginaInterna() {
        const sesion = await obtenerSesion();
        if (!sesion) {
            window.location.replace(LOGIN_PAGE);
            return null;
        }
        actualizarUsuarioUI(sesion);
        return sesion;
    }

    function protegerPagina() {
        if (!protectionPromise) {
            protectionPromise = protegerPaginaInterna();
        }
        return protectionPromise;
    }

    async function iniciarSesion(email, password) {
        const boton = document.getElementById('btnLogin');
        if (!email || !password) {
            mostrarMensaje('Escribe tu correo y contraseña.', 'error');
            return;
        }
        if (boton) {
            boton.disabled = true;
            boton.textContent = 'INICIANDO SESIÓN...';
        }
        const { data, error } = await window.supabaseClient.auth.signInWithPassword({
            email: email.trim(),
            password
        });
        if (error || !data?.session) {
            console.error('Error de autenticación:', error);
            mostrarMensaje('Correo o contraseña incorrectos.', 'error');
            if (boton) {
                boton.disabled = false;
                boton.textContent = 'INICIAR SESIÓN';
            }
            return;
        }
        mostrarMensaje('Acceso correcto. Entrando al sistema...', 'success');
        window.location.replace(APP_PAGE);
    }

    async function cerrarSesion() {
        const { error } = await window.supabaseClient.auth.signOut();
        if (error) {
            console.error('Error cerrando sesión:', error);
            mostrarMensajeGlobal('No se pudo cerrar la sesión.', 'error');
            return;
        }
        window.location.replace(LOGIN_PAGE);
    }

    function actualizarUsuarioUI(sesion) {
        const email = sesion?.user?.email || 'USUARIO AUTENTICADO';
        document.querySelectorAll('[data-user-email]').forEach(el => {
            el.textContent = email;
            el.title = email;
        });
    }

    function mostrarMensaje(texto, tipo) {
        const mensaje = document.getElementById('loginMensaje');
        if (!mensaje) return;
        mensaje.textContent = texto;
        mensaje.className = 'login-mensaje ' + tipo;
        mensaje.hidden = false;
    }

    function mostrarMensajeGlobal(texto, tipo) {
        const mensaje = document.getElementById('loginMensaje');
        if (mensaje) {
            mensaje.textContent = texto;
            mensaje.className = 'login-mensaje ' + tipo;
            mensaje.hidden = false;
        } else {
            alert(texto);
        }
    }

    async function inicializarLogin() {
        const form = document.getElementById('formLogin');
        if (!form) return;

        const sesion = await obtenerSesion();
        if (sesion) {
            window.location.replace(APP_PAGE);
            return;
        }

        form.addEventListener('submit', event => {
            event.preventDefault();
            iniciarSesion(
                document.getElementById('loginEmail')?.value || '',
                document.getElementById('loginPassword')?.value || ''
            );
        });
    }

    // IMPORTANTE: todas las páginas operativas esperan esta promesa antes
    // de consultar Supabase. Así evitamos la carrera que provocaba el
    // mensaje "JWT issued at future" al abrir Operadores/Unidades.
    window.SistemaAuth = {
        obtenerSesion,
        protegerPagina,
        iniciarSesion,
        cerrarSesion,
        ready: esPaginaLogin() ? Promise.resolve(null) : protegerPagina()
    };

    if (esPaginaLogin()) {
        document.addEventListener('DOMContentLoaded', inicializarLogin);
    }

})();
