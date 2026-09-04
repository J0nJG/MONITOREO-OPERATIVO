// ============================================================
// SISTEMA MONITOREO TAG
// OPERADORES.JS
// ============================================================

(function () {

    "use strict";


    const {
        mayusculas,
        escapeHtml
    } = window.SMT;


    let operadores =
        [];

    let telefonos = new Map();

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

        await cargarOperadores();
        await cargarTelefonos();

    }


    function conectarEventos() {

        $("btnNuevoOperador")
            ?.addEventListener(
                "click",
                abrirNuevo
            );


        $("cerrarModalOperador")
            ?.addEventListener(
                "click",
                cerrarModal
            );


        $("btnCancelarOperador")
            ?.addEventListener(
                "click",
                cerrarModal
            );


        $("formOperador")
            ?.addEventListener(
                "submit",
                guardar
            );


        $("buscarOperador")
            ?.addEventListener(
                "input",
                renderizar
            );


        $("filtroActivo")
            ?.addEventListener(
                "change",
                renderizar
            );


        $("tablaOperadores")
            ?.addEventListener(
                "click",
                manejarTabla
            );

    }


    async function cargarOperadores() {

        const {
            data,
            error
        } = await supabaseClient

            .from("operadores")

            .select("*")

            .order(
                "nombre",
                {
                    ascending: true
                }
            );


        if (error) {

            console.error(
                error
            );


            alert(
                "NO SE PUDIERON CARGAR LOS OPERADORES.\n\n" +
                error.message
            );


            return;

        }


        operadores =
            data || [];


        renderizar();

    }


    async function cargarTelefonos() {
        try {
            const { data, error } = await supabaseClient
                .from("operador_telefonos")
                .select("operador_id, telefono")
                .eq("activo", true);
            if (error) throw error;
            telefonos = new Map((data || []).map(item => [String(item.operador_id), item.telefono || ""]));
        } catch (error) {
            console.warn("No se pudo cargar WhatsApp:", error.message);
            telefonos = new Map();
        }
    }

    function normalizarTelefono(valor) {
        const digitos = String(valor || "").replace(/\D/g, "");
        if (!digitos) return "";
        if (digitos.length === 10) return "52" + digitos;
        if (digitos.startsWith("521") && digitos.length === 13) return "52" + digitos.slice(3);
        return digitos;
    }

    async function guardarTelefono(operadorId, telefono) {
        if (!operadorId) return;
        const id = String(operadorId);
        if (!telefono) {
            const { error } = await supabaseClient.from("operador_telefonos").delete().eq("operador_id", id);
            if (error) throw error;
            return;
        }
        const { error } = await supabaseClient.from("operador_telefonos")
            .upsert({ operador_id: id, telefono, activo: true }, { onConflict: "operador_id" });
        if (error) throw error;
    }

    function renderNombreWhatsapp(operador) {
        const nombre = escapeHtml(operador.nombre || "SIN NOMBRE");
        const telefono = telefonos.get(String(operador.id));
        const telefonoSeguro = escapeHtml(telefono || "");

        if (!telefono) {
            return `
                <div class="operador-identidad">
                    <strong>${nombre}</strong>
                    <span class="operador-movil-telefono sin-telefono">SIN TELÉFONO</span>
                </div>
            `;
        }

        return `
            <div class="operador-identidad">
                <a class="whatsapp-operador" href="https://wa.me/${telefonoSeguro}" target="_blank" rel="noopener noreferrer" title="Abrir WhatsApp">${nombre}</a>
                <a class="operador-movil-telefono" href="https://wa.me/${telefonoSeguro}" target="_blank" rel="noopener noreferrer" title="Abrir WhatsApp">${telefonoSeguro}</a>
            </div>
        `;
    }


    function obtenerFiltrados() {

        const buscar =
            mayusculas(
                $("buscarOperador")?.value
            );


        const filtro =
            $("filtroActivo")?.value;


        return operadores.filter(
            operador => {

                const texto =
                    [
                        operador.nombre,
                        operador.tag,
                        telefonos.get(String(operador.id)) || ""
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
                        operador.activo
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
            $("tablaOperadores");


        tabla.innerHTML =
            "";


        const lista =
            obtenerFiltrados();


        if (
            lista.length === 0
        ) {

            tabla.innerHTML =
                `
                <tr>
                    <td colspan="5" class="empty-state">
                        NO HAY OPERADORES.
                    </td>
                </tr>
                `;

            return;

        }


        lista.forEach(
            operador => {

                const tr =
                    document.createElement(
                        "tr"
                    );


                tr.innerHTML =
                    `

                    <td>
                        ${operador.id}
                    </td>

                    <td>
                        ${renderNombreWhatsapp(operador)}
                    </td>

                    <td>
                        ${escapeHtml(operador.tag || "SIN TAG")}
                    </td>

                    <td>

                        <span class="badge ${
                            operador.activo
                                ? "badge-success"
                                : "badge-danger"
                        }">

                            ${
                                operador.activo
                                    ? "ACTIVO"
                                    : "INACTIVO"
                            }

                        </span>

                    </td>

                    <td>
                        <div class="operador-acciones" aria-label="Acciones del operador">
                            <button
                                type="button"
                                class="btn-table btn-editar-operador operador-accion-editar"
                                data-id="${operador.id}">
                                <span aria-hidden="true">✎</span>
                                <span>EDITAR</span>
                            </button>

                            <button
                                type="button"
                                class="btn-table ${
                                    operador.activo
                                        ? "btn-danger"
                                        : "btn-success"
                                } btn-toggle-operador operador-accion-estado"
                                data-id="${operador.id}">
                                <span aria-hidden="true">${operador.activo ? "⏸" : "▶"}</span>
                                <span>${operador.activo ? "DESACTIVAR" : "ACTIVAR"}</span>
                            </button>
                        </div>
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
                ".btn-editar-operador"
            );


        if (editar) {

            abrirEdicion(
                editar.dataset.id
            );

            return;

        }


        const toggle =
            event.target.closest(
                ".btn-toggle-operador"
            );


        if (toggle) {

            await cambiarActivo(
                toggle.dataset.id
            );

        }

    }


    function abrirNuevo() {

        editando =
            false;


        $("tituloModalOperador")
            .textContent =
            "NUEVO OPERADOR";


        $("operadorId").value =
            "";


        $("nombreOperador").value =
            "";


        $("tagOperador").value =
            "";

        $("telefonoOperador").value =
            "";


        $("modalOperador")
            .style.display =
            "flex";

    }


    function abrirEdicion(
        id
    ) {

        const operador =
            operadores.find(
                item =>
                    String(item.id) ===
                    String(id)
            );


        if (!operador) {
            return;
        }


        editando =
            true;


        $("tituloModalOperador")
            .textContent =
            "EDITAR OPERADOR";


        $("operadorId").value =
            operador.id;


        $("nombreOperador").value =
            operador.nombre || "";


        $("tagOperador").value =
            operador.tag || "";

        $("telefonoOperador").value =
            telefonos.get(String(operador.id)) || "";


        $("modalOperador")
            .style.display =
            "flex";

    }


    function cerrarModal() {

        $("modalOperador")
            .style.display =
            "none";

    }


    async function guardar(
        event
    ) {

        event.preventDefault();


        const nombre =
            mayusculas(
                $("nombreOperador").value
            );


        const tag =
            mayusculas(
                $("tagOperador").value
            ) || null;

        const telefono = normalizarTelefono($("telefonoOperador").value);


        if (!nombre) {

            alert(
                "CAPTURA EL NOMBRE DEL OPERADOR."
            );

            return;

        }


        try {

            let resultado;


            if (editando) {

                resultado =
                    await supabaseClient

                        .from("operadores")

                        .update({

                            nombre:
                                nombre,

                            tag:
                                tag

                        })

                        .eq(
                            "id",
                            $("operadorId").value
                        );

            }

            else {

                resultado =
                    await supabaseClient

                        .from("operadores")

                        .insert({

                            nombre:
                                nombre,

                            tag:
                                tag,

                            activo:
                                true

                        })
                        .select("id")
                        .single();

            }


            if (resultado.error) {
                throw resultado.error;
            }


            alert(
                "OPERADOR GUARDADO CORRECTAMENTE."
            );


            const operadorGuardadoId = editando
                ? $("operadorId").value
                : resultado.data?.id;

            if (operadorGuardadoId) await guardarTelefono(operadorGuardadoId, telefono);

            cerrarModal();

            await cargarOperadores();
            await cargarTelefonos();

        }

        catch (error) {

            console.error(
                error
            );


            const mensaje = error?.code === "42501"
                ? "TU USUARIO NO TIENE PERMISOS PARA MODIFICAR OPERADORES. SOLICITA ACCESO DE ADMINISTRADOR."
                : "NO SE PUDO GUARDAR EL OPERADOR.\n\n" + error.message;

            alert(mensaje);

        }

    }


    async function cambiarActivo(
        id
    ) {

        const operador =
            operadores.find(
                item =>
                    String(item.id) ===
                    String(id)
            );


        if (!operador) {
            return;
        }


        const nuevoEstado =
            !operador.activo;


        const {
            error
        } = await supabaseClient

            .from("operadores")

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


        await cargarOperadores();

    }


})();