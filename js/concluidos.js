// ============================================================
// SISTEMA MONITOREO TAG
// CONCLUIDOS.JS
// ============================================================

(function () {

    "use strict";


    const {
        mayusculas,
        escapeHtml,
        formatearFecha,
        formatearHora,
        hoyISO,
        validarHora24,
        moneda,
        calcularCostos,
        claseEstatus,
        ESTATUS
    } = window.SMT;


    let viajes =
        [];

    let viajeEditando =
        null;


    const $ =
        id =>
            document.getElementById(id);


    // Semana ISO: lunes a domingo, igual que el control semanal del sistema.
    function obtenerDatosSemana(fechaISO) {
        if (!fechaISO) return null;
        const fecha = new Date(`${fechaISO}T12:00:00`);
        if (Number.isNaN(fecha.getTime())) return null;
        const dia = fecha.getDay() || 7;
        const lunes = new Date(fecha);
        lunes.setDate(fecha.getDate() - dia + 1);
        const domingo = new Date(lunes);
        domingo.setDate(lunes.getDate() + 6);
        const jueves = new Date(fecha);
        jueves.setDate(fecha.getDate() + (4 - dia));
        const inicioAnio = new Date(jueves.getFullYear(), 0, 1);
        const numeroSemana = Math.ceil((((jueves - inicioAnio) / 86400000) + 1) / 7);
        const iso = d => d.toISOString().slice(0, 10);
        return { anio: jueves.getFullYear(), numeroSemana, inicioSemana: iso(lunes), finSemana: iso(domingo) };
    }


    document.addEventListener(
        "DOMContentLoaded",
        iniciar
    );


    async function iniciar() {

        const sesion = await window.SistemaAuth?.ready;
        if (!sesion) return;

        conectarEventos();

        // Por defecto, "DÍA DE INICIO DE RUTA" siempre apunta a hoy.
        if ($("filtroFechaFinal")) {
            $("filtroFechaFinal").value = hoyISO();
        }

        await cargarViajes();

    }


    // ========================================================
    // EVENTOS
    // ========================================================

    function conectarEventos() {

        $("buscar")
            ?.addEventListener(
                "input",
                renderizar
            );


        $("filtroFechaFinal")
            ?.addEventListener(
                "change",
                renderizar
            );


        $("btnHoyConcluidos")
            ?.addEventListener(
                "click",
                () => {
                    $("filtroFechaFinal").value =
                        hoyISO();
                    renderizar();
                }
            );


        $("btnLimpiarFiltros")
            ?.addEventListener(
                "click",
                limpiarFiltros
            );


        $("filtroAnio")
            ?.addEventListener(
                "change",
                renderizar
            );


        $("filtroSemana")
            ?.addEventListener(
                "change",
                renderizar
            );


        $("filtroOperador")
            ?.addEventListener(
                "change",
                renderizar
            );


        $("filtroEco")
            ?.addEventListener(
                "change",
                renderizar
            );


        $("btnRecargarConcluidos")
            ?.addEventListener(
                "click",
                cargarViajes
            );


        $("btnExportarExcel")
            ?.addEventListener(
                "click",
                exportarExcel
            );


        $("btnCerrarEdicion")
            ?.addEventListener(
                "click",
                cerrarEdicion
            );


        $("btnCancelarEdicion")
            ?.addEventListener(
                "click",
                cerrarEdicion
            );


        $("btnAgregarCasetaEditar")
            ?.addEventListener(
                "click",
                () => agregarCasetaEditar()
            );


        $("editarEstatusViaje")
            ?.addEventListener("change", actualizarEstiloEstatusEdicion);


        $("listaCasetasEditar")
            ?.addEventListener(
                "input",
                actualizarTotalesEditar
            );


        $("formEditarFinalizado")
            ?.addEventListener(
                "submit",
                guardarEdicion
            );


        $("tablaConcluidos")
            ?.addEventListener(
                "click",
                manejarTabla
            );

    }


    // ========================================================
    // CARGAR
    // ========================================================

    async function cargarViajes() {

        const {
            data,
            error
        } = await supabaseClient

            .from("viajes")

            .select("*")

            .eq(
                "estatus",
                "CONCLUIDO"
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
                error
            );


            alert(
                "NO SE PUDIERON CARGAR LOS VIAJES CONCLUIDOS.\n\n" +
                error.message
            );


            return;

        }


        viajes =
            data || [];


        cargarFiltros();

        renderizar();

    }


    // ========================================================
    // FILTROS
    // ========================================================

    function cargarFiltros() {

        const anios =
            [
                ...new Set(
                    viajes
                        .map(
                            viaje =>
                                viaje.anio
                        )
                        .filter(Boolean)
                )
            ]
            .sort(
                (a, b) =>
                    b - a
            );


        const semanas =
            [
                ...new Set(
                    viajes
                        .map(
                            viaje =>
                                viaje.numero_semana
                        )
                        .filter(Boolean)
                )
            ]
            .sort(
                (a, b) =>
                    a - b
            );


        const operadores =
            [
                ...new Set(
                    viajes
                        .map(
                            viaje =>
                                viaje.operador
                        )
                        .filter(Boolean)
                )
            ]
            .sort();


        const ecos =
            [
                ...new Set(
                    viajes
                        .map(
                            viaje =>
                                viaje.eco
                        )
                        .filter(Boolean)
                )
            ]
            .sort();


        llenarSelect(
            $("filtroAnio"),
            anios,
            valor =>
                valor,
            valor =>
                valor
        );


        llenarSelect(
            $("filtroSemana"),
            semanas,
            valor =>
                valor,
            valor =>
                `SEMANA ${valor}`
        );


        llenarSelect(
            $("filtroOperador"),
            operadores,
            valor =>
                valor,
            valor =>
                valor
        );


        llenarSelect(
            $("filtroEco"),
            ecos,
            valor =>
                valor,
            valor =>
                valor
        );

    }


    function llenarSelect(
        select,
        valores,
        valueFn,
        textFn
    ) {

        if (!select) {
            return;
        }


        const valorActual =
            select.value;


        const primera =
            select.options[0]
                ?.outerHTML ||
            "";


        select.innerHTML =
            primera;


        valores.forEach(
            valor => {

                const option =
                    document.createElement(
                        "option"
                    );


                option.value =
                    valueFn(valor);


                option.textContent =
                    textFn(valor);


                select.appendChild(
                    option
                );

            }
        );


        if (
            valores
                .map(valueFn)
                .includes(valorActual)
        ) {

            select.value =
                valorActual;

        }

    }


    // ========================================================
    // OBTENER FILTRADOS
    // ========================================================

    function obtenerFiltrados() {

        const buscar =
            mayusculas(
                $("buscar")?.value
            );


        const fechaInicio =
            $("filtroFechaFinal")?.value || "";


        const anio =
            $("filtroAnio")?.value;


        const semana =
            $("filtroSemana")?.value;


        const operador =
            $("filtroOperador")?.value;


        const eco =
            $("filtroEco")?.value;


        return viajes.filter(
            viaje => {

                const texto =
                    [
                        viaje.id_viaje,
                        viaje.ot,
                        viaje.tag,
                        viaje.operador,
                        viaje.eco,
                        viaje.origen,
                        viaje.destino,
                        viaje.municipio
                    ]
                        .join(" ")
                        .toUpperCase();


                if (
                    buscar &&
                    !texto.includes(
                        buscar
                    )
                ) {

                    return false;

                }


                if (
                    fechaInicio &&
                    String(viaje.fecha || "") !== String(fechaInicio)
                ) {

                    return false;

                }


                if (
                    anio &&
                    String(
                        viaje.anio
                    ) !== String(anio)
                ) {

                    return false;

                }


                if (
                    semana &&
                    String(
                        viaje.numero_semana
                    ) !== String(semana)
                ) {

                    return false;

                }


                if (
                    operador &&
                    viaje.operador !== operador
                ) {

                    return false;

                }


                if (
                    eco &&
                    viaje.eco !== eco
                ) {

                    return false;

                }


                return true;

            }
        );

    }


    function limpiarFiltros() {

        $("buscar").value = "";
        $("filtroFechaFinal").value = "";
        $("filtroAnio").value = "";
        $("filtroSemana").value = "";
        $("filtroOperador").value = "";
        $("filtroEco").value = "";

        renderizar();

    }


    // ========================================================
    // TABLA
    // ========================================================

    function renderizar() {

        const lista =
            obtenerFiltrados();


        const tabla =
            $("tablaConcluidos");


        tabla.innerHTML =
            "";


        $("contadorConcluidos")
            .textContent =
            `${lista.length} REGISTRO${lista.length === 1 ? "" : "S"}`;


        if (
            lista.length === 0
        ) {

            tabla.innerHTML =
                `
                <tr>
                    <td colspan="15" class="empty-state">
                        NO HAY VIAJES CONCLUIDOS QUE COINCIDAN CON LOS FILTROS.
                    </td>
                </tr>
                `;

            return;

        }


        lista.forEach(
            viaje => {

                const tr =
                    document.createElement(
                        "tr"
                    );


                tr.innerHTML =
                    `

                    <td>
                        <strong>
                            ${escapeHtml(viaje.id_viaje)}
                        </strong>
                    </td>

                    <td>
                        ${escapeHtml(viaje.ot)}
                    </td>

                    <td>
                        ${formatearFecha(viaje.fecha)}
                    </td>

                    <td>
                        ${formatearHora(viaje.hora_salida)}
                    </td>

                    <td>
                        ${escapeHtml(viaje.tag || "—")}
                    </td>

                    <td>
                        ${escapeHtml(viaje.operador)}
                    </td>

                    <td>
                        ${escapeHtml(viaje.ejes)}
                    </td>

                    <td>
                        ${escapeHtml(viaje.eco || "—")}
                    </td>

                    <td>
                        ${escapeHtml(viaje.origen || "—")}
                    </td>

                    <td>
                        ${escapeHtml(viaje.destino || "—")}
                    </td>

                    <td>
                        ${formatearFecha(viaje.fecha_final)}
                    </td>

                    <td>
                        ${formatearHora(viaje.hora_final)}
                    </td>

                    <td>

                        <select
                            class="status-select concluido"
                            disabled>

                            <option selected>
                                CONCLUIDO
                            </option>

                        </select>

                    </td>

                    <td>
                        <strong>
                            ${moneda(viaje.total)}
                        </strong>
                    </td>

                    <td>

                        <button
                            class="btn-table btn-editar"
                            data-id="${escapeHtml(viaje.id_viaje)}">

                            EDITAR

                        </button>

                    </td>

                    `;


                tabla.appendChild(
                    tr
                );

            }
        );

    }


    // ========================================================
    // CLICK TABLA
    // ========================================================

    async function manejarTabla(event) {

        const boton =
            event.target.closest(
                ".btn-editar"
            );


        if (!boton) {
            return;
        }


        await abrirEdicion(
            boton.dataset.id
        );

    }


    function actualizarEstiloEstatusEdicion() {
        const select = $("editarEstatusViaje");
        if (!select) return;
        select.className = `status-select ${claseEstatus(select.value)}`;
    }


    // ========================================================
    // ABRIR EDICIÓN
    // ========================================================

    async function abrirEdicion(
        idViaje
    ) {

        viajeEditando =
            viajes.find(
                viaje =>
                    viaje.id_viaje ===
                    idViaje
            );


        if (!viajeEditando) {
            return;
        }

        $("editarIdViaje").value = viajeEditando.id_viaje || "";
        $("editarOtViaje").value = viajeEditando.ot || "SOT-OFM";
        $("editarFechaViaje").value = viajeEditando.fecha || "";
        $("editarHoraViaje").value = formatearHora(viajeEditando.hora_salida);
        $("editarOperadorViaje").value = viajeEditando.operador || "";
        $("editarTagViaje").value = viajeEditando.tag || "";
        $("editarEjesViaje").value = viajeEditando.ejes || "";
        $("editarEcoViaje").value = viajeEditando.eco || "";
        $("editarOrigenViaje").value = viajeEditando.origen || "";
        $("editarDestinoViaje").value = viajeEditando.destino || "";
        $("editarMunicipioViaje").value = viajeEditando.municipio || "";
        $("editarEstatusViaje").value = viajeEditando.estatus || "CONCLUIDO";
        actualizarEstiloEstatusEdicion();
        $("editarObservaciones").value = viajeEditando.observaciones || "";


        $("editarFechaFinal").value =
            viajeEditando.fecha_final ||
            "";


        $("editarHoraFinal").value =
            formatearHora(
                viajeEditando.hora_final
            );


        $("listaCasetasEditar").innerHTML =
            "";


        const {
            data,
            error
        } = await supabaseClient

            .from("casetas")

            .select("*")

            .eq(
                "viaje_id",
                viajeEditando.id
            )

            .order(
                "orden",
                {
                    ascending: true
                }
            );


        if (error) {

            console.error(
                error
            );


            alert(
                "NO SE PUDIERON CARGAR LAS CASETAS.\n\n" +
                error.message
            );


            return;

        }


        (
            data || []
        ).forEach(
            caseta => {

                agregarCasetaEditar(
                    caseta.nombre,
                    caseta.costo
                );

            }
        );


        if (
            !data ||
            data.length === 0
        ) {

            agregarCasetaEditar();

        }


        actualizarTotalesEditar();


        $("modalEditarFinalizado")
            .style.display =
            "flex";

    }


    // ========================================================
    // CASETAS
    // ========================================================

    function agregarCasetaEditar(
        nombre = "",
        costo = ""
    ) {

        const contenedor =
            $("listaCasetasEditar");


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

                    actualizarTotalesEditar();

                }
            );


        contenedor.appendChild(
            fila
        );


        actualizarTotalesEditar();

    }


    function obtenerCasetasEditar() {

        return [
            ...document.querySelectorAll(
                "#listaCasetasEditar .caseta-row"
            )
        ]
            .map(
                fila => ({

                    nombre:
                        mayusculas(
                            fila.querySelector(
                                ".caseta-nombre"
                            ).value
                        ),

                    costo:
                        Number(
                            fila.querySelector(
                                ".caseta-costo"
                            ).value || 0
                        )

                })
            )
            .filter(
                caseta =>
                    caseta.nombre ||
                    caseta.costo > 0
            );

    }


    function actualizarTotalesEditar() {

        const casetas =
            obtenerCasetasEditar();


        const costos =
            calcularCostos(
                casetas
            );


        $("editarSubtotal")
            .textContent =
            moneda(
                costos.subtotal
            );


        $("editarIva")
            .textContent =
            moneda(
                costos.iva
            );


        $("editarTotal")
            .textContent =
            moneda(
                costos.total
            );

    }


    // ========================================================
    // GUARDAR EDICIÓN
    // ========================================================

    async function guardarEdicion(
        event
    ) {

        event.preventDefault();


        if (!viajeEditando) {
            return;
        }


        const fecha = $("editarFechaViaje").value;
        const horaSalida = validarHora24($("editarHoraViaje").value);
        const operador = mayusculas($("editarOperadorViaje").value);
        const tag = mayusculas($("editarTagViaje").value) || null;
        const ejes = mayusculas($("editarEjesViaje").value);
        const eco = mayusculas($("editarEcoViaje").value);
        const origen = mayusculas($("editarOrigenViaje").value) || null;
        const destino = mayusculas($("editarDestinoViaje").value) || null;
        const municipio = mayusculas($("editarMunicipioViaje").value) || null;
        const observaciones = $("editarObservaciones").value.trim() || null;
        const fechaFinal = $("editarFechaFinal").value;
        const horaFinal = validarHora24($("editarHoraFinal").value);
        if (!horaSalida || !horaFinal) {
            alert("CAPTURA LAS HORAS EN FORMATO 24 HORAS. EJEMPLO: 22:00 O 2200.");
            if (!horaSalida) $("editarHoraViaje")?.focus(); else $("editarHoraFinal")?.focus();
            return;
        }
        $("editarHoraViaje").value = horaSalida;
        $("editarHoraFinal").value = horaFinal;
        const datosSemana = obtenerDatosSemana(fecha);
        if (!datosSemana) {
            alert("LA FECHA DEL VIAJE NO ES VÁLIDA.");
            return;
        }


        const casetas =
            obtenerCasetasEditar();


        const costos =
            calcularCostos(
                casetas
            );


        try {

            const eliminar =
                await supabaseClient

                    .from("casetas")

                    .delete()

                    .eq(
                        "viaje_id",
                        viajeEditando.id
                    );


            if (eliminar.error) {
                throw eliminar.error;
            }


            if (
                casetas.length > 0
            ) {

                const registros =
                    casetas.map(
                        (caseta, index) => ({

                            viaje_id:
                                viajeEditando.id,

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


            const actualizar =
                await supabaseClient

                    .from("viajes")

                    .update({
                        fecha,
                        hora_salida: horaSalida || null,
                        tag,
                        operador,
                        ejes,
                        eco,
                        origen,
                        destino,
                        municipio,
                        estatus: ESTATUS.includes(mayusculas($("editarEstatusViaje").value))
                            ? mayusculas($("editarEstatusViaje").value)
                            : "CONCLUIDO",
                        observaciones,
                        anio: datosSemana.anio,
                        numero_semana: datosSemana.numeroSemana,
                        inicio_semana: datosSemana.inicioSemana,
                        fin_semana: datosSemana.finSemana,
                        fecha_final: fechaFinal,
                        hora_final: horaFinal,
                        subtotal:
                            costos.subtotal,

                        iva:
                            costos.iva,

                        total:
                            costos.total

                    })

                    .eq(
                        "id_viaje",
                        viajeEditando.id_viaje
                    );


            if (actualizar.error) {
                throw actualizar.error;
            }


            alert(
                "CAMBIOS GUARDADOS CORRECTAMENTE."
            );


            cerrarEdicion();


            await cargarViajes();

        }

        catch (error) {

            console.error(
                error
            );


            alert(
                "NO SE PUDIERON GUARDAR LOS CAMBIOS.\n\n" +
                error.message
            );

        }

    }


    function cerrarEdicion() {

        $("modalEditarFinalizado")
            .style.display =
            "none";


        viajeEditando =
            null;

    }


    // ========================================================
    // EXPORTAR EXCEL
    // ========================================================

    async function exportarExcel() {

        if (
            typeof XLSX ===
            "undefined"
        ) {

            alert(
                "NO SE CARGÓ EL MÓDULO DE EXCEL."
            );

            return;

        }


        const lista =
            obtenerFiltrados();


        if (
            lista.length === 0
        ) {

            alert(
                "NO HAY VIAJES PARA EXPORTAR."
            );

            return;

        }


        const boton =
            $("btnExportarExcel");


        boton.disabled =
            true;


        boton.textContent =
            "GENERANDO...";


        try {

            const ids =
                lista.map(
                    viaje =>
                        viaje.id
                );


            const {
                data: casetas,
                error
            } = await supabaseClient

                .from("casetas")

                .select("*")

                .in(
                    "viaje_id",
                    ids
                )

                .order(
                    "orden",
                    {
                        ascending: true
                    }
                );


            if (error) {
                throw error;
            }


            const casetasPorViaje =
                {};


            (
                casetas || []
            ).forEach(
                caseta => {

                    if (
                        !casetasPorViaje[
                            caseta.viaje_id
                        ]
                    ) {

                        casetasPorViaje[
                            caseta.viaje_id
                        ] = [];

                    }


                    casetasPorViaje[
                        caseta.viaje_id
                    ].push(
                        caseta
                    );

                }
            );


            /*
             * Agrupamos por año + semana.
             */

            const grupos =
                {};


            lista.forEach(
                viaje => {

                    const clave =
                        `${viaje.anio}-${viaje.numero_semana}`;


                    if (
                        !grupos[clave]
                    ) {

                        grupos[clave] =
                            [];

                    }


                    grupos[clave].push(
                        viaje
                    );

                }
            );


            const workbook =
                XLSX.utils.book_new();


            Object.keys(grupos)
                .sort()
                .forEach(
                    clave => {

                        const viajesSemana =
                            grupos[clave]
                                .sort(
                                    (a, b) => {

                                        const fechaA =
                                            `${a.fecha} ${a.hora_salida || ""}`;

                                        const fechaB =
                                            `${b.fecha} ${b.hora_salida || ""}`;

                                        return fechaA
                                            .localeCompare(
                                                fechaB
                                            );

                                    }
                                );


                        let maxCasetas =
                            0;


                        viajesSemana.forEach(
                            viaje => {

                                maxCasetas =
                                    Math.max(
                                        maxCasetas,
                                        (
                                            casetasPorViaje[
                                                viaje.id
                                            ] || []
                                        ).length
                                    );

                            }
                        );


                        const encabezados =
                            [

                                "ID VIAJE",
                                "OT",
                                "FECHA",
                                "TAG",
                                "OPERADOR",
                                "EJES",
                                "ECO",
                                "ORIGEN",
                                "HORA SALIDA",
                                "DESTINO",
                                "MUNICIPIO / ALCALDIA",
                                "STATUS",
                                "FECHA FINAL",
                                "HORA FINAL",
                                "OBSERVACIONES"

                            ];


                        for (
                            let i = 1;
                            i <= maxCasetas;
                            i++
                        ) {

                            encabezados.push(
                                `CASETA ${i}`
                            );

                            encabezados.push(
                                `COSTO ${i}`
                            );

                        }


                        /*
                         * RESUMEN DE COSTOS
                         *
                         * Dejamos una columna vacía como separador visual
                         * entre las casetas y los totales. Así, al abrir
                         * el Excel, SUBTOTAL / IVA / TOTAL quedan siempre
                         * juntos y separados de las casetas sin ordenar nada.
                         */

                        encabezados.push(
                            "",
                            "SUBTOTAL",
                            "IVA",
                            "TOTAL"
                        );


                        const filas =
                            [
                                encabezados
                            ];


                        viajesSemana.forEach(
                            viaje => {

                                const fila =
                                    [

                                        viaje.id_viaje || "",
                                        viaje.ot || "",
                                        formatearFecha(viaje.fecha),
                                        viaje.tag || "",
                                        viaje.operador || "",
                                        viaje.ejes || "",
                                        viaje.eco || "",
                                        viaje.origen || "",
                                        formatearHora(viaje.hora_salida),
                                        viaje.destino || "",
                                        viaje.municipio || "",
                                        viaje.estatus || "",
                                        formatearFecha(viaje.fecha_final),
                                        formatearHora(viaje.hora_final),
                                        viaje.observaciones || ""

                                    ];


                                const listaCasetas =
                                    casetasPorViaje[
                                        viaje.id
                                    ] || [];


                                for (
                                    let i = 0;
                                    i < maxCasetas;
                                    i++
                                ) {

                                    const caseta =
                                        listaCasetas[i];


                                    fila.push(
                                        caseta
                                            ? caseta.nombre
                                            : ""
                                    );


                                    fila.push(
                                        caseta
                                            ? Number(caseta.costo || 0)
                                            : ""
                                    );

                                }


                                // Separador visual antes del resumen de costos.
                                fila.push(
                                    "",
                                    Number(
                                        viaje.subtotal || 0
                                    ),
                                    Number(
                                        viaje.iva || 0
                                    ),
                                    Number(
                                        viaje.total || 0
                                    )
                                );


                                filas.push(
                                    fila
                                );

                            }
                        );


                        const worksheet =
                            XLSX.utils.aoa_to_sheet(
                                filas
                            );


                        worksheet["!cols"] =
                            encabezados.map(
                                encabezado => {

                                    if (
                                        encabezado.includes(
                                            "CASETA"
                                        )
                                    ) {

                                        return {
                                            wch: 20
                                        };

                                    }


                                    if (encabezado === "") {
                                        return { wch: 4 };
                                    }

                                    if (
                                        encabezado.includes(
                                            "COSTO"
                                        ) ||
                                        encabezado === "SUBTOTAL" ||
                                        encabezado === "IVA" ||
                                        encabezado === "TOTAL"
                                    ) {

                                        return {
                                            wch: 13
                                        };

                                    }


                                    if (encabezado === "MUNICIPIO / ALCALDIA") {
                                        return { wch: 24 };
                                    }

                                    if (encabezado === "OBSERVACIONES") {
                                        return { wch: 28 };
                                    }

                                    if (encabezado === "OPERADOR") {
                                        return { wch: 24 };
                                    }

                                    if (encabezado === "DESTINO" || encabezado === "ORIGEN") {
                                        return { wch: 20 };
                                    }

                                    return {
                                        wch:
                                            Math.max(
                                                12,
                                                encabezado.length + 2
                                            )
                                    };

                                }
                            );


                        /*
                         * Formato moneda.
                         */

                        for (
                            let fila = 1;
                            fila < filas.length;
                            fila++
                        ) {

                            encabezados.forEach(
                                (
                                    encabezado,
                                    columna
                                ) => {

                                    if (
                                        encabezado.includes(
                                            "COSTO"
                                        ) ||
                                        encabezado ===
                                            "SUBTOTAL" ||
                                        encabezado ===
                                            "IVA" ||
                                        encabezado ===
                                            "TOTAL"
                                    ) {

                                        const celda =
                                            XLSX.utils.encode_cell({
                                                r: fila,
                                                c: columna
                                            });


                                        if (
                                            worksheet[
                                                celda
                                            ]
                                        ) {

                                            worksheet[
                                                celda
                                            ].z =
                                                "$#,##0.00";

                                        }

                                    }

                                }
                            );

                        }


                        const semana =
                            viajesSemana[0]
                                .numero_semana;


                        const nombreHoja =
                            `CONTROL TAG SEMANA ${semana}`
                                .substring(
                                    0,
                                    31
                                );


                        XLSX.utils.book_append_sheet(
                            workbook,
                            worksheet,
                            nombreHoja
                        );

                    }
                );


            const ahora =
                new Date();


            const nombreArchivo =
                `CONTROL_TAG_${ahora.getFullYear()}-${String(
                    ahora.getMonth() + 1
                ).padStart(2, "0")}-${String(
                    ahora.getDate()
                ).padStart(2, "0")}.xlsx`;


            XLSX.writeFile(
                workbook,
                nombreArchivo
            );


            alert(
                "EXCEL GENERADO CORRECTAMENTE."
            );

        }

        catch (error) {

            console.error(
                error
            );


            alert(
                "NO SE PUDO GENERAR EL EXCEL.\n\n" +
                error.message
            );

        }

        finally {

            boton.disabled =
                false;


            boton.textContent =
                "📊 EXPORTAR EXCEL";

        }

    }


})();