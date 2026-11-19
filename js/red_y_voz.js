// Gestor de Red P2P (PeerJS) y Chat de Voz en Tiempo Real (WebRTC tipo Meet)

class GestorRedYVoz {
    static PREFIJO_PEER_SALA = "cacho-bolivia-sala-";

    constructor() {
        this.peer_actual = null;
        this.mi_id_peer = null;
        this.mi_nombre = "Jugador 1";
        this.es_anfitrion = false;
        this.codigo_sala = "";
        this.modo_sala = "ALALAY";
        this.en_partida_online = false;

        // Conexiones de datos: en el host guarda todas las conexiones; en el cliente guarda la conexion al host
        this.conexiones_clientes = new Map();
        this.conexion_al_host = null;

        // Lista de jugadores en la sala: [{ id_peer, nombre, es_host, micro_activo, hablando }]
        this.jugadores_sala = [];

        // Estado de Audio WebRTC (tipo Meet)
        this.stream_microfono_local = null;
        this.microfono_activo = false;
        this.altavoz_activo = true;
        this.llamadas_audio = new Map();
        this.elementos_audio_remoto = new Map();
        this.intervalo_detector_voz = null;
    }

    // Metodo para generar un codigo corto de 5 caracteres faciles de leer
    generarCodigoSalaAleatorio() {
        const caracteres = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        let codigo = "";
        for (let i = 0; i < 5; i++) {
            codigo += caracteres.charAt(Math.floor(Math.random() * caracteres.length));
        }
        return codigo;
    }

    // Metodo para obtener el enlace directo de invitacion con el parametro ?sala=XXXX
    obtenerEnlaceInvitacion() {
        const url_base = window.location.origin + window.location.pathname;
        return `${url_base}?sala=${this.codigo_sala}`;
    }

    // Metodo para crear una sala como Anfitrion (Host)
    crearSalaComoAnfitrion(nombre_jugador, modo_seleccionado, callback_exito, callback_error) {
        this.cerrarConexionesActuales();
        this.mi_nombre = String(nombre_jugador || "Anfitrión").trim() || "Anfitrión";
        this.modo_sala = modo_seleccionado;
        this.es_anfitrion = true;
        this.codigo_sala = this.generarCodigoSalaAleatorio();
        const id_completo_host = GestorRedYVoz.PREFIJO_PEER_SALA + this.codigo_sala;

        const opciones_peer = {
            config: {
                iceServers: [
                    { urls: "stun:stun.l.google.com:19302" },
                    { urls: "stun:stun1.l.google.com:19302" },
                    { urls: "stun:stun2.l.google.com:19302" },
                    { urls: "stun:global.stun.twilio.com:3478" }
                ]
            }
        };

        try {
            this.peer_actual = new Peer(id_completo_host, opciones_peer);
        } catch (err) {
            if (callback_error) callback_error("No se pudo cargar el servicio PeerJS.");
            return;
        }

        this.peer_actual.on("open", (id_asignado) => {
            this.mi_id_peer = id_asignado;
            this.jugadores_sala = [{
                id_peer: this.mi_id_peer,
                nombre: this.mi_nombre,
                es_host: true,
                micro_activo: this.microfono_activo,
                hablando: false
            }];
            this.configurarRecepcionLlamadasVoz();
            if (callback_exito) callback_exito(this.codigo_sala, this.obtenerEnlaceInvitacion());
            actualizarVistaLobbyOnline();
        });

        this.peer_actual.on("connection", (conexion_entrante) => {
            this.configurarConexionEntranteEnHost(conexion_entrante);
        });

        this.peer_actual.on("error", (error_peer) => {
            console.error("Error en Peer Host:", error_peer);
            if (error_peer.type === "unavailable-id") {
                this.crearSalaComoAnfitrion(nombre_jugador, modo_seleccionado, callback_exito, callback_error);
                return;
            }
            if (callback_error) callback_error("Error de red P2P: " + (error_peer.message || error_peer.type));
        });
    }

    // Metodo para unirse a una sala existente usando el codigo
    unirseASalaConCodigo(nombre_jugador, codigo_ingresado, callback_exito, callback_error) {
        this.cerrarConexionesActuales();
        const codigo_limpio = String(codigo_ingresado || "").trim().toUpperCase();
        if (!codigo_limpio) {
            if (callback_error) callback_error("Ingresa un código de sala válido.");
            return;
        }

        this.mi_nombre = String(nombre_jugador || "Invitado").trim() || "Invitado";
        this.es_anfitrion = false;
        this.codigo_sala = codigo_limpio;
        const id_host_destino = GestorRedYVoz.PREFIJO_PEER_SALA + this.codigo_sala;

        const opciones_peer = {
            config: {
                iceServers: [
                    { urls: "stun:stun.l.google.com:19302" },
                    { urls: "stun:stun1.l.google.com:19302" },
                    { urls: "stun:stun2.l.google.com:19302" },
                    { urls: "stun:global.stun.twilio.com:3478" }
                ]
            }
        };

        try {
            this.peer_actual = new Peer(opciones_peer);
        } catch (err) {
            if (callback_error) callback_error("No se pudo iniciar PeerJS en este navegador.");
            return;
        }

        this.peer_actual.on("open", (mi_id) => {
            this.mi_id_peer = mi_id;
            this.configurarRecepcionLlamadasVoz();

            const conn = this.peer_actual.connect(id_host_destino, { reliable: true });
            this.conexion_al_host = conn;

            const enviarSolicitud = () => {
                try {
                    conn.send({
                        tipo: "SOLICITUD_UNIRSE",
                        id_peer: this.mi_id_peer,
                        nombre: this.mi_nombre,
                        micro_activo: this.microfono_activo
                    });
                } catch (e) {
                    console.error("Error al enviar solicitud:", e);
                }
            };

            conn.on("open", () => {
                enviarSolicitud();
                // Enviar un respaldo a los 500ms por si el host aun estaba inicializando el canal
                setTimeout(enviarSolicitud, 500);
                if (callback_exito) callback_exito(this.codigo_sala, this.obtenerEnlaceInvitacion());
            });

            conn.on("data", (mensaje) => {
                this.procesarMensajeEnCliente(mensaje);
            });

            conn.on("close", () => {
                mostrarAvisoModal("Conexión finalizada", "El anfitrión cerró la sala o se perdió la conexión.");
                accionSalirSalaOnline();
            });

            conn.on("error", (err_conn) => {
                console.error("Error en conexión de datos:", err_conn);
            });
        });

        this.peer_actual.on("error", (error_peer) => {
            console.error("Error en Peer Invitado:", error_peer);
            if (callback_error) {
                callback_error("No se encontró la sala '" + this.codigo_sala + "' o el anfitrión no está conectado.");
            }
        });
    }

    // Configura los eventos de datos para cada amigo que se conecta al Anfitrion
    configurarConexionEntranteEnHost(conn) {
        const registrarEventos = () => {
            this.conexiones_clientes.set(conn.peer, conn);
        };

        if (conn.open) {
            registrarEventos();
        } else {
            conn.on("open", registrarEventos);
        }

        conn.on("data", (mensaje) => {
            this.conexiones_clientes.set(conn.peer, conn);
            this.procesarMensajeEnHost(conn, mensaje);
        });

        conn.on("close", () => {
            this.conexiones_clientes.delete(conn.peer);
            this.jugadores_sala = this.jugadores_sala.filter(j => j.id_peer !== conn.peer);
            this.difundirListaJugadoresSala();
            actualizarVistaLobbyOnline();
            actualizarChipsVozEnJuego();
        });

        conn.on("error", (err_c) => {
            console.error("Error en conexión entrante host:", err_c);
        });
    }

    // Procesa mensajes que llegan al Anfitrion desde los invitados
    procesarMensajeEnHost(conn_remitente, mensaje) {
        if (!mensaje || !mensaje.tipo) return;

        switch (mensaje.tipo) {
            case "SOLICITUD_UNIRSE": {
                if (this.jugadores_sala.length >= Partida.MAXIMO_JUGADORES) {
                    conn_remitente.send({ tipo: "SALA_LLENA" });
                    return;
                }
                const ya_existe = this.jugadores_sala.find(j => j.id_peer === mensaje.id_peer);
                if (!ya_existe) {
                    let nombre_final = mensaje.nombre;
                    const nombres_actuales = this.jugadores_sala.map(j => j.nombre.toLowerCase());
                    if (nombres_actuales.includes(nombre_final.toLowerCase())) {
                        nombre_final = nombre_final + " (" + (this.jugadores_sala.length + 1) + ")";
                    }
                    this.jugadores_sala.push({
                        id_peer: mensaje.id_peer,
                        nombre: nombre_final,
                        es_host: false,
                        micro_activo: Boolean(mensaje.micro_activo),
                        hablando: false
                    });
                }
                this.difundirListaJugadoresSala();
                actualizarVistaLobbyOnline();

                // Si la partida ya estaba en curso, le sincronizamos el tablero actual
                if (this.en_partida_online && partida_actual && cubilete_juego) {
                    conn_remitente.send({
                        tipo: "INICIAR_PARTIDA_ONLINE",
                        estado: gestor_archivos_web.serializarEstadoCompleto(partida_actual, cubilete_juego),
                        jugadores_sala: this.jugadores_sala
                    });
                }
                break;
            }

            case "ACCION_JUGADOR": {
                ejecutarAccionRemotaEnHost(mensaje.id_peer, mensaje.subtipo, mensaje.indice);
                break;
            }

            case "ESTADO_MICROFONO": {
                this.actualizarEstadoMicrofonoJugador(mensaje.id_peer, mensaje.micro_activo, mensaje.hablando);
                this.difundirATodos(mensaje);
                break;
            }
        }
    }

    // Procesa mensajes que llegan a un Invitado desde el Anfitrion
    procesarMensajeEnCliente(mensaje) {
        if (!mensaje || !mensaje.tipo) return;

        switch (mensaje.tipo) {
            case "ACTUALIZAR_LOBBY": {
                this.jugadores_sala = mensaje.jugadores_sala || [];
                this.modo_sala = mensaje.modo_sala || "ALALAY";
                actualizarVistaLobbyOnline();
                actualizarChipsVozEnJuego();
                // Si el cliente tiene el microfono prendido, asegura llamada con nuevos integrantes
                if (this.microfono_activo && this.stream_microfono_local) {
                    this.llamarATodosLosDemasConMiVoz();
                }
                break;
            }

            case "INICIAR_PARTIDA_ONLINE": {
                this.en_partida_online = true;
                if (mensaje.jugadores_sala) {
                    this.jugadores_sala = mensaje.jugadores_sala;
                }
                recibirInicioOSincronizacionOnline(mensaje.estado, true);
                break;
            }

            case "ANIMAR_LANZAMIENTO": {
                recibirAnimacionLanzamientoOnline(mensaje.estado_final, mensaje.primer_tiro, mensaje.es_mano_especial);
                break;
            }

            case "SINCRONIZAR_ESTADO": {
                recibirInicioOSincronizacionOnline(mensaje.estado, false);
                if (mensaje.pausa_cambio_turno) {
                    mostrarPausaVisualRemota();
                }
                break;
            }

            case "ESTADO_MICROFONO": {
                this.actualizarEstadoMicrofonoJugador(mensaje.id_peer, mensaje.micro_activo, mensaje.hablando);
                break;
            }
        }
    }

    difundirListaJugadoresSala() {
        this.difundirATodos({
            tipo: "ACTUALIZAR_LOBBY",
            jugadores_sala: this.jugadores_sala,
            modo_sala: this.modo_sala
        });
        if (this.microfono_activo && this.stream_microfono_local) {
            this.llamarATodosLosDemasConMiVoz();
        }
    }

    difundirATodos(objeto_mensaje) {
        for (const conn of this.conexiones_clientes.values()) {
            if (conn && conn.open) {
                conn.send(objeto_mensaje);
            }
        }
    }

    enviarAccionAlHost(subtipo_accion, indice_valor = 0) {
        if (this.es_anfitrion) {
            ejecutarAccionRemotaEnHost(this.mi_id_peer, subtipo_accion, indice_valor);
        } else if (this.conexion_al_host && this.conexion_al_host.open) {
            this.conexion_al_host.send({
                tipo: "ACCION_JUGADOR",
                id_peer: this.mi_id_peer,
                subtipo: subtipo_accion,
                indice: indice_valor
            });
        }
    }

    // ==================== SISTEMA DE AUDIO WEBRTC (TIPO MEET) ====================

    configurarRecepcionLlamadasVoz() {
        if (!this.peer_actual) return;
        this.peer_actual.on("call", (llamada_entrante) => {
            // Contesta con nuestro stream si tenemos mic activo, o sin stream para escuchar
            if (this.stream_microfono_local) {
                llamada_entrante.answer(this.stream_microfono_local);
            } else {
                llamada_entrante.answer();
            }
            this.registrarEventosLlamadaAudio(llamada_entrante);
        });
    }

    async alternarMicrofonoUsuario() {
        if (!this.stream_microfono_local) {
            try {
                this.stream_microfono_local = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true
                    },
                    video: false
                });
                this.microfono_activo = true;
                this.iniciarDetectorNivelVoz();
                this.llamarATodosLosDemasConMiVoz();
            } catch (error_mic) {
                mostrarAvisoModal(
                    "Permiso de Micrófono",
                    "No se pudo activar el micrófono. Asegúrate de darle permiso al navegador (en celulares requiere abrir el enlace con https:// de GitHub Pages)."
                );
                return false;
            }
        } else {
            this.microfono_activo = !this.microfono_activo;
            for (const pista of this.stream_microfono_local.getAudioTracks()) {
                pista.enabled = this.microfono_activo;
            }
            if (this.microfono_activo) {
                this.llamarATodosLosDemasConMiVoz();
            }
        }

        this.notificarMiEstadoMicrofono(false);
        actualizarBotonesVozUI();
        return this.microfono_activo;
    }

    alternarAltavozUsuario() {
        this.altavoz_activo = !this.altavoz_activo;
        for (const elem_audio of this.elementos_audio_remoto.values()) {
            elem_audio.muted = !this.altavoz_activo;
        }
        actualizarBotonesVozUI();
        return this.altavoz_activo;
    }

    llamarATodosLosDemasConMiVoz() {
        if (!this.peer_actual || !this.stream_microfono_local) return;
        for (const jugador of this.jugadores_sala) {
            if (jugador.id_peer && jugador.id_peer !== this.mi_id_peer) {
                const llamada_previa = this.llamadas_audio.get(jugador.id_peer);
                if (!llamada_previa || !llamada_previa.open) {
                    const nueva_llamada = this.peer_actual.call(jugador.id_peer, this.stream_microfono_local);
                    if (nueva_llamada) {
                        this.registrarEventosLlamadaAudio(nueva_llamada);
                    }
                }
            }
        }
    }

    registrarEventosLlamadaAudio(llamada) {
        this.llamadas_audio.set(llamada.peer, llamada);
        llamada.on("stream", (stream_remoto) => {
            this.reproducirStreamRemoto(llamada.peer, stream_remoto);
        });
        llamada.on("close", () => {
            this.eliminarAudioRemoto(llamada.peer);
        });
    }

    reproducirStreamRemoto(id_peer_remoto, stream_remoto) {
        let contenedor = document.getElementById("contenedor_audios_remotos");
        let audio_el = this.elementos_audio_remoto.get(id_peer_remoto);
        if (!audio_el) {
            audio_el = document.createElement("audio");
            audio_el.autoplay = true;
            audio_el.playsInline = true;
            contenedor.appendChild(audio_el);
            this.elementos_audio_remoto.set(id_peer_remoto, audio_el);
        }
        audio_el.srcObject = stream_remoto;
        audio_el.muted = !this.altavoz_activo;
        audio_el.play().catch(() => {});
    }

    eliminarAudioRemoto(id_peer_remoto) {
        const audio_el = this.elementos_audio_remoto.get(id_peer_remoto);
        if (audio_el) {
            audio_el.srcObject = null;
            audio_el.remove();
            this.elementos_audio_remoto.delete(id_peer_remoto);
        }
        this.llamadas_audio.delete(id_peer_remoto);
    }

    // Detector de volumen de voz para iluminar el indicador cuando el jugador habla
    iniciarDetectorNivelVoz() {
        if (this.intervalo_detector_voz || !this.stream_microfono_local) return;
        try {
            const CtxAudio = window.AudioContext || window.webkitAudioContext;
            const ctx = new CtxAudio();
            const fuente = ctx.createMediaStreamSource(this.stream_microfono_local);
            const analizador = ctx.createAnalyser();
            analizador.fftSize = 256;
            fuente.connect(analizador);
            const datos = new Uint8Array(analizador.frequencyBinCount);
            let hablaba_antes = false;

            this.intervalo_detector_voz = setInterval(() => {
                if (!this.microfono_activo) {
                    if (hablaba_antes) {
                        hablaba_antes = false;
                        this.notificarMiEstadoMicrofono(false);
                    }
                    return;
                }
                analizador.getByteFrequencyData(datos);
                let suma = 0;
                for (let i = 0; i < datos.length; i++) suma += datos[i];
                const promedio = suma / datos.length;
                const esta_hablando = promedio > 18;
                if (esta_hablando !== hablaba_antes) {
                    hablaba_antes = esta_hablando;
                    this.notificarMiEstadoMicrofono(esta_hablando);
                }
            }, 220);
        } catch (e) {
        }
    }

    notificarMiEstadoMicrofono(esta_hablando) {
        this.actualizarEstadoMicrofonoJugador(this.mi_id_peer, this.microfono_activo, esta_hablando);
        const msg = {
            tipo: "ESTADO_MICROFONO",
            id_peer: this.mi_id_peer,
            micro_activo: this.microfono_activo,
            hablando: Boolean(esta_hablando)
        };
        if (this.es_anfitrion) {
            this.difundirATodos(msg);
        } else if (this.conexion_al_host && this.conexion_al_host.open) {
            this.conexion_al_host.send(msg);
        }
    }

    actualizarEstadoMicrofonoJugador(id_peer_buscado, micro_on, hablando_ahora) {
        for (const j of this.jugadores_sala) {
            if (j.id_peer === id_peer_buscado) {
                j.micro_activo = Boolean(micro_on);
                j.hablando = Boolean(hablando_ahora);
            }
        }
        actualizarVistaLobbyOnline();
        actualizarChipsVozEnJuego();
    }

    cerrarConexionesActuales() {
        if (this.intervalo_detector_voz) {
            clearInterval(this.intervalo_detector_voz);
            this.intervalo_detector_voz = null;
        }
        if (this.stream_microfono_local) {
            for (const track of this.stream_microfono_local.getTracks()) {
                track.stop();
            }
            this.stream_microfono_local = null;
        }
        this.microfono_activo = false;
        for (const id_remoto of this.elementos_audio_remoto.keys()) {
            this.eliminarAudioRemoto(id_remoto);
        }
        this.conexiones_clientes.clear();
        this.conexion_al_host = null;
        if (this.peer_actual) {
            try {
                this.peer_actual.destroy();
            } catch (e) {
            }
            this.peer_actual = null;
        }
        this.en_partida_online = false;
        this.jugadores_sala = [];
        actualizarBotonesVozUI();
    }
}
