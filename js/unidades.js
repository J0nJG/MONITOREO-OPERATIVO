// ============================================================
// SISTEMA MONITOREO TAG
// UNIDADES.JS
// ============================================================

(function () {

    "use strict";


    const {
        mayusculas,
        escapeHtml
    } = window.SMT;


    let unidades =
        [];

    let editando =
        false;


    const $ =
        id =>
            document.getElementById(id);


    document.addEventListener(
        "DOMContentLoaded",
        iniciar
    );


    async function iniciar() {

        const sesion = await window.SistemaAuth?.ready;
        if (!sesion) return;

        conectarEventos();

        document.addEventListener("samsara:units-updated", () => cargarUnidades());

        await cargarUnidades();

    }


    function conectarEventos() {

        $("btnNuevaUnidad")?.addEventListener("click", abrirNueva);


        $("cerrarModalUnidad")
            ?.addEventListener(
                "click",
                cerrarModal
            );


        $("btnCancelarUnidad")
            ?.addEventListener(
                "click",
                cerrarModal
            );


        $("formUnidad")
            ?.addEventListener(
                "submit",
                guardar
            );


        $("buscarUnidad")
            ?.addEventListener(
                "input",
                renderizar
            );


        $("filtroActivoUnidad")
            ?.addEventListener(
                "change",
                renderizar
            );


        $("tablaUnidades")
            ?.addEventListener(
                "click",
                manejarTabla
            );

    }


    async function cargarUnidades() {

        const {
            data,
            error
        } = await supabaseClient

            .from("unidades")

            .select("*")

            .order(
                "eco",
                {
                    ascending: true
                }
            );


        if (error) {

            console.error(
                error
            );


            alert(
                "NO SE PUDIERON CARGAR LAS UNIDADES.\n\n" +
                error.message
            );


            return;

        }


        unidades =
            data || [];


        renderizar();

    }


    function obtenerFiltradas() {

        const buscar =
            mayusculas(
                $("buscarUnidad")?.value
            );


        const filtro =
            $("filtroActivoUnidad")?.value;


        return unidades.filter(
            unidad => {

                const texto =
                    [
                        unidad.eco,
                        unidad.placas,
                        unidad.tipo_unidad,
                        unidad.descripcion
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
                    filtro !== "" &&
                    String(
                        unidad.activo
                    ) !== filtro
                ) {

                    return false;

                }


                return true;

            }
        );

    }


    function renderizar() {

        const tabla =
            $("tablaUnidades");


        tabla.innerHTML =
            "";


        const lista =
            obtenerFiltradas();


        if (
            lista.length === 0
        ) {

            tabla.innerHTML =
                `
                <tr>
                    <td colspan="9" class="empty-state">
                        NO HAY UNIDADES.
                    </td>
                </tr>
                `;

            return;

        }


        lista.forEach(
            unidad => {

                const tr =
                    document.createElement(
                        "tr"
                    );


                tr.innerHTML =
                    `

                    <td>
                        ${unidad.id}
                    </td>

                    <td>
                        <strong>
                            ${escapeHtml(unidad.eco)}
                        </strong>
                    </td>

                    <td>
                        ${escapeHtml(unidad.placas || "SIN PLACAS")}
                    </td>

                    <td>
                        ${escapeHtml(unidad.tipo_unidad || "SIN TIPO")}
                    </td>

                    <td>
                        ${escapeHtml(unidad.descripcion || "SIN DESCRIPCIÓN")}
                    </td>

                    <td>

                        <span class="badge ${
                            unidad.activo
                                ? "badge-success"
                                : "badge-danger"
                        }">

                            ${
                                unidad.activo
                                    ? "ACTIVA"
                                    : "INACTIVA"
                            }

                        </span>

                    </td>

                    <td>
                        ${unidad.samsara_vehicle_id
                            ? '<span class="status-badge ok">✓ VINCULADA</span>'
                            : '<span class="status-badge">SIN VÍNCULO</span>'}
                    </td>

                    <td>

                        <button
                            class="btn-table btn-editar-unidad"
                            data-id="${unidad.id}">

                            EDITAR

                        </button>

                        <button
                            class="btn-table ${
                                unidad.activo
                                    ? "btn-danger"
                                    : "btn-success"
                            } btn-toggle-unidad"
                            data-id="${unidad.id}">

                            ${
                                unidad.activo
                                    ? "DESACTIVAR"
                                    : "ACTIVAR"
                            }

                        </button>

                    </td>

                    `;


                tabla.appendChild(
                    tr
                );

            }
        );

    }


    async function manejarTabla(
        event
    ) {

        const editar =
            event.target.closest(
                ".btn-editar-unidad"
            );


        if (editar) {

            abrirEdicion(
                editar.dataset.id
            );

            return;

        }


        const toggle =
            event.target.closest(
                ".btn-toggle-unidad"
            );


        if (toggle) {

            await cambiarActivo(
                toggle.dataset.id
            );

        }

    }


    function abrirNueva() {

        editando =
            false;


        $("tituloModalUnidad")
            .textContent =
            "NUEVA UNIDAD";


        $("unidadId").value =
            "";


        $("ecoUnidad").value =
            "";


        $("placasUnidad").value =
            "";


        $("tipoUnidad").value =
            "";

        $("descripcionUnidad").value =
            "";


        $("modalUnidad")
            .style.display =
            "flex";

    }


    function abrirEdicion(
        id
    ) {

        const unidad =
            unidades.find(
                item =>
                    String(item.id) ===
                    String(id)
            );


        if (!unidad) {
            return;
        }


        editando =
            true;


        $("tituloModalUnidad")
            .textContent =
            "EDITAR UNIDAD";


        $("unidadId").value =
            unidad.id;


        $("ecoUnidad").value =
            unidad.eco || "";


        $("placasUnidad").value =
            unidad.placas || "";


        $("tipoUnidad").value =
            unidad.tipo_unidad || "";

        $("descripcionUnidad").value =
            unidad.descripcion || "";


        $("modalUnidad")
            .style.display =
            "flex";

    }


    function cerrarModal() {

        $("modalUnidad")
            .style.display =
            "none";

    }


    async function guardar(
        event
    ) {

        event.preventDefault();


        const eco =
            mayusculas(
                $("ecoUnidad").value
            );


        const placas =
            mayusculas(
                $("placasUnidad").value
            ) || null;


        const tipoUnidad =
            mayusculas(
                $("tipoUnidad").value
            ) || null;

        const descripcion =
            mayusculas(
                $("descripcionUnidad").value
            ) || null;


        if (!eco) {

            alert(
                "CAPTURA EL ECO DE LA UNIDAD."
            );

            return;

        }


        try {

            let resultado;


            if (editando) {

                resultado =
                    await supabaseClient

                        .from("unidades")

                        .update({
                            eco: eco,
                            placas: placas,
                            tipo_unidad: tipoUnidad,
                            descripcion: descripcion,
                            updated_at: new Date().toISOString()
                        })

                        .eq(
                            "id",
                            $("unidadId").value
                        );

            }

            else {

                resultado =
                    await supabaseClient

                        .from("unidades")

                        .insert({
                            eco: eco,
                            placas: placas,
                            tipo_unidad: tipoUnidad,
                            descripcion: descripcion,
                            activo: true
                        });

            }


            if (resultado.error) {
                throw resultado.error;
            }


            alert(
                "UNIDAD GUARDADA CORRECTAMENTE."
            );


            cerrarModal();

            await cargarUnidades();

        }

        catch (error) {

            console.error(
                error
            );


            const mensaje = error?.code === "42501"
                ? "TU USUARIO NO TIENE PERMISOS PARA MODIFICAR UNIDADES. SOLICITA ACCESO DE ADMINISTRADOR."
                : "NO SE PUDO GUARDAR LA UNIDAD.\n\n" + error.message;

            alert(mensaje);

        }

    }


    async function cambiarActivo(
        id
    ) {

        const unidad =
            unidades.find(
                item =>
                    String(item.id) ===
                    String(id)
            );


        if (!unidad) {
            return;
        }


        const nuevoEstado =
            !unidad.activo;


        const {
            error
        } = await supabaseClient

            .from("unidades")

            .update({

                activo:
                    nuevoEstado

            })

            .eq(
                "id",
                id
            );


        if (error) {

            console.error(
                error
            );


            alert(
                "NO SE PUDO CAMBIAR EL ESTADO.\n\n" +
                error.message
            );


            return;

        }


        await cargarUnidades();

    }



})();