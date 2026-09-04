// ============================================================
// SISTEMA MONITOREO TAG - RUTAS Y CASETAS
// Fuente única: rutas + ruta_casetas
// ============================================================
(function () {
    "use strict";
    const SMT = window.SMT || {};
    const $ = id => document.getElementById(id);
    let rutas = [];
    let rutaEditando = null;

    // Las rutas MAN-/AUTO- son borradores creados por nosotros.
    // SOLO estas aparecen en "MIS RUTAS". Al publicarlas pasan al catálogo.
    const esRutaBorrador = r => {
        const codigo = String(r?.codigo || "").toUpperCase();
        return codigo.startsWith("MAN-") ||
            codigo.startsWith("AUTO-") ||
            (String(r?.hoja || "").toUpperCase() === "PERSONALIZADAS" && !codigo.startsWith("PUB-"));
    };

    const esRutaPersonalizada = esRutaBorrador;
    const esRutaCatalogo = r => !esRutaBorrador(r);

    document.addEventListener("DOMContentLoaded", iniciar);

    async function iniciar() {

        const sesion = await window.SistemaAuth?.ready;
        if (!sesion) return;
        conectarEventos();
        await cargarRutas();
        llenarDatalists();
    }

    function conectarEventos() {
        $("btnNuevaRuta")?.addEventListener("click", () => abrirModalRuta());
        $("cerrarModalRuta")?.addEventListener("click", cerrarModalRuta);
        $("btnCancelarRuta")?.addEventListener("click", cerrarModalRuta);
        $("btnAgregarCasetaRuta")?.addEventListener("click", () => agregarCasetaRuta());
        $("btnEliminarRutaModal")?.addEventListener("click", () => rutaEditando && eliminarRuta(rutaEditando));
        $("btnPublicarRutaModal")?.addEventListener("click", () => rutaEditando && publicarRuta(rutaEditando));
        $("formRuta")?.addEventListener("submit", guardarRuta);
        $("buscarRuta")?.addEventListener("input", renderizarRutas);
        $("buscarCatalogo")?.addEventListener("input", renderizarCatalogo);
        $("filtroTipo")?.addEventListener("change", renderizarCatalogo);
        $("filtroEjes")?.addEventListener("change", renderizarCatalogo);
        $("btnLimpiarCatalogo")?.addEventListener("click", () => { $("buscarCatalogo").value=""; $("filtroTipo").value=""; $("filtroEjes").value=""; renderizarCatalogo(); });
        $("tablaRutas")?.addEventListener("click", manejarTabla);
        $("tablaCatalogo")?.addEventListener("click", manejarTabla);
        $("listaCasetasRuta")?.addEventListener("input", actualizarTotalRuta);
        configurarSelectoresRuta();
    }

    async function cargarRutas() {
        const estado = $("estadoCatalogo");
        if (estado) { estado.className = "status-badge loading"; estado.textContent = "CARGANDO..."; }
        try {
            const { data, error } = await supabaseClient.from("rutas").select("*").eq("activo", true).order("destino", {ascending:true}).order("tipo_unidad", {ascending:true}).order("ejes", {ascending:true});
            if (error) throw error;
            rutas = data || [];
            if (rutas.length) {
                const ids = rutas.map(r => r.id);
                const { data: casetas, error: ce } = await supabaseClient.from("ruta_casetas").select("*").in("ruta_id", ids).order("orden", {ascending:true});
                if (ce) throw ce;
                const mapa = new Map(rutas.map(r => [r.id, []]));
                (casetas || []).forEach(c => mapa.get(c.ruta_id)?.push(c));
                rutas.forEach(r => r.casetas = mapa.get(r.id) || []);
            }
            if (estado) { estado.className = "status-badge ok"; estado.textContent = `CONECTADO · ${rutas.length} RUTAS`; }
            renderizarCatalogo();
            renderizarRutas();
        } catch (error) {
            console.error("ERROR CARGANDO RUTAS/CASETAS:", error);
            rutas = [];
            if (estado) { estado.className = "status-badge error"; estado.textContent = "ERROR DE CONSULTA"; }
            $("tablaCatalogo").innerHTML = `<tr><td colspan="7" class="empty-state"><strong>NO SE PUDO LEER LA BASE DE RUTAS</strong><br><small>${SMT.escapeHtml(error.message || "Error desconocido")}</small></td></tr>`;
            $("tablaRutas").innerHTML = `<tr><td colspan="6" class="empty-state">NO SE PUDO LEER RUTAS.</td></tr>`;
        }
    }

    function renderizarCatalogo() {
        const texto = SMT.mayusculas($("buscarCatalogo")?.value || "");
        const tipo = $("filtroTipo")?.value || "";
        const ejes = $("filtroEjes")?.value || "";
        const lista = rutas.filter(esRutaCatalogo).filter(r => {
            if (tipo && r.tipo_unidad !== tipo) return false;
            if (ejes && r.ejes !== ejes) return false;
            if (!texto) return true;
            return SMT.mayusculas([r.origen,r.estado,r.destino,r.municipio,r.tipo_unidad,r.ejes,(r.casetas||[]).map(c=>c.nombre).join(" ")].join(" ")).includes(texto);
        });
        $("contadorCatalogo").textContent = `${lista.length} RUTA${lista.length===1?"":"S"}`;
        $("tablaCatalogo").innerHTML = lista.length ? lista.map(r => {
            const total=(r.casetas||[]).reduce((s,c)=>s+Number(c.costo||0),0);
            const pills=(r.casetas||[]).slice(0,4).map(c=>`<span class="route-pill">${SMT.escapeHtml(c.nombre)}</span>`).join(" ");
            const more=(r.casetas||[]).length>4?`<span class="route-pill more">+${r.casetas.length-4}</span>`:"";
            return `<tr><td><strong>${SMT.escapeHtml(r.origen||"MATRIZ")}</strong><small class="table-sub">${SMT.escapeHtml(r.estado||"")}</small></td><td><strong>${SMT.escapeHtml(r.destino||"—")}</strong><small class="table-sub">${SMT.escapeHtml(r.municipio||"MUNICIPIO NO REGISTRADO")}</small></td><td><span class="soft-badge">${SMT.escapeHtml(r.tipo_unidad||"—")}</span></td><td><span class="soft-badge">${SMT.escapeHtml(r.ejes||"—")}</span></td><td>${pills||"—"} ${more}<small class="table-sub">${r.casetas?.length||0} CASETAS</small></td><td><strong>${SMT.moneda(total)}</strong></td><td><button class="btn btn-primary btn-small" data-action="usar-catalogo" data-id="${r.id}">USAR RUTA</button></td></tr>`;
        }).join("") : `<tr><td colspan="7" class="empty-state">NO HAY COINCIDENCIAS.</td></tr>`;
        llenarFiltros();
    }

    function llenarFiltros() {
        const catalogo=rutas.filter(esRutaCatalogo);
        const tipos=[...new Set(catalogo.map(r=>r.tipo_unidad).filter(Boolean))].sort();
        const ejes=[...new Set(catalogo.map(r=>r.ejes).filter(Boolean))].sort((a,b)=>(parseInt(a)||0)-(parseInt(b)||0));
        const tipoSelect=$("filtroTipo");
        const ejesSelect=$("filtroEjes");
        const tipoActual=tipoSelect?.value||"";
        const ejesActual=ejesSelect?.value||"";

        if(tipoSelect){
            tipoSelect.innerHTML='<option value="">TODOS LOS TIPOS</option>'+tipos.map(v=>`<option value="${SMT.escapeHtml(v)}">${SMT.escapeHtml(v)}</option>`).join("");
            if(tipos.includes(tipoActual)) tipoSelect.value=tipoActual;
        }
        if(ejesSelect){
            ejesSelect.innerHTML='<option value="">TODOS LOS EJES</option>'+ejes.map(v=>`<option value="${SMT.escapeHtml(v)}">${SMT.escapeHtml(v)}</option>`).join("");
            if(ejes.includes(ejesActual)) ejesSelect.value=ejesActual;
        }
    }

    function renderizarRutas() {
        const filtro=SMT.mayusculas($("buscarRuta")?.value||"").trim();
        const lista=rutas.filter(esRutaPersonalizada).filter(r=>!filtro||SMT.mayusculas([r.origen,r.destino,r.municipio,r.tipo_unidad,r.ejes,...(r.casetas||[]).map(c=>c.nombre)].join(" ")).includes(filtro));
        $("contadorRutas").textContent=`${lista.length} RUTA${lista.length===1?"":"S"}`;
        $("tablaRutas").innerHTML=lista.length?lista.map(r=>{
            const total=(r.casetas||[]).reduce((s,c)=>s+Number(c.costo||0),0);
            const casetas=(r.casetas||[]).slice(0,3).map(c=>`<span class="route-pill">${SMT.escapeHtml(c.nombre)}</span>`).join(" ");
            const mas=(r.casetas||[]).length>3?`<span class="route-pill more">+${r.casetas.length-3}</span>`:"";
            return `<tr><td><strong>${SMT.escapeHtml(r.origen||"—")}</strong><span class="route-arrow">→</span><strong>${SMT.escapeHtml(r.destino||"—")}</strong><small class="table-sub">${SMT.escapeHtml(r.municipio||"MUNICIPIO NO REGISTRADO")}</small></td><td><span class="soft-badge">${SMT.escapeHtml(r.tipo_unidad||"MANUAL")}</span> <span class="soft-badge">${SMT.escapeHtml(r.ejes||"MANUAL")}</span></td><td>${casetas||"—"} ${mas}<small class="table-sub">${r.casetas?.length||0} CASETAS</small></td><td><strong>${SMT.moneda(total)}</strong></td><td>${r.updated_at?new Date(r.updated_at).toLocaleDateString("es-MX"):"—"}</td><td><div class="route-actions"><button class="btn btn-secondary btn-small" data-action="editar" data-id="${r.id}">✏ EDITAR</button><button class="btn btn-success btn-small" data-action="publicar" data-id="${r.id}">✓ GUARDAR EN CATÁLOGO</button><button class="btn btn-danger btn-small btn-delete-route" data-action="eliminar" data-id="${r.id}">🗑 ELIMINAR</button></div></td></tr>`;
        }).join(""):`<tr><td colspan="6" class="empty-state"><strong>NO HAY RUTAS PERSONALIZADAS</strong><br><small>CREA UNA CON «+ NUEVA RUTA».</small></td></tr>`;
    }

    function manejarTabla(e){const b=e.target.closest("button[data-action]");if(!b)return;const r=rutas.find(x=>String(x.id)===String(b.dataset.id));if(!r)return;if(b.dataset.action==='editar')abrirModalRuta(r);if(b.dataset.action==='eliminar')eliminarRuta(r);if(b.dataset.action==='publicar')publicarRuta(r);if(b.dataset.action==='usar-catalogo')abrirModalDesdeCatalogo(r);}
    async function eliminarRuta(r){
        if(!esRutaPersonalizada(r)) return alert("LAS RUTAS DEL CATÁLOGO BASE NO SE ELIMINAN DESDE ESTA PANTALLA.");
        const ok=window.confirm(`¿ELIMINAR LA RUTA ${r.origen} → ${r.destino}?\n\nTAMBIÉN SE ELIMINARÁN SUS CASETAS PERSONALIZADAS.`);
        if(!ok)return;
        try{
            const {error:ce}=await supabaseClient.from("ruta_casetas").delete().eq("ruta_id",r.id);
            if(ce)throw ce;
            const {error:re}=await supabaseClient.from("rutas").delete().eq("id",r.id);
            if(re)throw re;
            await cargarRutas();
            llenarDatalists();
            cerrarModalRuta();
        }catch(err){console.error(err);alert("NO SE PUDO ELIMINAR LA RUTA.\n\n"+(err.message||err));}
    }

    function abrirModalDesdeCatalogo(r){
        rutaEditando=null;
        $("tituloModalRuta").textContent="NUEVA RUTA · COPIADA DEL CATÁLOGO";
        $("rutaId").value="";
        $("rutaOrigen").value=r?.origen||"";
        $("rutaDestino").value=r?.destino||"";
        $("rutaMunicipio").value=r?.municipio||"";
        $("rutaTipoUnidad").value=r?.tipo_unidad||"";
        $("rutaEjes").value=r?.ejes||"";
        $("listaCasetasRuta").innerHTML="";
        (r?.casetas||[]).forEach(c=>agregarCasetaRuta(c.nombre,c.costo));
        if(!r?.casetas?.length)agregarCasetaRuta();
        actualizarTotalRuta();
        if($("btnEliminarRutaModal"))$("btnEliminarRutaModal").hidden=true;if($("btnPublicarRutaModal"))$("btnPublicarRutaModal").hidden=true;
        $("modalRuta").style.display="flex";
        setTimeout(()=>$("rutaOrigen")?.focus(),50);
    }
    function abrirModalRuta(r=null){rutaEditando=r;const esManual=!!(r&&esRutaPersonalizada(r));$("tituloModalRuta").textContent=r?(esManual?"EDITAR RUTA PERSONALIZADA":"NUEVA RUTA · COPIADA DEL CATÁLOGO"):"NUEVA RUTA";$("rutaId").value=esManual?r.id:"";$("rutaOrigen").value=r?.origen||"";$("rutaDestino").value=r?.destino||"";$("rutaMunicipio").value=r?.municipio||"";$("rutaTipoUnidad").value=r?.tipo_unidad||"";$("rutaEjes").value=r?.ejes||"";$("listaCasetasRuta").innerHTML="";(r?.casetas||[]).forEach(c=>agregarCasetaRuta(c.nombre,c.costo));if(!r?.casetas?.length)agregarCasetaRuta();actualizarTotalRuta();if($("btnEliminarRutaModal"))$("btnEliminarRutaModal").hidden=!esManual;if($("btnPublicarRutaModal"))$("btnPublicarRutaModal").hidden=!esManual;$("modalRuta").style.display="flex";setTimeout(()=>$("rutaOrigen")?.focus(),50);}
    function cerrarModalRuta(){$("modalRuta").style.display="none";rutaEditando=null;}
    function agregarCasetaRuta(nombre="",costo=""){const f=document.createElement("div");f.className="caseta-row route-caseta-row";f.innerHTML=`<div class="caseta-numero">${($("listaCasetasRuta")?.children.length||0)+1}</div><input type="text" class="caseta-nombre" placeholder="NOMBRE DE CASETA" value="${SMT.escapeHtml(nombre)}" autocomplete="off"><input type="number" class="caseta-costo" placeholder="COSTO" min="0" step="0.01" value="${costo??""}"><button type="button" class="btn-remove-caseta">×</button>`;f.querySelector(".btn-remove-caseta").onclick=()=>{f.remove();renumerar();actualizarTotalRuta()};$("listaCasetasRuta").appendChild(f);renumerar();}
    function renumerar(){[...$("listaCasetasRuta").querySelectorAll(".caseta-row")].forEach((f,i)=>f.querySelector(".caseta-numero").textContent=i+1);}
    function obtenerCasetas(){return [...$("listaCasetasRuta").querySelectorAll(".caseta-row")].map(f=>({nombre:SMT.mayusculas(f.querySelector(".caseta-nombre").value),costo:Number(f.querySelector(".caseta-costo").value||0)})).filter(c=>c.nombre);}
    function actualizarTotalRuta(){$("totalRuta").textContent=SMT.moneda(obtenerCasetas().reduce((s,c)=>s+c.costo,0));}
    function generarCodigoRuta(){
        const ahora=Date.now();
        const aleatorio=(window.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)).replace(/[^a-z0-9]/gi,"").slice(-8).toUpperCase();
        return `MAN-${ahora}-${aleatorio}`;
    }

    function mensajeErrorRuta(error, contexto="guardar"){
        const code=String(error?.code||"");
        const status=String(error?.status||"");
        const msg=String(error?.message||error?.details||error||"Error desconocido");
        const lower=msg.toLowerCase();

        if(code==="42501" || status==="401" || status==="403" || lower.includes("row-level security") || lower.includes("permission denied")){
            return "TU USUARIO NO TIENE PERMISOS PARA " + (contexto==="editar" ? "EDITAR" : "CREAR Y GUARDAR") + " RUTAS. REVISA EL RLS DE RUTAS Y RUTA_CASETAS EN SUPABASE.";
        }
        if(code==="23505" || lower.includes("duplicate key") || lower.includes("unique constraint")){
            return "YA EXISTE UN REGISTRO CON EL MISMO IDENTIFICADOR EN LA BASE DE DATOS. INTENTA GUARDAR DE NUEVO.";
        }
        if(code==="23503" || lower.includes("foreign key")){
            return "LA RUTA NO PUDO VINCULARSE CON SUS CASETAS. REVISA LA RELACIÓN ENTRE RUTAS Y RUTA_CASETAS.";
        }
        if(code==="23514" || lower.includes("check constraint")){
            return "ALGUNO DE LOS DATOS DE LA RUTA NO CUMPLE UNA REGLA DE LA BASE DE DATOS.";
        }
        if(lower.includes("could not find the table") || lower.includes("relation") && lower.includes("does not exist")){
            return "NO SE ENCONTRÓ LA TABLA DE RUTAS EN SUPABASE. REVISA QUE EXISTAN RUTAS Y RUTA_CASETAS.";
        }
        return `NO SE PUDO ${contexto==="editar"?"ACTUALIZAR":"GUARDAR"} LA RUTA.\n\n${msg}`;
    }

    async function buscarIdRutaPorCodigo(codigo){
        const {data,error}=await supabaseClient.from("rutas").select("id").eq("codigo",codigo).maybeSingle();
        if(error) throw error;
        if(!data?.id) throw new Error("LA RUTA SE INSERTÓ, PERO NO SE PUDO RECUPERAR SU ID. RECARGA Y REVISA LA TABLA RUTAS.");
        return data.id;
    }

    async function guardarCasetasRuta(id, casetas){
        const del=await supabaseClient.from("ruta_casetas").delete().eq("ruta_id",id);
        if(del.error) throw del.error;
        if(!casetas.length) return;
        const ins=await supabaseClient.from("ruta_casetas").insert(casetas.map((c,i)=>({
            ruta_id:id,
            orden:i+1,
            nombre:c.nombre,
            costo:c.costo
        })));
        if(ins.error) throw ins.error;
    }

    async function restaurarCasetasRuta(id, casetas){
        try{
            await supabaseClient.from("ruta_casetas").delete().eq("ruta_id",id);
            if(casetas?.length){
                await supabaseClient.from("ruta_casetas").insert(casetas.map((c,i)=>({
                    ruta_id:id,
                    orden:i+1,
                    nombre:c.nombre,
                    costo:Number(c.costo||0)
                })));
            }
        }catch(error){
            console.error("NO SE PUDIERON RESTAURAR LAS CASETAS:",error);
        }
    }

    async function guardarRuta(e){
        e.preventDefault();

        const origen=SMT.mayusculas($("rutaOrigen")?.value);
        const destino=SMT.mayusculas($("rutaDestino")?.value);
        const municipio=SMT.mayusculas($("rutaMunicipio")?.value);
        const tipo_unidad=SMT.mayusculas($("rutaTipoUnidad")?.value);
        const ejes=SMT.mayusculas($("rutaEjes")?.value);
        const casetas=obtenerCasetas().map(c=>({nombre:c.nombre,costo:Number(c.costo||0)}));

        if(!origen||!destino||!municipio||!tipo_unidad||!ejes){
            alert("CAPTURA ORIGEN, DESTINO, MUNICIPIO / ALCALDÍA, TIPO DE UNIDAD Y EJES.");
            return;
        }
        if(origen===destino){
            alert("ORIGEN Y DESTINO NO PUEDEN SER IGUALES.");
            return;
        }
        if(casetas.some(c=>!Number.isFinite(c.costo)||c.costo<0)){
            alert("REVISA EL COSTO DE LAS CASETAS. DEBE SER UN NÚMERO IGUAL O MAYOR A 0.");
            return;
        }

        const form=$("formRuta");
        const btn=form?.querySelector('button[type="submit"]');
        const textoOriginal=btn?.textContent||"GUARDAR RUTA";
        if(btn){btn.disabled=true;btn.textContent="GUARDANDO...";}

        const rutaOriginal=rutaEditando ? {
            id:rutaEditando.id,
            origen:rutaEditando.origen,
            destino:rutaEditando.destino,
            municipio:rutaEditando.municipio,
            tipo_unidad:rutaEditando.tipo_unidad,
            ejes:rutaEditando.ejes,
            casetas:(rutaEditando.casetas||[]).map(c=>({nombre:c.nombre,costo:Number(c.costo||0)}))
        } : null;

        let id=rutaEditando?.id || null;
        let rutaNueva=false;

        try{
            if(!window.supabaseClient){
                throw new Error("NO SE ENCONTRÓ LA CONEXIÓN CON SUPABASE.");
            }

            if(id){
                const res=await supabaseClient
                    .from("rutas")
                    .update({origen,destino,municipio,tipo_unidad,ejes,updated_at:new Date().toISOString()})
                    .eq("id",id);
                if(res.error) throw res.error;
            }else{
                // No usamos insert().select().single(): un SELECT bloqueado por RLS
                // puede hacer parecer que el INSERT falló aunque la ruta sí se creó.
                const codigo=generarCodigoRuta();
                const res=await supabaseClient.from("rutas").insert({
                    codigo,
                    hoja:"PERSONALIZADAS",
                    origen,
                    destino,
                    municipio,
                    tipo_unidad,
                    ejes,
                    activo:true
                });
                if(res.error) throw res.error;
                rutaNueva=true;
                id=await buscarIdRutaPorCodigo(codigo);
            }

            await guardarCasetasRuta(id,casetas);

            // Verificación final: la pantalla no informa éxito hasta que
            // Supabase confirma que la ruta realmente quedó persistida.
            const verificacion=await supabaseClient
                .from("rutas")
                .select("id")
                .eq("id",id)
                .maybeSingle();
            if(verificacion.error) throw verificacion.error;
            if(!verificacion.data?.id) throw new Error("SUPABASE NO CONFIRMÓ LA RUTA DESPUÉS DEL GUARDADO.");

            cerrarModalRuta();
            await cargarRutas();
            llenarDatalists();
            alert(`RUTA GUARDADA CORRECTAMENTE.\n\n${origen} → ${destino}\nTIPO: ${tipo_unidad}\nEJES: ${ejes}\nCASETAS: ${casetas.length}`);
        }catch(err){
            console.error("ERROR GUARDANDO RUTA:",err);

            // Si fue una ruta nueva y falló el guardado de casetas, eliminamos
            // el registro incompleto para no dejar basura en la base.
            if(rutaNueva && id){
                try{
                    await supabaseClient.from("ruta_casetas").delete().eq("ruta_id",id);
                    await supabaseClient.from("rutas").delete().eq("id",id);
                }catch(rollbackError){
                    console.error("ERROR HACIENDO ROLLBACK DE RUTA NUEVA:",rollbackError);
                }
            }else if(id && rutaOriginal){
                // Si era edición y falló al escribir casetas, restauramos también
                // los datos generales para no dejar una edición a medias.
                try{
                    const restore=await supabaseClient.from("rutas").update({
                        origen:rutaOriginal.origen,
                        destino:rutaOriginal.destino,
                        municipio:rutaOriginal.municipio,
                        tipo_unidad:rutaOriginal.tipo_unidad,
                        ejes:rutaOriginal.ejes,
                        updated_at:new Date().toISOString()
                    }).eq("id",id);
                    if(restore.error) console.error("ERROR RESTAURANDO DATOS DE RUTA:",restore.error);
                }catch(restoreError){
                    console.error("ERROR RESTAURANDO DATOS DE RUTA:",restoreError);
                }
                // Restauramos sus casetas anteriores para evitar una edición a medias.
                await restaurarCasetasRuta(id,rutaOriginal.casetas);
            }

            alert(mensajeErrorRuta(err,id&&rutaOriginal?"editar":"guardar"));
        }finally{
            if(btn){btn.disabled=false;btn.textContent=textoOriginal;}
        }
    }

    async function publicarRuta(r){
        if(!r || !esRutaPersonalizada(r)) return;
        const ok=window.confirm(`¿GUARDAR ESTA RUTA EN EL CATÁLOGO?\n\n${r.origen} → ${r.destino}\nMUNICIPIO / ALCALDÍA: ${r.municipio||"—"}\nTIPO: ${r.tipo_unidad||"—"}\nEJES: ${r.ejes||"—"}\n\nUna vez guardada dejará de aparecer en MIS RUTAS y quedará disponible para cargar sus casetas automáticamente al finalizar viajes.`);
        if(!ok)return;
        try{
            const nuevoCodigo=`PUB-${Date.now()}`;
            const {error}=await supabaseClient.from("rutas").update({codigo:nuevoCodigo,hoja:"PERSONALIZADAS",updated_at:new Date().toISOString()}).eq("id",r.id);
            if(error)throw error;
            cerrarModalRuta(); await cargarRutas(); llenarDatalists(); alert("RUTA GUARDADA EN EL CATÁLOGO CORRECTAMENTE. YA NO APARECERÁ EN MIS RUTAS.");
        }catch(err){console.error(err);alert("NO SE PUDO GUARDAR LA RUTA EN EL CATÁLOGO.\n\n"+(err.message||err));}
    }

    function llenarDatalists(){
        // Los campos de origen/destino usan ahora un selector visual propio.
        // Se conserva esta función para actualizar el catálogo interno.
        configurarSelectoresRuta();
    }

    function configurarSelectoresRuta(){
        configurarSelector("rutaOrigen", "sugerenciasOrigen", () => [...new Set(rutas.map(r=>r.origen).filter(Boolean))].sort());
        configurarSelector("rutaDestino", "sugerenciasDestino", () => [...new Set(rutas.map(r=>r.destino).filter(Boolean))].sort());
        configurarSelector("rutaMunicipio", "sugerenciasMunicipioRuta", () => [...new Set(rutas.map(r=>r.municipio).filter(Boolean))].sort());
    }

    function configurarSelector(inputId, menuId, obtenerOpciones){
        const input=$(inputId), menu=$(menuId);
        if(!input || !menu || input.dataset.selectorReady) return;
        input.dataset.selectorReady="1";
        let indice=-1;

        const cerrar=()=>{ menu.hidden=true; indice=-1; };
        const render=()=>{
            const texto=SMT.mayusculas(input.value.trim());
            const opciones=obtenerOpciones().filter(v=>!texto || SMT.mayusculas(v).includes(texto)).slice(0,7);
            menu.innerHTML=opciones.length ? opciones.map((v,i)=>`<button type="button" class="route-suggestion" role="option" data-value="${SMT.escapeHtml(v)}" aria-selected="${i===indice}"><span><strong>${SMT.escapeHtml(v)}</strong><small>ORIGEN / DESTINO DISPONIBLE</small></span><b>SELECCIONAR</b></button>`).join("") : `<div class="route-suggestion-empty">SIN COINCIDENCIAS</div>`;
            menu.hidden=false;
        };

        input.addEventListener("input", ()=>{ indice=-1; render(); });
        input.addEventListener("focus", render);
        input.addEventListener("keydown", e=>{
            const items=[...menu.querySelectorAll(".route-suggestion[data-value]")];
            if(e.key==="ArrowDown"){ e.preventDefault(); indice=Math.min(indice+1,items.length-1); items.forEach((x,i)=>x.setAttribute("aria-selected",i===indice)); }
            else if(e.key==="ArrowUp"){ e.preventDefault(); indice=Math.max(indice-1,0); items.forEach((x,i)=>x.setAttribute("aria-selected",i===indice)); }
            else if(e.key==="Enter" && items.length){
                e.preventDefault();
                const seleccion=items[indice>=0?indice:0];
                if(seleccion){ input.value=seleccion.dataset.value; cerrar(); }
            }
            else if(e.key==="Tab" && items.length){
                const seleccion=items[indice>=0?indice:0];
                if(seleccion){ input.value=seleccion.dataset.value; cerrar(); }
            }
            else if(e.key==="Escape"){ cerrar(); }
        });
        menu.addEventListener("mousedown", e=>{
            const item=e.target.closest("[data-value]");
            if(!item) return;
            e.preventDefault(); input.value=item.dataset.value; cerrar();
        });
        document.addEventListener("mousedown", e=>{ if(!input.parentElement.contains(e.target)) cerrar(); });
    }
})();
