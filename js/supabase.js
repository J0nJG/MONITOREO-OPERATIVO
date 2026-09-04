// ============================================================
// SISTEMA MONITOREO TAG
// CONEXIÓN SUPABASE
// La clave usada aquí es PUBLISHABLE. Nunca colocar service_role o secretos en este archivo.
// ============================================================

const SUPABASE_URL =
    "https://ugfcheuyvriijcoqprue.supabase.co";

const SUPABASE_KEY =
    "sb_publishable_Z22F3rYjePYLg6iWsuE4CQ_ShzKEfSk";


if (!window.supabase) {

    throw new Error(
        "NO SE CARGÓ SUPABASE JS."
    );

}


window.supabaseClient =
    window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_KEY
    );


console.log(
    "✅ SUPABASE CONECTADO"
);