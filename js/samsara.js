// ============================================================
// SISTEMA MONITOREO TAG - SAMSARA UI
// ============================================================
(function () {
    "use strict";

    const $ = (id) => document.getElementById(id);
    let vehicles = [];
    let units = [];
    let monitorGpsTimer = null;
    const gpsCache = new Map();
    let miniMap = null;
    let miniMarker = null;
    let miniMapVehicleId = null;
    let miniMapTimer = null;

    function normalize(value) {
        return String(value || "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, "");
    }

    function escapeHtml(value) {
        const div = document.createElement("div");
        div.textContent = String(value ?? "");
        return div.innerHTML;
    }

    function clean(value) {
        return String(value ?? "").replace(/\s+/g, " ").trim();
    }

    async function invoke(action, extra = {}) {
        const { data, error } = await window.supabaseClient.functions.invoke("samsara-proxy", {
            body: { action, ...extra }
        });
        if (error) throw error;
        if (!data?.ok) throw new Error(data?.error || "La función Samsara devolvió un error.");
        return data.data;
    }

    async function loadVehicles() {
        const result = await invoke("vehicles");
        vehicles = Array.isArray(result?.data) ? result.data : [];
        renderVehicles();
        return vehicles;
    }

    async function loadUnits() {
        const { data, error } = await window.supabaseClient
            .from("unidades")
            .select("id, eco, placas, tipo_unidad, descripcion, activo, samsara_vehicle_id")
            .order("eco", { ascending: true });
        if (error) throw error;
        units = data || [];
        return units;
    }

    function matchingUnit(vehicle) {
        const byLinkedId = units.find(u => String(u.samsara_vehicle_id || "") === String(vehicle.id));
        if (byLinkedId) return byLinkedId;
        const target = normalize(vehicle.name);
        return units.find(u => normalize(u.eco) === target) || null;
    }

    function isSamsaraVehicleUsable(vehicle) {
        const name = clean(vehicle?.name).toUpperCase();
        return !name.startsWith("DEACTIVATED,") && !name.startsWith("DEACTIVATED ");
    }

    function vehicleSearchMatches(vehicle, search) {
        if (!search) return true;
        const text = [vehicle.name, vehicle.id, vehicle.vin, vehicle.licensePlate, vehicle.make, vehicle.model]
            .map(clean).join(" ").toUpperCase();
        return text.includes(search);
    }

    function renderVehicles() {
        const tbody = $("tablaSamsaraVehiculos");
        if (!tbody) return;
        const search = clean($("buscarSamsaraVehiculo")?.value).toUpperCase();
        const filtered = vehicles.filter(v => vehicleSearchMatches(v, search));

        if (!filtered.length) {
            tbody.innerHTML = `<tr><td colspan="4" class="empty-state samsara-empty"><div class="samsara-empty-icon">⌕</div><strong>NO ENCONTRAMOS VEHÍCULOS</strong><small>Prueba con otro ECO, ID, VIN o placa.</small></td></tr>`;
            updateSamsaraSummary();
            return;
        }

        tbody.innerHTML = filtered.map(vehicle => {
            const linkedUnit = units.find(u => String(u.samsara_vehicle_id || "") === String(vehicle.id));
            const suggestedUnit = linkedUnit || units.find(u => normalize(u.eco) === normalize(vehicle.name)) || null;
            const linked = Boolean(linkedUnit);
            const usable = isSamsaraVehicleUsable(vehicle);
            const driver = clean(vehicle.staticAssignedDriver?.name);
            const model = [vehicle.make, vehicle.model].filter(Boolean).join(" ");
            const plate = clean(vehicle.licensePlate);
            const options = [`<option value="">SELECCIONAR ECO LOCAL</option>`]
                .concat(units.map(u =>
                    `<option value="${escapeHtml(u.id)}" ${suggestedUnit?.id === u.id ? "selected" : ""}>${escapeHtml(u.eco)}${u.placas ? ` · ${escapeHtml(u.placas)}` : ""}</option>`
                )).join("");

            return `
                <tr class="samsara-row ${linked ? "is-linked" : ""} ${!usable ? "is-disabled" : ""}">
                    <td class="samsara-vehicle-cell">
                        <div class="samsara-vehicle-main">
                            <span class="samsara-status-dot ${usable ? "online" : "offline"}"></span>
                            <div>
                                <strong>${escapeHtml(vehicle.name || "SIN NOMBRE")}</strong>
                                <small>ID ${escapeHtml(vehicle.id)}</small>
                            </div>
                        </div>
                        <div class="samsara-vehicle-meta">
                            <span>${escapeHtml(model || "MODELO NO DISPONIBLE")}</span>
                            ${plate ? `<span>PLACA ${escapeHtml(plate)}</span>` : ""}
                            ${driver ? `<span>CONDUCTOR ${escapeHtml(driver)}</span>` : ""}
                        </div>
                    </td>
                    <td class="samsara-local-cell">
                        <div class="samsara-select-wrap ${linked ? "is-locked" : ""}">
                            <span class="samsara-select-label">ECO LOCAL</span>
                            <select class="samsara-link-select" data-vehicle-id="${escapeHtml(vehicle.id)}" ${(!usable || linked) ? "disabled" : ""}>
                                ${options}
                            </select>
                        </div>
                    </td>
                    <td class="samsara-state-cell">
                        ${linked
                            ? `<div class="samsara-state-card linked"><span class="samsara-state-check">✓</span><div><strong>VINCULADA</strong><small>${escapeHtml(linkedUnit.eco)}</small></div></div>`
                            : usable
                                ? `<div class="samsara-state-card"><span class="samsara-state-check neutral">•</span><div><strong>LISTA PARA VINCULAR</strong><small>${suggestedUnit ? `Sugerencia: ${escapeHtml(suggestedUnit.eco)}` : "Selecciona un ECO local"}</small></div></div>`
                                : `<div class="samsara-state-card disabled"><span class="samsara-state-check">—</span><div><strong>NO DISPONIBLE</strong><small>Vehículo desactivado</small></div></div>`}
                    </td>
                    <td class="samsara-action-cell">
                        ${linked
                            ? `<button type="button" class="samsara-link-btn samsara-unlink-btn" data-vehicle-id="${escapeHtml(vehicle.id)}" data-action="unlink"><span>DESVINCULAR</span></button>`
                            : usable
                                ? `<button type="button" class="samsara-link-btn" data-vehicle-id="${escapeHtml(vehicle.id)}" data-action="link"><span>VINCULAR</span><b>→</b></button>`
                                : `<span class="samsara-not-available">NO DISP.</span>`}
                    </td>
                </tr>`;
        }).join("");
        updateSamsaraSummary();
    }

    function updateSamsaraSummary() {
        const summary = $("samsaraSummary");
        if (!summary) return;
        const linked = units.filter(u => u.samsara_vehicle_id).length;
        const visible = vehicles.filter(v => vehicleSearchMatches(v, clean($("buscarSamsaraVehiculo")?.value).toUpperCase())).length;
        summary.innerHTML = `<span><b>${linked}</b> vinculadas</span><i></i><span><b>${visible}</b> vehículos mostrados</span>`;
    }

    async function saveLink(vehicleId, unitId) {
        if (!unitId) {
            const old = units.find(u => String(u.samsara_vehicle_id || "") === String(vehicleId));
            if (!old) return;
            const { error } = await window.supabaseClient.from("unidades").update({
                samsara_vehicle_id: null,
                updated_at: new Date().toISOString()
            }).eq("id", old.id);
            if (error) throw error;
            await loadUnits();
            await loadVehicles();
            document.dispatchEvent(new CustomEvent("samsara:units-updated"));
            return;
        }

        const current = units.find(u => String(u.id) === String(unitId));
        const oldLinked = units.find(u => String(u.samsara_vehicle_id || "") === String(vehicleId) && String(u.id) !== String(unitId));
        if (oldLinked) {
            const { error } = await window.supabaseClient.from("unidades").update({ samsara_vehicle_id: null, updated_at: new Date().toISOString() }).eq("id", oldLinked.id);
            if (error) throw error;
        }

        // Si el ECO seleccionado ya estaba ligado a otro vehículo Samsara,
        // quitamos ese vínculo antes de asignar el nuevo para evitar conflictos.
        const currentVehicleId = String(current?.samsara_vehicle_id || "");
        if (currentVehicleId && currentVehicleId !== String(vehicleId)) {
            const { error } = await window.supabaseClient.from("unidades").update({ samsara_vehicle_id: null, updated_at: new Date().toISOString() }).eq("id", unitId);
            if (error) throw error;
        }

        // Una unidad que se vincula correctamente a Samsara pasa a ACTIVA.
        // Esto evita que quede vinculada pero siga apareciendo como INACTIVA.
        const { error } = await window.supabaseClient.from("unidades").update({
            samsara_vehicle_id: String(vehicleId),
            activo: true,
            updated_at: new Date().toISOString()
        }).eq("id", unitId);
        if (error) throw error;

        await loadUnits();
        await loadVehicles();
        document.dispatchEvent(new CustomEvent("samsara:units-updated"));
        return current;
    }

    function setSyncMessage(text, kind = "") {
        const el = $("estadoSamsara");
        if (!el) return;
        el.textContent = text;
        el.className = `modal-subtitle samsara-sync-message ${kind}`.trim();
    }

    async function syncNow() {
        const button = $("btnActualizarSamsara");
        if (button) {
            button.disabled = true;
            button.classList.add("is-loading");
        }
        setSyncMessage("SINCRONIZANDO VEHÍCULOS…", "loading");
        try {
            await loadUnits();
            await loadVehicles();
            const linked = units.filter(u => u.samsara_vehicle_id).length;
            setSyncMessage(`${vehicles.length} VEHÍCULOS RECIBIDOS · ${linked} VINCULADOS`, "success");
        } catch (error) {
            console.error(error);
            setSyncMessage("NO SE PUDO COMPLETAR LA SINCRONIZACIÓN.", "error");
        } finally {
            if (button) {
                button.disabled = false;
                button.classList.remove("is-loading");
            }
        }
    }

    async function openUnitsModal() {
        const modal = $("modalSamsara");
        if (!modal) return;
        modal.style.display = "flex";
        modal.setAttribute("aria-hidden", "false");
        await syncNow();
    }

    function closeUnitsModal() {
        const modal = $("modalSamsara");
        if (modal) {
            modal.style.display = "none";
            modal.setAttribute("aria-hidden", "true");
        }
    }

    function formatTime(iso) {
        if (!iso) return "—";
        const date = new Date(iso);
        if (Number.isNaN(date.getTime())) return "—";
        return date.toLocaleString("es-MX", { dateStyle: "short", timeStyle: "medium" });
    }

    function normalizeGpsVehicle(item) {
        if (!item) return null;
        const gps = item.gps || item.gpsData || null;
        if (!gps) return null;
        return {
            id: item.id,
            latitude: Number(gps.latitude),
            longitude: Number(gps.longitude),
            speed: gps.speedMilesPerHour,
            heading: gps.headingDegrees,
            location: gps.reverseGeo?.formattedLocation || "UBICACIÓN NO DISPONIBLE",
            time: gps.time || null
        };
    }

    async function loadGpsForVehicles(vehicleIds) {
        const ids = [...new Set((vehicleIds || []).map(String).filter(Boolean))];
        if (!ids.length) return new Map();
        const found = new Map();

        // Ruta principal: Vehicle Stats snapshot, que Samsara recomienda para la última
        // ubicación conocida. Se mantiene una segunda ruta de respaldo para cuentas
        // donde el snapshot de stats no esté disponible.
        try {
            const result = await invoke("gps", { vehicleId: ids.join(",") });
            const list = Array.isArray(result?.data) ? result.data : [];
            list.forEach(item => {
                const normalized = normalizeGpsVehicle(item);
                if (normalized) {
                    found.set(String(normalized.id), normalized);
                    gpsCache.set(String(normalized.id), normalized);
                }
            });
        } catch (primaryError) {
            console.warn("Samsara stats GPS no disponible; usando locations snapshot…", primaryError);
        }

        const missing = ids.filter(id => !found.has(String(id)));
        if (missing.length) {
            try {
                const fallback = await invoke("locations", { vehicleId: missing.join(",") });
                const list = Array.isArray(fallback?.data) ? fallback.data : [];
                list.forEach(item => {
                    const point = item?.gps || item?.location || item;
                    const normalized = {
                        id: item?.id,
                        latitude: Number(point?.latitude),
                        longitude: Number(point?.longitude),
                        speed: point?.speedMilesPerHour,
                        heading: point?.headingDegrees,
                        location: point?.reverseGeo?.formattedLocation || point?.formattedLocation || point?.address?.formattedLocation || "UBICACIÓN NO DISPONIBLE",
                        time: point?.time || item?.time || null
                    };
                    if (normalized.id && Number.isFinite(normalized.latitude) && Number.isFinite(normalized.longitude)) {
                        found.set(String(normalized.id), normalized);
                        gpsCache.set(String(normalized.id), normalized);
                    }
                });
            } catch (fallbackError) {
                console.warn("Samsara locations snapshot tampoco disponible:", fallbackError);
            }
        }
        return found;
    }

    async function loadGpsHistory(vehicleId, startTime, endTime) {
        if (!vehicleId || !startTime || !endTime) return [];

        const collectStatsHistory = async () => {
            const all = [];
            let after = "";
            let page = 0;
            let result = null;
            do {
                result = await invoke("history", {
                    vehicleId: String(vehicleId),
                    startTime,
                    endTime,
                    ...(after ? { after } : {})
                });
                const list = Array.isArray(result?.data) ? result.data : [];
                // Samsara documenta stats/history como data[] -> vehicle -> gps[].
                // Se aceptan además variantes defensivas por compatibilidad entre respuestas.
                const vehiclesFound = list.length ? list : (result?.id ? [result] : []);
                vehiclesFound.forEach(vehicle => {
                    const gps = Array.isArray(vehicle?.gps)
                        ? vehicle.gps
                        : Array.isArray(vehicle?.gpsData)
                            ? vehicle.gpsData
                            : [];
                    all.push(...gps.map(item => ({
                        latitude: Number(item.latitude),
                        longitude: Number(item.longitude),
                        speed: item.speedMilesPerHour,
                        heading: item.headingDegrees,
                        time: item.time || null,
                        location: item.reverseGeo?.formattedLocation || item.formattedLocation || ""
                    })).filter(p => Number.isFinite(p.latitude) && Number.isFinite(p.longitude)));
                });
                after = String(result?.pagination?.endCursor || "");
                page += 1;
            } while (resultHasNextPage(result) && after && page < 50);
            return all;
        };

        const collectLegacyLocations = async () => {
            const all = [];
            let after = "";
            let page = 0;
            let result = null;
            do {
                result = await invoke("locationsHistory", {
                    vehicleId: String(vehicleId),
                    startTime,
                    endTime,
                    ...(after ? { after } : {})
                });
                const list = Array.isArray(result?.data) ? result.data : [];
                list.forEach(item => {
                    const point = item?.gps || item?.location || item;
                    const latitude = Number(point?.latitude);
                    const longitude = Number(point?.longitude);
                    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
                    all.push({
                        latitude,
                        longitude,
                        speed: point?.speedMilesPerHour,
                        heading: point?.headingDegrees,
                        time: point?.time || item?.time || null,
                        location: point?.reverseGeo?.formattedLocation || point?.formattedLocation || ""
                    });
                });
                after = String(result?.pagination?.endCursor || "");
                page += 1;
            } while (resultHasNextPage(result) && after && page < 50);
            return all;
        };

        let all = [];
        try {
            all = await collectStatsHistory();
        } catch (error) {
            console.warn("Samsara stats/history no disponible; probando locations/history…", error);
        }

        if (!all.length) {
            try {
                all = await collectLegacyLocations();
            } catch (error) {
                console.warn("Samsara locations/history tampoco devolvió recorrido:", error);
            }
        }

        const unique = new Map();
        all.forEach(p => {
            const key = p.time
                ? `${p.time}|${p.latitude.toFixed(6)}|${p.longitude.toFixed(6)}`
                : `${p.latitude.toFixed(6)}|${p.longitude.toFixed(6)}`;
            unique.set(key, p);
        });
        return [...unique.values()].sort((a, b) => new Date(a.time || 0) - new Date(b.time || 0));
    }

    function resultHasNextPage(result) {
        return Boolean(result?.pagination?.hasNextPage);
    }

    async function loadAddresses() {
        const result = await invoke("addresses");
        return Array.isArray(result?.data) ? result.data : [];
    }

    async function loadSafetyEvents(options = {}) {
        const result = await invoke("safetyEvents", options);
        return {
            events: Array.isArray(result?.data) ? result.data : [],
            pagination: result?.pagination || {}
        };
    }

    async function loadAlertConfigurations(options = {}) {
        const result = await invoke("alertConfigurations", options);
        return {
            configurations: Array.isArray(result?.data) ? result.data : [],
            pagination: result?.pagination || {}
        };
    }

    function normalizeAddressForMatch(value) {
        return normalize(value);
    }

    async function syncOperationalGeofences() {
        const addresses = await loadAddresses();
        const { data: zones, error } = await window.supabaseClient
            .from("monitoreo_geocercas")
            .select("*")
            .eq("activo", true);
        if (error) throw error;
        let updated = 0;
        for (const zone of zones || []) {
            const target = normalizeAddressForMatch(zone.nombre);
            const match = addresses.find(a => {
                const name = normalizeAddressForMatch(a.name);
                return name === target || name.includes(target) || target.includes(name);
            });
            if (!match) continue;
            const circle = match.geofence?.circle;
            const lat = Number(match.latitude ?? circle?.latitude);
            const lng = Number(match.longitude ?? circle?.longitude);
            const radius = Number(circle?.radiusMeters || zone.radio_metros || 300);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
            const patch = {
                samsara_address_id: String(match.id),
                lat, lng, radio_metros: radius,
                updated_at: new Date().toISOString()
            };
            const res = await window.supabaseClient.from("monitoreo_geocercas").update(patch).eq("id", zone.id);
            if (!res.error) updated++;
        }
        return { updated, total: (zones || []).length };
    }

    function monitorGpsCell(vehicleId) {
        if (!vehicleId) return `<span class="monitor-gps muted">—</span>`;
        const gps = gpsCache.get(String(vehicleId));
        if (!gps) return `<span class="monitor-gps waiting"><i></i> BUSCANDO…</span>`;
        const speed = gps.speed == null ? "—" : `${Number(gps.speed).toFixed(1)} MPH`;
        const location = clean(gps.location);
        return `<div class="monitor-gps live"><span class="monitor-gps-dot"></span><div><strong>${escapeHtml(speed)}</strong><small title="${escapeHtml(location)}">${escapeHtml(location)}</small></div></div>`;
    }

    function updateMonitorGpsCells() {
        document.querySelectorAll("[data-monitor-samsara-id]").forEach(cell => {
            cell.innerHTML = monitorGpsCell(cell.dataset.monitorSamsaraId);
        });
    }

    async function refreshMonitorGps(vehicleIds) {
        const ids = [...new Set((vehicleIds || []).map(String).filter(Boolean))];
        if (!ids.length) return;
        try {
            await loadGpsForVehicles(ids);
            updateMonitorGpsCells();
        } catch (error) {
            console.error("Samsara GPS monitor:", error);
            document.querySelectorAll("[data-monitor-samsara-id]").forEach(cell => {
                if (!gpsCache.has(String(cell.dataset.monitorSamsaraId))) {
                    cell.innerHTML = `<span class="monitor-gps error">SIN DATOS</span>`;
                }
            });
        }
    }

    function startMonitorGps(getVehicleIds) {
        if (monitorGpsTimer) clearInterval(monitorGpsTimer);
        const tick = async () => {
            const ids = typeof getVehicleIds === "function" ? getVehicleIds() : [];
            await refreshMonitorGps(ids);
        };
        tick();
        monitorGpsTimer = setInterval(tick, 15000);
    }

    function findVehicleIdForEco(eco) {
        const unit = units.find(u => normalize(u.eco) === normalize(eco));
        return unit?.samsara_vehicle_id || null;
    }

    // ========================================================
    // MAPAS SAMSARA MULTIPLES
    // ========================================================
    const samsaraMapWindows = new Map();
    let samsaraMapZ = 10000;
    let samsaraMapCascade = 0;
    // Seguimiento móvil/PC: actualización frecuente sin depender de un refresco manual.
    const SAMSARA_LIVE_POLL_MS = 5000;

    function formatMiniSpeed(speed) {
        if (speed == null || Number.isNaN(Number(speed))) return "—";
        return `${Number(speed).toFixed(1)} MPH`;
    }

    function setBasemapMode(map, state, mode, button = null) {
        state.basemapMode = mode === "normal" ? "normal" : "hybrid";
        const normal = state.mapLayer;
        const hybridBase = state.satelliteLayer;
        const hybridLabels = state.hybridLabelsLayer;
        const hybridTransport = state.hybridTransportLayer;

        if (normal && map.hasLayer(normal)) map.removeLayer(normal);
        if (hybridBase && map.hasLayer(hybridBase)) map.removeLayer(hybridBase);
        if (hybridLabels && map.hasLayer(hybridLabels)) map.removeLayer(hybridLabels);
        if (hybridTransport && map.hasLayer(hybridTransport)) map.removeLayer(hybridTransport);

        if (state.basemapMode === "hybrid") {
            hybridBase?.addTo(map);
            hybridTransport?.addTo(map);
            hybridLabels?.addTo(map);
        } else {
            normal?.addTo(map);
        }

        if (button) {
            // El control es únicamente un punto visual. El estado se comunica
            // por title/aria-label, nunca con texto dentro del botón.
            button.textContent = "";
            button.classList.toggle("is-satellite", state.basemapMode === "hybrid");
            button.title = state.basemapMode === "hybrid"
                ? "Cambiar a mapa normal"
                : "Cambiar a mapa híbrido";
            button.setAttribute("aria-label", button.title);
        }
    }

    function createMapPanel(vehicleId, eco, idViaje = null, anchorEl = null) {
        const container = $("samsaraMapsContainer");
        if (!container || !vehicleId || !window.L) return null;
        const key = String(vehicleId);
        const old = samsaraMapWindows.get(key);
        if (old) {
            bringMapToFront(old.panel);
            return old;
        }

        const panel = document.createElement("section");
        panel.className = "samsara-mini-map-panel samsara-floating-map";
        panel.setAttribute("aria-hidden", "false");
        panel.dataset.vehicleId = key;
        panel.style.zIndex = String(++samsaraMapZ);

        const offset = samsaraMapCascade % 6;
        if (anchorEl?.getBoundingClientRect) {
            const rect = anchorEl.getBoundingClientRect();
            const w = 430, h = 430, gap = 12;
            let left = rect.right + gap;
            let top = rect.top - 20;
            if (left + w > window.innerWidth - 10) left = rect.left - w - gap;
            if (left < 10) left = Math.min(window.innerWidth - w - 10, rect.right + gap);
            top = Math.max(10, Math.min(top, window.innerHeight - h - 10));
            panel.style.left = `${Math.max(10, left)}px`;
            panel.style.top = `${top}px`;
            panel.style.right = 'auto';
        } else {
            panel.style.right = `${24 + offset * 28}px`;
            panel.style.top = `${Math.max(80, 50 + offset * 28)}px`;
        }
        samsaraMapCascade++;

        panel.innerHTML = `
            <div class="samsara-mini-map-head samsara-map-drag-handle">
                <div class="samsara-mini-map-title">
                    <span class="samsara-mini-live-dot"></span>
                    <div>
                        <strong>${escapeHtml(eco || "ECO")}</strong>
                        <small class="samsara-map-status">CARGANDO UBICACIÓN…</small>
                    </div>
                </div>
                <div class="samsara-mini-actions">
                    <button class="samsara-mini-action samsara-map-follow" type="button" aria-label="Seguir unidad" title="Seguir unidad">◎</button>
                    <button class="samsara-mini-action samsara-map-track" type="button" aria-label="Cargar recorrido" title="Cargar recorrido">↝</button>
                    <button class="samsara-mini-action samsara-map-center" type="button" aria-label="Centrar unidad" title="Centrar unidad">⌖</button>
                    <button class="samsara-mini-action samsara-map-basemap" type="button" aria-label="Cambiar mapa" title="Cambiar a vista normal"><span aria-hidden="true"></span></button>
                    <button class="samsara-mini-close samsara-map-close" type="button" aria-label="Cerrar mapa" title="Cerrar mapa">×</button>
                </div>
            </div>
            <div class="samsara-mini-map-canvas"></div>
            <div class="samsara-mini-map-info">
                <div><span>VELOCIDAD</span><strong class="samsara-map-speed">—</strong></div>
                <div><span>UBICACIÓN</span><strong class="samsara-map-location">—</strong></div>
                <div><span>SEGUIMIENTO</span><strong class="samsara-map-follow-state">LIBRE</strong></div>
                <div><span>ACTUALIZADO</span><strong class="samsara-map-updated">—</strong></div>
            </div>
            <span class="samsara-resize-handle samsara-resize-se" data-resize="se" aria-hidden="true"></span>
            <span class="samsara-resize-handle samsara-resize-sw" data-resize="sw" aria-hidden="true"></span>
            <span class="samsara-resize-handle samsara-resize-ne" data-resize="ne" aria-hidden="true"></span>
            <span class="samsara-resize-handle samsara-resize-nw" data-resize="nw" aria-hidden="true"></span>`;

        container.appendChild(panel);
        const canvas = panel.querySelector(".samsara-mini-map-canvas");
        const status = panel.querySelector(".samsara-map-status");
        const speedEl = panel.querySelector(".samsara-map-speed");
        const locationEl = panel.querySelector(".samsara-map-location");
        const updatedEl = panel.querySelector(".samsara-map-updated");

        const state = {
            key, vehicleId: key, eco: eco || "ECO", panel, canvas,
            map: null, marker: null, tileLayer: null, mapLayer: null, satelliteLayer: null, hybridTransportLayer: null, hybridLabelsLayer: null, basemapControl: null, basemapMode: "hybrid", isSatellite: true, trackLine: null, casetaLayer: null,
            centered: false, follow: true, requestInFlight: false, timer: null,
            historyLoaded: false, userInteracted: false, historyMode: "auto", tripId: idViaje ? String(idViaje) : null, tripStatus: null, tripStart: null, tripEnd: null, lastTrackPointTime: null, lastGpsTime: null, lastGpsPoint: null,
            dragging: false, dragOffsetX: 0, dragOffsetY: 0,
            resizing: false, resizeDir: "", resizeStartX: 0, resizeStartY: 0,
            resizeStartW: 430, resizeStartH: 430, resizeStartLeft: 0, resizeStartTop: 0
        };

        try {
            state.map = L.map(canvas, {
                zoomControl: true, attributionControl: true,
                zoomAnimation: false, fadeAnimation: false,
                markerZoomAnimation: false, inertia: true,
                worldCopyJump: true, zoomSnap: 1, zoomDelta: 1,
                minZoom: 2, maxZoom: 22
            });
            const mapaBase = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
                subdomains: ["a", "b", "c"], minZoom: 2, maxZoom: 22,
                maxNativeZoom: 18, updateWhenIdle: false, updateWhenZooming: true,
                keepBuffer: 4, tileSize: 256, crossOrigin: true,
                attribution: "© OpenStreetMap contributors"
            });
            const sateliteBase = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
                minZoom: 2, maxZoom: 22, maxNativeZoom: 18, updateWhenIdle: false, updateWhenZooming: true, keepBuffer: 4, attribution: "Tiles © Esri"
            });
            const transporteHibrido = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}", {
                minZoom: 2, maxZoom: 22, maxNativeZoom: 18, updateWhenIdle: false, updateWhenZooming: true, keepBuffer: 4, opacity: 1,
                attribution: "Transporte © Esri"
            });
            const etiquetasHibridas = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}", {
                minZoom: 2, maxZoom: 22, maxNativeZoom: 18, updateWhenIdle: false, updateWhenZooming: true, keepBuffer: 4, opacity: 1,
                attribution: "Límites y lugares © Esri"
            });
            state.mapLayer = mapaBase;
            state.satelliteLayer = sateliteBase;
            state.hybridTransportLayer = transporteHibrido;
            state.hybridLabelsLayer = etiquetasHibridas;
            // La cartografía puede ampliarse más allá del nivel nativo sin pedir
            // teselas inexistentes: Leaflet escala la última tesela disponible.
            // Esto evita el panel gris "Map data not yet available" al usar el
            // máximo zoom, especialmente en móviles.
            state.tileLayer = sateliteBase.addTo(state.map);
            transporteHibrido.addTo(state.map);
            etiquetasHibridas.addTo(state.map);
            sateliteBase.on("tileerror", () => {
                // Si una tesela de alta ampliación no existe, conservamos la
                // última tesela válida escalada en lugar de dejar el mapa vacío.
                if (state.map && state.map.getZoom() > 18) {
                    try { state.map.invalidateSize({ animate: false, pan: false }); } catch (_) {}
                }
            });
            transporteHibrido.on("tileerror", () => {
                if (state.map && state.map.getZoom() > 18) {
                    try { state.map.invalidateSize({ animate: false, pan: false }); } catch (_) {}
                }
            });
            etiquetasHibridas.on("tileerror", () => {
                if (state.map && state.map.getZoom() > 18) {
                    try { state.map.invalidateSize({ animate: false, pan: false }); } catch (_) {}
                }
            });
            // El cambio NORMAL/HÍBRIDA vive en las acciones superiores del mapa.
            // Se elimina el control flotante sobre la cartografía para mantenerla limpia.
            state.map.setView([19.4326, -99.1332], 6, { animate: false });
        } catch (error) {
            console.error("No se pudo inicializar mapa Samsara:", error);
            status.textContent = "MAPA NO DISPONIBLE";
            return state;
        }

        samsaraMapWindows.set(key, state);
        bringMapToFront(panel);
        state.map.on("dragstart zoomstart", () => { state.userInteracted = true; });

        panel.addEventListener("pointerdown", () => bringMapToFront(panel));
        panel.querySelector(".samsara-map-close").addEventListener("click", (e) => {
            e.stopPropagation();
            closeMapWindow(key);
        });
        panel.querySelector(".samsara-map-center").addEventListener("click", async (e) => {
            e.stopPropagation();
            await centerMapWindow(state);
        });
        panel.querySelector(".samsara-map-follow").addEventListener("click", (e) => {
            e.stopPropagation();
            state.follow = !state.follow;
            const btn = panel.querySelector(".samsara-map-follow");
            const label = panel.querySelector(".samsara-map-follow-state");
            btn.classList.toggle("is-active", state.follow);
            btn.title = state.follow ? "Dejar de seguir unidad" : "Seguir unidad";
            if (label) label.textContent = state.follow ? "ACTIVO" : "LIBRE";
            if (state.follow) centerMapWindow(state);
        });
        {
            const btn = panel.querySelector(".samsara-map-follow");
            const label = panel.querySelector(".samsara-map-follow-state");
            btn?.classList.add("is-active");
            if (btn) btn.title = "Dejar de seguir unidad";
            if (label) label.textContent = "ACTIVO";
        }
        panel.querySelector(".samsara-map-track").addEventListener("click", async (e) => {
            e.stopPropagation();
            await loadMapHistory(state);
        });
        panel.querySelector(".samsara-map-basemap").addEventListener("click", (e) => {
            e.stopPropagation();
            const btn = panel.querySelector(".samsara-map-basemap");
            setBasemapMode(state.map, state, state.basemapMode === "hybrid" ? "normal" : "hybrid", btn);
        });
        {
            const btn = panel.querySelector(".samsara-map-basemap");
            if (btn) {
                btn.textContent = "◐";
                btn.classList.toggle("is-satellite", state.basemapMode === "hybrid");
                btn.title = state.basemapMode === "hybrid"
                    ? "Vista híbrida · pulsa para vista normal"
                    : "Vista normal · pulsa para vista híbrida";
                btn.setAttribute("aria-label", btn.title);
            }
        }
        enableMapDragging(state, panel.querySelector(".samsara-map-drag-handle"));
        enableMapResizing(state);

        requestAnimationFrame(() => repairMapWindowSize(state));
        [80, 250, 600, 1200].forEach(ms => setTimeout(() => repairMapWindowSize(state), ms));
        if (window.ResizeObserver) {
            state.resizeObserver = new ResizeObserver(() => {
                requestAnimationFrame(() => repairMapWindowSize(state));
            });
            state.resizeObserver.observe(panel);
            state.resizeObserver.observe(canvas);
        }
        const viewportRepair = () => {
            const rect = panel.getBoundingClientRect();
            const maxW = Math.max(220, window.innerWidth - 12);
            const maxH = Math.max(220, window.innerHeight - 12);
            const width = Math.min(panel.offsetWidth || 430, maxW);
            const height = Math.min(panel.offsetHeight || 430, maxH);
            if (panel.offsetWidth > maxW) panel.style.width = `${Math.round(maxW)}px`;
            if (panel.offsetHeight > maxH) panel.style.height = `${Math.round(maxH)}px`;
            const left = Math.max(4, Math.min(window.innerWidth - width - 4, rect.left));
            const top = Math.max(4, Math.min(window.innerHeight - height - 4, rect.top));
            panel.style.left = `${Math.round(left)}px`;
            panel.style.top = `${Math.round(top)}px`;
            panel.style.right = "auto";
            panel.style.transform = "none";
            requestAnimationFrame(() => repairMapWindowSize(state));
        };
        state.viewportRepair = viewportRepair;
        window.addEventListener("resize", viewportRepair, { passive: true });
        window.addEventListener("orientationchange", viewportRepair, { passive: true });
        refreshMapWindow(state).then(async () => {
            await loadMapHistory(state, state.tripId ? { idViaje: state.tripId } : {});
        });
        state.timer = setInterval(async () => {
            await refreshMapWindow(state);
            // El recorrido se mantiene automático: si todavía no existe o cambió el viaje activo,
            // se reconstruye desde la salida hasta el último GPS disponible.
            // El trazo se vuelve a consultar en automático mientras el viaje siga activo.
            // Así la línea aparece aunque la primera consulta haya ocurrido antes de que Samsara
            // entregara los primeros puntos y también incorpora puntos nuevos.
            if (state.historyMode === "live" || !state.historyLoaded) {
                await loadMapHistory(state, state.tripId ? { idViaje: state.tripId } : {});
            }
        }, SAMSARA_LIVE_POLL_MS);
        state.visibilityHandler = () => {
            if (document.visibilityState === "visible") {
                refreshMapWindow(state);
                if (state.historyMode === "live") loadMapHistory(state, state.tripId ? { idViaje: state.tripId } : {});
            }
        };
        document.addEventListener("visibilitychange", state.visibilityHandler, { passive: true });
        return state;
    }

    function bringMapToFront(panel) {
        if (!panel) return;
        panel.style.zIndex = String(++samsaraMapZ);
    }

    function repairMapWindowSize(state) {
        if (!state?.map) return;
        try { state.map.invalidateSize({ animate: false, pan: false }); } catch (_) {}
        try { state.tileLayer?.redraw(); } catch (_) {}
    }

    function enableMapDragging(state, handle) {
        if (!handle) return;
        handle.addEventListener("pointerdown", (event) => {
            if (event.target.closest("button")) return;
            bringMapToFront(state.panel);
            state.dragging = true;
            const rect = state.panel.getBoundingClientRect();
            state.dragOffsetX = event.clientX - rect.left;
            state.dragOffsetY = event.clientY - rect.top;
            state.panel.classList.add("is-dragging");
            handle.setPointerCapture?.(event.pointerId);
            event.preventDefault();
        });
        handle.addEventListener("pointermove", (event) => {
            if (!state.dragging) return;
            const maxX = Math.max(0, window.innerWidth - state.panel.offsetWidth - 8);
            const maxY = Math.max(0, window.innerHeight - state.panel.offsetHeight - 8);
            const left = Math.min(maxX, Math.max(8, event.clientX - state.dragOffsetX));
            const top = Math.min(maxY, Math.max(8, event.clientY - state.dragOffsetY));
            state.panel.style.left = `${left}px`;
            state.panel.style.top = `${top}px`;
            state.panel.style.right = "auto";
            state.panel.style.transform = "none";
        });
        const stop = (event) => {
            if (!state.dragging) return;
            state.dragging = false;
            state.panel.classList.remove("is-dragging");
            try { handle.releasePointerCapture?.(event.pointerId); } catch (_) {}
            repairMapWindowSize(state);
        };
        handle.addEventListener("pointerup", stop);
        handle.addEventListener("pointercancel", stop);
    }

    function enableMapResizing(state) {
        state.panel.querySelectorAll(".samsara-resize-handle").forEach(handle => {
            handle.addEventListener("pointerdown", (event) => {
                event.stopPropagation();
                event.preventDefault();
                bringMapToFront(state.panel);
                const rect = state.panel.getBoundingClientRect();
                state.resizing = true;
                state.resizeDir = handle.dataset.resize || "se";
                state.resizeStartX = event.clientX;
                state.resizeStartY = event.clientY;
                state.resizeStartW = rect.width;
                state.resizeStartH = rect.height;
                state.resizeStartLeft = rect.left;
                state.resizeStartTop = rect.top;
                state.panel.classList.add("is-resizing");
                handle.setPointerCapture?.(event.pointerId);
            });
            handle.addEventListener("pointermove", (event) => {
                if (!state.resizing) return;
                const dx = event.clientX - state.resizeStartX;
                const dy = event.clientY - state.resizeStartY;
                const minW = Math.min(280, Math.max(220, window.innerWidth - 24));
                const minH = Math.min(260, Math.max(220, window.innerHeight - 24));
                const maxW = Math.max(minW, window.innerWidth - 16);
                const maxH = Math.max(minH, window.innerHeight - 16);
                let w = state.resizeStartW, h = state.resizeStartH, left = state.resizeStartLeft, top = state.resizeStartTop;
                const dir = state.resizeDir;
                if (dir.includes("e")) w = state.resizeStartW + dx;
                if (dir.includes("s")) h = state.resizeStartH + dy;
                if (dir.includes("w")) { w = state.resizeStartW - dx; left = state.resizeStartLeft + dx; }
                if (dir.includes("n")) { h = state.resizeStartH - dy; top = state.resizeStartTop + dy; }
                w = Math.max(minW, Math.min(maxW, w));
                h = Math.max(minH, Math.min(maxH, h));
                if (dir.includes("w")) left = state.resizeStartLeft + (state.resizeStartW - w);
                if (dir.includes("n")) top = state.resizeStartTop + (state.resizeStartH - h);
                left = Math.max(8, Math.min(window.innerWidth - w - 8, left));
                top = Math.max(8, Math.min(window.innerHeight - h - 8, top));
                state.panel.style.width = `${Math.round(w)}px`;
                state.panel.style.height = `${Math.round(h)}px`;
                state.panel.style.left = `${Math.round(left)}px`;
                state.panel.style.top = `${Math.round(top)}px`;
                state.panel.style.right = "auto";
                state.panel.style.transform = "none";
                repairMapWindowSize(state);
            });
            const stopResize = (event) => {
                if (!state.resizing) return;
                state.resizing = false;
                state.panel.classList.remove("is-resizing");
                try { handle.releasePointerCapture?.(event.pointerId); } catch (_) {}
                repairMapWindowSize(state);
            };
            handle.addEventListener("pointerup", stopResize);
            handle.addEventListener("pointercancel", stopResize);
        });
    }

    async function pintarCasetasEnMapa(state, points) {
        if (!state?.map || !Array.isArray(points) || !points.length) return;
        if (!state.casetaLayer) state.casetaLayer = L.layerGroup().addTo(state.map);
        state.casetaLayer.clearLayers();
        const { data: catalog } = await window.supabaseClient
            .from("casetas_catalogo")
            .select("id,nombre,lat,lng,radio_metros,costo")
            .eq("activo", true)
            .not("lat", "is", null)
            .not("lng", "is", null);
        if (!catalog?.length) return;
        const found = new Map();
        for (const caseta of catalog) {
            const lat = Number(caseta.lat), lng = Number(caseta.lng), radius = Number(caseta.radio_metros || 180);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
            let best = Infinity, hit = null;
            for (const point of points) {
                const d = distanciaMetrosLocal(point.latitude, point.longitude, lat, lng);
                if (d < best) { best = d; hit = point; }
            }
            if (hit && best <= radius) found.set(String(caseta.id), { caseta, best, hit });
        }
        found.forEach(({caseta, best}) => {
            const icon = L.divIcon({ className: "samsara-caseta-marker-wrap", html: `<span class="samsara-caseta-marker">$</span>`, iconSize: [22,22], iconAnchor: [11,11] });
            L.marker([Number(caseta.lat), Number(caseta.lng)], { icon, riseOnHover: true })
                .bindTooltip(`CASETA · ${escapeHtml(caseta.nombre || "SIN NOMBRE")} · ${Math.round(best)} m`, { sticky: true })
                .addTo(state.casetaLayer);
        });
    }

    function distanciaMetrosLocal(lat1, lng1, lat2, lng2) {
        const R = 6371000;
        const a1 = Number(lat1) * Math.PI / 180, a2 = Number(lat2) * Math.PI / 180;
        const da = (Number(lat2) - Number(lat1)) * Math.PI / 180;
        const dl = (Number(lng2) - Number(lng1)) * Math.PI / 180;
        const h = Math.sin(da / 2) ** 2 + Math.cos(a1) * Math.cos(a2) * Math.sin(dl / 2) ** 2;
        return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
    }

    async function loadMapHistory(state, options = {}) {
        if (!state) return;
        const preferredTripId = options.idViaje || state.tripId || null;
        let query = window.supabaseClient.from("viajes")
            .select("id_viaje,fecha,hora_salida,fecha_final,hora_final,estatus,eco,destino,origen")
            .eq("eco", state.eco)
            .in("estatus", ["PENDIENTE","EN RUTA","EN ESPERA","CONCLUIDO"])
            .order("fecha", { ascending: false })
            .order("hora_salida", { ascending: false });
        if (preferredTripId) query = query.eq("id_viaje", String(preferredTripId));
        const viajes = await query.limit(20);
        const candidates = viajes.data || [];
        const viaje = candidates.find(v => ["PENDIENTE","EN RUTA","EN ESPERA"].includes(String(v.estatus || "").toUpperCase())) || candidates[0];
        if (!viaje) {
            setMapStatus(state, "SIN VIAJE PARA MOSTRAR", "error");
            return;
        }
        const start = viaje?.fecha && viaje?.hora_salida ? new Date(`${viaje.fecha}T${String(viaje.hora_salida).slice(0,8)}`) : new Date(Date.now() - 3 * 3600000);
        const live = String(viaje.estatus || "").toUpperCase() !== "CONCLUIDO";
        const end = !live && viaje?.fecha_final && viaje?.hora_final
            ? new Date(`${viaje.fecha_final}T${String(viaje.hora_final).slice(0,8)}`)
            : new Date();
        if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return;

        state.tripId = String(viaje.id_viaje);
        state.tripStatus = String(viaje.estatus || "").toUpperCase();
        state.tripStart = start;
        state.tripEnd = end;
        state.historyMode = live ? "live" : "history";
        setMapStatus(state, live ? "CARGANDO RECORRIDO EN VIVO…" : "CARGANDO RECORRIDO HISTÓRICO…", "loading");
        try {
            const points = await loadGpsHistory(state.vehicleId, start.toISOString(), end.toISOString());
            if (!points.length) { setMapStatus(state, live ? "ESPERANDO PRIMER RECORRIDO…" : "SIN RECORRIDO HISTÓRICO", "error"); return; }
            const latLngs = points.map(p => [p.latitude, p.longitude]);
            if (!state.trackLine) {
                state.trackLine = L.polyline(latLngs, { weight: 5, opacity: .9, smoothFactor: 1.1, lineCap: "round", lineJoin: "round" }).addTo(state.map);
            } else state.trackLine.setLatLngs(latLngs);
            await pintarCasetasEnMapa(state, points);
            state.historyLoaded = true;
            const last = points[points.length - 1];
            state.lastTrackPointTime = last?.time || null;
            setMapStatus(state, live ? `RECORRIDO EN VIVO · ${points.length} PUNTOS` : `RECORRIDO HISTÓRICO · ${points.length} PUNTOS`, "live");
            if (!state.follow && !state.userInteracted) state.map.fitBounds(state.trackLine.getBounds(), { padding: [28,28], maxZoom: 14, animate: false });
        } catch (error) {
            console.error("Samsara historial:", error);
            setMapStatus(state, "NO SE PUDO CARGAR RECORRIDO", "error");
        }
    }

    async function centerMapWindow(state) {
        if (!state?.map) return;
        let gps = gpsCache.get(state.key);
        if (!gps || !Number.isFinite(Number(gps.latitude)) || !Number.isFinite(Number(gps.longitude))) {
            await refreshMapWindow(state);
            gps = gpsCache.get(state.key);
        }
        if (!gps || !Number.isFinite(Number(gps.latitude)) || !Number.isFinite(Number(gps.longitude))) return;
        state.map.setView([Number(gps.latitude), Number(gps.longitude)], 14, { animate: true, duration: .35 });
        state.centered = true;
        repairMapWindowSize(state);
    }

    function setMapStatus(state, text, cls = "") {
        const el = state?.panel?.querySelector(".samsara-map-status");
        if (!el) return;
        el.textContent = text;
        el.className = `samsara-map-status ${cls}`.trim();
    }

    function animateMarkerTo(state, target, duration = 900) {
        if (!state?.marker || !window.L) return;
        const fromLL = state.marker.getLatLng();
        const from = [Number(fromLL.lat), Number(fromLL.lng)];
        const to = [Number(target[0]), Number(target[1])];
        if (!Number.isFinite(from[0]) || !Number.isFinite(from[1]) ||
            !Number.isFinite(to[0]) || !Number.isFinite(to[1])) {
            state.marker.setLatLng(to);
            return;
        }
        const start = performance.now();
        const ease = t => t < .5 ? 2*t*t : 1-Math.pow(-2*t+2,2)/2;
        const frame = now => {
            const t = Math.min(1, (now - start) / duration);
            const e = ease(t);
            state.marker.setLatLng([from[0] + (to[0]-from[0])*e, from[1] + (to[1]-from[1])*e]);
            if (t < 1) state.markerAnimation = requestAnimationFrame(frame);
        };
        if (state.markerAnimation) cancelAnimationFrame(state.markerAnimation);
        state.markerAnimation = requestAnimationFrame(frame);
    }

    async function refreshMapWindow(state) {
        if (!state || state.requestInFlight) return;
        state.requestInFlight = true;
        try {
            const found = await loadGpsForVehicles([state.vehicleId]);
            const gps = found.get(state.key) || gpsCache.get(state.key);
            const pointData = gps || gpsCache.get(state.key);
            if (!pointData || !Number.isFinite(Number(pointData.latitude)) || !Number.isFinite(Number(pointData.longitude))) {
                setMapStatus(state, "ESPERANDO UBICACIÓN GPS…", "error");
                return;
            }
            const point = [Number(pointData.latitude), Number(pointData.longitude)];
            const isNewPoint = !state.lastGpsTime || String(pointData.time || "") !== String(state.lastGpsTime);
            state.lastGpsTime = pointData.time || state.lastGpsTime;
            state.lastGpsPoint = point;
            setMapStatus(state, isNewPoint ? "UBICACIÓN ACTUALIZADA" : "ÚLTIMA UBICACIÓN CONOCIDA", isNewPoint ? "live" : "cached");
            state.panel.querySelector(".samsara-map-speed").textContent = formatMiniSpeed(pointData.speed);
            state.panel.querySelector(".samsara-map-location").textContent = clean(pointData.location || "UBICACIÓN NO DISPONIBLE");
            state.panel.querySelector(".samsara-map-updated").textContent = formatTime(pointData.time);

            if (!state.marker) {
                const vehicleIcon = L.divIcon({
                    className: "samsara-vehicle-marker-wrap",
                    html: '<span class="samsara-vehicle-marker"><i></i></span>',
                    iconSize: [16, 16], iconAnchor: [8, 8]
                });
                state.marker = L.marker(point, { icon: vehicleIcon, riseOnHover: true }).addTo(state.map);
            } else {
                // Movimiento visual suave entre lecturas para que el seguimiento no “salte”.
                animateMarkerTo(state, point, Math.min(1200, Math.max(500, SAMSARA_LIVE_POLL_MS - 300)));
            }

            if (!state.centered || state.follow) {
                const zoom = state.map.getZoom();
                const targetZoom = (!Number.isFinite(zoom) || zoom < 10) ? 15 : zoom;
                state.map.setView(point, targetZoom, { animate: Boolean(state.centered && state.follow), duration: .35 });
                state.centered = true;
            }
            // En teléfonos, cambios de orientación/resize pueden dejar el canvas con
            // dimensiones antiguas. Invalidar después de actualizar el marcador garantiza
            // que el mapa y el punto sigan visibles incluso al maximizar/redimensionar.
            requestAnimationFrame(() => repairMapWindowSize(state));
            // En viajes activos, el recorrido se mantiene actualizado sin pulsar RECORRIDO.
            if (state.historyMode === "live" && state.historyLoaded && state.trackLine) {
                const currentTime = pointData.time || null;
                if (!state.lastTrackPointTime || String(currentTime || "") !== String(state.lastTrackPointTime)) {
                    const existing = state.trackLine.getLatLngs();
                    const last = existing[existing.length - 1];
                    const changed = !last || Math.abs(last.lat - point[0]) > 0.00001 || Math.abs(last.lng - point[1]) > 0.00001;
                    if (changed) state.trackLine.addLatLng(point);
                    state.lastTrackPointTime = currentTime;
                    const count = state.trackLine.getLatLngs().length;
                    setMapStatus(state, `RECORRIDO EN VIVO · ${count} PUNTOS`, "live");
                }
            }
            repairMapWindowSize(state);
        } catch (error) {
            console.error("Samsara mapa:", error);
            const cached = gpsCache.get(state.key);
            setMapStatus(state, cached ? "ÚLTIMA UBICACIÓN CONOCIDA" : "NO SE PUDO ACTUALIZAR", cached ? "cached" : "error");
        } finally {
            state.requestInFlight = false;
        }
    }

    function openMiniMap(vehicleId, eco, idViaje = null, anchorEl = null) {
        if (!vehicleId) return;
        const state = createMapPanel(vehicleId, eco, idViaje, anchorEl);
        if (state) {
            bringMapToFront(state.panel);
            if (idViaje) {
                state.tripId = String(idViaje);
                state.historyLoaded = false;
                loadMapHistory(state, { idViaje: String(idViaje) });
            }
        }
    }

    function closeMapWindow(key) {
        const state = samsaraMapWindows.get(String(key));
        if (!state) return;
        if (state.timer) clearInterval(state.timer);
        if (state.visibilityHandler) document.removeEventListener("visibilitychange", state.visibilityHandler);
        if (state.viewportRepair) {
            window.removeEventListener("resize", state.viewportRepair);
            window.removeEventListener("orientationchange", state.viewportRepair);
        }
        try { state.resizeObserver?.disconnect(); } catch (_) {}
        if (state.markerAnimation) cancelAnimationFrame(state.markerAnimation);
        try { state.map?.remove(); } catch (_) {}
        state.panel?.remove();
        samsaraMapWindows.delete(String(key));
    }

    function closeMiniMap() {
        [...samsaraMapWindows.keys()].forEach(closeMapWindow);
    }

    function refreshMiniMap() {
        return Promise.all([...samsaraMapWindows.values()].map(refreshMapWindow));
    }

    function init() {
        $("btnSamsara")?.addEventListener("click", openUnitsModal);
        $("cerrarModalSamsara")?.addEventListener("click", closeUnitsModal);
        $("btnCerrarSamsara")?.addEventListener("click", closeUnitsModal);
        $("btnActualizarSamsara")?.addEventListener("click", syncNow);
        $("buscarSamsaraVehiculo")?.addEventListener("input", renderVehicles);

        $("tablaSamsaraVehiculos")?.addEventListener("click", async (event) => {
            const button = event.target.closest(".samsara-link-btn");
            if (!button) return;
            const vehicleId = button.dataset.vehicleId;
            const action = button.dataset.action;
            const row = button.closest(".samsara-row");
            const select = row?.querySelector(".samsara-link-select");

            try {
                button.disabled = true;
                button.classList.add("is-loading");
                if (action === "link") {
                    if (!select?.value) {
                        setSyncMessage("SELECCIONA UN ECO LOCAL ANTES DE VINCULAR.", "error");
                        button.disabled = false;
                        button.classList.remove("is-loading");
                        select?.focus();
                        return;
                    }
                    setSyncMessage("VINCULANDO UNIDAD…", "loading");
                    await saveLink(vehicleId, select.value);
                    setSyncMessage("VÍNCULO GUARDADO · UNIDAD MARCADA COMO ACTIVA", "success");
                } else {
                    setSyncMessage("DESVINCULANDO UNIDAD…", "loading");
                    await saveLink(vehicleId, "");
                    setSyncMessage("UNIDAD DESVINCULADA CORRECTAMENTE.", "success");
                }
            } catch (error) {
                console.error(error);
                setSyncMessage(action === "link" ? "NO SE PUDO GUARDAR EL VÍNCULO." : "NO SE PUDO QUITAR EL VÍNCULO.", "error");
                await loadUnits();
                renderVehicles();
            }
        });

        $("tablaSamsaraVehiculos")?.addEventListener("change", (event) => {
            const select = event.target.closest(".samsara-link-select");
            if (!select) return;
            setSyncMessage(select.value ? "ECO SELECCIONADO · PULSA VINCULAR PARA CONFIRMAR." : "SELECCIONA EL ECO LOCAL QUE CORRESPONDA.", "");
        });

        document.addEventListener("click", (event) => {
            const trigger = event.target.closest(".eco-map-open");
            if (trigger) {
                openMiniMap(trigger.dataset.samsaraVehicleId, trigger.dataset.samsaraEco, trigger.dataset.samsaraTripId || null, trigger);
                return;
            }
            // Los mapas son independientes: solo se cierran con su propia X.
            // No cerramos ninguno por clic fuera.

        });

        document.addEventListener("keydown", (event) => {
            const trigger = event.target.closest?.(".eco-map-open");
            if (!trigger || !["Enter", " "].includes(event.key)) return;
            event.preventDefault();
            openMiniMap(trigger.dataset.samsaraVehicleId, trigger.dataset.samsaraEco, trigger.dataset.samsaraTripId || null, trigger);
        });

        window.addEventListener("resize", () => {
            samsaraMapWindows.forEach(repairMapWindowSize);
        }, { passive: true });
        window.addEventListener("orientationchange", () => {
            setTimeout(() => samsaraMapWindows.forEach(repairMapWindowSize), 150);
        }, { passive: true });

        // El ECO abre únicamente el mini mapa cuando la unidad está vinculada.
        window.SamsaraUI = {
            openUnitsModal,
            openMiniMap,
            closeMiniMap,
            refreshMiniMap,
            refreshMonitorGps,
            startMonitorGps,
            findVehicleIdForEco,
            preloadUnits: loadUnits,
            getGpsCache: () => gpsCache,
            getGpsSnapshot: loadGpsForVehicles,
            getGpsHistory: loadGpsHistory,
            getAddresses: loadAddresses,
            getSafetyEvents: loadSafetyEvents,
            getAlertConfigurations: loadAlertConfigurations,
            syncOperationalGeofences
        };
    }

    document.addEventListener("DOMContentLoaded", init);
})();
