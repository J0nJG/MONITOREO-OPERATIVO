// ============================================================
// SISTEMA MONITOREO TAG — CENTRO DE ALERTAS V34
// Motor común de alertas. No contiene secretos.
// ============================================================
(function () {
    'use strict';

    const INTERVALO_SEGUIMIENTO_MS = 3 * 60 * 60 * 1000;
    const INTERVALO_REVISION_MS = 60 * 1000;
    const STORAGE_SILENCIO = 'sistemaMonitoreoTAG.alertas.silencio';

    let alertas = [];
    let temporizador = null;
    let temporizadorGeocercas = null;
    let temporizadorSamsara = null;
    let primeraRevision = true;
    let primeraRevisionSamsara = true;
    let revisionEnCurso = false;
    let filtro = 'TODAS';
    let samsaraConfigCount = null;
    let ultimoChequeoGps = 0;

    const $ = id => document.getElementById(id);

    const ES_MONITOREO_OPERATIVO = /(?:^|\/)monitoreo\.html$/i.test(window.location.pathname);

    document.addEventListener('DOMContentLoaded', () => {
        if (!ES_MONITOREO_OPERATIVO) return;
        iniciar();
    });

    async function iniciar() {
        const sesion = await window.SistemaAuth?.ready;
        if (!sesion || !window.supabaseClient) return;

        montarInterfaz();
        conectarEventos();
        await revisar();
        await revisarGeocercas();
        await revisarSamsaraSeguridad();
        await revisarSaludGpsSamsara();
        await revisarConfiguracionesSamsara();

        if (temporizador) clearInterval(temporizador);
        temporizador = setInterval(revisar, INTERVALO_REVISION_MS);
        if (temporizadorGeocercas) clearInterval(temporizadorGeocercas);
        temporizadorGeocercas = setInterval(revisarGeocercas, 15000);
        if (temporizadorSamsara) clearInterval(temporizadorSamsara);
        temporizadorSamsara = setInterval(async () => {
            await revisarSamsaraSeguridad();
            await revisarSaludGpsSamsara();
        }, 60000);
        setInterval(revisarConfiguracionesSamsara, 5 * 60 * 1000);
    }

    function montarInterfaz() {
        if ($('smtAlertasButton')) return;

        const topbar = document.querySelector('.topbar');
        if (!topbar) return;

        let acciones = topbar.querySelector('.topbar-actions');
        if (!acciones) {
            acciones = document.createElement('div');
            acciones.className = 'topbar-actions smt-alertas-topbar-actions';
            topbar.appendChild(acciones);
        }

        const boton = document.createElement('button');
        boton.id = 'smtAlertasButton';
        boton.type = 'button';
        boton.className = 'smt-alertas-button';
        boton.setAttribute('aria-label', 'Abrir centro de alertas');
        boton.title = 'Centro de alertas';
        boton.innerHTML = '<span class="smt-alertas-bell" aria-hidden="true"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span>ALERTAS</span><b id="smtAlertasBadge" hidden>0</b>';
        acciones.prepend(boton);

        const modal = document.createElement('div');
        modal.id = 'smtAlertasModal';
        modal.className = 'modal smt-alertas-modal';
        modal.setAttribute('aria-hidden', 'true');
        modal.innerHTML = `
            <div class="modal-content smt-alertas-content">
                <div class="smt-alertas-head">
                    <div>
                        <span class="eyebrow">CENTRO DE CONTROL</span>
                        <h2>ALERTAS OPERATIVAS</h2>
                        <p>Seguimiento de eventos pendientes y acciones realizadas.</p>
                    </div>
                    <button id="smtAlertasClose" class="modal-close" type="button" aria-label="Cerrar">×</button>
                </div>
                <div class="smt-alertas-toolbar">
                    <div class="smt-alertas-summary"><span id="smtAlertasSummary">0 pendientes</span></div>
                    <div class="smt-alertas-filters" role="tablist" aria-label="Filtrar alertas">
                        <button type="button" class="is-active" data-alert-filter="TODAS">TODAS</button>
                        <button type="button" data-alert-filter="ALTA">PRIORIDAD</button>
                        <button type="button" data-alert-filter="MEDIA">ATENCIÓN</button>
                    </div>
                </div>
                <div id="smtAlertasList" class="smt-alertas-list"></div>
                <div class="smt-alertas-footer">
                    <span id="smtSamsaraSafetyStatus">● SAMSARA ACTIVO · SEGURIDAD · GPS · GEOCERCAS · CONFIGURACIONES</span>
                    <div class="smt-alertas-footer-actions">
                        <button id="smtAlertasSyncGeofences" type="button" class="btn btn-secondary btn-small">SINCRONIZAR ZONAS</button>
                        <button id="smtAlertasRefresh" type="button" class="btn btn-secondary btn-small">ACTUALIZAR</button>
                    </div>
                </div>
            </div>`;
        document.body.appendChild(modal);

        const toast = document.createElement('div');
        toast.id = 'smtAlertasToast';
        toast.className = 'smt-alertas-toast';
        toast.setAttribute('role', 'status');
        toast.innerHTML = '<span class="smt-toast-icon">!</span><div><strong id="smtToastTitle">Nueva alerta</strong><small id="smtToastMessage">Revisa el centro de alertas.</small></div><button id="smtToastOpen" type="button">VER</button>';
        document.body.appendChild(toast);
    }

    function conectarEventos() {
        $('smtAlertasButton')?.addEventListener('click', abrir);
        $('smtAlertasClose')?.addEventListener('click', cerrar);
        $('smtAlertasRefresh')?.addEventListener('click', async () => { await revisar(true); await revisarGeocercas(true); await revisarSamsaraSeguridad(true); await revisarSaludGpsSamsara(true); await revisarConfiguracionesSamsara(true); });
        $('smtAlertasSyncGeofences')?.addEventListener('click', sincronizarGeocercas);
        $('smtAlertasList')?.addEventListener('click', manejarAccion);
        $('smtToastOpen')?.addEventListener('click', abrir);
        document.querySelectorAll('[data-alert-filter]').forEach(btn => {
            btn.addEventListener('click', () => {
                filtro = btn.dataset.alertFilter || 'TODAS';
                document.querySelectorAll('[data-alert-filter]').forEach(x => x.classList.toggle('is-active', x === btn));
                renderizar();
            });
        });
        $('smtAlertasModal')?.addEventListener('click', e => {
            if (e.target === $('smtAlertasModal')) cerrar();
        });
    }

    function escapeHtml(value) {
        const div = document.createElement('div');
        div.textContent = value == null ? '' : String(value);
        return div.innerHTML;
    }

    function normalizarTelefono(valor) {
        const digitos = String(valor || '').replace(/\D/g, '');
        if (!digitos) return '';
        if (digitos.length === 10) return '52' + digitos;
        if (digitos.startsWith('521') && digitos.length === 13) return '52' + digitos.slice(3);
        return digitos;
    }

    function fechaHoraSalidaMs(viaje) {
        if (!viaje?.fecha || !viaje?.hora_salida) return NaN;
        const d = new Date(`${viaje.fecha}T${String(viaje.hora_salida).slice(0, 8)}`);
        return d.getTime();
    }

    function activo(viaje) {
        return !['CONCLUIDO', 'CANCELADO'].includes(String(viaje?.estatus || '').toUpperCase());
    }

    async function cargarDatos() {
        const [viajesRes, estadosRes, telefonosRes, operadoresRes] = await Promise.all([
            supabaseClient.from('viajes').select('id_viaje,eco,operador,destino,municipio,fecha,hora_salida,estatus').in('estatus', ['PENDIENTE','EN RUTA','EN ESPERA']).order('fecha', { ascending: false }),
            supabaseClient.from('monitoreo_alertas').select('id_viaje,tipo,severidad,titulo,mensaje,estado,ciclo_actual,ciclo_atendido,snoozed_until,atendida_at'),
            supabaseClient.from('operador_telefonos').select('operador_id,telefono').eq('activo', true),
            supabaseClient.from('operadores').select('id,nombre')
        ]);
        if (viajesRes.error) throw viajesRes.error;
        if (estadosRes.error) throw estadosRes.error;
        const telefonos = new Map((telefonosRes.data || []).map(x => [String(x.operador_id), normalizarTelefono(x.telefono)]));
        const telefonoPorNombre = new Map((operadoresRes.data || []).map(op => [String(op.nombre || '').trim().toUpperCase(), telefonos.get(String(op.id)) || '']).filter(x => x[0]));
        return { viajes: viajesRes.data || [], estados: new Map((estadosRes.data || []).map(x => [String(x.id_viaje), x])), telefonoPorNombre };
    }

    function distanciaMetros(lat1, lng1, lat2, lng2) {
        const R = 6371000;
        const a1 = Number(lat1) * Math.PI / 180;
        const a2 = Number(lat2) * Math.PI / 180;
        const da = (Number(lat2) - Number(lat1)) * Math.PI / 180;
        const dl = (Number(lng2) - Number(lng1)) * Math.PI / 180;
        const h = Math.sin(da / 2) ** 2 + Math.cos(a1) * Math.cos(a2) * Math.sin(dl / 2) ** 2;
        return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
    }

    async function revisarGeocercas() {
        if (!window.SamsaraUI?.getGpsSnapshot) return;
        try {
            const [{ data: zones, error: zErr }, { data: viajes, error: vErr }, { data: unidades, error: uErr }] = await Promise.all([
                supabaseClient.from('monitoreo_geocercas').select('*').eq('activo', true),
                supabaseClient.from('viajes').select('id_viaje,eco,operador,destino,municipio,estatus').in('estatus', ['PENDIENTE','EN RUTA','EN ESPERA']),
                supabaseClient.from('unidades').select('eco,samsara_vehicle_id').eq('activo', true)
            ]);
            if (zErr || vErr || uErr) return;
            const unitByEco = new Map((unidades || []).map(u => [String(u.eco || '').trim().toUpperCase(), u]));
            const activeTrips = (viajes || []).map(v => ({ ...v, unit: unitByEco.get(String(v.eco || '').trim().toUpperCase()) })).filter(v => v.unit?.samsara_vehicle_id);
            const vehicleIds = activeTrips.map(v => String(v.unit.samsara_vehicle_id));
            if (!vehicleIds.length || !zones?.length) return;
            const gps = await window.SamsaraUI.getGpsSnapshot(vehicleIds);
            for (const zone of zones) {
                const lat = Number(zone.lat), lng = Number(zone.lng), radius = Number(zone.radio_metros || 300);
                if (!Number.isFinite(lat) || !Number.isFinite(lng) || radius <= 0) continue;
                for (const viaje of activeTrips) {
                    const vehicleId = String(viaje.unit.samsara_vehicle_id);
                    const point = gps.get(vehicleId);
                    if (!point || !Number.isFinite(Number(point.latitude)) || !Number.isFinite(Number(point.longitude))) continue;
                    const distance = distanciaMetros(point.latitude, point.longitude, lat, lng);
                    const dentro = distance <= radius;
                    const { data: previo } = await supabaseClient.from('monitoreo_geocerca_estado').select('*').eq('geocerca_id', zone.id).eq('samsara_vehicle_id', vehicleId).maybeSingle();
                    if (!previo) {
                        await supabaseClient.from('monitoreo_geocerca_estado').upsert({ geocerca_id: zone.id, samsara_vehicle_id: vehicleId, dentro, observado_at: new Date().toISOString(), lat: point.latitude, lng: point.longitude }, { onConflict: 'geocerca_id,samsara_vehicle_id' });
                        continue;
                    }
                    const salio = Boolean(previo.dentro) && !dentro && Boolean(zone.alertar_salida);
                    const entro = !Boolean(previo.dentro) && dentro && (Boolean(zone.alertar_entrada) || String(zone.tipo).toUpperCase() === 'LLEGADA');
                    await supabaseClient.from('monitoreo_geocerca_estado').update({ dentro, observado_at: new Date().toISOString(), lat: point.latitude, lng: point.longitude }).eq('id', previo.id);
                    if (salio) await generarAlertaGeocerca(viaje, zone, 'SALIDA', point, distance);
                    if (entro) {
                        await generarAlertaGeocerca(viaje, zone, 'ENTRADA', point, distance);
                        if (String(zone.tipo).toUpperCase() === 'LLEGADA') await concluirViajePorLlegada(viaje, zone, point);
                    }
                }
            }
        } catch (error) {
            console.warn('Geocercas operativas no disponibles:', error?.message || error);
        }
    }

    function obtenerEtiquetasSeguridad(evento) {
        const raw = evento?.behaviorLabels ?? evento?.behaviorLabel ?? evento?.labels ?? evento?.behaviors ?? [];
        const lista = Array.isArray(raw) ? raw : [raw];
        return lista.map(item => {
            if (typeof item === 'string') return item;
            return item?.label || item?.name || item?.behaviorLabel || item?.type || '';
        }).map(x => String(x || '').trim()).filter(Boolean);
    }

    function normalizarEtiquetaSeguridad(value) {
        return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    }

    function severidadSeguridad(etiquetas) {
        const texto = etiquetas.map(normalizarEtiquetaSeguridad).join(' ');
        const alta = [
            'CRASH', 'ROLLOVER', 'SEVERESPEEDING', 'HEAVYSPEEDING',
            'FORWARDCOLLISIONWARNING', 'NEARCOLLISION', 'NEARPEDSTRIANCOLLISION',
            'PANICBUTTON', 'HARSHIMPACT'
        ];
        return alta.some(x => texto.includes(x)) ? 'ALTA' : 'MEDIA';
    }

    function tituloSeguridad(etiquetas) {
        if (!etiquetas.length) return 'EVENTO DE SEGURIDAD SAMSARA';
        const mapa = {
            SEVERESPEEDING: 'EXCESO DE VELOCIDAD SEVERO', HEAVYSPEEDING: 'EXCESO DE VELOCIDAD', SPEEDING: 'EXCESO DE VELOCIDAD',
            CRASH: 'COLISIÓN DETECTADA', ROLLOVER: 'RIESGO DE VOLCADURA', HARSHBRAKING: 'FRENADO BRUSCO',
            HARSHACCELERATION: 'ACELERACIÓN BRUSCA', HARSHCORNERING: 'VUELTA BRUSCA', DISTRACTEDDRIVING: 'DISTRACCIÓN AL CONDUCIR',
            SEATBELT: 'CINTURÓN DE SEGURIDAD', FORWARDCOLLISIONWARNING: 'ADVERTENCIA DE COLISIÓN', NEARCOLLISION: 'CASI COLISIÓN',
            PANICBUTTON: 'BOTÓN DE PÁNICO', HARSHIMPACT: 'IMPACTO BRUSCO'
        };
        const texto = etiquetas.map(x => mapa[normalizarEtiquetaSeguridad(x)] || String(x).replace(/_/g, ' ')).join(' · ');
        return `SAMSARA · ${texto.toUpperCase()}`;
    }

    function fechaEventoSamsara(evento) {
        const candidatos = [evento?.startMs, evento?.startTime, evento?.createdAtTime, evento?.updatedAtTime, evento?.detectedAtTime];
        for (const value of candidatos) {
            if (value == null || value === '') continue;
            const n = Number(value);
            if (Number.isFinite(n) && n > 100000000000) return new Date(n).getTime();
            const d = new Date(value).getTime();
            if (Number.isFinite(d)) return d;
        }
        return Date.now();
    }

    function assetIdSamsara(evento) {
        return String(
            evento?.asset?.id || evento?.assetId || evento?.vehicle?.id || evento?.vehicleId || ''
        );
    }

    function nombreAssetSamsara(evento) {
        return String(
            evento?.asset?.name || evento?.vehicle?.name || evento?.assetName || evento?.vehicleName || ''
        ).trim();
    }

    function idEventoSamsara(evento, assetId, etiquetas, timestamp) {
        return String(
            evento?.id || evento?.eventId || evento?.safetyEventId ||
            `${assetId || nombreAssetSamsara(evento) || 'ASSET'}-${timestamp}-${etiquetas.join('-')}`
        );
    }

    async function revisarSamsaraSeguridad(forzada = false) {
        if (!window.SamsaraUI?.getSafetyEvents) return;
        try {
            const [{ viajes, telefonoPorNombre }, { data: unidades, error: uErr }] = await Promise.all([
                cargarDatos(),
                supabaseClient.from('unidades').select('id,eco,samsara_vehicle_id,activo').eq('activo', true)
            ]);
            if (uErr) return;

            const activas = (unidades || []).filter(u => u.samsara_vehicle_id);
            const assetIds = activas.map(u => String(u.samsara_vehicle_id));
            if (!assetIds.length) {
                primeraRevisionSamsara = false;
                return;
            }

            // Ventana solapada de 10 minutos para no perder eventos entre revisiones.
            const endTime = new Date().toISOString();
            const startTime = new Date(Date.now() - 10 * 60 * 1000).toISOString();
            const result = await window.SamsaraUI.getSafetyEvents({
                startTime,
                endTime,
                assetIds: assetIds.join(','),
                includeAsset: 'true',
                includeDriver: 'true',
                includeVgOnlyEvents: 'true',
                queryByTimeField: 'createdAtTime'
            });
            const eventos = Array.isArray(result?.events) ? result.events : [];
            const statusEl = $('smtSamsaraSafetyStatus');
            if (statusEl) statusEl.textContent = `● SAMSARA SEGURIDAD EN VIVO · ${eventos.length} EVENTOS RECIENTES · GEOCERCAS 15 S`;
            if (!eventos.length) {
                primeraRevisionSamsara = false;
                return;
            }

            const unidadPorVehiculo = new Map(activas.map(u => [String(u.samsara_vehicle_id), u]));
            const viajePorEco = new Map((viajes || []).map(v => [String(v.eco || '').trim().toUpperCase(), v]));
            const nuevas = [];

            for (const evento of eventos) {
                const etiquetas = obtenerEtiquetasSeguridad(evento);
                const assetId = assetIdSamsara(evento);
                const unidad = unidadPorVehiculo.get(assetId);
                const eco = unidad?.eco || nombreAssetSamsara(evento) || 'UNIDAD SAMSARA';
                const viaje = viajePorEco.get(String(eco).trim().toUpperCase()) || null;
                const timestamp = fechaEventoSamsara(evento);
                const eventId = idEventoSamsara(evento, assetId, etiquetas, timestamp);
                const idViaje = `SAMSARA_EVENT:${eventId}`;
                const severidad = severidadSeguridad(etiquetas);
                const titulo = tituloSeguridad(etiquetas);
                const driver = String(evento?.driver?.name || evento?.driverName || viaje?.operador || 'SIN CONDUCTOR').trim();
                const descripcion = etiquetas.length
                    ? etiquetas.join(', ')
                    : 'Samsara reportó un evento de seguridad.';
                const lugar = evento?.location?.formattedAddress || evento?.gps?.reverseGeo?.formattedLocation || '';
                const horaEvento = new Date(timestamp).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
                const mensaje = `${eco} · ${driver}. ${descripcion}. Evento: ${horaEvento}.${lugar ? ` Ubicación: ${lugar}.` : ''}`;
                const ahora = new Date().toISOString();

                const { error } = await supabaseClient.from('monitoreo_alertas').upsert({
                    id_viaje: idViaje,
                    tipo: 'SAMSARA_SEGURIDAD',
                    severidad,
                    titulo,
                    mensaje,
                    estado: 'PENDIENTE',
                    ciclo_actual: timestamp,
                    ciclo_atendido: 0,
                    snoozed_until: null,
                    atendida_at: null,
                    ultima_generada_at: ahora,
                    updated_at: ahora
                }, { onConflict: 'id_viaje' });
                if (error) continue;

                await supabaseClient.from('monitoreo_alertas_eventos').upsert({
                    id_viaje: idViaje,
                    tipo: 'SAMSARA_SEGURIDAD',
                    ciclo: timestamp,
                    severidad,
                    titulo,
                    mensaje,
                    generado_at: ahora,
                    metadata: {
                        samsara_event_id: eventId,
                        samsara_asset_id: assetId || null,
                        eco,
                        driver,
                        behavior_labels: etiquetas,
                        location: lugar || null
                    }
                }, { onConflict: 'id_viaje,tipo,ciclo' });

                nuevas.push({
                    id_viaje: idViaje,
                    ciclo: timestamp,
                    timestamp,
                    severidad,
                    tipo: 'SAMSARA_SEGURIDAD',
                    titulo,
                    mensaje,
                    viaje: viaje || { eco, operador: driver, destino: 'EVENTO SAMSARA' },
                    telefono: viaje ? (telefonoPorNombre.get(String(viaje.operador || '').trim().toUpperCase()) || '') : ''
                });
            }

            if (nuevas.length) {
                const existentes = new Set(alertas.map(a => `${a.id_viaje}:${a.ciclo}`));
                const realmenteNuevas = nuevas.filter(a => !existentes.has(`${a.id_viaje}:${a.ciclo}`));
                if (!primeraRevisionSamsara && realmenteNuevas.length && !forzada) {
                    mostrarToast(realmenteNuevas[0]);
                }
                await revisar(true);
            }
            primeraRevisionSamsara = false;
        } catch (error) {
            // Si el token no tiene "Read Safety Events & Scores", no se rompe el monitoreo:
            // el resto de alertas continúa funcionando normalmente.
            console.warn('Alertas de seguridad Samsara no disponibles:', error?.message || error);
            const statusEl = $('smtSamsaraSafetyStatus');
            if (statusEl) statusEl.textContent = '● SAMSARA SEGURIDAD · REQUIERE PERMISO READ SAFETY EVENTS & SCORES';
            primeraRevisionSamsara = false;
        }
    }

    async function revisarSaludGpsSamsara(forzada = false) {
        const ahoraMs = Date.now();
        if (!forzada && ahoraMs - ultimoChequeoGps < 45000) return;
        ultimoChequeoGps = ahoraMs;
        if (!window.SamsaraUI?.getGpsSnapshot) return;
        try {
            const { data: unidades, error } = await supabaseClient
                .from('unidades')
                .select('id,eco,samsara_vehicle_id,activo')
                .eq('activo', true);
            if (error) return;
            const activas = (unidades || []).filter(u => u.samsara_vehicle_id);
            if (!activas.length) return;
            const ids = activas.map(u => String(u.samsara_vehicle_id));
            const gps = await window.SamsaraUI.getGpsSnapshot(ids);
            const limiteMs = 10 * 60 * 1000;
            const ahora = new Date().toISOString();
            const alertasGps = [];

            for (const unidad of activas) {
                const vehicleId = String(unidad.samsara_vehicle_id);
                const point = gps.get(vehicleId);
                let edad = Infinity;
                let ultima = null;
                if (point?.time) {
                    const t = new Date(point.time).getTime();
                    if (Number.isFinite(t)) {
                        edad = Math.max(0, ahoraMs - t);
                        ultima = point.time;
                    }
                }
                const idViaje = `SAMSARA_GPS:${vehicleId}`;
                const demasiadoAntiguo = !point || !Number.isFinite(edad) || edad > limiteMs;
                if (!demasiadoAntiguo) {
                    // Si la unidad recuperó comunicación, cerrar la alerta de salud pendiente.
                    await supabaseClient.from('monitoreo_alertas').update({
                        estado: 'RESUELTA', atendida_at: ahora, updated_at: ahora
                    }).eq('id_viaje', idViaje).eq('estado', 'PENDIENTE');
                    continue;
                }
                const minutos = Number.isFinite(edad) ? Math.max(1, Math.floor(edad / 60000)) : null;
                const mensaje = `${unidad.eco || 'UNIDAD'} no reporta una posición GPS reciente${minutos ? ` desde hace ${minutos} min` : ''}. Revisa comunicación, GPS y alimentación del equipo Samsara.${ultima ? ` Último dato: ${new Date(ultima).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}.` : ''}`;
                const payload = {
                    id_viaje: idViaje,
                    tipo: 'SAMSARA_GPS',
                    severidad: 'ALTA',
                    titulo: 'SIN ACTUALIZACIÓN GPS',
                    mensaje,
                    estado: 'PENDIENTE',
                    ciclo_actual: Math.floor(ahoraMs / 60000),
                    ciclo_atendido: 0,
                    snoozed_until: null,
                    atendida_at: null,
                    ultima_generada_at: ahora,
                    updated_at: ahora
                };
                const { error: upsertError } = await supabaseClient.from('monitoreo_alertas').upsert(payload, { onConflict: 'id_viaje' });
                if (!upsertError) {
                    await supabaseClient.from('monitoreo_alertas_eventos').upsert({
                        id_viaje: idViaje,
                        tipo: 'SAMSARA_GPS',
                        ciclo: payload.ciclo_actual,
                        severidad: 'ALTA',
                        titulo: payload.titulo,
                        mensaje,
                        generado_at: ahora,
                        metadata: { samsara_asset_id: vehicleId, eco: unidad.eco || null, last_gps_time: ultima, age_minutes: minutos }
                    }, { onConflict: 'id_viaje,tipo,ciclo' });
                    alertasGps.push({ eco: unidad.eco || 'UNIDAD' });
                }
            }
            const statusEl = $('smtSamsaraSafetyStatus');
            const salud = alertasGps.length ? ` · GPS CON ${alertasGps.length} INCIDENCIA${alertasGps.length === 1 ? '' : 'S'}` : ' · GPS OK';
            const configs = samsaraConfigCount == null ? '' : ` · CONFIG ${samsaraConfigCount}`;
            if (statusEl) statusEl.textContent = `● SAMSARA ACTIVO · SEGURIDAD · GEOCERCAS 15 S${salud}${configs}`;
            await revisar(true);
        } catch (error) {
            console.warn('Salud GPS Samsara no disponible:', error?.message || error);
        }
    }

    async function revisarConfiguracionesSamsara() {
        if (!window.SamsaraUI?.getAlertConfigurations) return;
        try {
            const result = await window.SamsaraUI.getAlertConfigurations({ status: 'enabled' });
            samsaraConfigCount = Array.isArray(result?.configurations) ? result.configurations.length : 0;
            const statusEl = $('smtSamsaraSafetyStatus');
            if (statusEl) statusEl.textContent = `● SAMSARA ACTIVO · SEGURIDAD · GPS · GEOCERCAS 15 S · CONFIG ${samsaraConfigCount}`;
        } catch (error) {
            console.warn('Configuraciones de alertas Samsara no disponibles:', error?.message || error);
        }
    }

    async function concluirViajePorLlegada(viaje, zone, point) {
        const now = new Date();
        const fechaFinal = now.toISOString().slice(0, 10);
        const horaFinal = now.toTimeString().slice(0, 8);
        const { data: actual } = await supabaseClient.from('viajes').select('estatus,fecha,hora_salida').eq('id_viaje', String(viaje.id_viaje)).maybeSingle();
        if (!actual || ['CONCLUIDO','CANCELADO'].includes(String(actual.estatus || '').toUpperCase())) return;
        const { error } = await supabaseClient.from('viajes').update({ estatus: 'CONCLUIDO', fecha_final: fechaFinal, hora_final: horaFinal, updated_at: now.toISOString() }).eq('id_viaje', String(viaje.id_viaje));
        if (error) { console.warn('No se pudo concluir automáticamente:', error.message); return; }
        await supabaseClient.from('viaje_monitoreo').upsert({
            id_viaje: String(viaje.id_viaje),
            samsara_vehicle_id: String(viaje.unit?.samsara_vehicle_id || ''),
            llegada_detectada_at: now.toISOString(),
            auto_concluido: true,
            recorrido_inicio: actual.fecha && actual.hora_salida ? new Date(`${actual.fecha}T${String(actual.hora_salida).slice(0,8)}`).toISOString() : null,
            recorrido_fin: now.toISOString(),
            analisis_estado: 'PROCESANDO',
            analisis_mensaje: `Llegada detectada en ${zone.nombre}.`
        }, { onConflict: 'id_viaje' });
        mostrarToastSimple('VIAJE CONCLUIDO AUTOMÁTICAMENTE', `${viaje.eco || 'UNIDAD'} llegó a ${zone.nombre}.`);
        await analizarRecorridoViaje(viaje, actual, now, zone);
    }

    async function analizarRecorridoViaje(viaje, actual, finDate, zone) {
        const vehicleId = String(viaje.unit?.samsara_vehicle_id || '');
        if (!vehicleId || !window.SamsaraUI?.getGpsHistory) return;
        try {
            const inicio = actual.fecha && actual.hora_salida ? new Date(`${actual.fecha}T${String(actual.hora_salida).slice(0,8)}`) : new Date(finDate.getTime() - 12 * 3600000);
            const puntos = await window.SamsaraUI.getGpsHistory(vehicleId, inicio.toISOString(), finDate.toISOString());
            if (!puntos.length) return;
            let distancia = 0, maxMph = 0, speedSum = 0, speedCount = 0;
            for (let i=1;i<puntos.length;i++) {
                distancia += distanciaMetros(puntos[i-1].latitude,puntos[i-1].longitude,puntos[i].latitude,puntos[i].longitude);
            }
            for (const p of puntos) { const sp=Number(p.speed); if(Number.isFinite(sp)){ maxMph=Math.max(maxMph,sp); speedSum+=sp; speedCount++; } }
            const resumen = { inicio: inicio.toISOString(), fin: finDate.toISOString(), llegada_geocerca: zone.nombre, puntos: puntos.length };
            const { data: cat } = await supabaseClient.from('casetas_catalogo').select('*').eq('activo', true).not('lat','is',null).not('lng','is',null);
            const detectadas = [];
            for (const caseta of cat || []) {
                let first = null, best = Infinity;
                for (const pt of puntos) {
                    const d = distanciaMetros(pt.latitude, pt.longitude, caseta.lat, caseta.lng);
                    if (d <= Number(caseta.radio_metros || 180)) { if (!first) first = pt; best = Math.min(best,d); }
                }
                if (first) detectadas.push({ caseta, point:first, distancia:best });
            }
            detectadas.sort((a,b)=>new Date(a.point.time||0)-new Date(b.point.time||0));
            await supabaseClient.from('viaje_monitoreo').upsert({ id_viaje:String(viaje.id_viaje), samsara_vehicle_id:vehicleId, llegada_detectada_at:finDate.toISOString(), auto_concluido:true, recorrido_inicio:inicio.toISOString(), recorrido_fin:finDate.toISOString(), distancia_metros:distancia, puntos_recorrido:puntos.length, casetas_detectadas:detectadas.length, analisis_estado:'COMPLETADO', analisis_mensaje:`${detectadas.length} casetas detectadas por proximidad.`, resumen_recorrido:resumen, updated_at:new Date().toISOString() }, { onConflict:'id_viaje' });
            await supabaseClient.from('viaje_recorrido_resumen').insert({ id_viaje:String(viaje.id_viaje), samsara_vehicle_id:vehicleId, inicio:inicio.toISOString(), fin:finDate.toISOString(), distancia_metros:distancia, puntos:puntos.length, velocidad_max_mph:maxMph, velocidad_promedio_mph:speedCount ? speedSum/speedCount : null, resumen });
            if (detectadas.length) {
                const rows = detectadas.map((d,i)=>({ id_viaje:String(viaje.id_viaje), caseta_id:d.caseta.id, orden:i+1, detectada_at:d.point.time || finDate.toISOString(), distancia_metros:d.distancia, confianza:Math.max(0,Math.min(100,100-(d.distancia/Number(d.caseta.radio_metros||180))*100)) }));
                await supabaseClient.from('viaje_casetas_detectadas').upsert(rows, { onConflict:'id_viaje,caseta_id' });
                const { count } = await supabaseClient.from('casetas').select('id', { count:'exact', head:true }).eq('viaje_id', (await supabaseClient.from('viajes').select('id').eq('id_viaje',String(viaje.id_viaje)).maybeSingle()).data?.id);
                if (!count) {
                    const viajeRow = (await supabaseClient.from('viajes').select('id').eq('id_viaje',String(viaje.id_viaje)).maybeSingle()).data;
                    if (viajeRow) await supabaseClient.from('casetas').insert(detectadas.map((d,i)=>({ viaje_id:viajeRow.id, nombre:d.caseta.nombre, costo:Number(d.caseta.costo||0), orden:i+1 })));
                }
            }
        } catch (error) {
            console.warn('Análisis de recorrido no disponible:', error?.message || error);
            await supabaseClient.from('viaje_monitoreo').upsert({ id_viaje:String(viaje.id_viaje), analisis_estado:'ERROR', analisis_mensaje:error?.message || 'Error de análisis', updated_at:new Date().toISOString() }, { onConflict:'id_viaje' });
        }
    }

    async function generarAlertaGeocerca(viaje, zone, evento, point, distance) {
        const tipo = evento === 'SALIDA' ? 'SALIDA_GEOCERCA' : 'ENTRADA_GEOCERCA';
        const severidad = evento === 'SALIDA' ? 'ALTA' : 'MEDIA';
        const titulo = evento === 'SALIDA' ? 'SALIDA DE GEOCERCA' : 'ENTRADA A GEOCERCA';
        const mensaje = `${viaje.eco || 'UNIDAD'} ${evento === 'SALIDA' ? 'salió de' : 'entró a'} ${zone.nombre}. Distancia al centro: ${Math.round(distance)} m.`;
        const ahora = new Date().toISOString();
        const payload = { id_viaje: String(viaje.id_viaje), tipo, severidad, titulo, mensaje, estado: 'PENDIENTE', ciclo_actual: 0, ciclo_atendido: 0, snoozed_until: null, atendida_at: null, ultima_generada_at: ahora, updated_at: ahora };
        const { error } = await supabaseClient.from('monitoreo_alertas').upsert(payload, { onConflict: 'id_viaje' });
        if (error) { console.warn('No se pudo guardar alerta de geocerca:', error.message); return; }
        await supabaseClient.from('monitoreo_alertas_eventos').insert({
            id_viaje: String(viaje.id_viaje), tipo, ciclo: Date.now(), severidad, titulo, mensaje, generado_at: ahora,
            metadata: { eco: viaje.eco, operador: viaje.operador, geocerca: zone.nombre, geocerca_id: zone.id, evento, latitude: point.latitude, longitude: point.longitude, distancia_metros: distance }
        });
        mostrarToastSimple(titulo, `${viaje.eco || 'UNIDAD'} · ${zone.nombre}`);
        await revisar(true);
    }

    async function sincronizarGeocercas() {
        const button = $('smtAlertasSyncGeofences');
        if (button) { button.disabled = true; button.textContent = 'SINCRONIZANDO…'; }
        try {
            if (!window.SamsaraUI?.syncOperationalGeofences) throw new Error('La integración Samsara no está disponible.');
            const result = await window.SamsaraUI.syncOperationalGeofences();
            mostrarToastSimple('Zonas sincronizadas', `${result.updated} geocercas vinculadas con Samsara.`);
            await revisarGeocercas();
        } catch (error) {
            mostrarToastSimple('No se pudieron sincronizar las zonas', error?.message || 'Revisa la configuración.');
        } finally {
            if (button) { button.disabled = false; button.textContent = 'SINCRONIZAR ZONAS'; }
        }
    }

    async function revisar(forzada = false) {
        if (revisionEnCurso) return;
        revisionEnCurso = true;
        try {
            const datos = await cargarDatos();
            const ahora = Date.now();
            const antes = new Set(alertas.map(a => `${a.id_viaje}:${a.ciclo}`));
            const pendientes = [];

            for (const viaje of datos.viajes.filter(activo)) {
                const salida = fechaHoraSalidaMs(viaje);
                if (!Number.isFinite(salida) || ahora < salida + INTERVALO_SEGUIMIENTO_MS) continue;

                const ciclo = Math.floor((ahora - salida) / INTERVALO_SEGUIMIENTO_MS);
                const estado = datos.estados.get(String(viaje.id_viaje));
                const necesitaNueva = !estado || Number(estado.ciclo_actual || 0) !== ciclo;

                if (necesitaNueva) {
                    await generarAlerta(viaje, ciclo);
                }

                const actualizado = necesitaNueva ? { ...(estado || {}), ciclo_actual: ciclo, ciclo_atendido: 0, estado: 'PENDIENTE', snoozed_until: null, severidad: 'MEDIA', tipo: 'SEGUIMIENTO_3H' } : estado;
                if (!actualizado) continue;

                const pospuestaHasta = actualizado.snoozed_until ? new Date(actualizado.snoozed_until).getTime() : 0;
                const atendida = Number(actualizado.ciclo_atendido || 0) === ciclo && String(actualizado.estado || '').toUpperCase() === 'ATENDIDA';
                if (atendida || (pospuestaHasta && ahora < pospuestaHasta)) continue;

                const telefono = datos.telefonoPorNombre.get(String(viaje.operador || '').trim().toUpperCase()) || '';
                pendientes.push(construirAlerta(viaje, actualizado, ciclo, telefono));
            }

            // Las alertas nativas de Samsara no pertenecen necesariamente a un viaje,
            // por eso se conservan como alertas independientes del ciclo de 3 horas.
            for (const estado of datos.estados.values()) {
                if (!['SAMSARA_SEGURIDAD','SAMSARA_GPS'].includes(String(estado.tipo || '').toUpperCase())) continue;
                if (String(estado.estado || '').toUpperCase() !== 'PENDIENTE') continue;
                const pospuestaHasta = estado.snoozed_until ? new Date(estado.snoozed_until).getTime() : 0;
                if (pospuestaHasta && ahora < pospuestaHasta) continue;
                const marca = Number(estado.ciclo_actual || new Date(estado.ultima_generada_at || estado.updated_at || Date.now()).getTime());
                const mensaje = String(estado.mensaje || 'Evento de seguridad Samsara.');
                const eco = mensaje.split(' · ')[0] || 'UNIDAD SAMSARA';
                pendientes.push({
                    id_viaje: String(estado.id_viaje),
                    ciclo: marca,
                    timestamp: marca,
                    severidad: estado.severidad || 'MEDIA',
                    tipo: 'SAMSARA_SEGURIDAD',
                    titulo: estado.titulo || 'EVENTO DE SEGURIDAD SAMSARA',
                    mensaje,
                    viaje: { eco, operador: 'SAMSARA', destino: 'EVENTO DE SEGURIDAD' },
                    telefono: ''
                });
            }

            const nuevas = pendientes.filter(a => !antes.has(`${a.id_viaje}:${a.ciclo}`));
            alertas = pendientes.sort((a, b) => b.timestamp - a.timestamp);
            actualizarBadge();
            renderizar();

            if (!primeraRevision && nuevas.length && !forzada) mostrarToast(nuevas[0]);
            primeraRevision = false;
        } catch (error) {
            console.warn('Centro de alertas no disponible:', error?.message || error);
        } finally {
            revisionEnCurso = false;
        }
    }


    async function generarAlerta(viaje, ciclo) {
        const titulo = 'SEGUIMIENTO OPERATIVO';
        const mensaje = `${viaje.eco || 'UNIDAD'} lleva ${ciclo * 3} h o más desde su salida. Se requiere seguimiento del viaje.`;
        const ahora = new Date().toISOString();
        const payload = {
            id_viaje: String(viaje.id_viaje),
            tipo: 'SEGUIMIENTO_3H',
            severidad: 'MEDIA',
            titulo,
            mensaje,
            estado: 'PENDIENTE',
            ciclo_actual: ciclo,
            ciclo_atendido: 0,
            snoozed_until: null,
            atendida_at: null,
            ultima_generada_at: ahora,
            updated_at: ahora
        };
        const { error } = await supabaseClient.from('monitoreo_alertas').upsert(payload, { onConflict: 'id_viaje' });
        if (error) throw error;

        const evento = {
            id_viaje: String(viaje.id_viaje),
            tipo: 'SEGUIMIENTO_3H',
            ciclo,
            severidad: 'MEDIA',
            titulo,
            mensaje,
            generado_at: ahora,
            metadata: {
                eco: viaje.eco || null,
                operador: viaje.operador || null,
                destino: viaje.destino || null,
                municipio: viaje.municipio || null
            }
        };
        const { error: eventoError } = await supabaseClient.from('monitoreo_alertas_eventos').upsert(evento, { onConflict: 'id_viaje,tipo,ciclo' });
        if (eventoError) console.warn('No se pudo guardar historial de alerta:', eventoError.message);
    }

    function construirAlerta(viaje, estado, ciclo, telefono) {
        const salida = fechaHoraSalidaMs(viaje);
        return {
            id_viaje: String(viaje.id_viaje),
            ciclo,
            timestamp: Number.isFinite(salida) ? salida : Date.now(),
            severidad: estado.severidad || 'MEDIA',
            tipo: estado.tipo || 'SEGUIMIENTO_3H',
            titulo: estado.titulo || 'SEGUIMIENTO OPERATIVO',
            mensaje: estado.mensaje || 'Requiere seguimiento operativo.',
            viaje,
            telefono
        };
    }

    function actualizarBadge() {
        const badge = $('smtAlertasBadge');
        if (!badge) return;
        badge.textContent = String(alertas.length);
        badge.hidden = alertas.length === 0;
        $('smtAlertasSummary').textContent = `${alertas.length} ${alertas.length === 1 ? 'pendiente' : 'pendientes'}`;
    }

    function renderizar() {
        const lista = $('smtAlertasList');
        if (!lista) return;
        const visibles = filtro === 'TODAS' ? alertas : alertas.filter(a => a.severidad === filtro);
        if (!visibles.length) {
            lista.innerHTML = '<div class="smt-alertas-empty"><span>✓</span><strong>TODO EN ORDEN</strong><small>No hay alertas pendientes con este filtro.</small></div>';
            return;
        }
        lista.innerHTML = visibles.map(a => {
            const v = a.viaje || {};
            const wa = a.telefono ? `<a class="btn btn-whatsapp" href="https://wa.me/${escapeHtml(a.telefono)}" target="_blank" rel="noopener noreferrer" data-alert-action="whatsapp" data-id-viaje="${escapeHtml(a.id_viaje)}">WHATSAPP</a>` : '';
            return `<article class="smt-alert-card smt-severity-${String(a.severidad).toLowerCase()}" data-id-viaje="${escapeHtml(a.id_viaje)}">
                <div class="smt-alert-card-main">
                    <div class="smt-alert-meta"><span>${escapeHtml(a.severidad)}</span><span>·</span><span>${escapeHtml(a.tipo === 'SAMSARA_SEGURIDAD' ? 'SAMSARA · SEGURIDAD' : (a.tipo === 'SAMSARA_GPS' ? 'SAMSARA · GPS' : a.tipo))}</span><span>·</span><span>${a.tipo === 'SAMSARA_SEGURIDAD' ? 'EVENTO EN VIVO' : (a.tipo === 'SAMSARA_GPS' ? 'SALUD GPS' : `CICLO ${escapeHtml(a.ciclo)}`)}</span></div>
                    <h3>${escapeHtml(a.titulo)}</h3>
                    <p>${escapeHtml(a.mensaje)}</p>
                    <div class="smt-alert-context"><b>${escapeHtml(v.eco || '—')}</b><span>${escapeHtml(v.operador || 'SIN OPERADOR')}</span><span>→ ${escapeHtml(v.destino || 'SIN DESTINO')}</span></div>
                </div>
                <div class="smt-alert-card-actions">
                    ${wa}
                    <button type="button" class="btn btn-secondary" data-alert-action="snooze" data-id-viaje="${escapeHtml(a.id_viaje)}">POSPONER 30 MIN</button>
                    <button type="button" class="btn btn-primary" data-alert-action="ack" data-id-viaje="${escapeHtml(a.id_viaje)}">ATENDER</button>
                </div>
            </article>`;
        }).join('');
    }

    async function manejarAccion(event) {
        const control = event.target.closest('[data-alert-action]');
        if (!control) return;
        const id = control.dataset.idViaje;
        const accion = control.dataset.alertAction;
        if (!id) return;

        if (accion === 'whatsapp') {
            setTimeout(() => atender(id, true), 150);
            return;
        }
        if (accion === 'snooze') await posponer(id);
        if (accion === 'ack') await atender(id, false);
    }

    async function obtenerUsuarioId() {
        try {
            const { data } = await supabaseClient.auth.getUser();
            return data?.user?.id || null;
        } catch (_) { return null; }
    }

    async function atender(idViaje, desdeWhatsapp) {
        const item = alertas.find(a => String(a.id_viaje) === String(idViaje));
        if (!item) return;
        const ahora = new Date().toISOString();
        const usuario = await obtenerUsuarioId();
        const { error } = await supabaseClient.from('monitoreo_alertas').update({
            estado: 'ATENDIDA',
            ciclo_atendido: item.ciclo,
            atendida_at: ahora,
            atendida_por: usuario,
            snoozed_until: null,
            updated_at: ahora
        }).eq('id_viaje', String(idViaje));
        if (error) {
            console.error(error);
            return;
        }
        await supabaseClient.from('monitoreo_alertas_eventos')
            .update({ atendida_at: ahora, atendida_por: usuario })
            .eq('id_viaje', String(idViaje)).eq('tipo', item.tipo).eq('ciclo', item.ciclo);
        alertas = alertas.filter(a => String(a.id_viaje) !== String(idViaje));
        actualizarBadge();
        renderizar();
        if (!desdeWhatsapp) mostrarToastSimple('Alerta atendida', 'El seguimiento quedó registrado.');
    }

    async function posponer(idViaje) {
        const item = alertas.find(a => String(a.id_viaje) === String(idViaje));
        if (!item) return;
        const hasta = new Date(Date.now() + 30 * 60 * 1000).toISOString();
        const { error } = await supabaseClient.from('monitoreo_alertas').update({
            estado: 'POSPUESTA',
            snoozed_until: hasta,
            updated_at: new Date().toISOString()
        }).eq('id_viaje', String(idViaje));
        if (error) {
            console.error(error);
            return;
        }
        alertas = alertas.filter(a => String(a.id_viaje) !== String(idViaje));
        actualizarBadge();
        renderizar();
        mostrarToastSimple('Alerta pospuesta', 'Volverá al centro de alertas en 30 minutos.');
    }

    function abrir() {
        const modal = $('smtAlertasModal');
        if (!modal) return;
        modal.style.display = 'flex';
        modal.setAttribute('aria-hidden', 'false');
        renderizar();
    }

    function cerrar() {
        const modal = $('smtAlertasModal');
        if (!modal) return;
        modal.style.display = 'none';
        modal.setAttribute('aria-hidden', 'true');
    }

    function mostrarToast(alerta) {
        mostrarToastSimple(alerta.titulo, `${alerta.viaje?.eco || 'UNIDAD'} · ${alerta.viaje?.operador || 'SIN OPERADOR'}`);
    }

    function mostrarToastSimple(titulo, mensaje) {
        const toast = $('smtAlertasToast');
        if (!toast) return;
        $('smtToastTitle').textContent = titulo;
        $('smtToastMessage').textContent = mensaje;
        toast.classList.add('visible');
        clearTimeout(mostrarToastSimple.timer);
        mostrarToastSimple.timer = setTimeout(() => toast.classList.remove('visible'), 5500);
    }
})();
