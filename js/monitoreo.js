// ============================================================
// SISTEMA MONITOREO TAG
// MONITOREO.JS
// ============================================================

(function () {

    "use strict";


    const {
        mayusculas,
        escapeHtml,
        formatearFecha,
        formatearHora,
        obtenerDatosSemana,
        obtenerSiguienteId,
        validarHora24,
        hoyISO,
        horaActual,
        moneda,
        calcularCostos,
        estatusValido,
        OT_FIJA,
        ESTATUS
    } = window.SMT;


    let viajes =
        [];

    let operadores =
        [];

    let unidades =
        [];

    let rutas =
        [];

    // Catálogo proveniente del Excel / Supabase.
    // Se mantiene separado de las rutas personalizadas para no mezclar datos.
    let catalogoRutas =
        [];

    let viajeSeleccionado =
        null;

    let viajeEditandoActivo =
        null;

    let contadorGeneracionID =
        0;

    // ========================================================
    // TIEMPO REAL MULTI-DISPOSITIVO
    // ========================================================

    let canalTiempoReal = null;
    let tiempoRealInicializado = false;
    let temporizadorRespaldo = null;
    let telefonosOperadores = new Map();
    let alertasPendientes = [];


    const $ =
        id =>
            document.getElementById(id);


    // Las rutas creadas manualmente permanecen como BORRADORES hasta que
    // se publican desde RUTAS. Monitoreo solo consume rutas publicadas.
    function esRutaBorrador(ruta) {
        const codigo = String(ruta?.codigo || "").toUpperCase();
        const hoja = String(ruta?.hoja || "").toUpperCase();
        return codigo.startsWith("MAN-") ||
            codigo.startsWith("AUTO-") ||
            (hoja === "PERSONALIZADAS" && !codigo.startsWith("PUB-"));
    }


    const modal =
        $("modal");

    const modalConfirmar =
        $("modalConfirmar");

    const modalFinalizar =
        $("modalFinalizar");

    const formulario =
        $("formViaje");

    const formFinalizar =
        $("formFinalizar");

    const tabla =
        $("tablaViajes");


    // ========================================================
    // INICIO
    // ========================================================

    document.addEventListener(
        "DOMContentLoaded",
        iniciar
    );


    async function iniciar() {

        const sesion = await window.SistemaAuth?.ready;
        if (!sesion) return;

        conectarEventos();

        prepararFormulario();

        await cargarCatalogos();
        inicializarSelectoresViaje();

        await cargarViajes();
        await cargarTelefonosOperadores();

        iniciarTiempoReal();

    }


    // ========================================================
    // EVENTOS
    // ========================================================

    function conectarEventos() {


        $("btnNuevo")
            ?.addEventListener(
                "click",
                abrirNuevoViaje
            );

        $("cerrar")
            ?.addEventListener(
                "click",
                cerrarNuevoViaje
            );


        $("btnCancelarNuevo")
            ?.addEventListener(
                "click",
                cerrarNuevoViaje
            );


        $("fecha")
            ?.addEventListener(
                "change",
                async () => {

                    await actualizarIdAutomatico();

                }
            );


        $("operador")
            ?.addEventListener(
                "input",
                cargarTagOperador
            );

        $("operador")
            ?.addEventListener(
                "change",
                cargarTagOperador
            );


        formulario
            ?.addEventListener(
                "submit",
                guardarViaje
            );


        tabla
            ?.addEventListener(
                "change",
                manejarCambioTabla
            );


        tabla
            ?.addEventListener(
                "click",
                manejarCambioTabla
            );


        $("btnRecargar")
            ?.addEventListener(
                "click",
                cargarViajes
            );


        $("btnCerrarEdicionActivo")
            ?.addEventListener(
                "click",
                cerrarEdicionActivo
            );


        $("btnCancelarEdicionActivo")
            ?.addEventListener(
                "click",
                cerrarEdicionActivo
            );


        $("formEditarActivo")
            ?.addEventListener(
                "submit",
                guardarEdicionActivo
            );


        $("editarOperadorActivo")
            ?.addEventListener(
                "input",
                cargarTagOperadorEdicion
            );

        $("editarOperadorActivo")
            ?.addEventListener(
                "change",
                cargarTagOperadorEdicion
            );


        $("btnConfirmarConclusion")
            ?.addEventListener(
                "click",
                confirmarConclusion
            );


        $("btnCancelarConclusion")
            ?.addEventListener(
                "click",
                cancelarConclusion
            );


        $("btnCancelarFinalizacion")
            ?.addEventListener(
                "click",
                cancelarFinalizacion
            );


        $("btnCancelarFinalizacion2")
            ?.addEventListener(
                "click",
                cancelarFinalizacion
            );


        $("btnAgregarCaseta")
            ?.addEventListener(
                "click",
                () => agregarCaseta()
            );

        $("btnCargarRuta")
            ?.addEventListener(
                "click",
                () => cargarRutaSeleccionada({ reemplazar: false, mostrarOrigen: true })
            );

        $("rutaGuardada")
            ?.addEventListener(
                "input",
                () => {
                    mostrarSugerenciasRutaCierre();
                    mostrarEstadoRutaSeleccionada();
                }
            );
        $("rutaGuardada")?.addEventListener("focus", mostrarSugerenciasRutaCierre);
        document.addEventListener("click", (e) => {
            const wrap = document.querySelector(".compact-autocomplete");
            if (wrap && !wrap.contains(e.target)) ocultarSugerenciasRutaCierre();
        });


        formFinalizar
            ?.addEventListener(
                "submit",
                guardarFinalizacion
            );


        $("listaCasetas")
            ?.addEventListener(
                "input",
                actualizarTotalesFinal
            );

    }


    // ========================================================
    // FORMULARIO
    // ========================================================

    function prepararFormulario() {

        const fecha =
            $("fecha");


        if (!fecha.value) {

            fecha.value =
                hoyISO();

        }


        $("ot").value =
            OT_FIJA;


        $("estatus").value =
            "EN RUTA";


        $("hora").value =
            horaActual();


        actualizarIdAutomatico();

    }


    // ========================================================
    // CATALOGOS
    // ========================================================

    async function cargarCatalogos() {

        await cargarOperadores();

        await cargarUnidades();

        await cargarRutas();
        await cargarCatalogoRutasExcel();

    }


    async function cargarOperadores() {

        const { data, error } = await supabaseClient
            .from("operadores")
            .select("*")
            .eq("activo", true)
            .order("nombre", { ascending: true });

        if (error) {
            console.error("ERROR OPERADORES:", error);
            alert("NO SE PUDIERON CARGAR LOS OPERADORES.\n\n" + error.message);
            return;
        }

        operadores = data || [];

        const lista = $("listaOperadores");
        if (lista) {
            lista.innerHTML = operadores.map(operador =>
                `<option value="${escapeHtml(mayusculas(operador.nombre))}"></option>`
            ).join("");
        }
    }


    async function cargarUnidades() {

        const { data, error } = await supabaseClient
            .from("unidades")
            .select("*")
            .eq("activo", true)
            .order("eco", { ascending: true });

        if (error) {
            console.error("ERROR UNIDADES:", error);
            alert("NO SE PUDIERON CARGAR LAS UNIDADES.\n\n" + error.message);
            return;
        }

        unidades = data || [];

        const lista = $("listaUnidades");
        if (lista) {
            lista.innerHTML = unidades.map(unidad => {
                const detalle = unidad.tipo_unidad || unidad.tipo || unidad.descripcion || "";
                const texto = detalle
                    ? `${unidad.eco} — ${mayusculas(detalle)}`
                    : unidad.eco;
                return `<option value="${escapeHtml(mayusculas(unidad.eco))}" label="${escapeHtml(texto)}"></option>`;
            }).join("");
        }
    }


    // ========================================================
    // CATÁLOGO DE RUTAS DEL EXCEL
    // ========================================================

    async function cargarCatalogoRutasExcel() {
        // Desde este sprint YA NO usamos rutas_excel_catalogo.
        // El Excel fue cargado directamente en rutas + ruta_casetas.
        catalogoRutas = rutas.map(r => ({
            ...r,
            inicio: r.origen,
            ciudad: r.destino
        }));
        console.log(`CATÁLOGO DE CASETAS CONECTADO: ${catalogoRutas.length} RUTAS.`);
        llenarDatalistsRutas();
    }

    function normalizarTextoRuta(valor) {
        return mayusculas(valor)
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[.]/g, "")
            .replace(/\s+/g, " ")
            .trim();
    }


    function normalizarEjes(valor) {
        const texto = normalizarTextoRuta(valor);
        const numero = texto.match(/\d+/)?.[0];
        return numero ? Number(numero) : null;
    }


    function obtenerTipoUnidad(unidad) {

        if (!unidad) return "";

        const texto = normalizarTextoRuta(
            unidad.descripcion || unidad.tipo || unidad.tipo_unidad || ""
        );

        if (texto.includes("TRACTO")) return "TRACTO CAMION";
        if (texto.includes("TORTON")) return "TORTON";
        if (texto.includes("AUTOBUS") || texto.includes("AUTOBÚS")) return "AUTOBUS";
        if (texto.includes("AUTO MOVIL") || texto.includes("AUTOMOVIL") || texto.includes("AUTO")) return "AUTO MOVIL";

        return texto;

    }


    function obtenerCasetasCatalogo(catalogo) {

        return (catalogo?.casetas || [])
            .slice()
            .sort((a, b) => Number(a.orden || 0) - Number(b.orden || 0))
            .map(c => ({
                nombre: mayusculas(c.nombre || ""),
                costo: Number(c.costo || 0)
            }))
            .filter(c => c.nombre || c.costo > 0);

    }


    function encontrarRutaCatalogo(viaje) {
        if (!catalogoRutas.length || !viaje) return null;

        const destino = normalizarTextoRuta(viaje.destino);
        const origen = normalizarTextoRuta(viaje.origen);
        const municipio = normalizarTextoRuta(viaje.municipio);
        const ejes = normalizarEjes(viaje.ejes);
        if (!destino || !ejes) return null;

        const unidad = unidades.find(u => normalizarTextoRuta(u.eco) === normalizarTextoRuta(viaje.eco));
        const tipoUnidad = normalizarTextoRuta(unidad?.tipo_unidad || unidad?.tipo || unidad?.descripcion || "");

        let candidatos = catalogoRutas.filter(r => {
            const ciudad = normalizarTextoRuta(r.ciudad || r.destino || "");
            const ejesCatalogo = normalizarEjes(r.ejes);
            return ejesCatalogo === ejes && ciudad && (
                ciudad === destino || ciudad.includes(destino) || destino.includes(ciudad)
            );
        });

        if (!candidatos.length) return null;

        // Si la unidad tiene tipo guardado, es la primera prioridad.
        if (tipoUnidad) {
            const porTipo = candidatos.filter(r => normalizarTextoRuta(r.tipo_unidad) === tipoUnidad);
            if (porTipo.length) candidatos = porTipo;
        }

        // Después priorizamos el inicio/origen.
        if (origen) {
            const porOrigen = candidatos.filter(r => {
                const inicio = normalizarTextoRuta(r.inicio || "");
                return inicio && (inicio === origen || inicio.includes(origen) || origen.includes(inicio));
            });
            if (porOrigen.length) candidatos = porOrigen;
        }

        // Si la ruta tiene municipio registrado, lo usamos como segundo filtro
        // para evitar elegir una ruta de la misma ciudad pero de otro municipio.
        if (municipio) {
            const porMunicipio = candidatos.filter(r => {
                const municipioRuta = normalizarTextoRuta(r.municipio || "");
                return municipioRuta && (municipioRuta === municipio || municipioRuta.includes(municipio) || municipio.includes(municipioRuta));
            });
            if (porMunicipio.length) candidatos = porMunicipio;
        }

        // Si queda una sola tarifa, es segura y se carga automáticamente.
        if (candidatos.length === 1) return candidatos[0];

        // Si hay varias pero todas pertenecen al mismo tipo de unidad, podemos elegir.
        const tipos = [...new Set(candidatos.map(r => normalizarTextoRuta(r.tipo_unidad || "")))].filter(Boolean);
        if (tipos.length === 1) return candidatos[0];

        // Evitamos cobrar una tarifa incorrecta cuando el catálogo tiene más de una opción.
        console.warn("HAY VARIAS TARIFAS POSIBLES PARA EL VIAJE:", candidatos);
        return null;
    }

    function prepararRutaDesdeCatalogo(viaje) {

        const estado = $("estadoRutaCierre");

        const rutaCatalogo = encontrarRutaCatalogo(viaje);

        if (!rutaCatalogo) {

            if (estado) {
                estado.textContent = "NO SE ENCONTRÓ UNA TARIFA AUTOMÁTICA PARA ESTA UNIDAD/EJES Y DESTINO. PUEDES CAPTURAR LAS CASETAS MANUALMENTE.";
                estado.className = "route-loader-status warn";
            }

            return false;

        }

        const casetas = obtenerCasetasCatalogo(rutaCatalogo);

        $("listaCasetas").innerHTML = "";
        $("listaCasetas").dataset.rutasCargadas = "";
        casetas.forEach(c => agregarCaseta(c.nombre, c.costo));
        asegurarEspacioCasetaVacio();
        actualizarTotalesFinal();

        const tipo = rutaCatalogo.tipo_unidad || "TIPO NO ESPECIFICADO";
        const ejes = rutaCatalogo.ejes || viaje.ejes || "";
        const destino = rutaCatalogo.ciudad || viaje.destino || "";

        if (estado) {
            estado.textContent = `TARIFA AUTOMÁTICA: ${destino} · ${tipo} · ${ejes} · ${casetas.length} CASETA(S). PUEDES MODIFICARLAS.`;
            estado.className = "route-loader-status ok";
        }

        return true;

    }


    async function cargarRutas() {

        try {
            const { data, error } = await supabaseClient
                .from("rutas")
                .select("*")
                .order("origen", { ascending: true })
                .order("destino", { ascending: true });

            if (error) throw error;

            // IMPORTANTE: Monitoreo NO crea ni consume borradores.
            // Solo se cargan rutas publicadas en el catálogo de la base de datos.
            rutas = (data || []).filter(r => !esRutaBorrador(r));

            if (rutas.length) {
                const ids = rutas.map(r => r.id);
                const resultado = await supabaseClient
                    .from("ruta_casetas")
                    .select("*")
                    .in("ruta_id", ids)
                    .order("orden", { ascending: true });

                if (resultado.error) throw resultado.error;

                const mapa = new Map(rutas.map(r => [r.id, []]));
                (resultado.data || []).forEach(c => mapa.get(c.ruta_id)?.push(c));
                rutas.forEach(r => r.casetas = mapa.get(r.id) || []);
            }

            catalogoRutas = rutas.map(r => ({ ...r, inicio: r.origen, ciudad: r.destino }));
            llenarDatalistsRutas();
        } catch (error) {
            // La función es opcional: si todavía no existe la tabla, el resto del monitoreo sigue funcionando.
            console.warn("CATÁLOGO DE RUTAS NO DISPONIBLE:", error.message);
            rutas = [];
            llenarDatalistsRutas();
        }
    }


    function llenarDatalistsRutas() {

        const origenes = [...new Set([
            ...rutas.map(r => r.origen),
            ...catalogoRutas.map(r => r.inicio || "MATRIZ")
        ].filter(Boolean))].sort();

        const destinos = [...new Set([
            ...rutas.map(r => r.destino),
            ...catalogoRutas.map(r => r.ciudad)
        ].filter(Boolean))].sort();

        $("listaOrigenes") && ($("listaOrigenes").innerHTML = origenes.map(v => `<option value="${escapeHtml(v)}"></option>`).join(""));
        $("listaDestinos") && ($("listaDestinos").innerHTML = destinos.map(v => `<option value="${escapeHtml(v)}"></option>`).join(""));

        const listaRutas = $("listaRutasCierre");
        if (listaRutas) {

            const etiquetas = [
                ...rutas.map(r => `${mayusculas(r.origen)} → ${mayusculas(r.destino)}`),
                ...catalogoRutas.map(r => `${mayusculas(r.inicio || "MATRIZ")} → ${mayusculas(r.ciudad || "")}`)
            ];

            listaRutas.innerHTML = [...new Set(etiquetas)]
                .map(v => `<option value="${escapeHtml(v)}"></option>`)
                .join("");

        }

    }


    // ========================================================
    // SELECTORES COMPACTOS DE VIAJE
    // Reemplazan los datalist nativos para evitar listas gigantes.
    // ========================================================

    function inicializarSelectoresViaje() {
        configurarSelectorViaje("operador", "sugerenciasOperador", () =>
            operadores.map(o => ({ valor: mayusculas(o.nombre), detalle: o.tag ? `TAG · ${mayusculas(o.tag)}` : "SIN TAG" }))
        );
        configurarSelectorViaje("ejes", "sugerenciasEjes", () => [
            "1 EJE", "2 EJES", "3 EJES", "4 EJES", "5 EJES", "6 EJES", "7 EJES", "8 EJES", "9 EJES"
        ].map(v => ({ valor: v, detalle: "CONFIGURACIÓN DISPONIBLE" })));
        configurarSelectorViaje("eco", "sugerenciasEco", () =>
            unidades.map(u => ({ valor: mayusculas(u.eco), detalle: mayusculas(u.tipo_unidad || u.tipo || u.descripcion || "UNIDAD") }))
        );
        configurarSelectorViaje("origen", "sugerenciasOrigenViaje", () =>
            [...new Set([...(rutas || []).map(r => r.origen), ...(catalogoRutas || []).map(r => r.inicio || r.origen)].filter(Boolean))]
                .map(v => ({ valor: mayusculas(v), detalle: "ORIGEN DISPONIBLE" }))
        );
        configurarSelectorViaje("municipio", "sugerenciasMunicipioViaje", () =>
            [...new Set([
                ...(rutas || []).map(r => r.destino),
                ...(rutas || []).map(r => r.municipio),
                ...(catalogoRutas || []).map(r => r.ciudad || r.destino)
            ].filter(Boolean))]
                .map(v => ({ valor: mayusculas(v), detalle: "DESTINO / MUNICIPIO DISPONIBLE" }))
        );

        configurarSelectorViaje("editarOperadorActivo", "sugerenciasEditarOperador", () =>
            operadores.map(o => ({ valor: mayusculas(o.nombre), detalle: o.tag ? `TAG · ${mayusculas(o.tag)}` : "SIN TAG" }))
        );
        configurarSelectorViaje("editarEjesActivo", "sugerenciasEditarEjes", () => [
            "1 EJE", "2 EJES", "3 EJES", "4 EJES", "5 EJES", "6 EJES", "7 EJES", "8 EJES", "9 EJES"
        ].map(v => ({ valor: v, detalle: "CONFIGURACIÓN DISPONIBLE" })));
        configurarSelectorViaje("editarEcoActivo", "sugerenciasEditarEco", () =>
            unidades.map(u => ({ valor: mayusculas(u.eco), detalle: mayusculas(u.tipo_unidad || u.tipo || u.descripcion || "UNIDAD") }))
        );
        configurarSelectorViaje("editarOrigenActivo", "sugerenciasEditarOrigen", () =>
            [...new Set([...(rutas || []).map(r => r.origen), ...(catalogoRutas || []).map(r => r.inicio || r.origen)].filter(Boolean))]
                .map(v => ({ valor: mayusculas(v), detalle: "ORIGEN DISPONIBLE" }))
        );
        configurarSelectorViaje("editarMunicipioActivo", "sugerenciasEditarMunicipio", () =>
            [...new Set([
                ...(rutas || []).map(r => r.destino),
                ...(rutas || []).map(r => r.municipio),
                ...(catalogoRutas || []).map(r => r.ciudad || r.destino)
            ].filter(Boolean))]
                .map(v => ({ valor: mayusculas(v), detalle: "DESTINO / MUNICIPIO DISPONIBLE" }))
        );
    }

    function configurarSelectorViaje(inputId, menuId, obtenerOpciones) {
        const input = $(inputId);
        const menu = $(menuId);
        if (!input || !menu || input.dataset.smartReady) return;
        input.dataset.smartReady = "1";
        let indice = -1;

        const cerrar = () => {
            menu.hidden = true;
            indice = -1;
        };

        const render = () => {
            const texto = mayusculas(input.value.trim());
            const unicos = new Map();
            (obtenerOpciones() || []).forEach(item => {
                const valor = typeof item === "string" ? item : item.valor;
                const detalle = typeof item === "string" ? "" : item.detalle;
                if (valor && !unicos.has(valor)) unicos.set(valor, detalle);
            });
            const opciones = [...unicos.entries()]
                .filter(([valor]) => !texto || mayusculas(valor).includes(texto))
                .slice(0, 7);

            if (!opciones.length) {
                menu.innerHTML = `<div class="smart-suggestion-empty">SIN COINCIDENCIAS</div>`;
                menu.hidden = false;
                return;
            }

            menu.innerHTML = opciones.map(([valor, detalle], i) => `
                <button type="button" class="smart-suggestion" data-value="${escapeHtml(valor)}" data-index="${i}" role="option" aria-selected="${i === indice}">
                    <span><strong>${escapeHtml(valor)}</strong>${detalle ? `<small>${escapeHtml(detalle)}</small>` : ""}</span>
                    <b>↵</b>
                </button>
            `).join("");
            menu.hidden = false;
        };

        input.addEventListener("input", () => { indice = -1; render(); });
        input.addEventListener("focus", render);
        input.addEventListener("keydown", e => {
            const items = [...menu.querySelectorAll(".smart-suggestion[data-value]")];
            if (e.key === "ArrowDown" && !menu.hidden) {
                e.preventDefault();
                indice = Math.min(indice + 1, items.length - 1);
                items.forEach((x, i) => x.setAttribute("aria-selected", i === indice));
            } else if (e.key === "ArrowUp" && !menu.hidden) {
                e.preventDefault();
                indice = Math.max(indice - 1, 0);
                items.forEach((x, i) => x.setAttribute("aria-selected", i === indice));
            } else if (e.key === "Enter" && !menu.hidden && items.length) {
                // ENTER confirma la opción marcada; si no hay una marcada,
                // toma la primera coincidencia para trabajar sin mouse.
                e.preventDefault();
                const seleccion = items[indice >= 0 ? indice : 0];
                if (seleccion) {
                    input.value = seleccion.dataset.value;
                    cerrar();
                    input.dispatchEvent(new Event("change", { bubbles: true }));
                }
            } else if (e.key === "Tab" && !menu.hidden && items.length) {
                // TAB también puede seleccionar. No bloqueamos el TAB para
                // que, después de seleccionar, el foco continúe al siguiente campo.
                const seleccion = items[indice >= 0 ? indice : 0];
                if (seleccion) {
                    input.value = seleccion.dataset.value;
                    cerrar();
                    input.dispatchEvent(new Event("change", { bubbles: true }));
                }
            } else if (e.key === "Escape") {
                cerrar();
            }
        });

        menu.addEventListener("mousedown", e => {
            const item = e.target.closest(".smart-suggestion[data-value]");
            if (!item) return;
            e.preventDefault();
            input.value = item.dataset.value;
            cerrar();
            input.dispatchEvent(new Event("change", { bubbles: true }));
        });

        document.addEventListener("mousedown", e => {
            if (!input.closest(".smart-picker")?.contains(e.target)) cerrar();
        });
    }

    // ========================================================
    // TAG AUTOMÁTICO
    // ========================================================

    function cargarTagOperador() {

        const nombre = mayusculas($("operador")?.value || "");
        const operador = operadores.find(item => mayusculas(item.nombre) === nombre);

        if (operador?.tag) {
            $("tag").value = mayusculas(operador.tag);
        }
        // Si no existe TAG para ese operador, no bloqueamos el campo: puede capturarse manualmente.
    }


    // ========================================================
    // ID EN TIEMPO REAL
    // ========================================================

    async function actualizarIdAutomatico() {

        const fecha =
            $("fecha").value;


        if (!fecha) {

            $("id").value =
                "";

            $("infoSemana").textContent =
                "SELECCIONA UNA FECHA.";

            return;

        }


        const datos =
            obtenerDatosSemana(
                fecha
            );


        if (!datos) {
            return;
        }


        const token =
            ++contadorGeneracionID;


        $("infoSemana").textContent =
            `SEMANA ${datos.numeroSemana} · ` +
            `${formatearFecha(datos.inicioSemana)} → ` +
            `${formatearFecha(datos.finSemana)}`;


        /*
         * Consultamos Supabase para obtener
         * el siguiente consecutivo de ESA semana.
         */

        try {

            const id =
                await obtenerSiguienteId(
                    fecha
                );


            /*
             * Si mientras consultábamos
             * el usuario cambió nuevamente
             * la fecha, ignoramos este resultado.
             */

            if (
                token !==
                contadorGeneracionID
            ) {

                return;

            }


            $("id").value =
                id;

        }

        catch (error) {

            console.error(
                "ERROR GENERANDO ID:",
                error
            );

            $("id").value =
                `S${datos.numeroSemana}-001`;

        }

    }


    // ========================================================
    // NUEVO VIAJE
    // ========================================================

    async function abrirNuevoViaje() {

        formulario.reset();


        $("ot").value =
            OT_FIJA;


        $("estatus").value =
            "EN RUTA";


        $("fecha").value =
            hoyISO();


        $("hora").value =
            horaActual();


        $("tag").value =
            "";


        $("listaCasetas").innerHTML =
            "";


        await actualizarIdAutomatico();


        modal.style.display =
            "flex";

    }


    function cerrarNuevoViaje() {

        modal.style.display =
            "none";

    }


    // ========================================================
    // GUARDAR VIAJE
    // ========================================================

    async function guardarViaje(event) {

        event.preventDefault();


        const fecha =
            $("fecha").value;


        if (!fecha) {

            alert(
                "SELECCIONA UNA FECHA."
            );

            return;

        }


        /*
         * MUY IMPORTANTE:
         * recalculamos TODO justo antes
         * del INSERT.
         */

        const horaSalida = validarHora24($("hora").value);
        if (!horaSalida) {
            alert("CAPTURA LA HORA DE SALIDA EN FORMATO 24 HORAS. EJEMPLO: 22:00 O 2200.");
            $("hora")?.focus();
            return;
        }
        $("hora").value = horaSalida;

        const datosSemana =
            obtenerDatosSemana(
                fecha
            );


        if (!datosSemana) {

            alert(
                "LA FECHA SELECCIONADA NO ES VÁLIDA."
            );

            return;

        }


        const idViaje =
            $("id").value.trim();


        const patron =
            new RegExp(
                `^S${datosSemana.numeroSemana}-\\d{3,}$`
            );


        /*
         * Si el usuario modificó algo
         * o el ID está vacío, regeneramos.
         */

        let idFinal =
            idViaje;


        if (!patron.test(idFinal)) {

            idFinal =
                await obtenerSiguienteId(
                    fecha
                );

        }


        const estatus =
            mayusculas(
                $("estatus").value
            );


        if (
            !estatusValido(
                estatus
            )
        ) {

            alert(
                "EL ESTATUS SELECCIONADO NO ES VÁLIDO."
            );

            return;

        }


        const viaje = {

            id_viaje:
                idFinal,

            ot:
                OT_FIJA,

            fecha:
                fecha,

            tag:
                mayusculas(
                    $("tag").value
                ) || null,

            operador:
                mayusculas(
                    $("operador").value
                ),

            ejes:
                $("ejes").value,

            eco:
                mayusculas(
                    $("eco").value
                ),

            origen:
                mayusculas(
                    $("origen").value
                ),

            hora_salida:
                horaSalida,

            destino:
                mayusculas(
                    $("destino").value
                ),

            municipio:
                mayusculas(
                    $("municipio").value
                ),

            estatus:
                estatus,

            fecha_final:
                null,

            hora_final:
                null,

            anio:
                datosSemana.anio,

            numero_semana:
                datosSemana.numeroSemana,

            inicio_semana:
                datosSemana.inicioSemana,

            fin_semana:
                datosSemana.finSemana,

            subtotal:
                0,

            iva:
                0,

            total:
                0

        };


        const boton =
            formulario.querySelector(
                'button[type="submit"]'
            );


        boton.disabled =
            true;


        boton.textContent =
            "GUARDANDO...";


        try {

            const {
                data,
                error
            } = await supabaseClient

                .from("viajes")

                .insert(viaje)

                .select()

                .single();


            if (error) {

                console.error(
                    "ERROR GUARDANDO VIAJE:",
                    error
                );


                /*
                 * Si dos dispositivos generaron
                 * el mismo consecutivo al mismo
                 * tiempo, intentamos una vez más
                 * con el siguiente ID.
                 */

                if (
                    error.code === "23505" &&
                    error.message
                        ?.includes(
                            "id_viaje"
                        )
                ) {

                    const nuevoID =
                        await obtenerSiguienteId(
                            fecha
                        );


                    viaje.id_viaje =
                        nuevoID;


                    const segundoIntento =
                        await supabaseClient

                            .from("viajes")

                            .insert(viaje)

                            .select()

                            .single();


                    if (
                        segundoIntento.error
                    ) {

                        throw segundoIntento.error;

                    }


                    alert(
                        `VIAJE GUARDADO CORRECTAMENTE.\n\nID: ${nuevoID}`
                    );

                }

                else {

                    throw error;

                }

            }

            else {

                alert(
                    `VIAJE GUARDADO CORRECTAMENTE.\n\nID: ${data.id_viaje}`
                );

            }

            // NO se crean rutas al guardar un viaje.
            // Las rutas solo se administran desde el módulo RUTAS y, al concluir,
            // Monitoreo únicamente consulta el catálogo publicado.

            cerrarNuevoViaje();

            await cargarViajes();

        }

        catch (error) {

            console.error(
                error
            );


            alert(
                "NO SE PUDO GUARDAR EL VIAJE.\n\n" +
                error.message
            );

        }

        finally {

            boton.disabled =
                false;

            boton.textContent =
                "GUARDAR VIAJE";

        }

    }


    // ========================================================
    // CARGAR VIAJES
    // ========================================================

    async function cargarViajes() {

        const {
            data,
            error
        } = await supabaseClient

            .from("viajes")

            .select("*")

            .not(
                "estatus",
                "in",
                "(CONCLUIDO,CANCELADO)"
            )

            .order(
                "fecha",
                {
                    ascending: false
                }
            )
            .order(
                "hora_salida",
                {
                    ascending: false
                }
            );


        if (error) {

            console.error(
                "ERROR CARGANDO VIAJES:",
                error
            );

            alert(
                "NO SE PUDIERON CARGAR LOS VIAJES.\n\n" +
                error.message
            );

            return;

        }


        viajes =
            data || [];


        renderizarTabla();
        actualizarSincronizacion();

    }


    // ========================================================
    // MONITOREO EN TIEMPO REAL
    // ========================================================

    function iniciarTiempoReal() {

        const indicador = $("estadoTiempoReal");
        const texto = $("textoTiempoReal");

        if (!supabaseClient || !supabaseClient.channel) {
            establecerEstadoTiempoReal("desconectado", "MODO RESPALDO");
            iniciarRespaldoPolling();
            return;
        }

        canalTiempoReal = supabaseClient
            .channel("monitoreo-viajes-live")
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "viajes"
                },
                async payload => {

                    // Evitamos mostrar una alerta durante la primera sincronización.
                    if (!tiempoRealInicializado) {
                        tiempoRealInicializado = true;
                        actualizarSincronizacion();
                        return;
                    }

                    await cargarViajes();

                    let mensaje = "La información fue actualizada desde otro dispositivo.";

                    if (payload.eventType === "INSERT") {
                        mensaje = "Se registró un nuevo viaje.";
                    } else if (payload.eventType === "UPDATE") {
                        mensaje = "Un viaje fue actualizado en tiempo real.";
                    } else if (payload.eventType === "DELETE") {
                        mensaje = "Un viaje fue eliminado.";
                    }

                    mostrarToast("OPERACIÓN ACTUALIZADA", mensaje);
                }
            )
            .subscribe(status => {

                if (status === "SUBSCRIBED") {
                    tiempoRealInicializado = true;
                    establecerEstadoTiempoReal("conectado", "EN VIVO");
                    detenerRespaldoPolling();
                    actualizarSincronizacion();
                    return;
                }

                if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
                    establecerEstadoTiempoReal("desconectado", "MODO RESPALDO");
                    iniciarRespaldoPolling();
                    return;
                }

                if (status === "CLOSED") {
                    establecerEstadoTiempoReal("desconectado", "DESCONECTADO");
                    iniciarRespaldoPolling();
                }
            });

        // Respaldo: si Realtime no está habilitado en Supabase, el sistema
        // continúa funcionando y revisa cambios periódicamente.
        setTimeout(() => {
            if (!tiempoRealInicializado) {
                establecerEstadoTiempoReal("desconectado", "MODO RESPALDO");
                iniciarRespaldoPolling();
            }
        }, 8000);
    }


    function iniciarRespaldoPolling() {
        if (temporizadorRespaldo) return;

        temporizadorRespaldo = setInterval(
            async () => {
                await cargarViajes();
            },
            60000
        );
    }


    function detenerRespaldoPolling() {
        if (!temporizadorRespaldo) return;
        clearInterval(temporizadorRespaldo);
        temporizadorRespaldo = null;
    }


    function establecerEstadoTiempoReal(estado, texto) {
        const indicador = $("estadoTiempoReal");
        const etiqueta = $("textoTiempoReal");

        if (!indicador || !etiqueta) return;

        indicador.classList.remove("conectado", "desconectado", "conectando");
        indicador.classList.add(estado);
        etiqueta.textContent = texto;
    }


    function actualizarSincronizacion() {
        const elemento = $("ultimaSincronizacion");
        if (!elemento) return;

        const ahora = new Date();
        elemento.textContent =
            `ACTUALIZADO ${String(ahora.getHours()).padStart(2, "0")}:${String(ahora.getMinutes()).padStart(2, "0")}`;
    }


    function mostrarToast(titulo, mensaje) {
        const toast = $("toastSistema");
        const tituloEl = $("toastTitulo");
        const mensajeEl = $("toastMensaje");

        if (!toast || !tituloEl || !mensajeEl) return;

        tituloEl.textContent = titulo;
        mensajeEl.textContent = mensaje;
        toast.classList.add("visible");

        clearTimeout(mostrarToast.temporizador);
        mostrarToast.temporizador = setTimeout(() => {
            toast.classList.remove("visible");
        }, 4200);
    }


    // ========================================================
    // TABLA
    // ========================================================

    function renderizarTabla() {

        tabla.innerHTML = "";

        if (viajes.length === 0) {
            tabla.innerHTML = `
                <tr>
                    <td colspan="8" class="empty-state">
                        NO HAY UNIDADES ACTIVAS EN ESTE MOMENTO.
                    </td>
                </tr>`;
            actualizarContadores();
            return;
        }

        viajes.forEach(viaje => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>
                    ${(() => {
                        const eco = viaje.eco || "—";
                        const unidadSamsara = unidades.find(u => mayusculas(u.eco || "") === mayusculas(eco));
                        const vehicleId = unidadSamsara?.samsara_vehicle_id || "";
                        return vehicleId
                            ? `<div class="eco-map-inline"><span class="eco-principal eco-map-open" data-samsara-eco="${escapeHtml(eco)}" data-samsara-vehicle-id="${escapeHtml(vehicleId)}" data-samsara-trip-id="${escapeHtml(viaje.id_viaje)}" title="Abrir mapa de ${escapeHtml(eco)}" role="button" tabindex="0" aria-label="Abrir mapa de ${escapeHtml(eco)}">${escapeHtml(eco)}</span></div>`
                            : `<span class="eco-map-inline"><strong class="eco-principal">${escapeHtml(eco)}</strong></span>`;
                    })()}
                </td>

                <td>${renderOperadorWhatsapp(viaje)}</td>
                <td>${escapeHtml(viaje.destino || "—")}</td>
                <td>${escapeHtml(viaje.municipio || "—")}</td>
                <td>
                    <span class="hora-salida">${formatearHora(viaje.hora_salida) || "—"}</span>
                    <small class="fecha-salida">${formatearFecha(viaje.fecha)}</small>
                </td>
                <td>
                    <span class="tiempo-fuera" data-tiempo-fuera data-fecha="${escapeHtml(viaje.fecha || "")}" data-hora="${escapeHtml(viaje.hora_salida || "")}">—</span>
                    <small class="tiempo-fuera-label">FUERA</small>
                </td>
                <td>
                    <select
                        class="status-select"
                        data-id="${escapeHtml(viaje.id_viaje)}">
                        ${ESTATUS.map(estado => `
                            <option value="${estado}" ${estado === viaje.estatus ? "selected" : ""}>
                                ${estado}
                            </option>`).join("")}
                    </select>
                </td>
                <td>
                    <div class="table-actions">
                        <button class="btn-table btn-editar-activo" data-id="${escapeHtml(viaje.id_viaje)}">✏ EDITAR</button>
                    </div>
                </td>`;
            tabla.appendChild(tr);
        });

        actualizarContadores();
        actualizarTiemposFuera();
    }


    // ========================================================
    // TIEMPO FUERA DE BASE
    // ========================================================

    function calcularTiempoFuera(fecha, hora) {
        if (!fecha || !hora) return null;
        const inicio = new Date(`${fecha}T${String(hora).slice(0, 8)}`);
        if (Number.isNaN(inicio.getTime())) return null;
        const ahora = new Date();
        const minutos = Math.max(0, Math.floor((ahora.getTime() - inicio.getTime()) / 60000));
        const dias = Math.floor(minutos / 1440);
        const horas = Math.floor((minutos % 1440) / 60);
        const mins = minutos % 60;
        if (dias > 0) return `${dias} d ${horas} h ${mins} min`;
        if (horas > 0) return `${horas} h ${mins} min`;
        return `${mins} min`;
    }

    function actualizarTiemposFuera() {
        document.querySelectorAll("[data-tiempo-fuera]").forEach(el => {
            el.textContent = calcularTiempoFuera(el.dataset.fecha, el.dataset.hora) || "—";
        });
    }

    setInterval(actualizarTiemposFuera, 30000);


    // ========================================================
    // CAMBIO ESTATUS / ACCIONES

    // ========================================================

    async function manejarCambioTabla(event) {

        if (event.type === "click") {
            const editar = event.target.closest(".btn-editar-activo");
            if (editar) {
                abrirEdicionActivo(editar.dataset.id);
                return;
            }

            return;
        }

        if (!event.target.classList.contains("status-select")) {
            return;
        }

        const select = event.target;
        const id = select.dataset.id;
        const nuevoEstado = mayusculas(select.value);

        if (nuevoEstado === "CONCLUIDO") {
            iniciarConclusion(id);
            renderizarTabla();
            return;
        }

        if (!estatusValido(nuevoEstado)) {
            alert("EL ESTATUS SELECCIONADO NO ES VÁLIDO.");
            await cargarViajes();
            return;
        }

        await actualizarEstatus(id, nuevoEstado);
    }


    // ========================================================
    // EDICIÓN DE VIAJE ACTIVO
    // ========================================================

    function llenarSelectEdicion() {
        const listaOperadores = $("listaOperadores");
        const listaUnidades = $("listaUnidades");

        if (listaOperadores) {
            listaOperadores.innerHTML = operadores.map(item =>
                `<option value="${escapeHtml(mayusculas(item.nombre))}"></option>`
            ).join("");
        }

        if (listaUnidades) {
            listaUnidades.innerHTML = unidades.map(item =>
                `<option value="${escapeHtml(mayusculas(item.eco))}"></option>`
            ).join("");
        }
    }


    function abrirEdicionActivo(id) {

        const viaje = viajes.find(item => item.id_viaje === id);
        if (!viaje) return;

        viajeEditandoActivo = viaje;
        llenarSelectEdicion();

        $("editarIdActivo").value = viaje.id_viaje || "";
        $("editarOtActivo").value = viaje.ot || OT_FIJA;
        $("editarFechaActivo").value = viaje.fecha || "";
        $("editarHoraActivo").value = formatearHora(viaje.hora_salida);
        $("editarOperadorActivo").value = viaje.operador || "";
        $("editarTagActivo").value = viaje.tag || "";
        $("editarEjesActivo").value = viaje.ejes || "";
        $("editarEcoActivo").value = viaje.eco || "";
        $("editarOrigenActivo").value = viaje.origen || "";
        $("editarDestinoActivo").value = viaje.destino || "";
        $("editarMunicipioActivo").value = viaje.municipio || "";
        $("modalEditarActivo").style.display = "flex";
    }


    function cargarTagOperadorEdicion() {
        const nombre = mayusculas($("editarOperadorActivo")?.value || "");
        const operador = operadores.find(item => mayusculas(item.nombre) === nombre);
        if (operador?.tag) {
            $("editarTagActivo").value = mayusculas(operador.tag);
        }
    }


    async function guardarEdicionActivo(event) {

        event.preventDefault();
        if (!viajeEditandoActivo) return;

        const fecha = $("editarFechaActivo").value;
        const horaSalidaActivo = validarHora24($("editarHoraActivo").value);
        if (!horaSalidaActivo) {
            alert("CAPTURA LA HORA DE SALIDA EN FORMATO 24 HORAS. EJEMPLO: 22:00 O 2200.");
            $("editarHoraActivo")?.focus();
            return;
        }
        $("editarHoraActivo").value = horaSalidaActivo;
        if (!fecha) {
            alert("SELECCIONA UNA FECHA.");
            return;
        }

        const datosSemana = obtenerDatosSemana(fecha);
        if (!datosSemana) {
            alert("LA FECHA SELECCIONADA NO ES VÁLIDA.");
            return;
        }

        const nuevoId = await obtenerSiguienteId(fecha, viajeEditandoActivo.id);
        // Conservamos el ID actual si sigue perteneciendo a la misma semana.
        const idActual = viajeEditandoActivo.id_viaje || "";
        const prefijo = `S${datosSemana.numeroSemana}-`;
        const idFinal = idActual.startsWith(prefijo) ? idActual : nuevoId;

        const datos = {
            id_viaje: idFinal,
            ot: OT_FIJA,
            fecha,
            hora_salida: horaSalidaActivo || null,
            tag: mayusculas($("editarTagActivo").value) || null,
            operador: mayusculas($("editarOperadorActivo").value),
            ejes: $("editarEjesActivo").value,
            eco: mayusculas($("editarEcoActivo").value),
            origen: mayusculas($("editarOrigenActivo").value) || null,
            destino: mayusculas($("editarDestinoActivo").value) || null,
            municipio: mayusculas($("editarMunicipioActivo").value) || null,
            anio: datosSemana.anio,
            numero_semana: datosSemana.numeroSemana,
            inicio_semana: datosSemana.inicioSemana,
            fin_semana: datosSemana.finSemana
        };

        const boton = $("formEditarActivo").querySelector('button[type="submit"]');
        boton.disabled = true;
        boton.textContent = "GUARDANDO...";

        try {
            const { error } = await supabaseClient
                .from("viajes")
                .update(datos)
                .eq("id", viajeEditandoActivo.id);

            if (error) throw error;

            alert("VIAJE ACTUALIZADO CORRECTAMENTE.");
            cerrarEdicionActivo();
            await cargarViajes();
        } catch (error) {
            console.error("ERROR EDITANDO VIAJE:", error);
            alert("NO SE PUDO ACTUALIZAR EL VIAJE.\n\n" + error.message);
        } finally {
            boton.disabled = false;
            boton.textContent = "GUARDAR CAMBIOS";
        }
    }


    function cerrarEdicionActivo() {
        $("modalEditarActivo").style.display = "none";
        viajeEditandoActivo = null;
    }


    async function actualizarEstatus(
        id,
        nuevoEstado
    ) {

        const {
            error
        } = await supabaseClient

            .from("viajes")

            .update({
                estatus:
                    nuevoEstado
            })

            .eq(
                "id_viaje",
                id
            );


        if (error) {

            console.error(
                "ERROR ACTUALIZANDO ESTATUS:",
                error
            );


            alert(
                "NO SE PUDO ACTUALIZAR EL ESTATUS.\n\n" +
                error.message
            );


            await cargarViajes();

            return;

        }


        await cargarViajes();

    }


    // ========================================================
    // CONCLUSIÓN
    // ========================================================

    function iniciarConclusion(
        id
    ) {

        viajeSeleccionado =
            viajes.find(
                viaje =>
                    viaje.id_viaje === id
            );


        if (!viajeSeleccionado) {
            return;
        }


        modalConfirmar.style.display =
            "flex";

    }


    function cancelarConclusion() {

        viajeSeleccionado =
            null;


        modalConfirmar.style.display =
            "none";


        renderizarTabla();

    }


    function confirmarConclusion() {

        if (!viajeSeleccionado) {
            return;
        }


        modalConfirmar.style.display =
            "none";


        abrirModalFinalizar(
            viajeSeleccionado
        );

    }


    // ========================================================
    // MODAL FINALIZAR
    // ========================================================

    function abrirModalFinalizar(
        viaje
    ) {

        // Resumen discreto para que el operador confirme que está cerrando el viaje correcto.
        $("finalDestino").textContent =
            mayusculas(viaje.destino || "—");

        $("finalMunicipio").textContent =
            mayusculas(viaje.municipio || "—");

        $("finalOperador").textContent =
            mayusculas(viaje.operador || "—");

        $("finalUnidad").textContent =
            mayusculas(viaje.eco || "—");

        const salidaTexto = [
            viaje.origen ? `ORIGEN: ${mayusculas(viaje.origen)}` : "ORIGEN: —",
            formatearHora(viaje.hora_salida) || "—",
            formatearFecha(viaje.fecha) || "—"
        ].join(" · ");
        $("finalSalida").textContent = salidaTexto;

        $("fechaFinal").value =
            hoyISO();

        $("observacionesFinal").value = viaje.observaciones || "";


        $("horaFinal").value =
            horaActual();


        $("listaCasetas").innerHTML =
            "";

        $("rutaGuardada").value = "";
        if ($("observacionesFinal")) $("observacionesFinal").value = "";
        $("estadoRutaCierre").textContent = "PUEDES CAPTURAR LAS CASETAS MANUALMENTE.";
        $("estadoRutaCierre").className = "route-loader-status";


        $("subtotalFinal").textContent =
            moneda(0);


        $("ivaFinal").textContent =
            moneda(0);


        $("totalFinal").textContent =
            moneda(0);


        // Las casetas quedan vacías al abrir.
        // Solo se crean/cargan cuando el usuario pulsa "CARGAR CASETAS"
        // o agrega una caseta manualmente.

        modalFinalizar.style.display =
            "flex";

    }


    function cancelarFinalizacion() {

        modalFinalizar.style.display =
            "none";


        viajeSeleccionado =
            null;

        $("finalDestino").textContent = "—";
        $("finalMunicipio").textContent = "—";
        $("finalOperador").textContent = "—";
        $("finalUnidad").textContent = "—";
        $("finalSalida").textContent = "—";
        $("rutaGuardada").value = "";
        $("estadoRutaCierre").textContent = "PUEDES CAPTURAR LAS CASETAS MANUALMENTE.";
        $("estadoRutaCierre").className = "route-loader-status";

        renderizarTabla();

    }


    function etiquetaRuta(ruta) {
        return `${mayusculas(ruta.origen)} → ${mayusculas(ruta.destino)}`;
    }


    function rutaCoincideConViaje(ruta, viaje) {
        const origenIgual = normalizarTextoRuta(ruta.origen) === normalizarTextoRuta(viaje.origen);
        const destinoIgual = normalizarTextoRuta(ruta.destino) === normalizarTextoRuta(viaje.destino);
        if (!origenIgual || !destinoIgual) return false;

        const municipioRuta = normalizarTextoRuta(ruta.municipio || "");
        const municipioViaje = normalizarTextoRuta(viaje.municipio || "");
        return !municipioRuta || !municipioViaje || municipioRuta === municipioViaje;
    }


    function encontrarRutaSeleccionada() {
        const texto = mayusculas($("rutaGuardada")?.value || "");
        if (!texto) return null;

        return rutas.find(r => mayusculas(etiquetaRuta(r)) === texto) ||
            rutas.find(r => mayusculas(r.destino) === texto) ||
            rutas.find(r => mayusculas(r.origen) === texto);
    }


    function mostrarSugerenciasRutaCierre() {
        const input=$("rutaGuardada"), box=$("sugerenciasRutaCierre");
        if(!input||!box)return;
        const q=normalizarTextoRuta(input.value||"");
        const lista=(rutas||[]).filter(r=>{
            const etiqueta=normalizarTextoRuta(etiquetaRuta(r));
            const destino=normalizarTextoRuta(r.destino||"");
            const origen=normalizarTextoRuta(r.origen||"");
            return !q || etiqueta.includes(q) || destino.includes(q) || origen.includes(q);
        }).slice(0,8);
        if(!lista.length){box.hidden=true;box.innerHTML="";return;}
        box.innerHTML=lista.map(r=>`<button type="button" class="route-suggestion" data-route-id="${r.id}"><span><strong>${escapeHtml(etiquetaRuta(r))}</strong><small>${escapeHtml(r.municipio||"MUNICIPIO NO REGISTRADO")} · ${escapeHtml(r.tipo_unidad||"MANUAL")} · ${escapeHtml(r.ejes||"MANUAL")} · ${(r.casetas||[]).length} CASETAS</small></span><b>${moneda((r.casetas||[]).reduce((a,c)=>a+Number(c.costo||0),0))}</b></button>`).join("");
        box.hidden=false;
        // pointerdown evita que el blur/cierre del menú ocurra antes de
        // seleccionar la ruta. Esto corrige el problema de "tengo que
        // buscarla dos veces" en mouse y, especialmente, en pantallas táctiles.
        box.querySelectorAll(".route-suggestion").forEach(btn => {
            btn.addEventListener("pointerdown", (event) => {
                event.preventDefault();
                const r = (rutas || []).find(
                    x => String(x.id) === String(btn.dataset.routeId)
                );
                if (!r) return;

                input.value = etiquetaRuta(r);
                ocultarSugerenciasRutaCierre();

                // Seleccionar una ruta NO la carga.
                // La carga de casetas ocurre exclusivamente al pulsar
                // "CARGAR CASETAS".
                mostrarEstadoRutaSeleccionada();
            });
        });
    }

    function ocultarSugerenciasRutaCierre(){const box=$("sugerenciasRutaCierre");if(box)box.hidden=true;}

    function mostrarEstadoRutaSeleccionada() {
        const estado = $("estadoRutaCierre");
        if (!estado) return;
        const ruta = encontrarRutaSeleccionada();
        if (ruta) {
            estado.textContent = `${(ruta.casetas || []).length} CASETA(S) PREDEFINIDA(S). PULSA CARGAR CASETAS.`;
            estado.className = "route-loader-status ok";
        } else {
            estado.textContent = "PUEDES CAPTURAR LAS CASETAS MANUALMENTE.";
            estado.className = "route-loader-status warn";
        }
    }


    function cargarRutaSeleccionada(opciones = {}) {
        ocultarSugerenciasRutaCierre();

        const reemplazar = opciones.reemplazar === true;
        const mostrarOrigen = opciones.mostrarOrigen !== false;
        // Si la selección viene directamente del menú, usamos ese objeto.
        // Así evitamos depender de que el navegador dispare change/blur.
        const ruta = opciones.rutaDirecta || encontrarRutaSeleccionada();
        const estado = $("estadoRutaCierre");

        if (ruta) {

            const casetas = ruta.casetas || [];
            if (reemplazar) {
                $("listaCasetas").innerHTML = "";
                $("listaCasetas").dataset.rutasCargadas = "";
            }
            // Una ruta puede cargarse varias veces; el usuario decide cuántas casetas necesita.
            casetas.forEach(c => agregarCasetaEnEspacioVacio(c.nombre, c.costo));
            actualizarTotalesFinal();

            if (estado) {
                estado.textContent = `${mostrarOrigen ? "RUTA DEL CATÁLOGO" : "RUTA"}: ${etiquetaRuta(ruta)} · ${casetas.length} CASETA(S) AGREGADAS. PUEDES CARGAR OTRA RUTA.`;
                estado.className = "route-loader-status ok";
            }

            return;

        }

        // También permitimos cargar una ruta directamente del catálogo Excel.
        const texto = normalizarTextoRuta($("rutaGuardada")?.value || "");
        const catalogo = catalogoRutas.find(r => {
            const etiqueta = `${normalizarTextoRuta(r.inicio || "MATRIZ")} → ${normalizarTextoRuta(r.ciudad || "")}`;
            return etiqueta === texto ||
                normalizarTextoRuta(r.ciudad) === texto;
        });

        if (catalogo) {
            const casetas = obtenerCasetasCatalogo(catalogo);
            if (reemplazar) {
                $("listaCasetas").innerHTML = "";
                $("listaCasetas").dataset.rutasCargadas = "";
            }
            // También el catálogo puede seleccionarse repetidamente.
            casetas.forEach(c => agregarCasetaEnEspacioVacio(c.nombre, c.costo));
            actualizarTotalesFinal();

            if (estado) {
                estado.textContent = `RUTA DEL CATÁLOGO: ${mayusculas(catalogo.ciudad)} · ${catalogo.tipo_unidad || ""} · ${catalogo.ejes || ""} · ${casetas.length} CASETA(S). PUEDES MODIFICARLAS.`;
                estado.className = "route-loader-status ok";
            }
            return;
        }

        if (estado) {
            estado.textContent = "NO SE ENCONTRÓ ESA RUTA. PUEDES CONTINUAR DE FORMA MANUAL.";
            estado.className = "route-loader-status warn";
        }

    }


    function prepararRutaParaViaje(viaje) {
        // Intencionalmente no se carga ninguna ruta de forma automática.
        // La ruta/casetas deben ser seleccionadas y cargadas por el usuario.
        return false;
    }

    function asegurarEspacioCasetaVacio() {
        const contenedor = $("listaCasetas");
        if (!contenedor) return;
        const existeVacia = [...contenedor.querySelectorAll(".caseta-row")].some(fila => {
            const nombre = fila.querySelector(".caseta-nombre")?.value.trim() || "";
            const costo = fila.querySelector(".caseta-costo")?.value.trim() || "";
            return !nombre && !costo;
        });
        if (!existeVacia) agregarCaseta();
    }


    function agregarCasetaEnEspacioVacio(nombre = "", costo = "") {
        const filas = [...document.querySelectorAll("#listaCasetas .caseta-row")];
        const vacia = filas.find(fila => {
            const nombreActual = fila.querySelector(".caseta-nombre")?.value.trim() || "";
            const costoActual = fila.querySelector(".caseta-costo")?.value.trim() || "";
            return !nombreActual && !costoActual;
        });

        if (vacia) {
            vacia.querySelector(".caseta-nombre").value = nombre || "";
            vacia.querySelector(".caseta-costo").value = costo ?? "";
            actualizarTotalesFinal();
            return;
        }

        agregarCaseta(nombre, costo);
    }


    function agregarCaseta(
        nombre = "",
        costo = ""
    ) {

        const contenedor =
            $("listaCasetas");


        const fila =
            document.createElement(
                "div"
            );


        fila.className =
            "caseta-row";


        fila.innerHTML =
            `

            <div class="caseta-numero">
                CASETA
            </div>

            <input
                type="text"
                class="caseta-nombre"
                placeholder="NOMBRE DE CASETA"
                value="${escapeHtml(nombre)}">

            <input
                type="number"
                class="caseta-costo"
                placeholder="COSTO"
                min="0"
                step="0.01"
                value="${costo}">

            <button
                type="button"
                class="btn-remove-caseta">

                ×

            </button>

            `;


        fila.querySelector(
            ".btn-remove-caseta"
        )
            .addEventListener(
                "click",
                () => {

                    fila.remove();

                    actualizarTotalesFinal();

                }
            );


        contenedor.appendChild(
            fila
        );


        actualizarTotalesFinal();

    }


    function obtenerCasetasDesdeDOM() {
        return [...document.querySelectorAll("#listaCasetas .caseta-row")]
            .map(fila => ({
                nombre: mayusculas(fila.querySelector(".caseta-nombre")?.value || ""),
                costo: Number(fila.querySelector(".caseta-costo")?.value || 0)
            }))
            .filter(c => c.nombre || c.costo > 0);
    }

    function actualizarTotalesFinal() {

        const casetas =
            obtenerCasetasDesdeDOM();


        const costos =
            calcularCostos(
                casetas
            );


        $("subtotalFinal").textContent =
            moneda(
                costos.subtotal
            );


        $("ivaFinal").textContent =
            moneda(
                costos.iva
            );


        $("totalFinal").textContent =
            moneda(
                costos.total
            );

    }


    // ========================================================
    // GUARDAR FINALIZACIÓN
    // ========================================================

    async function guardarFinalizacion(
        event
    ) {

        event.preventDefault();


        if (!viajeSeleccionado) {
            return;
        }


        const fechaFinal =
            $("fechaFinal").value;


        const horaFinal =
            $("horaFinal").value;


        if (
            !fechaFinal ||
            !horaFinal
        ) {

            alert(
                "CAPTURA FECHA Y HORA FINAL."
            );

            return;

        }


        const casetas =
            obtenerCasetasDesdeDOM();


        const costos =
            calcularCostos(
                casetas
            );


        try {

            /*
             * Primero eliminamos cualquier
             * caseta previa por seguridad.
             */

            const eliminar =
                await supabaseClient

                    .from("casetas")

                    .delete()

                    .eq(
                        "viaje_id",
                        viajeSeleccionado.id
                    );


            if (eliminar.error) {
                throw eliminar.error;
            }


            /*
             * Insertamos casetas.
             */

            if (
                casetas.length > 0
            ) {

                const registros =
                    casetas.map(
                        (caseta, index) => ({

                            viaje_id:
                                viajeSeleccionado.id,

                            nombre:
                                caseta.nombre,

                            costo:
                                caseta.costo,

                            orden:
                                index + 1

                        })
                    );


                const insertar =
                    await supabaseClient

                        .from("casetas")

                        .insert(
                            registros
                        );


                if (insertar.error) {
                    throw insertar.error;
                }

            }


            /*
             * Finalmente actualizamos
             * el viaje.
             */

            const actualizar =
                await supabaseClient

                    .from("viajes")

                    .update({

                        estatus:
                            "CONCLUIDO",

                        fecha_final:
                            fechaFinal,

                        hora_final:
                            horaFinal,

                        observaciones:
                            $("observacionesFinal")?.value.trim() || null,

                        subtotal:
                            costos.subtotal,

                        iva:
                            costos.iva,

                        total:
                            costos.total

                    })

                    .eq(
                        "id_viaje",
                        viajeSeleccionado.id_viaje
                    );


            if (actualizar.error) {
                throw actualizar.error;
            }


            alert(
                "VIAJE CONCLUIDO CORRECTAMENTE."
            );


            modalFinalizar.style.display =
                "none";


            viajeSeleccionado =
                null;


            await cargarViajes();

        }

        catch (error) {

            console.error(
                "ERROR FINALIZANDO:",
                error
            );


            alert(
                "NO SE PUDO FINALIZAR EL VIAJE.\n\n" +
                error.message
            );

        }

    }


    // ========================================================
    // ALERTAS DE SEGUIMIENTO CADA 3 HORAS
    // ========================================================

    const INTERVALO_ALERTA_MS = 3 * 60 * 60 * 1000;

    function normalizarTelefono(valor) {
        const digitos = String(valor || "").replace(/\D/g, "");
        if (!digitos) return "";
        if (digitos.length === 10) return "52" + digitos;
        if (digitos.startsWith("521") && digitos.length === 13) return "52" + digitos.slice(3);
        return digitos;
    }

    async function cargarTelefonosOperadores() {
        try {
            const { data, error } = await supabaseClient
                .from("operador_telefonos")
                .select("operador_id, telefono");
            if (error) throw error;
            const porId = new Map((data || []).map(x => [String(x.operador_id), normalizarTelefono(x.telefono)]));
            telefonosOperadores = new Map();
            (operadores || []).forEach(op => {
                const tel = porId.get(String(op.id));
                if (tel) telefonosOperadores.set(mayusculas(op.nombre), tel);
            });
        } catch (error) {
            console.warn("No se pudieron cargar teléfonos de operadores:", error.message);
            telefonosOperadores = new Map();
        }
    }

    function renderOperadorWhatsapp(viaje) {
        const nombre = String(viaje?.operador || "—");
        const telefono = telefonosOperadores.get(mayusculas(nombre));
        if (!telefono || nombre === "—") return escapeHtml(nombre);
        return `<a class="whatsapp-operador" href="https://wa.me/${telefono}" target="_blank" rel="noopener noreferrer" title="Abrir WhatsApp">${escapeHtml(nombre)}</a>`;
    }

    // ========================================================
    // CONTADORES
    // ========================================================

    function actualizarContadores() {
        // Los indicadores superiores fueron retirados del nuevo diseño.
        // Se conserva la función para compatibilidad con el flujo existente.
        return;
    }


})();