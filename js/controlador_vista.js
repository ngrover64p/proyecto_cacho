// Controlador principal y renderizado visual del Juego de Cacho (Local y Online)

const calculador_puntaje = new CalculadorPuntaje();
const gestor_archivos_web = new GestorArchivosWeb();
const gestor_red_voz = new GestorRedYVoz();

let partida_actual = null;
let cubilete_juego = null;
let es_partida_online = false;

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
    renderizarCamposJugadoresLocales();
    dibujarTodosLosDadosIniciales();
    verificarParametroSalaEnURL();
});

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
            campo_nombre.value = "";
            campo_nombre.placeholder = "Escribe tu nombre para entrar a la sala " + codigo_url.toUpperCase();
            campo_nombre.focus();
        }
        mostrarAvisoModal(
            "Invitación a Sala de Cacho",
            `<p>Te invitaron a la sala <b>${codigo_url.toUpperCase()}</b>.</p>
             <p style="margin-top:8px;">Escribe tu nombre en la casilla <b>"Nombre del jugador"</b> y presiona el botón azul <b>"ENTRAR A SALA"</b>.</p>`
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
    partida_actual = new Partida(lista_jugadores, modo_sel);
    cubilete_juego = new Cubilete(partida_actual.obtenerModoJuego());
    mostrarPantallaDeJuego();
    actualizarInterfazCompleta();
    verificarSiTurnoEsComputadora();
}

// ==================== SALA ONLINE Y ENLACE DE INVITACION ====================

function accionCrearSalaOnline() {
    const nombre_host = document.getElementById("input_nombre_online").value.trim() || "Jugador 1";
    const modo_online = document.getElementById("combo_modo_online").value;

    document.getElementById("subpanel_crear_o_unirse").classList.add("oculto");
    document.getElementById("subpanel_sala_espera").classList.remove("oculto");
    document.getElementById("etiqueta_codigo_sala").textContent = "Creando...";

    gestor_red_voz.crearSalaComoAnfitrion(
        nombre_host,
        modo_online,
        (codigo, link) => {
            document.getElementById("etiqueta_rol_sala").textContent = `ANFITRIÓN (${modo_online})`;
            document.getElementById("etiqueta_codigo_sala").textContent = codigo;
            document.getElementById("input_enlace_invitacion").value = link;
            document.getElementById("boton_iniciar_online_host").classList.remove("oculto");
            document.getElementById("mensaje_esperando_host").classList.add("oculto");
        },
        (mensaje_error) => {
            accionSalirSalaOnline();
            mostrarAvisoModal("Error al crear sala", mensaje_error);
        }
    );
}

function accionUnirseSalaOnline() {
    const nombre_invitado = document.getElementById("input_nombre_online").value.trim() || "Invitado";
    const codigo_sala = document.getElementById("input_codigo_sala").value.trim().toUpperCase();

    if (!codigo_sala) {
        mostrarAvisoModal("Aviso", "Escribe el código de la sala a la que deseas entrar.");
        return;
    }

    document.getElementById("subpanel_crear_o_unirse").classList.add("oculto");
    document.getElementById("subpanel_sala_espera").classList.remove("oculto");
    document.getElementById("etiqueta_codigo_sala").textContent = codigo_sala;
    document.getElementById("boton_iniciar_online_host").classList.add("oculto");
    document.getElementById("mensaje_esperando_host").classList.remove("oculto");

    gestor_red_voz.unirseASalaConCodigo(
        nombre_invitado,
        codigo_sala,
        (codigo, link) => {
            document.getElementById("etiqueta_rol_sala").textContent = "CONECTADO A SALA";
            document.getElementById("input_enlace_invitacion").value = link;
        },
        (mensaje_error) => {
            accionSalirSalaOnline();
            mostrarAvisoModal("No se pudo conectar", mensaje_error);
        }
    );
}

function actualizarVistaLobbyOnline() {
    const lista_ul = document.getElementById("lista_jugadores_lobby");
    const contador_span = document.getElementById("contador_jugadores_sala");
    if (!lista_ul) return;

    lista_ul.innerHTML = "";
    contador_span.textContent = String(gestor_red_voz.jugadores_sala.length);

    for (const j of gestor_red_voz.jugadores_sala) {
        const item = document.createElement("li");
        const icono_mic = j.micro_activo ? (j.hablando ? "🟢🎤" : "🎤") : "🔇";
        const etiqueta_host = j.es_host ? " (Anfitrión)" : "";
        const etiqueta_tu = j.id_peer === gestor_red_voz.mi_id_peer ? " [Tú]" : "";
        item.innerHTML = `<span>${j.nombre}${etiqueta_host}${etiqueta_tu}</span><span>${icono_mic}</span>`;
        lista_ul.appendChild(item);
    }

    const btn_iniciar = document.getElementById("boton_iniciar_online_host");
    if (btn_iniciar && gestor_red_voz.es_anfitrion) {
        btn_iniciar.disabled = gestor_red_voz.jugadores_sala.length < 2;
        btn_iniciar.textContent = gestor_red_voz.jugadores_sala.length < 2
            ? "⏳ ESPERANDO AL MENOS 2 JUGADORES..."
            : `▶ EMPEZAR PARTIDA (${gestor_red_voz.jugadores_sala.length} JUGADORES)`;
    }
}

function confirmarExpulsionJugador(id_peer, nombre_jugador) {
    if (confirm(`¿Expulsar a ${nombre_jugador} de la partida para que el turno avance?`)) {
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

function accionHostIniciarPartidaOnline() {
    if (!gestor_red_voz.es_anfitrion) return;
    if (gestor_red_voz.jugadores_sala.length < 2) {
        mostrarAvisoModal("Aviso", "Se necesitan al menos 2 jugadores en la sala para iniciar.");
        return;
    }

    const jugadores_partida = gestor_red_voz.jugadores_sala.map(
        j => new Jugador(j.nombre, false, j.id_peer)
    );
    es_partida_online = true;
    gestor_red_voz.en_partida_online = true;
    partida_actual = new Partida(jugadores_partida, gestor_red_voz.modo_sala);
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
        mostrarPantallaDeJuego();
    }
    actualizarInterfazCompleta();

    if (partida_actual.estaPartidaTerminada()) {
        mostrarFinDePartida();
    }
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
    if (!contenedor_chips) return;
    contenedor_chips.innerHTML = "";

    for (const j of gestor_red_voz.jugadores_sala) {
        const chip = document.createElement("div");
        const esta_conectado = (j.conectado !== false);
        chip.className = "chip_jugador_voz" 
            + (j.hablando ? " hablando" : "") 
            + (!esta_conectado ? " desconectado" : "");

        const icono = !esta_conectado ? "⚠️" : (j.micro_activo ? "🎤" : "🔇");
        const estado_txt = !esta_conectado ? " (Desconectado)" : "";
        chip.innerHTML = `<span>${icono} ${j.nombre}${estado_txt}</span>`;

        // Si es el anfitrión y el jugador se desconectó, mostrar botón rápido para expulsar
        if (gestor_red_voz.es_anfitrion && !esta_conectado && !j.es_host) {
            const btn_exp = document.createElement("button");
            btn_exp.className = "btn_expulsar_chip";
            btn_exp.title = "Expulsar jugador de la partida";
            btn_exp.textContent = "✕ Expulsar";
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
    if (es_partida_online) {
        panel_voz.classList.remove("oculto");
        btn_link.classList.remove("oculto");
        actualizarChipsVozEnJuego();
    } else {
        panel_voz.classList.add("oculto");
        btn_link.classList.add("oculto");
    }
}

// Verifica si este navegador tiene permiso para tocar los botones del turno actual
function esMiTurnoDeJugar() {
    if (!partida_actual || partida_actual.estaPartidaTerminada()) return false;
    const jugador_en_turno = partida_actual.obtenerJugadorActual();
    if (jugador_en_turno.esComputadora()) return false;
    if (!es_partida_online) return true;
    return jugador_en_turno.id_peer === gestor_red_voz.mi_id_peer;
}

// ==================== ACCIONES DE JUEGO (LOCAL Y ONLINE) ====================

function accionLanzarDadosConAnimacion() {
    if (animacion_en_curso || cambio_turno_en_pausa) return;
    if (!esMiTurnoDeJugar()) return;

    if (es_partida_online && !gestor_red_voz.es_anfitrion) {
        gestor_red_voz.enviarAccionAlHost("LANZAR");
        return;
    }

    ejecutarLanzamientoComoAutoridad();
}

function ejecutarLanzamientoComoAutoridad() {
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

    if (es_partida_online && gestor_red_voz.es_anfitrion) {
        const estado_nuevo = gestor_archivos_web.serializarEstadoCompleto(partida_actual, cubilete_juego);
        gestor_red_voz.difundirATodos({
            tipo: "ANIMAR_LANZAMIENTO",
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

    if (es_partida_online && !gestor_red_voz.es_anfitrion) {
        gestor_red_voz.enviarAccionAlHost("BLOQUEAR", indice_dado);
        return;
    }

    if (cubilete_juego.obtenerTirosRealizados() === 0) return;
    const dado = cubilete_juego.obtenerDado(indice_dado);
    if (dado) {
        dado.alternarBloqueoDado();
        sincronizarYActualizarHost(false);
    }
}

function accionVoltearDado(indice_dado) {
    if (animacion_en_curso || cambio_turno_en_pausa || !esMiTurnoDeJugar()) return;

    if (es_partida_online && !gestor_red_voz.es_anfitrion) {
        gestor_red_voz.enviarAccionAlHost("VOLTEAR", indice_dado);
        return;
    }

    if (!cubilete_juego.voltearDadoEnPosicion(indice_dado)) {
        mostrarAvisoModal("Aviso", "No puedes voltear más dados en este turno.");
        return;
    }
    sincronizarYActualizarHost(false);
}

function accionAnotarEnCategoria(indice_categoria) {
    if (animacion_en_curso || cambio_turno_en_pausa || !esMiTurnoDeJugar()) return;

    if (es_partida_online && !gestor_red_voz.es_anfitrion) {
        gestor_red_voz.enviarAccionAlHost("ANOTAR", indice_categoria);
        return;
    }

    ejecutarAnotacionComoAutoridad(indice_categoria);
}

function ejecutarAnotacionComoAutoridad(indice_categoria) {
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
    sincronizarYActualizarHost(true);

    // Pausa de 1000ms igual a VentanaJuego.java antes de cambiar de jugador
    setTimeout(() => {
        cambio_turno_en_pausa = false;
        if (partida_actual.estaPartidaTerminada()) {
            sincronizarYActualizarHost(false);
            mostrarFinDePartida();
        } else {
            partida_actual.pasarSiguienteJugador();
            cubilete_juego.reiniciarParaNuevoTurno();
            sincronizarYActualizarHost(false);
            verificarSiTurnoEsComputadora();
        }
    }, 1000);
}

function mostrarPausaVisualRemota() {
    cambio_turno_en_pausa = true;
    setTimeout(() => {
        cambio_turno_en_pausa = false;
        actualizarInterfazCompleta();
    }, 980);
}

// Procesa jugadas enviadas por un invitado cuando es su turno en partida online
function ejecutarAccionRemotaEnHost(id_peer_remitente, subtipo_accion, indice_valor) {
    if (!partida_actual || partida_actual.estaPartidaTerminada() || animacion_en_curso || cambio_turno_en_pausa) return;
    const jugador_turno = partida_actual.obtenerJugadorActual();
    if (jugador_turno.id_peer !== id_peer_remitente) return;

    if (subtipo_accion === "LANZAR") {
        ejecutarLanzamientoComoAutoridad();
    } else if (subtipo_accion === "BLOQUEAR") {
        if (cubilete_juego.obtenerTirosRealizados() > 0 && cubilete_juego.puedeLanzarDados()) {
            const dado = cubilete_juego.obtenerDado(indice_valor);
            if (dado) dado.alternarBloqueoDado();
            sincronizarYActualizarHost(false);
        }
    } else if (subtipo_accion === "VOLTEAR") {
        if (cubilete_juego.voltearDadoEnPosicion(indice_valor)) {
            sincronizarYActualizarHost(false);
        }
    } else if (subtipo_accion === "ANOTAR") {
        ejecutarAnotacionComoAutoridad(indice_valor);
    }
}

function sincronizarYActualizarHost(en_pausa_turno) {
    actualizarInterfazCompleta();
    if (es_partida_online && gestor_red_voz.es_anfitrion) {
        const estado = gestor_archivos_web.serializarEstadoCompleto(partida_actual, cubilete_juego);
        gestor_red_voz.difundirATodos({
            tipo: "SINCRONIZAR_ESTADO",
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

    const aviso_remoto = document.getElementById("aviso_turno_remoto");
    if (es_partida_online && !esMiTurnoDeJugar() && !partida_actual.estaPartidaTerminada()) {
        aviso_remoto.classList.remove("oculto");
        const jugador_turno_obj = gestor_red_voz.jugadores_sala.find(
            j => j.nombre.toLowerCase() === jug.obtenerNombreJugador().toLowerCase()
        );
        const esta_conectado = jugador_turno_obj ? (jugador_turno_obj.conectado !== false) : true;

        if (!esta_conectado) {
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
    // 1. Ranking ordenado de mayor a menor
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

    // 2. Tablero detallado resaltando en amarillo la fila del jugador en turno
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

// Equivalente exacto a PanelDadoGrafico.java
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

// Equivalente exacto a PanelMesaConCubilete.java (vaso de cuero inclinado con anillos dorados)
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

    // Anillos dorados del cubilete
    ctx.beginPath();
    ctx.moveTo(x_izq + 32, y_centro - 69);
    ctx.lineTo(x_izq + 32, y_centro + 69);
    ctx.moveTo(x_der - 26, y_centro - 57);
    ctx.lineTo(x_der - 26, y_centro + 57);
    ctx.stroke();

    // Boca izquierda oscura
    ctx.beginPath();
    ctx.ellipse(x_izq, y_centro, 14, mitad_boca_izq, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgb(42, 18, 5)";
    ctx.fill();
    ctx.strokeStyle = "rgb(212, 175, 55)";
    ctx.stroke();
}

// ==================== MELODIA SINTETIZADA (IGUAL A CONTROLADORCACHO.JAVA) ====================

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
    if (ganador) {
        gestor_archivos_web.registrarGanador(
            ganador.obtenerNombreJugador(),
            ganador.obtenerPuntajeTotal(),
            partida_actual.obtenerModoJuego()
        );
    }
    const resumen = partida_actual.obtenerResumenResultado();
    reproducirMelodiaVictoria();
    mostrarAvisoModal("Fin del Juego — PARTIDA FINALIZADA", `<p style="font-size:16px;font-weight:800;">${resumen}</p>`);
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
