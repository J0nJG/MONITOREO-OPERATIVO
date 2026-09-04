// ============================================================
// SISTEMA MONITOREO TAG
// UTILIDADES CENTRALES
// ============================================================

(function () {

    "use strict";


    const SMT =
        window.SMT || {};


    // ========================================================
    // CONFIGURACIÓN
    // ========================================================

    SMT.OT_FIJA =
        "SOT-OFM";


    SMT.ESTATUS =
        [
            "PENDIENTE",
            "EN RUTA",
            "EN ESPERA",
            "CONCLUIDO",
            "CANCELADO"
        ];


    SMT.EJES =
        [
            "1 Eje",
            "2 Ejes",
            "3 Ejes",
            "4 Ejes",
            "5 Ejes",
            "6 Ejes",
            "7 Ejes",
            "8 Ejes",
            "9 Ejes"
        ];


    // ========================================================
    // MAYÚSCULAS
    // ========================================================

    SMT.mayusculas =
        function (valor) {

            return String(
                valor ?? ""
            )
                .trim()
                .toUpperCase();

        };


    // ========================================================
    // ESCAPAR HTML
    // ========================================================

    SMT.escapeHtml =
        function (valor) {

            return String(
                valor ?? ""
            )
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");

        };


    // ========================================================
    // PARSEAR FECHA SIN PROBLEMAS DE ZONA HORARIA
    // ========================================================

    SMT.parseFecha =
        function (fechaISO) {

            if (!fechaISO) {
                return null;
            }


            const partes =
                String(fechaISO)
                    .split("-")
                    .map(Number);


            if (
                partes.length !== 3 ||
                partes.some(
                    numero => !Number.isFinite(numero)
                )
            ) {

                return null;

            }


            const [
                anio,
                mes,
                dia
            ] = partes;


            return new Date(
                anio,
                mes - 1,
                dia
            );

        };


    // ========================================================
    // FECHA ISO
    // ========================================================

    SMT.fechaISO =
        function (fecha) {

            if (!fecha) {
                return "";
            }


            const anio =
                fecha.getFullYear();


            const mes =
                String(
                    fecha.getMonth() + 1
                )
                    .padStart(2, "0");


            const dia =
                String(
                    fecha.getDate()
                )
                    .padStart(2, "0");


            return (
                `${anio}-${mes}-${dia}`
            );

        };


    // ========================================================
    // FECHA DD/MM/YYYY
    // ========================================================

    SMT.formatearFecha =
        function (fechaISO) {

            if (!fechaISO) {
                return "";
            }


            const partes =
                String(fechaISO)
                    .substring(0, 10)
                    .split("-");


            if (partes.length !== 3) {
                return fechaISO;
            }


            return (
                `${partes[2]}/${partes[1]}/${partes[0]}`
            );

        };


    // ========================================================
    // HORA 24 HORAS
    // ========================================================

    SMT.formatearHora =
        function (hora) {

            if (!hora) {
                return "";
            }


            return String(hora)
                .substring(0, 5);

        };


    // ========================================================
    // SEMANA ISO
    // LUNES -> DOMINGO
    // ========================================================

    SMT.obtenerDatosSemana =
        function (fechaISO) {

            const fecha =
                SMT.parseFecha(
                    fechaISO
                );


            if (!fecha) {
                return null;
            }


            /*
             * Trabajamos con UTC únicamente para
             * calcular el número de semana.
             * Así evitamos desplazamientos de fecha.
             */

            const utcDate =
                new Date(
                    Date.UTC(
                        fecha.getFullYear(),
                        fecha.getMonth(),
                        fecha.getDate()
                    )
                );


            /*
             * ISO:
             * jueves = día de referencia.
             */

            const diaSemana =
                utcDate.getUTCDay() || 7;


            utcDate.setUTCDate(
                utcDate.getUTCDate() +
                4 -
                diaSemana
            );


            const anioISO =
                utcDate.getUTCFullYear();


            const inicioAnio =
                new Date(
                    Date.UTC(
                        anioISO,
                        0,
                        1
                    )
                );


            const numeroSemana =
                Math.ceil(
                    (
                        (
                            (
                                utcDate -
                                inicioAnio
                            ) /
                            86400000
                        ) +
                        1
                    ) /
                    7
                );


            /*
             * Lunes de la semana seleccionada.
             */

            const lunes =
                new Date(
                    Date.UTC(
                        fecha.getFullYear(),
                        fecha.getMonth(),
                        fecha.getDate()
                    )
                );


            const diaLocal =
                lunes.getUTCDay() || 7;


            lunes.setUTCDate(
                lunes.getUTCDate() -
                diaLocal +
                1
            );


            /*
             * Domingo.
             */

            const domingo =
                new Date(lunes);

            domingo.setUTCDate(
                domingo.getUTCDate() + 6
            );


            const inicioSemana =
                `${lunes.getUTCFullYear()}-` +
                `${String(
                    lunes.getUTCMonth() + 1
                ).padStart(2, "0")}-` +
                `${String(
                    lunes.getUTCDate()
                ).padStart(2, "0")}`;


            const finSemana =
                `${domingo.getUTCFullYear()}-` +
                `${String(
                    domingo.getUTCMonth() + 1
                ).padStart(2, "0")}-` +
                `${String(
                    domingo.getUTCDate()
                ).padStart(2, "0")}`;


            return {

                anio:
                    anioISO,

                numeroSemana:
                    numeroSemana,

                inicioSemana:
                    inicioSemana,

                finSemana:
                    finSemana

            };

        };


    // ========================================================
    // OBTENER SIGUIENTE ID
    // ========================================================

    SMT.obtenerSiguienteId =
        async function (fechaISO) {

            const datosSemana =
                SMT.obtenerDatosSemana(
                    fechaISO
                );


            if (!datosSemana) {

                throw new Error(
                    "FECHA INVÁLIDA PARA GENERAR ID."
                );

            }


            const prefijo =
                `S${datosSemana.numeroSemana}-`;


            const {
                data,
                error
            } = await window.supabaseClient

                .from("viajes")

                .select("id_viaje")

                .like(
                    "id_viaje",
                    `${prefijo}%`
                );


            if (error) {

                console.error(
                    "ERROR OBTENIENDO ID:",
                    error
                );

                /*
                 * No inventamos un consecutivo.
                 * Si falla la consulta, dejamos 001
                 * como sugerencia visual.
                 */

                return `${prefijo}001`;

            }


            let mayor =
                0;


            (
                data || []
            ).forEach(
                viaje => {

                    const valor =
                        String(
                            viaje.id_viaje || ""
                        );


                    const patron =
                        new RegExp(
                            `^S${datosSemana.numeroSemana}-(\\d+)$`
                        );


                    const coincidencia =
                        valor.match(
                            patron
                        );


                    if (!coincidencia) {
                        return;
                    }


                    const numero =
                        Number(
                            coincidencia[1]
                        );


                    if (
                        Number.isFinite(numero) &&
                        numero > mayor
                    ) {

                        mayor =
                            numero;

                    }

                }
            );


            return (
                `${prefijo}` +
                String(
                    mayor + 1
                ).padStart(3, "0")
            );

        };


    // ========================================================
    // CÁLCULO DE COSTOS
    // TOTAL = SUMA DE CASETAS
    // SUBTOTAL = TOTAL / 1.16
    // IVA = SUBTOTAL * 0.16
    // ========================================================

    SMT.calcularCostos =
        function (casetas) {

            let total =
                0;


            (
                casetas || []
            ).forEach(
                caseta => {

                    const costo =
                        Number(
                            caseta.costo || 0
                        );


                    if (
                        Number.isFinite(costo) &&
                        costo >= 0
                    ) {

                        total +=
                            costo;

                    }

                }
            );


            total =
                Math.round(
                    (
                        total +
                        Number.EPSILON
                    ) *
                    100
                ) / 100;


            const subtotal =
                Math.round(
                    (
                        (
                            total /
                            1.16
                        ) +
                        Number.EPSILON
                    ) *
                    100
                ) / 100;


            const iva =
                Math.round(
                    (
                        (
                            subtotal *
                            0.16
                        ) +
                        Number.EPSILON
                    ) *
                    100
                ) / 100;


            return {

                subtotal,
                iva,
                total

            };

        };


    // ========================================================
    // MONEDA
    // ========================================================

    SMT.moneda =
        function (valor) {

            return new Intl.NumberFormat(
                "es-MX",
                {
                    style: "currency",
                    currency: "MXN"
                }
            ).format(
                Number(valor || 0)
            );

        };


    // ========================================================
    // CLASE ESTATUS
    // ========================================================

    SMT.claseEstatus =
        function (estatus) {

            return SMT.mayusculas(
                estatus
            )
                .toLowerCase()
                .replace(/\s+/g, "-");

        };


    // ========================================================
    // ESTATUS VÁLIDO
    // ========================================================

    SMT.estatusValido =
        function (estatus) {

            return SMT.ESTATUS
                .includes(
                    SMT.mayusculas(
                        estatus
                    )
                );

        };


    // ========================================================
    // FECHA ACTUAL
    // ========================================================

    SMT.hoyISO =
        function () {

            const ahora =
                new Date();


            return SMT.fechaISO(
                ahora
            );

        };


    // ========================================================
    // CAPTURA DE HORA 24 HORAS
    // ========================================================

    SMT.normalizarHora24 = function (valor, completar = false) {
        let texto = String(valor ?? "").replace(/[^0-9:]/g, "").slice(0, 5);

        // No transformar durante la escritura: 2200 debe poder capturarse completo.
        // Solo damos formato automático cuando ya hay 4 dígitos, o al salir del campo.
        if (/^\d{4}$/.test(texto)) {
            texto = texto.slice(0, 2) + ":" + texto.slice(2);
        } else if (/^\d{3}$/.test(texto) && completar) {
            texto = texto.slice(0, 2) + ":" + texto.slice(2) + "0";
        } else if (completar && /^\d{1,2}$/.test(texto)) {
            texto = texto.padStart(2, "0") + ":00";
        }

        // Mantener exactamente HH:MM mientras el usuario escribe.
        const partes = texto.split(":");
        if (partes.length > 2) texto = partes[0] + ":" + partes.slice(1).join("");
        return texto.slice(0, 5);
    };

    SMT.validarHora24 = function (valor) {
        const bruto = String(valor ?? "").trim();
        let texto = SMT.normalizarHora24(bruto, true);
        if (/^\d{3}$/.test(bruto)) {
            texto = bruto.slice(0, 2) + ":" + bruto.slice(2) + "0";
        } else if (/^\d{4}$/.test(bruto)) {
            texto = bruto.slice(0, 2) + ":" + bruto.slice(2);
        }
        return /^([01]\d|2[0-3]):[0-5]\d$/.test(texto) ? texto : null;
    };

    function instalarCamposHora24() {
        document.addEventListener("keydown", event => {
            const el = event.target.closest?.(".hora-24");
            if (!el) return;
            if (["Backspace", "Delete", "ArrowLeft", "ArrowRight", "Home", "End", "Tab", "Enter", "Escape"].includes(event.key) || event.ctrlKey || event.metaKey) return;
            if (!/[0-9:]/.test(event.key)) event.preventDefault();
            // Un solo separador y máximo 5 caracteres visibles.
            if (event.key === ":" && el.value.includes(":")) event.preventDefault();
            if (event.key !== ":" && el.value.length >= 5 && el.selectionStart === el.selectionEnd) event.preventDefault();
        });
        document.addEventListener("input", event => {
            const el = event.target.closest?.(".hora-24");
            if (!el) return;
            const antes = el.value;
            const normalizada = SMT.normalizarHora24(antes, false);
            if (normalizada !== antes) {
                el.value = normalizada;
                try { el.setSelectionRange(el.value.length, el.value.length); } catch (_) {}
            }
            const provisional = String(el.value || "");
            const valida = SMT.validarHora24(provisional);
            el.setCustomValidity(provisional && !valida && provisional.length >= 4
                ? "CAPTURA HH:MM EN FORMATO 24 HORAS. EJEMPLO: 22:00 O 2200."
                : "");
        });
        document.addEventListener("blur", event => {
            const el = event.target.closest?.(".hora-24");
            if (!el) return;
            const valor = SMT.validarHora24(el.value);
            if (valor) el.value = valor;
            el.setCustomValidity(el.value && !valor ? "CAPTURA HH:MM EN FORMATO 24 HORAS. EJEMPLO: 22:00 O 2200." : "");
        }, true);
    }
    instalarCamposHora24();

    // ========================================================
    // HORA ACTUAL
    // ========================================================

    SMT.horaActual =
        function () {

            const ahora =
                new Date();


            return (
                `${String(
                    ahora.getHours()
                ).padStart(2, "0")}:` +
                `${String(
                    ahora.getMinutes()
                ).padStart(2, "0")}`
            );

        };


    // ========================================================
    // EXPONER
    // ========================================================

    window.SMT =
        SMT;


})();