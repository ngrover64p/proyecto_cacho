// Controlador principal y renderizado visual del Juego de Cacho (Local y Online estilo WolfTeam)

const calculador_puntaje = new CalculadorPuntaje();
const gestor_archivos_web = new GestorArchivosWeb();
const gestor_red_voz = new GestorRedYVoz();

let partida_actual = null;
let cubilete_juego = null;
let es_partida_online = false;
let estadistica_partida_registrada = false;

// Estado de animacion del vaso/cubilete y dados
let animacion_en_curso = false;
let cambio_turno_en_pausa = false;
let ocultos_en_cubilete = [false, false, false, false, false];
let caras_en_animacion = [1, 1, 1, 1, 1];
let dados_en_giro_visual = [false, false, false, false, false];

// Lista de nombres para el modo local
let nombres_jugadores_locales = ["Jugador 1", "Jugador 2"];

// Inicializacion al cargar la pagina
window.addEventListener("DOMContentLoaded", () => {
    cargarPerfilUsuarioEnMenu();
    renderizarCamposJugadoresLocales();
    dibujarTodosLosDadosIniciales();
    verificarParametroSalaEnURL();
});

// ==================== PERFIL DE USUARIO Y ESTADISTICAS ====================

function cargarPerfilUsuarioEnMenu() {
    const perfil = gestor_archivos_web.obtenerPerfilUsuario();
    const input_nom = document.getElementById("input_nombre_online");
    const input_ali = document.getElementById("input_alias_online");
    if (input_nom) input_nom.value = perfil.nombre;
    if (input_ali) input_ali.value = perfil.alias;
    renderizarBarraEstadisticasPerfil(perfil);
}

function actualizarPerfilDesdeInputs() {
    const input_nom = document.getElementById("input_nombre_online");
    const input_ali = document.getElementById("input_alias_online");
    let alias_val = input_ali ? input_ali.value.trim() : "#BO1";
    if (alias_val && !alias_val.startsWith("#")) {
        alias_val = "#" + alias_val;
    }
    const actualizado = gestor_archivos_web.guardarPerfilUsuario({
        nombre: input_nom ? input_nom.value : "Jugador 1",
        alias: alias_val || "#BO1"
    });
    renderizarBarraEstadisticasPerfil(actualizado);
}

function renderizarBarraEstadisticasPerfil(perfil) {
    const badge = document.getElementById("badge_alias_perfil");
    if (badge) badge.textContent = perfil.alias || "#BO1";
    const s_gan = document.getElementById("stat_ganadas");
    const s_per = document.getElementById("stat_perdidas");
    const s_dor = document.getElementById("stat_dormidas");
    const s_jug = document.getElementById("stat_jugadas");
    if (s_gan) s_gan.textContent = String(perfil.ganadas || 0);
    if (s_per) s_per.textContent = String(perfil.perdidas || 0);
    if (s_dor) s_dor.textContent = String(perfil.dormidas || 0);
    if (s_jug) s_jug.textContent = String(perfil.jugadas || 0);
}

// Detecta si el jugador abrio un enlace de invitacion (?sala=XXXX)
function verificarParametroSalaEnURL() {
    const params = new URLSearchParams(window.location.search);
    const codigo_url = params.get("sala");
    if (codigo_url && codigo_url.trim().length > 0) {
        cambiarTabMenu("ONLINE");
        const campo_codigo = document.getElementById("input_codigo_sala");
        const campo_nombre = document.getElementById("input_nombre_online");
        if (campo_codigo) {
            campo_codigo.value = codigo_url.trim().toUpperCase();
        }
        if (campo_nombre) {
            campo_nombre.focus();
            campo_nombre.select();
        }
        mostrarAvisoModal(
            "Invitación a Sala de Cacho",
            `<p>Te invitaron a la sala <b>${codigo_url.toUpperCase()}</b>.</p>
             <p style="margin-top:8px;">Verifica tu nombre en <b>"Nombre del jugador"</b> y presiona el botón azul <b>"ENTRAR A SALA"</b>.</p>`
        );
    }
}

// ==================== NAVEGACION Y CONFIGURACION DEL MENU ====================

function cambiarTabMenu(tipo_tab) {
    const btn_online = document.getElementById("tab_modo_online");
    const btn_local = document.getElementById("tab_modo_local");
    const panel_online = document.getElementById("panel_config_online");
    const panel_local = document.getElementById("panel_config_local");

    if (tipo_tab === "ONLINE") {
        btn_online.classList.add("activo");
        btn_local.classList.remove("activo");
        panel_online.classList.remove("oculto");
        panel_local.classList.add("oculto");
    } else {
        btn_local.classList.add("activo");
        btn_online.classList.remove("activo");
        panel_local.classList.remove("oculto");
        panel_online.classList.add("oculto");
    }
}

function renderizarCamposJugadoresLocales() {
    const contenedor = document.getElementById("contenedor_campos_jugadores");
    const check_ia = document.getElementById("check_jugar_solo_ia");
    const jugando_ia = check_ia && check_ia.checked;

    contenedor.innerHTML = "";
    for (let i = 0; i < nombres_jugadores_locales.length; i++) {
        const fila = document.createElement("div");
        fila.className = "fila_campo";

        const label = document.createElement("label");
        label.textContent = `Jugador ${i + 1}:`;

        const input = document.createElement("input");
        input.type = "text";
        input.className = "campo_texto";
        input.value = nombres_jugadores_locales[i];
        input.maxLength = 18;
        if (jugando_ia && i === 1) {
            input.value = "IA";
            input.readOnly = true;
        }
        input.addEventListener("input", (ev) => {
            nombres_jugadores_locales[i] = ev.target.value;
        });

        fila.appendChild(label);
        fila.appendChild(input);
        contenedor.appendChild(fila);
    }

    const btn_mas = document.getElementById("boton_agregar_jugador");
    const btn_menos = document.getElementById("boton_quitar_jugador");
    if (btn_mas && btn_menos) {
        btn_mas.disabled = jugando_ia || nombres_jugadores_locales.length >= Partida.MAXIMO_JUGADORES;
        btn_menos.disabled = jugando_ia || nombres_jugadores_locales.length <= Partida.MINIMO_JUGADORES;
    }
}

function accionAgregarJugadorLocal() {
    if (nombres_jugadores_locales.length < Partida.MAXIMO_JUGADORES) {
        nombres_jugadores_locales.push("Jugador " + (nombres_jugadores_locales.length + 1));
        renderizarCamposJugadoresLocales();
    }
}

function accionQuitarJugadorLocal() {
    if (nombres_jugadores_locales.length > Partida.MINIMO_JUGADORES) {
        nombres_jugadores_locales.pop();
        renderizarCamposJugadoresLocales();
    }
}

function actualizarModoJugarSoloLocal() {
    const check_ia = document.getElementById("check_jugar_solo_ia");
    if (check_ia.checked) {
        nombres_jugadores_locales = [nombres_jugadores_locales[0] || "Jugador 1", "IA"];
    } else {
        nombres_jugadores_locales = [nombres_jugadores_locales[0] || "Jugador 1", "Jugador 2"];
    }
    renderizarCamposJugadoresLocales();
}

function iniciarNuevaPartidaLocal() {
    const modo_sel = document.getElementById("combo_modo_local").value;
    const check_ia = document.getElementById("check_jugar_solo_ia").checked;

    const lista_jugadores = [];
    for (let i = 0; i < nombres_jugadores_locales.length; i++) {
        let nombre = String(nombres_jugadores_locales[i] || "").trim();
        if (!nombre) nombre = "Jugador " + (i + 1);
        const es_ia = (i === 1) && check_ia;
        lista_jugadores.push(new Jugador(es_ia ? "IA" : nombre, es_ia));
    }

    es_partida_online = false;
    estadistica_partida_registrada = false;
    partida_actual = new Partida(lista_jugadores, modo_sel, false);
    cubilete_juego = new Cubilete(partida_actual.obtenerModoJuego());
    mostrarPantallaDeJuego();
    actualizarInterfazCompleta();
    verificarSiTurnoEsComputadora();
}

// ==================== SALA ONLINE ESTILO WOLFTEAM + QR ====================

function accionCrearSalaOnline() {
    actualizarPerfilDesdeInputs();
    const nombre_host = document.getElementById("input_nombre_online").value.trim() || "Jugador 1";
    const modo_online = document.getElementById("combo_modo_online").value;

    document.getElementById("subpanel_crear_o_unirse").classList.add("oculto");
    document.getElementById("subpanel_sala_espera").classList.remove("oculto");
    document.getElementById("etiqueta_codigo_sala").textContent = "...";

    gestor_red_voz.crearSalaComoAnfitrion(
        nombre_host,
        modo_online,
        (codigo, link) => {
            document.getElementById("etiqueta_codigo_sala").textContent = codigo;
            document.getElementById("input_enlace_invitacion").value = link;
            actualizarImagenQRSala(link);
            actualizarVistaLobbyOnline();
        },
        (mensaje_error) => {
            accionSalirSalaOnline();
            mostrarAvisoModal("Error al crear sala", mensaje_error);
        }
    );
}

function accionUnirseSalaOnline() {
    actualizarPerfilDesdeInputs();
    const nombre_invitado = document.getElementById("input_nombre_online").value.trim() || "Invitado";
    const codigo_sala = document.getElementById("input_codigo_sala").value.trim().toUpperCase();

    if (!codigo_sala) {
        mostrarAvisoModal("Aviso", "Escribe el código de la sala a la que deseas entrar.");
        return;
    }

    document.getElementById("subpanel_crear_o_unirse").classList.add("oculto");
    document.getElementById("subpanel_sala_espera").classList.remove("oculto");
    document.getElementById("etiqueta_codigo_sala").textContent = codigo_sala;

    gestor_red_voz.unirseASalaConCodigo(
        nombre_invitado,
        codigo_sala,
        (codigo, link) => {
            document.getElementById("input_enlace_invitacion").value = link;
            actualizarImagenQRSala(link);
            actualizarVistaLobbyOnline();
        },
        (mensaje_error) => {
            accionSalirSalaOnline();
            mostrarAvisoModal("No se pudo conectar", mensaje_error);
        }
    );
}

function actualizarImagenQRSala(link_sala) {
    const img_qr = document.getElementById("img_qr_sala");
    if (img_qr && link_sala) {
        img_qr.src = `https://api.qrserver.com/v1/create-qr-code/?size=190x190&data=${encodeURIComponent(link_sala)}`;
    }
}

function accionAlternarQRSala() {
    const caja_qr = document.getElementById("caja_qr_sala");
    if (caja_qr) {
        caja_qr.classList.toggle("oculto");
        if (!caja_qr.classList.contains("oculto")) {
            actualizarImagenQRSala(gestor_red_voz.obtenerEnlaceInvitacion());
        }
    }
}

function mostrarModalQRJuegoGeneral() {
    const url_juego = window.location.origin + window.location.pathname;
    const qr_src = `https://api.qrserver.com/v1/create-qr-code/?size=210x210&data=${encodeURIComponent(url_juego)}`;
    const html = `
        <div style="text-align:center;">
            <p style="margin-bottom:10px;">Pasa este enlace o haz que escaneen este código QR para abrir el juego y crear sus propias salas:</p>
            <img src="${qr_src}" alt="QR del Juego" style="width:190px;height:190px;border:2px solid #142d5c;border-radius:8px;padding:6px;">
            <div style="margin-top:10px;display:flex;gap:6px;">
                <input type="text" class="campo_texto" value="${url_juego}" readonly id="input_url_general_qr">
                <button class="boton_copiar" onclick="navigator.clipboard.writeText('${url_juego}')">📋 Copiar</button>
            </div>
        </div>
    `;
    mostrarAvisoModal("Compartir Juego de Cacho (Enlace y QR)", html);
}

function accionAlternarListoEnSala() {
    gestor_red_voz.alternarMiEstadoListo();
}

function accionAlternarRolEspectadorEnSala() {
    gestor_red_voz.alternarMiRolEspectador();
}

function accionMasterCambiarModoSala() {
    const combo = document.getElementById("combo_cambiar_modo_sala");
    if (combo && gestor_red_voz.es_anfitrion) {
        gestor_red_voz.cambiarModoDeSalaComoMaster(combo.value);
    }
}

function actualizarVistaLobbyOnline() {
    const lista_ul = document.getElementById("lista_jugadores_lobby");
    const contador_span = document.getElementById("contador_jugadores_sala");
    if (!lista_ul) return;

    // Titulo de la sala con el modo activo
    const etiq_rol = document.getElementById("etiqueta_rol_sala");
    if (etiq_rol) {
        etiq_rol.textContent = `SALA: ${gestor_red_voz.modo_sala}`;
    }

    const combo_modo_sala = document.getElementById("combo_cambiar_modo_sala");
    if (combo_modo_sala) {
        combo_modo_sala.value = gestor_red_voz.modo_sala;
        if (gestor_red_voz.es_anfitrion) {
            combo_modo_sala.classList.remove("oculto");
        } else {
            combo_modo_sala.classList.add("oculto");
        }
    }

    // Botones de estado personal en el lobby (Listo / Espectador)
    const btn_listo = document.getElementById("boton_listo_lobby");
    const btn_esp = document.getElementById("boton_rol_espectador_lobby");
    if (btn_listo) {
        btn_listo.textContent = gestor_red_voz.mi_listo ? "✅ Estoy Listo" : "⏳ No Listo";
        btn_listo.className = "boton_mini_lobby" + (gestor_red_voz.mi_listo ? " btn_listo_activo" : "");
    }
    if (btn_esp) {
        btn_esp.textContent = gestor_red_voz.mi_espectador ? "👁️ Espectador" : "🪑 Jugador";
        btn_esp.className = "boton_mini_lobby" + (gestor_red_voz.mi_espectador ? " btn_espectador_activo" : "");
    }

    lista_ul.innerHTML = "";
    contador_span.textContent = String(gestor_red_voz.jugadores_sala.length);

    let cantidad_jugadores_sentados = 0;
    for (const j of gestor_red_voz.jugadores_sala) {
        if (!j.espectador && j.conectado !== false) {
            cantidad_jugadores_sentados++;
        }

        const item = document.createElement("li");
        const icono_mic = j.micro_activo ? (j.hablando ? "🟢🎤" : "🎤") : "🔇";
        const etiqueta_tu = j.id_peer === gestor_red_voz.mi_id_peer ? " [Tú]" : "";
        const alias_txt = j.alias ? ` <span class="stats_mini_lobby">${j.alias}</span>` : "";
        const ganadas_num = (j.stats && j.stats.ganadas) ? j.stats.ganadas : 0;
        const perdidas_num = (j.stats && j.stats.perdidas) ? j.stats.perdidas : 0;
        const stats_txt = `<span class="stats_mini_lobby">(🏆${ganadas_num} / ❌${perdidas_num})</span>`;

        let badge_rol = "";
        if (j.es_host) {
            badge_rol = `<span class="badge_rol_lobby badge_master">👑 MASTER</span>`;
        }
        if (j.espectador) {
            badge_rol += `<span class="badge_rol_lobby badge_espectador">👁️ ESPECTADOR</span>`;
        } else if (j.listo) {
            badge_rol += `<span class="badge_rol_lobby badge_listo">✅ LISTO</span>`;
        } else {
            badge_rol += `<span class="badge_rol_lobby badge_espera">⏳ EN SALA</span>`;
        }

        let btn_kick_lobby = "";
        if (gestor_red_voz.es_anfitrion && j.id_peer !== gestor_red_voz.mi_id_peer) {
            btn_kick_lobby = `<button class="btn_expulsar_chip" onclick="confirmarExpulsionJugador('${j.id_peer}', '${j.nombre}')">✕</button>`;
        }

        item.innerHTML = `
            <div>
                <span>${j.nombre}${etiqueta_tu}</span>
                ${alias_txt}
                ${stats_txt}
                ${badge_rol}
            </div>
            <div style="display:flex;align-items:center;gap:6px;">
                <span>${icono_mic}</span>
                ${btn_kick_lobby}
            </div>
        `;
        lista_ul.appendChild(item);
    }

    const btn_iniciar = document.getElementById("boton_iniciar_online_host");
    const btn_mesa_solo = document.getElementById("boton_abrir_mesa_solitario");
    const msg_esperando = document.getElementById("mensaje_esperando_host");

    if (gestor_red_voz.es_anfitrion) {
        btn_iniciar.classList.remove("oculto");
        btn_mesa_solo.classList.remove("oculto");
        msg_esperando.classList.add("oculto");

        btn_iniciar.disabled = (cantidad_jugadores_sentados < 2);
        btn_iniciar.textContent = (cantidad_jugadores_sentados < 2)
            ? "⏳ ESPERANDO 2+ JUGADORES PARA PARTIDA..."
            : `▶ INICIAR PARTIDA (${cantidad_jugadores_sentados} JUGADORES EN MESA)`;
        btn_mesa_solo.textContent = "🎲 ABRIR MESA DE DADOS (SIN ESPERAR)";
    } else {
        btn_iniciar.classList.add("oculto");
        msg_esperando.classList.remove("oculto");
        if (gestor_red_voz.en_partida_online && partida_actual) {
            btn_mesa_solo.classList.remove("oculto");
            btn_mesa_solo.textContent = "👁️ VER MESA DE JUEGO EN VIVO";
        } else {
            btn_mesa_solo.classList.add("oculto");
        }
    }
}

function confirmarExpulsionJugador(id_peer, nombre_jugador) {
    if (confirm(`¿Expulsar a ${nombre_jugador} de la sala?`)) {
        gestor_red_voz.expulsarJugadorDePartida(id_peer);
    }
}

function accionCopiarEnlaceInvitacion() {
    const link = gestor_red_voz.obtenerEnlaceInvitacion();
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(link).then(() => mostrarConfirmacionCopia());
    } else {
        const input = document.getElementById("input_enlace_invitacion");
        input.select();
        document.execCommand("copy");
        mostrarConfirmacionCopia();
    }
}

function mostrarConfirmacionCopia() {
    const aviso = document.getElementById("aviso_copiado");
    if (aviso) {
        aviso.classList.remove("oculto");
        setTimeout(() => aviso.classList.add("oculto"), 2500);
    }
}

function accionCompartirWhatsApp() {
    const link = gestor_red_voz.obtenerEnlaceInvitacion();
    const texto = `¡Entra a jugar Cacho Boliviano conmigo! Toca el enlace para unirte a la sala ${gestor_red_voz.codigo_sala}: ${link}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank");
}

function accionSalirSalaOnline() {
    gestor_red_voz.cerrarConexionesActuales();
    document.getElementById("subpanel_sala_espera").classList.add("oculto");
    document.getElementById("subpanel_crear_o_unirse").classList.remove("oculto");
}

// El Master inicia la partida con todos los usuarios de la sala que tengan rol de Jugador (no espectadores)
function accionHostIniciarPartidaOnline() {
    if (!gestor_red_voz.es_anfitrion) return;

    const activos_mesa = gestor_red_voz.jugadores_sala.filter(j => !j.espectador && j.conectado !== false);
    if (activos_mesa.length < 2) {
        mostrarAvisoModal("Aviso", "Se necesitan al menos 2 usuarios con rol de '🪑 Jugador' para iniciar una partida competitiva, o usa el botón azul '🎲 Abrir Mesa de Dados (Sin esperar)'.");
        return;
    }

    iniciarMesaOnlineConLista(activos_mesa, false);
}

// Permite al Master abrir la mesa de inmediato (incluso estando el solo en la sala) o a un espectador ver la mesa activa
function accionAbrirMesaSinEsperar() {
    if (!gestor_red_voz.es_anfitrion) {
        if (gestor_red_voz.en_partida_online && partida_actual) {
            mostrarPantallaDeJuego();
            actualizarInterfazCompleta();
        }
        return;
    }

    let activos_mesa = gestor_red_voz.jugadores_sala.filter(j => !j.espectador && j.conectado !== false);
    if (activos_mesa.length === 0) {
        activos_mesa = [gestor_red_voz.jugadores_sala[0]];
    }
    iniciarMesaOnlineConLista(activos_mesa, true);
}

function iniciarMesaOnlineConLista(lista_jugadores_sala, permitir_solitario) {
    const jugadores_partida = lista_jugadores_sala.map(
        j => new Jugador(j.nombre, false, j.id_peer)
    );
    es_partida_online = true;
    estadistica_partida_registrada = false;
    gestor_red_voz.en_partida_online = true;
    partida_actual = new Partida(jugadores_partida, gestor_red_voz.modo_sala, permitir_solitario);
    cubilete_juego = new Cubilete(partida_actual.obtenerModoJuego());

    const estado_inicial = gestor_archivos_web.serializarEstadoCompleto(partida_actual, cubilete_juego);
    gestor_red_voz.difundirATodos({
        tipo: "INICIAR_PARTIDA_ONLINE",
        estado: estado_inicial,
        jugadores_sala: gestor_red_voz.jugadores_sala
    });

    mostrarPantallaDeJuego();
    actualizarInterfazCompleta();
}

function recibirInicioOSincronizacionOnline(estado_serializado, mostrar_mesa) {
    const reconstruido = gestor_archivos_web.reconstruirDesdeEstado(estado_serializado);
    partida_actual = reconstruido.partida;
    cubilete_juego = reconstruido.cubilete;
    es_partida_online = true;

    if (mostrar_mesa) {
        estadistica_partida_registrada = false;
        mostrarPantallaDeJuego();
    }
    actualizarInterfazCompleta();

    if (partida_actual.estaPartidaTerminada()) {
        mostrarFinDePartida();
    }
}

// Boton "👥 Sala" en la mesa de juego: permite volver a la Sala de Selección para unir espectadores
function accionVolverASalaDeEspera() {
    if (!es_partida_online) {
        accionVolverAlMenu();
        return;
    }

    if (gestor_red_voz.es_anfitrion) {
        // Si soy el Master, llevo a todos los integrantes de la sala de regreso al Lobby de seleccion
        // y convierto a los espectadores en jugadores listos para que puedan entrar a la nueva partida
        for (const j of gestor_red_voz.jugadores_sala) {
            j.espectador = false;
            j.listo = true;
        }
        gestor_red_voz.mi_espectador = false;
        gestor_red_voz.en_partida_online = false;
        gestor_red_voz.difundirATodos({
            tipo: "REGRESAR_TODOS_A_SALA_ESPERA",
            jugadores_sala: gestor_red_voz.jugadores_sala
        });
        recibirRegresoASalaDeEspera();
    } else {
        // Si soy invitado/espectador, muestro mi vista del Lobby de la sala sin desconectarme
        recibirRegresoASalaDeEspera();
    }
}

function recibirRegresoASalaDeEspera() {
    cerrarModal();
    document.getElementById("pantalla_juego").classList.add("oculto");
    document.getElementById("pantalla_menu").classList.remove("oculto");
    cambiarTabMenu("ONLINE");
    document.getElementById("subpanel_crear_o_unirse").classList.add("oculto");
    document.getElementById("subpanel_sala_espera").classList.remove("oculto");
    actualizarVistaLobbyOnline();
}

// Cuando un espectador toca "🪑 Unirme a Jugar" desde el banner de la mesa
function accionSolicitarEntrarAJugar() {
    gestor_red_voz.alternarMiRolEspectador(false);
    actualizarBannerEspectadorYMesa();
    mostrarAvisoModal(
        "Listo para entrar a la mesa",
        "Ya estás marcado como <b>🪑 Jugador</b>. En cuanto el 👑 Master abra la <b>👥 Sala de Jugadores</b> o inicie la siguiente ronda, entrarás a jugar."
    );
}

// ==================== CONTROLES DE VOZ (MICROFONO Y ALTAVOZ) ====================

async function accionAlternarMicrofono() {
    await gestor_red_voz.alternarMicrofonoUsuario();
}

function accionAlternarAltavoz() {
    gestor_red_voz.alternarAltavozUsuario();
}

function actualizarBotonesVozUI() {
    const btn_lobby = document.getElementById("boton_microfono_lobby");
    const btn_juego = document.getElementById("boton_microfono_juego");
    const btn_altavoz = document.getElementById("boton_altavoz_juego");

    if (btn_lobby) {
        btn_lobby.className = "boton_voz " + (gestor_red_voz.microfono_activo ? "micro_encendido" : "micro_apagado");
        btn_lobby.textContent = gestor_red_voz.microfono_activo ? "🎤 Micrófono: ON (Hablando)" : "🎤 Micrófono: OFF (Toca para hablar)";
    }
    if (btn_juego) {
        btn_juego.className = "boton_voz " + (gestor_red_voz.microfono_activo ? "micro_encendido" : "micro_apagado");
        btn_juego.textContent = gestor_red_voz.microfono_activo ? "🎤 Mic: ON" : "🎤 Mic: OFF";
    }
    if (btn_altavoz) {
        btn_altavoz.className = "boton_voz " + (gestor_red_voz.altavoz_activo ? "altavoz_activo" : "altavoz_silenciado");
        btn_altavoz.textContent = gestor_red_voz.altavoz_activo ? "🔊 Audio: ON" : "🔇 Audio: OFF";
    }
    actualizarChipsVozEnJuego();
}

function actualizarChipsVozEnJuego() {
    const contenedor_chips = document.getElementById("chips_jugadores_voz");
    const span_num_sala = document.getElementById("num_en_sala_top");
    if (span_num_sala) {
        span_num_sala.textContent = String(gestor_red_voz.jugadores_sala.length);
    }
    if (!contenedor_chips) return;
    contenedor_chips.innerHTML = "";

    for (const j of gestor_red_voz.jugadores_sala) {
        const chip = document.createElement("div");
        const esta_conectado = (j.conectado !== false);
        chip.className = "chip_jugador_voz"
            + (j.hablando ? " hablando" : "")
            + (!esta_conectado ? " desconectado" : "");

        const icono_corona = j.es_host ? "👑 " : "";
        const icono_rol = j.espectador ? "👁️ " : "";
        const icono_voz = !esta_conectado ? "⚠️" : (j.micro_activo ? "🎤" : "🔇");
        const estado_txt = !esta_conectado ? " (Desc.)" : "";
        chip.innerHTML = `<span>${icono_corona}${icono_rol}${icono_voz} ${j.nombre}${estado_txt}</span>`;

        if (gestor_red_voz.es_anfitrion && j.id_peer !== gestor_red_voz.mi_id_peer) {
            const btn_exp = document.createElement("button");
            btn_exp.className = "btn_expulsar_chip";
            btn_exp.title = "Expulsar jugador de la sala";
            btn_exp.textContent = !esta_conectado ? "✕ Expulsar" : "✕";
            btn_exp.onclick = (e) => {
                e.stopPropagation();
                if (confirm(`¿Deseas expulsar a ${j.nombre} para continuar la partida sin él?`)) {
                    gestor_red_voz.expulsarJugadorDePartida(j.id_peer);
                }
            };
            chip.appendChild(btn_exp);
        }

        contenedor_chips.appendChild(chip);
    }
}

// ==================== PANTALLA DE JUEGO Y PERMISOS DE TURNO ====================

function mostrarPantallaDeJuego() {
    document.getElementById("pantalla_menu").classList.add("oculto");
    document.getElementById("pantalla_juego").classList.remove("oculto");

    const panel_voz = document.getElementById("panel_controles_voz_juego");
    const btn_link = document.getElementById("boton_copiar_link_juego");
    const btn_volver_sala = document.getElementById("boton_volver_sala_juego");

    if (es_partida_online) {
        panel_voz.classList.remove("oculto");
        btn_link.classList.remove("oculto");
        if (btn_volver_sala) btn_volver_sala.classList.remove("oculto");
        actualizarChipsVozEnJuego();
    } else {
        panel_voz.classList.add("oculto");
        btn_link.classList.add("oculto");
        if (btn_volver_sala) btn_volver_sala.classList.add("oculto");
    }
    actualizarBannerEspectadorYMesa();
}

function estoySentadoEnPartidaActual() {
    if (!partida_actual) return false;
    if (!es_partida_online) return true;
    return partida_actual.obtenerListaJugadores().some(j => j.id_peer === gestor_red_voz.mi_id_peer);
}

function actualizarBannerEspectadorYMesa() {
    const banner = document.getElementById("banner_estado_mesa_online");
    const texto = document.getElementById("texto_banner_mesa_online");
    const btn_unirse = document.getElementById("btn_unirse_proxima_ronda");
    const btn_master_sala = document.getElementById("btn_master_sala_espera_banner");

    if (!banner || !es_partida_online || !partida_actual) {
        if (banner) banner.classList.add("oculto");
        return;
    }

    const sentado = estoySentadoEnPartidaActual();
    const total_en_sala = gestor_red_voz.jugadores_sala.length;
    const total_en_mesa = partida_actual.obtenerCantidadJugadores();
    const espectadores_esperando = total_en_sala - total_en_mesa;

    if (!sentado) {
        // Soy un espectador viendo la partida en curso
        banner.classList.remove("oculto");
        texto.textContent = gestor_red_voz.mi_espectador
            ? "👁️ MODO ESPECTADOR — Viendo partida en vivo"
            : "🪑 EN FILA DE ESPERA — Entrarás en cuanto el Master inicie nueva mesa";
        btn_unirse.classList.toggle("oculto", !gestor_red_voz.mi_espectador);
        btn_master_sala.classList.add("oculto");
    } else if (gestor_red_voz.es_anfitrion && (total_en_mesa === 1 || espectadores_esperando > 0)) {
        // Soy el Master y estoy practicando solo o hay amigos esperando en modo espectador
        banner.classList.remove("oculto");
        if (espectadores_esperando > 0) {
            texto.textContent = `👥 Hay ${espectadores_esperando} jugador(es) en espera mirando la mesa`;
        } else {
            texto.textContent = `🎲 MESA EN MODO PRÁCTICA (1 Jugador) — Código de Sala: ${gestor_red_voz.codigo_sala}`;
        }
        btn_unirse.classList.add("oculto");
        btn_master_sala.classList.remove("oculto");
        btn_master_sala.textContent = espectadores_esperando > 0
            ? `👥 Abrir Sala e Incluir a Todos (${total_en_sala})`
            : "👥 Volver a Sala de Espera";
    } else {
        banner.classList.add("oculto");
    }
}

// Verifica si este navegador tiene permiso para tocar los botones del turno actual
function esMiTurnoDeJugar() {
    if (!partida_actual || partida_actual.estaPartidaTerminada()) return false;
    const jugador_en_turno = partida_actual.obtenerJugadorActual();
    if (!jugador_en_turno || jugador_en_turno.esComputadora()) return false;
    if (!es_partida_online) return true;
    return jugador_en_turno.id_peer === gestor_red_voz.mi_id_peer;
}

// ==================== ACCIONES DE JUEGO CON 0-LAG (AUTORIDAD EN TURNO) ====================

function accionLanzarDadosConAnimacion() {
    if (animacion_en_curso || cambio_turno_en_pausa) return;
    if (!esMiTurnoDeJugar()) return;

    // 0-Lag: El jugador en turno calcula y anima inmediatamente en su propio dispositivo (0ms delay)
    // y transmite la tirada al resto de la sala en paralelo
    ejecutarLanzamientoInstantaneoEnTurno();
}

function ejecutarLanzamientoInstantaneoEnTurno() {
    if (!partida_actual || partida_actual.estaPartidaTerminada()) return;
    if (!cubilete_juego.puedeLanzarDados()) {
        mostrarAvisoModal("Aviso", "Ya no tienes más tiros en este turno.");
        return;
    }

    const primer_tiro = (cubilete_juego.obtenerTirosRealizados() === 0);
    cubilete_juego.lanzarDadosDisponibles();
    const valores_nuevos = cubilete_juego.obtenerValoresDados();
    const es_mano_especial = cubilete_juego.esJugadaDeMano() && (
        calculador_puntaje.esEscalera(valores_nuevos) ||
        calculador_puntaje.esFull(valores_nuevos) ||
        calculador_puntaje.esPoker(valores_nuevos) ||
        calculador_puntaje.esGrande(valores_nuevos)
    );

    if (es_partida_online) {
        const estado_nuevo = gestor_archivos_web.serializarEstadoCompleto(partida_actual, cubilete_juego);
        gestor_red_voz.difundirATodos({
            tipo: "ANIMAR_LANZAMIENTO",
            id_autor: gestor_red_voz.mi_id_peer,
            estado_final: estado_nuevo,
            primer_tiro: primer_tiro,
            es_mano_especial: es_mano_especial
        });
    }

    iniciarSecuenciaAnimacionCubilete(primer_tiro, es_mano_especial);
}

function recibirAnimacionLanzamientoOnline(estado_final, primer_tiro, es_mano_especial) {
    const reconstruido = gestor_archivos_web.reconstruirDesdeEstado(estado_final);
    partida_actual = reconstruido.partida;
    cubilete_juego = reconstruido.cubilete;
    iniciarSecuenciaAnimacionCubilete(primer_tiro, es_mano_especial);
}

// Metodo que anima el vaso de cuero en 3 fases identico a VentanaJuego.java
function iniciarSecuenciaAnimacionCubilete(primer_tiro, es_mano_especial) {
    animacion_en_curso = true;
    document.getElementById("boton_lanzar_dados").disabled = true;

    const canvas_vaso = document.getElementById("canvas_cubilete_animado");
    const ancho_mesa = canvas_vaso.width;
    const paso_px = Math.max(18, Math.floor(ancho_mesa / 19));

    let fase_animacion = 1;
    let x_cubilete = ancho_mesa;
    let pasos_giro = 0;

    const posiciones_x_dados = [55, 175, 295, 415, 535];

    const intervalo = setInterval(() => {
        if (fase_animacion === 1) {
            x_cubilete -= paso_px;
            dibujarCubileteEnCanvas(true, x_cubilete);
            for (let i = 0; i < Cubilete.CANTIDAD_DADOS; i++) {
                if (primer_tiro || !cubilete_juego.obtenerDado(i).estaDadoBloqueado()) {
                    if (x_cubilete <= posiciones_x_dados[i]) {
                        ocultos_en_cubilete[i] = true;
                        dibujarDadoIndividual(i);
                    }
                }
            }
            if (x_cubilete <= 0) {
                x_cubilete = 0;
                fase_animacion = 2;
            }
        } else if (fase_animacion === 2) {
            x_cubilete += paso_px;
            dibujarCubileteEnCanvas(true, x_cubilete);
            pasos_giro++;
            for (let i = 0; i < Cubilete.CANTIDAD_DADOS; i++) {
                if (primer_tiro || !cubilete_juego.obtenerDado(i).estaDadoBloqueado()) {
                    if (x_cubilete >= posiciones_x_dados[i]) {
                        ocultos_en_cubilete[i] = false;
                        dados_en_giro_visual[i] = true;
                        if (pasos_giro % 2 === 0) {
                            caras_en_animacion[i] = Math.floor(Math.random() * 6) + 1;
                        }
                        dibujarDadoIndividual(i);
                    }
                }
            }
            if (x_cubilete >= ancho_mesa) {
                dibujarCubileteEnCanvas(false, -200);
                fase_animacion = 3;
                pasos_giro = 0;
            }
        } else if (fase_animacion === 3) {
            pasos_giro++;
            if (pasos_giro <= 7) {
                if (pasos_giro % 2 === 0) {
                    for (let i = 0; i < Cubilete.CANTIDAD_DADOS; i++) {
                        if (primer_tiro || !cubilete_juego.obtenerDado(i).estaDadoBloqueado()) {
                            caras_en_animacion[i] = Math.floor(Math.random() * 6) + 1;
                            dibujarDadoIndividual(i);
                        }
                    }
                }
            } else {
                clearInterval(intervalo);
                for (let i = 0; i < Cubilete.CANTIDAD_DADOS; i++) {
                    ocultos_en_cubilete[i] = false;
                    dados_en_giro_visual[i] = false;
                }
                animacion_en_curso = false;
                actualizarInterfazCompleta();
                if (es_mano_especial) {
                    reproducirMelodiaVictoria();
                }
            }
        }
    }, 28);
}

function accionToqueDirectoDado(indice_dado) {
    if (cubilete_juego && cubilete_juego.obtenerTirosRealizados() > 0 && cubilete_juego.puedeLanzarDados()) {
        accionAlternarBloqueoDado(indice_dado);
    }
}

function accionAlternarBloqueoDado(indice_dado) {
    if (animacion_en_curso || cambio_turno_en_pausa || !esMiTurnoDeJugar()) return;
    if (cubilete_juego.obtenerTirosRealizados() === 0) return;

    const dado = cubilete_juego.obtenerDado(indice_dado);
    if (dado) {
        dado.alternarBloqueoDado();
        sincronizarYActualizarJugadaDirecta(false);
    }
}

function accionVoltearDado(indice_dado) {
    if (animacion_en_curso || cambio_turno_en_pausa || !esMiTurnoDeJugar()) return;

    if (!cubilete_juego.voltearDadoEnPosicion(indice_dado)) {
        mostrarAvisoModal("Aviso", "No puedes voltear más dados en este turno.");
        return;
    }
    sincronizarYActualizarJugadaDirecta(false);
}

function accionAnotarEnCategoria(indice_categoria) {
    if (animacion_en_curso || cambio_turno_en_pausa || !esMiTurnoDeJugar()) return;

    if (cubilete_juego.obtenerTirosRealizados() === 0) {
        mostrarAvisoModal("Aviso", "Debes lanzar los dados antes de anotar.");
        return;
    }
    const jugador_actual = partida_actual.obtenerJugadorActual();
    if (jugador_actual.obtenerLibretaJugador().estaCasillaUsada(indice_categoria)) {
        return;
    }

    const valores = cubilete_juego.obtenerValoresDados();
    const es_mano = cubilete_juego.esJugadaDeMano();
    const puntos = calculador_puntaje.calcularPuntajeCategoria(valores, indice_categoria, es_mano);
    const es_dormida = (indice_categoria === Libreta.CATEGORIA_GRANDE) && calculador_puntaje.esDormida(valores, es_mano);

    jugador_actual.anotarEnLibreta(indice_categoria, puntos);
    if (es_dormida) {
        jugador_actual.establecerGanoPorDormida(true);
        partida_actual.establecerPartidaTerminada(true);
    } else if (partida_actual.verificarTodasLasLibretasLlenas()) {
        partida_actual.establecerPartidaTerminada(true);
    }

    cambio_turno_en_pausa = true;
    sincronizarYActualizarJugadaDirecta(true);

    setTimeout(() => {
        cambio_turno_en_pausa = false;
        if (partida_actual.estaPartidaTerminada()) {
            sincronizarYActualizarJugadaDirecta(false);
            mostrarFinDePartida();
        } else {
            partida_actual.pasarSiguienteJugador();
            cubilete_juego.reiniciarParaNuevoTurno();
            sincronizarYActualizarJugadaDirecta(false);
            verificarSiTurnoEsComputadora();
        }
    }, 950);
}

function mostrarPausaVisualRemota() {
    cambio_turno_en_pausa = true;
    setTimeout(() => {
        cambio_turno_en_pausa = false;
        actualizarInterfazCompleta();
    }, 920);
}

function sincronizarYActualizarJugadaDirecta(en_pausa_turno) {
    actualizarInterfazCompleta();
    if (es_partida_online) {
        const estado = gestor_archivos_web.serializarEstadoCompleto(partida_actual, cubilete_juego);
        gestor_red_voz.difundirATodos({
            tipo: "SINCRONIZAR_ESTADO",
            id_autor: gestor_red_voz.mi_id_peer,
            estado: estado,
            pausa_cambio_turno: Boolean(en_pausa_turno)
        });
    }
}

// Turno automatico de la IA igual a ControladorCacho.java
function verificarSiTurnoEsComputadora() {
    if (!partida_actual || partida_actual.estaPartidaTerminada()) return;
    const jugador_actual = partida_actual.obtenerJugadorActual();
    if (!jugador_actual.esComputadora()) return;

    setTimeout(() => {
        cubilete_juego.lanzarDadosDisponibles();
        const valores_ia = cubilete_juego.obtenerValoresDados();
        const es_mano = cubilete_juego.esJugadaDeMano();

        let mejor_categoria = -1;
        let mejor_puntaje = -1;
        const libreta_ia = jugador_actual.obtenerLibretaJugador();

        for (let cat_i = 0; cat_i < Libreta.TOTAL_CATEGORIAS; cat_i++) {
            if (!libreta_ia.estaCasillaUsada(cat_i)) {
                const pts = calculador_puntaje.calcularPuntajeCategoria(valores_ia, cat_i, es_mano);
                if (pts > mejor_puntaje) {
                    mejor_puntaje = pts;
                    mejor_categoria = cat_i;
                }
            }
        }

        if (mejor_categoria !== -1) {
            const es_dormida_ia = (mejor_categoria === Libreta.CATEGORIA_GRANDE)
                && calculador_puntaje.esDormida(valores_ia, es_mano);
            jugador_actual.anotarEnLibreta(mejor_categoria, mejor_puntaje);
            if (es_dormida_ia) {
                jugador_actual.establecerGanoPorDormida(true);
                partida_actual.establecerPartidaTerminada(true);
            } else if (partida_actual.verificarTodasLasLibretasLlenas()) {
                partida_actual.establecerPartidaTerminada(true);
            } else {
                partida_actual.pasarSiguienteJugador();
            }
            cubilete_juego.reiniciarParaNuevoTurno();
            actualizarInterfazCompleta();
            if (partida_actual.estaPartidaTerminada()) {
                mostrarFinDePartida();
            }
        }
    }, 650);
}

// ==================== ACTUALIZACION VISUAL DE LA MESA ====================

function actualizarInterfazCompleta() {
    if (!partida_actual || !cubilete_juego) return;

    const jug = partida_actual.obtenerJugadorActual();
    const tiros = cubilete_juego.obtenerTirosRealizados();
    const puedo_actuar = esMiTurnoDeJugar() && !cambio_turno_en_pausa && !partida_actual.estaPartidaTerminada();

    document.getElementById("etiqueta_modo_activo").textContent = partida_actual.obtenerModoJuego();
    document.getElementById("etiqueta_info_turno").textContent =
        `TURNO: ${jug.obtenerNombreJugador().toUpperCase()} (${jug.obtenerPuntajeTotal()} pts)`;
    document.getElementById("etiqueta_info_tiros").textContent =
        `Tiros: ${tiros}/${cubilete_juego.obtenerMaximoTirosPermitidos()}   |   Volteos: ${cubilete_juego.obtenerVolteosRealizados()}/${cubilete_juego.obtenerMaximoVolteosPermitidos()}`;

    actualizarBannerEspectadorYMesa();

    const aviso_remoto = document.getElementById("aviso_turno_remoto");
    if (es_partida_online && !esMiTurnoDeJugar() && !partida_actual.estaPartidaTerminada()) {
        aviso_remoto.classList.remove("oculto");
        const jugador_turno_obj = gestor_red_voz.jugadores_sala.find(
            j => j.id_peer === jug.id_peer || j.nombre.toLowerCase() === jug.obtenerNombreJugador().toLowerCase()
        );
        const esta_conectado = jugador_turno_obj ? (jugador_turno_obj.conectado !== false) : true;

        if (!esta_conectado && jugador_turno_obj) {
            aviso_remoto.innerHTML = `⚠️ <span id="nombre_jugador_remoto">${jug.obtenerNombreJugador()}</span> se desconectó. `
                + (gestor_red_voz.es_anfitrion
                    ? `<button class="btn_expulsar_aviso" onclick="confirmarExpulsionJugador('${jugador_turno_obj.id_peer}', '${jug.obtenerNombreJugador()}')">Expulsar para continuar</button>`
                    : `Esperando a que regrese...`);
        } else {
            aviso_remoto.innerHTML = `Esperando jugada de <span id="nombre_jugador_remoto">${jug.obtenerNombreJugador()}</span>...`;
        }
    } else {
        aviso_remoto.classList.add("oculto");
    }

    // Actualizar los 5 dados y sus botones
    for (let i = 0; i < Cubilete.CANTIDAD_DADOS; i++) {
        dibujarDadoIndividual(i);
        const d = cubilete_juego.obtenerDado(i);
        const btn_bloq = document.getElementById(`btn_bloquear_${i}`);
        const btn_volt = document.getElementById(`btn_voltear_${i}`);

        btn_bloq.textContent = d.estaDadoBloqueado() ? "Bloqueado" : "Conservar";
        btn_bloq.className = "btn_conservar" + (d.estaDadoBloqueado() ? " bloqueado" : "");
        btn_bloq.disabled = !(puedo_actuar && tiros > 0 && cubilete_juego.puedeLanzarDados());

        btn_volt.disabled = !(puedo_actuar && cubilete_juego.puedeVoltearDados());
    }

    document.getElementById("boton_lanzar_dados").disabled = !(puedo_actuar && cubilete_juego.puedeLanzarDados());

    actualizarBotonesLibretaUI(jug.obtenerLibretaJugador(), tiros, puedo_actuar);
    actualizarTablasInferioresUI();
}

function actualizarBotonesLibretaUI(libreta_actual, tiros_hechos, puedo_actuar) {
    const es_mano = cubilete_juego.esJugadaDeMano();
    const valores = cubilete_juego.obtenerValoresDados();

    for (let c = 0; c < Libreta.TOTAL_CATEGORIAS; c++) {
        const nombre_cat = Libreta.obtenerNombreCategoria(c);
        const btn = document.getElementById(`btn_cat_${c}`);
        if (!btn) continue;

        if (libreta_actual.estaCasillaUsada(c)) {
            btn.innerHTML = `<span>${nombre_cat}</span><b>[${libreta_actual.obtenerPuntajeCasilla(c)} pts]</b>`;
            btn.className = "btn_categoria estado_usada";
            btn.disabled = true;
        } else {
            btn.disabled = !puedo_actuar;
            const extra = (c === Libreta.CATEGORIA_GRANDE && libreta_actual.obtenerUsosCasilla(c) === 1)
                ? ` [${libreta_actual.obtenerPuntajeCasilla(c)} pts] (1/2)`
                : "";

            if (tiros_hechos === 0) {
                btn.innerHTML = `<span>${nombre_cat}${extra}</span>`;
                btn.className = "btn_categoria";
            } else {
                const pts = calculador_puntaje.calcularPuntajeCategoria(valores, c, es_mano);
                let texto_pts = `${pts} pts`;
                if (es_mano && pts > 0 && (
                    c === Libreta.CATEGORIA_ESCALERA ||
                    c === Libreta.CATEGORIA_FULL ||
                    c === Libreta.CATEGORIA_POKER
                )) {
                    texto_pts = `${pts - 5} + 5 pts`;
                }
                btn.innerHTML = `<span>${nombre_cat}${extra}</span><b>${texto_pts}</b>`;
                btn.className = "btn_categoria " + (pts > 0 ? "estado_positivo" : "estado_cero");
            }
        }
    }
}

function actualizarTablasInferioresUI() {
    const copia_ranking = [...partida_actual.obtenerListaJugadores()];
    copia_ranking.sort((j1, j2) => j2.obtenerPuntajeTotal() - j1.obtenerPuntajeTotal());

    const tbody_rank = document.getElementById("cuerpo_tabla_ranking");
    tbody_rank.innerHTML = "";
    copia_ranking.forEach((j, idx) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td style="width:26px;font-weight:700;">${idx + 1}</td>
                        <td>${j.obtenerNombreJugador()}</td>
                        <td style="text-align:right;font-weight:700;">${j.obtenerPuntajeTotal()} pts</td>`;
        tbody_rank.appendChild(tr);
    });

    const tbody_resumen = document.getElementById("cuerpo_tabla_resumen");
    tbody_resumen.innerHTML = "";
    const turno_actual = partida_actual.obtenerIndiceTurnoActual();

    partida_actual.obtenerListaJugadores().forEach((jug, j_idx) => {
        const lib = jug.obtenerLibretaJugador();
        const tr = document.createElement("tr");
        if (j_idx === turno_actual) {
            tr.className = "fila_turno_activo";
        }
        let html_celdas = `<td style="text-align:left;">${j_idx === turno_actual ? "▶ " : ""}${jug.obtenerNombreJugador()}</td>`;
        for (let c = 0; c < Libreta.TOTAL_CATEGORIAS; c++) {
            const val = lib.tieneAnotacionEnCasilla(c) ? lib.obtenerPuntajeCasilla(c) : "-";
            html_celdas += `<td>${val}</td>`;
        }
        html_celdas += `<td><b>${jug.obtenerPuntajeTotal()}</b></td>`;
        tr.innerHTML = html_celdas;
        tbody_resumen.appendChild(tr);
    });
}

// ==================== DIBUJO 2D DE DADOS Y CUBILETE EN CANVAS ====================

function dibujarTodosLosDadosIniciales() {
    for (let i = 0; i < Cubilete.CANTIDAD_DADOS; i++) {
        dibujarDadoIndividual(i);
    }
}

function dibujarDadoIndividual(indice_dado) {
    const canvas = document.getElementById(`canvas_dado_${indice_dado}`);
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const ancho = canvas.width;
    const alto = canvas.height;
    ctx.clearRect(0, 0, ancho, alto);

    if (ocultos_en_cubilete[indice_dado]) {
        return;
    }

    const tiros_hechos = cubilete_juego ? cubilete_juego.obtenerTirosRealizados() : 0;
    const dado_obj = cubilete_juego ? cubilete_juego.obtenerDado(indice_dado) : null;
    const en_giro = dados_en_giro_visual[indice_dado];
    const activo_en_mesa = en_giro || (tiros_hechos > 0);
    const bloqueado = dado_obj ? dado_obj.estaDadoBloqueado() : false;
    const valor_cara = en_giro ? caras_en_animacion[indice_dado] : (dado_obj ? dado_obj.obtenerValorCara() : 1);

    const lado = Math.min(ancho, alto) - 10;
    const x_ini = (ancho - lado) / 2;
    const y_ini = (alto - lado) / 2;

    if (!activo_en_mesa) {
        ctx.fillStyle = "#dce1e6";
    } else if (en_giro) {
        ctx.fillStyle = "#fffacd";
    } else if (bloqueado) {
        ctx.fillStyle = "#ffebb4";
    } else {
        ctx.fillStyle = "#ffffff";
    }

    dibujarRectanguloRedondeado(ctx, x_ini, y_ini, lado, lado, 14);
    ctx.fill();

    ctx.lineWidth = (bloqueado || en_giro) ? 3.5 : 2.0;
    if (en_giro) {
        ctx.strokeStyle = "#f39c12";
    } else if (bloqueado) {
        ctx.strokeStyle = "#d35400";
    } else {
        ctx.strokeStyle = "#2c3e50";
    }
    ctx.stroke();

    if (!activo_en_mesa) {
        ctx.fillStyle = "#78828c";
        ctx.font = "bold 26px SansSerif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("?", ancho / 2, alto / 2);
        return;
    }

    const radio_punto = Math.max(5.5, lado / 11);
    const centro_x = x_ini + lado / 2;
    const centro_y = y_ini + lado / 2;
    const izq_x = x_ini + lado / 4;
    const der_x = x_ini + (lado * 3) / 4;
    const arr_y = y_ini + lado / 4;
    const aba_y = y_ini + (lado * 3) / 4;

    ctx.fillStyle = (valor_cara === 1) ? "#c0392b" : "#1e272e";

    if (valor_cara === 1 || valor_cara === 3 || valor_cara === 5) {
        dibujarPuntoDado(ctx, centro_x, centro_y, radio_punto);
    }
    if (valor_cara >= 2) {
        dibujarPuntoDado(ctx, izq_x, arr_y, radio_punto);
        dibujarPuntoDado(ctx, der_x, aba_y, radio_punto);
    }
    if (valor_cara >= 4) {
        dibujarPuntoDado(ctx, der_x, arr_y, radio_punto);
        dibujarPuntoDado(ctx, izq_x, aba_y, radio_punto);
    }
    if (valor_cara === 6) {
        dibujarPuntoDado(ctx, izq_x, centro_y, radio_punto);
        dibujarPuntoDado(ctx, der_x, centro_y, radio_punto);
    }
}

function dibujarRectanguloRedondeado(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

function dibujarPuntoDado(ctx, cx, cy, radio) {
    ctx.beginPath();
    ctx.arc(cx, cy, radio, 0, Math.PI * 2);
    ctx.fill();
}

function dibujarCubileteEnCanvas(visible, pos_x_cubilete) {
    const canvas = document.getElementById("canvas_cubilete_animado");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!visible) return;

    const x_izq = pos_x_cubilete;
    const x_der = pos_x_cubilete + 150;
    const y_centro = 92;
    const mitad_boca_izq = 74;
    const mitad_base_der = 53;

    const grad = ctx.createLinearGradient(x_izq, y_centro - mitad_boca_izq, x_izq, y_centro + mitad_boca_izq);
    grad.addColorStop(0, "rgb(150, 82, 35)");
    grad.addColorStop(1, "rgb(92, 44, 14)");

    ctx.beginPath();
    ctx.moveTo(x_izq, y_centro - mitad_boca_izq);
    ctx.lineTo(x_der, y_centro - mitad_base_der);
    ctx.lineTo(x_der, y_centro + mitad_base_der);
    ctx.lineTo(x_izq, y_centro + mitad_boca_izq);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.strokeStyle = "rgb(212, 175, 55)";
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x_izq + 32, y_centro - 69);
    ctx.lineTo(x_izq + 32, y_centro + 69);
    ctx.moveTo(x_der - 26, y_centro - 57);
    ctx.lineTo(x_der - 26, y_centro + 57);
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(x_izq, y_centro, 14, mitad_boca_izq, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgb(42, 18, 5)";
    ctx.fill();
    ctx.strokeStyle = "rgb(212, 175, 55)";
    ctx.stroke();
}

// ==================== MELODIA SINTETIZADA ====================

function reproducirMelodiaVictoria() {
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        const ctx = new AudioCtx();
        const notas_hz = [523, 659, 784, 1046, 784, 1046];
        const duraciones_ms = [110, 110, 110, 220, 110, 350];

        let tiempo_inicio = ctx.currentTime;
        for (let n = 0; n < notas_hz.length; n++) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = "sine";
            osc.frequency.value = notas_hz[n];

            gain.gain.setValueAtTime(0.18, tiempo_inicio);
            gain.gain.exponentialRampToValueAtTime(0.01, tiempo_inicio + duraciones_ms[n] / 1000);

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.start(tiempo_inicio);
            osc.stop(tiempo_inicio + duraciones_ms[n] / 1000);
            tiempo_inicio += duraciones_ms[n] / 1000;
        }
    } catch (e) {
    }
}

// ==================== GUARDADO, FIN DE PARTIDA Y VENTANAS MODALES ====================

function accionGuardarPartida() {
    if (!partida_actual || !cubilete_juego) return;
    const ok = gestor_archivos_web.guardarPartida(partida_actual, cubilete_juego);
    mostrarAvisoModal(
        ok ? "Guardar Partida" : "Error",
        ok ? "Partida agregada a la lista de partidas guardadas." : "No se pudo guardar la partida."
    );
}

function accionVolverAlMenu() {
    if (es_partida_online) {
        accionSalirSalaOnline();
    }
    es_partida_online = false;
    document.getElementById("pantalla_juego").classList.add("oculto");
    document.getElementById("pantalla_menu").classList.remove("oculto");
}

function mostrarFinDePartida() {
    const ganador = partida_actual.obtenerJugadorGanador();
    if (!estadistica_partida_registrada) {
        estadistica_partida_registrada = true;
        if (ganador) {
            gestor_archivos_web.registrarGanador(
                ganador.obtenerNombreJugador(),
                ganador.obtenerPuntajeTotal(),
                partida_actual.obtenerModoJuego()
            );
        }

        // Registrar estadistica en el perfil personal si participaron 2 o mas jugadores
        if (partida_actual.obtenerCantidadJugadores() >= 2 && estoySentadoEnPartidaActual()) {
            const gane_yo = ganador && (
                (es_partida_online && ganador.id_peer === gestor_red_voz.mi_id_peer) ||
                (!es_partida_online && ganador === partida_actual.obtenerJugadorPorIndice(0))
            );
            const fue_dormida = Boolean(ganador && ganador.obtenerGanoPorDormida());
            const nuevo_p = gestor_archivos_web.registrarResultadoEnPerfil(Boolean(gane_yo), fue_dormida);
            renderizarBarraEstadisticasPerfil(nuevo_p);
            gestor_red_voz.sincronizarMiPerfilLocal();
        }
    }

    const resumen = partida_actual.obtenerResumenResultado();
    reproducirMelodiaVictoria();

    let boton_extra_online = "";
    if (es_partida_online) {
        boton_extra_online = `
            <div style="margin-top:14px;">
                <button class="boton_accion boton_verde" onclick="accionVolverASalaDeEspera()">
                    👥 Volver a la Sala de Espera (Unir Espectadores / Nueva Ronda)
                </button>
            </div>
        `;
    }

    mostrarAvisoModal(
        "Fin del Juego — PARTIDA FINALIZADA",
        `<p style="font-size:16px;font-weight:800;">${resumen}</p>${boton_extra_online}`
    );
}

function mostrarVentanaHelp() {
    const html_help = `
        <h4 style="color:#142d5c; margin-bottom:6px;">REGLAS BÁSICAS</h4>
        <ul>
            <li><b>Tiro Volteo:</b> 1 tiro y 1 volteo.</li>
            <li><b>Alalay:</b> 2 tiros y 2 volteos.</li>
            <li><b>Triplete:</b> 3 tiros y 3 volteos.</li>
            <li><b>Voltear dado:</b> Cambia el dado a su cara opuesta (1↔6, 2↔5, 3↔4).</li>
        </ul>
        <h4 style="color:#142d5c; margin-bottom:6px;">COMBINACIONES Y PUNTAJES</h4>
        <ul>
            <li><b>Números (Balas a Senas):</b> Suma de los dados de ese número (1 al 6).</li>
            <li><b>Escalera:</b> 5 números seguidos = <b>20 pts</b>.</li>
            <li><b>Full:</b> 3 dados iguales + 2 iguales = <b>30 pts</b>.</li>
            <li><b>Poker:</b> 4 dados iguales = <b>40 pts</b>.</li>
            <li><b>Grande:</b> 5 dados iguales = <b>50 pts</b> (se puede anotar hasta 2 veces).</li>
            <li><b>Dormida:</b> 5 dados iguales en el primer tiro = <b>100 pts y gana la partida</b>.</li>
            <li><b>De Mano (Primer tiro):</b> Si se saca Escalera, Full o Poker en el primer tiro se añaden <b>+5 pts</b>.</li>
        </ul>
    `;
    mostrarAvisoModal("Help - Reglas de Cacho", html_help);
}

function abrirModalPartidasGuardadas() {
    const lista = gestor_archivos_web.leerPartidasGuardadas();
    let html = "";
    if (lista.length === 0) {
        html = "<p>No hay partidas guardadas todavía.</p>";
    } else {
        html = `<table class="tabla_resumen" style="margin-bottom:10px;">
                <thead><tr><th>Fecha</th><th>Modo</th><th>Jugadores</th><th>Acción</th></tr></thead><tbody>`;
        lista.forEach((p, idx) => {
            html += `<tr>
                <td>${p.fecha}</td>
                <td>${p.modo_juego}</td>
                <td>${p.resumen_jugadores || ""}</td>
                <td>
                    <button class="boton_pequeno" onclick="recuperarPartidaGuardada(${idx})">Recuperar</button>
                    <button class="boton_pequeno" onclick="borrarPartidaGuardada(${idx})">Borrar</button>
                </td>
            </tr>`;
        });
        html += `</tbody></table>
                 <button class="boton_pequeno" onclick="borrarTodasPartidasGuardadas()">Borrar Todas</button>`;
    }
    mostrarAvisoModal("Partidas Guardadas", html);
}

function recuperarPartidaGuardada(indice) {
    const lista = gestor_archivos_web.leerPartidasGuardadas();
    if (!lista[indice]) return;
    const rec = gestor_archivos_web.reconstruirDesdeEstado(lista[indice]);
    partida_actual = rec.partida;
    cubilete_juego = rec.cubilete;
    es_partida_online = false;
    cerrarModal();
    mostrarPantallaDeJuego();
    actualizarInterfazCompleta();
}

function borrarPartidaGuardada(indice) {
    gestor_archivos_web.eliminarPartidaPorIndice(indice);
    abrirModalPartidasGuardadas();
}

function borrarTodasPartidasGuardadas() {
    gestor_archivos_web.borrarTodasLasPartidas();
    abrirModalPartidasGuardadas();
}

function abrirModalGanadores() {
    const lista = gestor_archivos_web.leerHistorialGanadores();
    let html = "";
    if (lista.length === 0) {
        html = "<p>Aún no hay ganadores registrados.</p>";
    } else {
        html = `<table class="tabla_resumen" style="margin-bottom:10px;">
                <thead><tr><th>Fecha</th><th>Ganador</th><th>Puntaje</th><th>Modo</th></tr></thead><tbody>`;
        lista.forEach(g => {
            html += `<tr><td>${g.fecha}</td><td><b>${g.nombre}</b></td><td>${g.puntaje} pts</td><td>${g.modo}</td></tr>`;
        });
        html += `</tbody></table>
                 <button class="boton_pequeno" onclick="borrarHistorialGanadoresUI()">Borrar Toda la Lista</button>`;
    }
    mostrarAvisoModal("Historial de Ganadores", html);
}

function borrarHistorialGanadoresUI() {
    gestor_archivos_web.borrarHistorialGanadores();
    abrirModalGanadores();
}

function mostrarAvisoModal(titulo, contenido_html) {
    document.getElementById("titulo_modal").textContent = titulo;
    document.getElementById("contenido_modal").innerHTML = contenido_html;
    document.getElementById("fondo_modal").classList.remove("oculto");
}

function cerrarModal() {
    document.getElementById("fondo_modal").classList.add("oculto");
}

function cerrarModalSiClickFondo(evento) {
    if (evento.target && evento.target.id === "fondo_modal") {
        cerrarModal();
    }
}
