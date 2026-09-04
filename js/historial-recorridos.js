// ============================================================
// SISTEMA MONITOREO TAG - HISTORIAL DE RECORRIDOS V36
// Carga la línea real de Samsara para los viajes que coinciden
// con los filtros seleccionados en CONCLUIDOS.
// ============================================================
(function () {
    "use strict";

    const $ = id => document.getElementById(id);
    let map = null;
    let layers = [];
    let markersLayer = null;
    let unidades = [];
    let viajesActuales = [];
    let cargando = false;

    const lineStyles = [
        { weight: 6, opacity: .92 },
        { weight: 5, opacity: .88, dashArray: "1 9", lineCap: "round" },
        { weight: 5, opacity: .82, dashArray: "10 7" },
        { weight: 4, opacity: .86 },
        { weight: 5, opacity: .80, dashArray: "4 8" },
        { weight: 4, opacity: .84, dashArray: "14 6 2 6" }
    ];

    function escapeHtml(value) {
        const div = document.createElement("div");
        div.textContent = String(value ?? "");
        return div.innerHTML;
    }

    function fechaHora(viaje, final = false) {
        const fecha = final ? viaje.fecha_final : viaje.fecha;
        const hora = final ? viaje.hora_final : viaje.hora_salida;
        if (!fecha || !hora) return null;
        const d = new Date(`${fecha}T${String(hora).slice(0, 8)}`);
        return Number.isFinite(d.getTime()) ? d : null;
    }

    async function cargarUnidades() {
        if (unidades.length) return unidades;
        const { data, error } = await window.supabaseClient
            .from("unidades")
            .select("id,eco,samsara_vehicle_id,activo")
            .not("samsara_vehicle_id", "is", null);
        if (error) throw error;
        unidades = data || [];
        return unidades;
    }

    function obtenerVehiculoId(viaje) {
        const unit = unidades.find(u => String(u.eco || "").trim().toUpperCase() === String(viaje.eco || "").trim().toUpperCase());
        return unit?.samsara_vehicle_id ? String(unit.samsara_vehicle_id) : null;
    }

    function inicializarMapa() {
        if (map || !window.L) return;
        const el = $("historialRecorridosMapa");
        if (!el) return;
        map = L.map(el, { zoomControl: true, attributionControl: true, preferCanvas: true, minZoom: 2, maxZoom: 22 });
        const calle = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            minZoom: 2, maxZoom: 22, maxNativeZoom: 19,
            attribution: "© OpenStreetMap contributors"
        });
        const satelite = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
            minZoom: 2, maxZoom: 22, maxNativeZoom: 19,
            attribution: "Tiles © Esri"
        });
        const transporte = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}", {
            minZoom: 2, maxZoom: 22, maxNativeZoom: 18,
            attribution: "Transporte © Esri"
        });
        const etiquetas = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}", {
            minZoom: 2, maxZoom: 22, maxNativeZoom: 18,
            attribution: "Límites y lugares © Esri"
        });
        const state = { mode: "hybrid", mapLayer: calle, satelliteLayer: satelite, transportLayer: transporte, labelsLayer: etiquetas };
        satelite.addTo(map);
        transporte.addTo(map);
        etiquetas.addTo(map);
        const control = L.control({ position: "topright" });
        control.onAdd = function () {
            const button = L.DomUtil.create("button", "historial-basemap-toggle");
            button.type = "button";
            button.textContent = "";
            button.title = "Cambiar a mapa normal";
            button.setAttribute("aria-label", button.title);
            L.DomEvent.disableClickPropagation(button);
            L.DomEvent.on(button, "click", () => {
                state.mode = state.mode === "hybrid" ? "normal" : "hybrid";
                [state.mapLayer, state.satelliteLayer, state.transportLayer, state.labelsLayer].forEach(layer => { if (map.hasLayer(layer)) map.removeLayer(layer); });
                if (state.mode === "hybrid") {
                    state.satelliteLayer.addTo(map);
                    state.transportLayer.addTo(map);
                    state.labelsLayer.addTo(map);
                    button.textContent = "";
                    button.title = "Cambiar a mapa normal";
                } else {
                    state.mapLayer.addTo(map);
                    button.textContent = "";
                    button.title = "Cambiar a mapa híbrido";
                }
                button.setAttribute("aria-label", button.title);
                button.classList.toggle("is-satellite", state.mode === "hybrid");
            });
            return button;
        };
        control.addTo(map);
        markersLayer = L.layerGroup().addTo(map);
        map.setView([19.4326, -99.1332], 6);
    }

    function limpiarMapa() {
        layers.forEach(layer => { try { map.removeLayer(layer); } catch (_) {} });
        layers = [];
        markersLayer?.clearLayers();
    }

    function markerIcon(tipo) {
        const cls = tipo === "inicio" ? "route-start" : tipo === "fin" ? "route-end" : "route-caseta";
        return L.divIcon({ className: "smt-route-marker-wrap", html: `<span class="smt-route-marker ${cls}"></span>`, iconSize: [18, 18], iconAnchor: [9, 9] });
    }

    async function cargarViaje(viaje, index) {
        const vehicleId = obtenerVehiculoId(viaje);
        if (!vehicleId) return { viaje, points: [], error: "ECO sin vehículo Samsara vinculado" };
        const inicio = fechaHora(viaje, false);
        const fin = fechaHora(viaje, true) || new Date();
        if (!inicio || !fin || fin <= inicio) return { viaje, points: [], error: "Rango de fechas inválido" };
        try {
            const points = await window.SamsaraUI.getGpsHistory(vehicleId, inicio.toISOString(), fin.toISOString());
            return { viaje, points, vehicleId, inicio, fin, index };
        } catch (error) {
            return { viaje, points: [], vehicleId, inicio, fin, index, error: error?.message || "No se pudo consultar Samsara" };
        }
    }

    function pintarRecorrido(item) {
        if (!item.points?.length) return;
        const latLngs = item.points.map(p => [p.latitude, p.longitude]);
        const style = lineStyles[item.index % lineStyles.length];
        const line = L.polyline(latLngs, style).addTo(map);
        line.bindTooltip(`${item.viaje.eco || "ECO"} · ${item.viaje.id_viaje || "VIAJE"}`, { sticky: true });
        layers.push(line);

        const first = item.points[0];
        const last = item.points[item.points.length - 1];
        const start = L.marker([first.latitude, first.longitude], { icon: markerIcon("inicio") }).bindTooltip(`SALIDA · ${escapeHtml(item.viaje.eco || "ECO")}`).addTo(markersLayer);
        const end = L.marker([last.latitude, last.longitude], { icon: markerIcon("fin") }).bindTooltip(`LLEGADA · ${escapeHtml(item.viaje.destino || "DESTINO")}`).addTo(markersLayer);
        layers.push(start, end);
    }

    async function pintarCasetas(viajes) {
        const ids = viajes.map(v => String(v.id_viaje)).filter(Boolean);
        if (!ids.length) return;
        const { data: detected } = await window.supabaseClient
            .from("viaje_casetas_detectadas")
            .select("id_viaje,orden,detectada_at,distancia_metros,caseta_id")
            .in("id_viaje", ids);
        if (!detected?.length) return;
        const casetaIds = [...new Set(detected.map(x => x.caseta_id).filter(Boolean))];
        const { data: catalog } = await window.supabaseClient
            .from("casetas_catalogo")
            .select("id,nombre,lat,lng,costo")
            .in("id", casetaIds);
        const byId = new Map((catalog || []).map(c => [String(c.id), c]));
        detected.forEach(d => {
            const c = byId.get(String(d.caseta_id));
            if (!c || !Number.isFinite(Number(c.lat)) || !Number.isFinite(Number(c.lng))) return;
            const marker = L.marker([Number(c.lat), Number(c.lng)], { icon: markerIcon("caseta") })
                .bindTooltip(`CASETA · ${escapeHtml(c.nombre || "SIN NOMBRE")} · ${escapeHtml(d.id_viaje)}`)
                .addTo(markersLayer);
            layers.push(marker);
        });
    }

    async function abrirMapaDesdeFiltros(viajes) {
        viajesActuales = Array.isArray(viajes) ? viajes.slice() : [];
        inicializarMapa();
        const modal = $("modalHistorialRecorridos");
        if (!modal || !map) return;
        modal.style.display = "flex";
        modal.setAttribute("aria-hidden", "false");
        requestAnimationFrame(() => map.invalidateSize());
        await cargarMapa(viajesActuales);
    }

    async function cargarMapa(viajes) {
        if (cargando || !map) return;
        cargando = true;
        limpiarMapa();
        const estado = $("historialRecorridosEstado");
        const resumen = $("historialRecorridosResumen");
        try {
            const lista = (viajes || []).slice().sort((a,b) => `${a.fecha || ""} ${a.hora_salida || ""}`.localeCompare(`${b.fecha || ""} ${b.hora_salida || ""}`));
            if (!lista.length) {
                estado.textContent = "SIN VIAJES";
                resumen.textContent = "Los filtros actuales no contienen viajes concluidos con recorrido para mostrar.";
                map.setView([19.4326, -99.1332], 6);
                return;
            }
            estado.textContent = `CARGANDO 0/${lista.length}`;
            resumen.textContent = `${lista.length} viaje${lista.length === 1 ? "" : "s"} seleccionado${lista.length === 1 ? "" : "s"}. Se dibujará la línea real de Samsara cuando exista vínculo y telemetría histórica.`;
            const resultados = [];
            for (let i = 0; i < lista.length; i++) {
                const result = await cargarViaje(lista[i], i);
                resultados.push(result);
                pintarRecorrido(result);
                estado.textContent = `CARGANDO ${i + 1}/${lista.length}`;
            }
            await pintarCasetas(lista);
            const validos = resultados.filter(r => r.points?.length);
            const errores = resultados.filter(r => !r.points?.length);
            if (validos.length) {
                const bounds = L.latLngBounds([]);
                validos.forEach(r => r.points.forEach(p => bounds.extend([p.latitude, p.longitude])));
                if (bounds.isValid()) map.fitBounds(bounds, { padding: [35,35], maxZoom: 13 });
            }
            estado.textContent = `LISTO · ${validos.length}/${lista.length} RECORRIDOS`;
            resumen.textContent = errores.length
                ? `${validos.length} recorridos dibujados. ${errores.length} sin telemetría histórica o sin vínculo Samsara.`
                : `Todos los recorridos seleccionados fueron dibujados con su línea de rastreo histórica.`;
            const leyenda = $("historialRecorridosLeyenda");
            leyenda.innerHTML = resultados.map((r, i) => `<div class="historial-leyenda-item"><span class="historial-leyenda-line" style="border-top-style:${lineStyles[i % lineStyles.length].dashArray ? "dashed" : "solid"}"></span><div><strong>${escapeHtml(r.viaje.eco || "ECO")}</strong><small>${escapeHtml(r.viaje.fecha || "")} · ${escapeHtml(r.viaje.id_viaje || "")}${r.error ? ` · ${escapeHtml(r.error)}` : ` · ${r.points.length} puntos`}</small></div></div>`).join("");
        } catch (error) {
            console.error("Historial de recorridos:", error);
            estado.textContent = "ERROR";
            resumen.textContent = error?.message || "No se pudo cargar el historial.";
        } finally {
            cargando = false;
        }
    }

    function cerrar() {
        const modal = $("modalHistorialRecorridos");
        if (!modal) return;
        modal.style.display = "none";
        modal.setAttribute("aria-hidden", "true");
    }

    document.addEventListener("DOMContentLoaded", () => {
        $("btnCerrarHistorialRecorridos")?.addEventListener("click", cerrar);
        $("btnRecargarHistorialRecorridos")?.addEventListener("click", () => cargarMapa(viajesActuales));
    });

    window.SMTRecorridos = {
        abrirMapaDesdeFiltros,
        cerrar
    };
})();
