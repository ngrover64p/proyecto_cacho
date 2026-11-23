// Gestor de Red Online via WebSockets (MQTT over WSS) + Chat de Voz WebRTC (PeerJS)
// Conecta PC y Celulares en cualquier red (Wi-Fi, 4G/5G, routers con CGNAT o Brave) sin bloqueos

class GestorRedYVoz {
    static PREFIJO_TOPIC_SALA = "cacho_bolivia_v3/sala/";
    static PREFIJO_PEER_VOZ = "cacho-voz-v3-";

    // Servidores WebSocket publicos de alta disponibilidad con SSL (WSS)
    static LISTA_BROKERS_WSS = [
        "wss://broker.emqx.io:8084/mqtt",
        "wss://broker.hivemq.com:8884/mqtt"
    ];

    static CONFIGURACION_ICE = {
        iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun1.l.google.com:19302" },
            { urls: "stun:stun2.l.google.com:19302" },
            { urls: "stun:stun3.l.google.com:19302" }
        ]
    };

    constructor() {
        this.cliente_mqtt = null;
        this.indice_broker_actual = 0;
        this.mi_id_peer = this.obtenerOCrearMiIdUnico();
        this.mi_nombre = "Jugador 1";
        this.es_anfitrion = false;
        this.codigo_sala = "";
        this.modo_sala = "ALALAY";
        this.en_partida_online = false;
        this.unido_confirmado = false;

        // Lista de jugadores en la sala: [{ id_peer, nombre, es_host, micro_activo, hablando, conectado, ultimo_latido }]
        this.jugadores_sala = [];

        // Timers de sincronizacion y presencia
        this.intervalo_reintento_unirse = null;
        this.intervalo_latido_cliente = null;
        this.intervalo_vigilancia_host = null;

        // Estado de Audio WebRTC (tipo Meet)
        this.peer_actual = null;
        this.stream_microfono_local = null;
        this.microfono_activo = false;
        this.altavoz_activo = true;
        this.llamadas_audio = new Map();
        this.elementos_audio_remoto = new Map();
        this.intervalo_detector_voz = null;

        this.configurarEventosCierreYVisibilidad();
    }

    // Genera un ID unico para esta pestana/dispositivo
    obtenerOCrearMiIdUnico() {
        const aleatorio = Math.random().toString(36).substring(2, 8);
        const tiempo = Date.now().toString(36).slice(-4);
        return `jug_${aleatorio}_${tiempo}`;
    }

    // Notifica desconexion inmediata si el usuario cierra la ventana o pestana
    configurarEventosCierreYVisibilidad() {
        const notificarSalida = () => {
            if (this.cliente_mqtt && this.cliente_mqtt.connected && this.codigo_sala) {
                try {
                    if (this.es_anfitrion) {
                        this.publicarMensajeSala("todos", {
                            tipo: "SALA_CERRADA_POR_HOST"
                        });
                    } else {
                        this.publicarMensajeSala("host", {
                            tipo: "JUGADOR_DESCONECTADO",
                            id_peer: this.mi_id_peer
                        });
                    }
                } catch (e) {
                }
            }
        };

        window.addEventListener("beforeunload", notificarSalida);
        window.addEventListener("pagehide", notificarSalida);

        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "visible") {
                if (this.cliente_mqtt && !this.cliente_mqtt.connected) {
                    try {
                        this.cliente_mqtt.reconnect();
                    } catch (e) {
                    }
                }
                if (this.es_anfitrion && this.codigo_sala) {
                    this.difundirListaJugadoresSala();
                } else if (!this.es_anfitrion && this.codigo_sala) {
                    this.enviarLatidoAlHost();
                }
            }
        });
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

    obtenerTopicCanal(subcanal) {
        return `${GestorRedYVoz.PREFIJO_TOPIC_SALA}${this.codigo_sala}/${subcanal}`;
    }

    publicarMensajeSala(subcanal, objeto_datos, opciones = {}) {
        if (!this.cliente_mqtt || !this.codigo_sala) return;
        try {
            const topic = this.obtenerTopicCanal(subcanal);
            this.cliente_mqtt.publish(topic, JSON.stringify(objeto_datos), {
                qos: 0,
                retain: Boolean(opciones.retain)
            });
        } catch (e) {
            console.error("Error publicando mensaje WSS:", e);
        }
    }

    // ==================== CREAR SALA COMO ANFITRION ====================

    crearSalaComoAnfitrion(nombre_jugador, modo_seleccionado, callback_exito, callback_error) {
        this.cerrarConexionesActuales();
        this.mi_id_peer = this.obtenerOCrearMiIdUnico();
        this.mi_nombre = String(nombre_jugador || "Anfitrión").trim() || "Anfitrión";
        this.modo_sala = modo_seleccionado;
        this.es_anfitrion = true;
        this.codigo_sala = this.generarCodigoSalaAleatorio();

        this.jugadores_sala = [{
            id_peer: this.mi_id_peer,
            nombre: this.mi_nombre,
            es_host: true,
            micro_activo: this.microfono_activo,
            hablando: false,
            conectado: true,
            ultimo_latido: Date.now()
        }];

        this.conectarBrokerMQTT(
            () => {
                // Suscribirse al canal de solicitudes dirigidas al Host
                this.cliente_mqtt.subscribe(this.obtenerTopicCanal("host"), { qos: 0 });
                this.cliente_mqtt.subscribe(this.obtenerTopicCanal("todos"), { qos: 0 });

                this.iniciarPeerVozEnSegundoPlano();
                this.iniciarVigilanciaPresenciaEnHost();
                this.difundirListaJugadoresSala();

                if (callback_exito) callback_exito(this.codigo_sala, this.obtenerEnlaceInvitacion());
                actualizarVistaLobbyOnline();
            },
            (err_msg) => {
                if (callback_error) callback_error(err_msg);
            }
        );
    }

    // ==================== UNIRSE A SALA COMO INVITADO ====================

    unirseASalaConCodigo(nombre_jugador, codigo_ingresado, callback_exito, callback_error) {
        this.cerrarConexionesActuales();
        const codigo_limpio = String(codigo_ingresado || "").trim().toUpperCase();
        if (!codigo_limpio) {
            if (callback_error) callback_error("Ingresa un código de sala válido.");
            return;
        }

        this.mi_id_peer = this.obtenerOCrearMiIdUnico();
        this.mi_nombre = String(nombre_jugador || "Invitado").trim() || "Invitado";
        this.es_anfitrion = false;
        this.codigo_sala = codigo_limpio;
        this.unido_confirmado = false;

        this.conectarBrokerMQTT(
            () => {
                // Suscribirse al canal general de la sala y al canal privado de este jugador
                this.cliente_mqtt.subscribe(this.obtenerTopicCanal("todos"), { qos: 0 });
                this.cliente_mqtt.subscribe(this.obtenerTopicCanal("privado/" + this.mi_id_peer), { qos: 0 });

                this.iniciarPeerVozEnSegundoPlano();

                if (callback_exito) callback_exito(this.codigo_sala, this.obtenerEnlaceInvitacion());

                // Enviar solicitud de ingreso cada 1.1s hasta que el Host nos incluya en la lista
                const enviarPeticion = () => {
                    if (this.unido_confirmado) return;
                    this.publicarMensajeSala("host", {
                        tipo: "SOLICITUD_UNIRSE",
                        id_peer: this.mi_id_peer,
                        nombre: this.mi_nombre,
                        micro_activo: this.microfono_activo
                    });
                };

                enviarPeticion();
                let intentos = 0;
                this.intervalo_reintento_unirse = setInterval(() => {
                    if (this.unido_confirmado) {
                        clearInterval(this.intervalo_reintento_unirse);
                        this.intervalo_reintento_unirse = null;
                        return;
                    }
                    intentos++;
                    if (intentos > 30) {
                        clearInterval(this.intervalo_reintento_unirse);
                        this.intervalo_reintento_unirse = null;
                        if (callback_error) {
                            callback_error("El anfitrión no responde en la sala '" + this.codigo_sala + "'. Verifica que el código sea correcto y que el anfitrión tenga la sala abierta.");
                        }
                        return;
                    }
                    enviarPeticion();
                }, 1100);

                // Iniciar latidos cada 3 segundos para que el Host sepa que seguimos conectados
                this.intervalo_latido_cliente = setInterval(() => {
                    this.enviarLatidoAlHost();
                }, 3000);
            },
            (err_msg) => {
                if (callback_error) callback_error(err_msg);
            }
        );
    }

    enviarLatidoAlHost() {
        if (!this.es_anfitrion && this.cliente_mqtt && this.cliente_mqtt.connected && this.codigo_sala) {
            this.publicarMensajeSala("host", {
                tipo: "LATIDO_JUGADOR",
                id_peer: this.mi_id_peer
            });
        }
    }

    // ==================== CONEXION WEBSOCKET MQTT CON FALLBACK ====================

    conectarBrokerMQTT(on_conectado, on_error) {
        if (typeof mqtt === "undefined") {
            if (on_error) on_error("No se pudo cargar la librería de conexión WebSocket. Revisa tu conexión a internet.");
            return;
        }

        const url_broker = GestorRedYVoz.LISTA_BROKERS_WSS[this.indice_broker_actual];
        let conectado_una_vez = false;

        // Configurar Last Will para que el broker avise instantaneamente si este jugador cierra la pestaña
        const opciones_mqtt = {
            clientId: "cacho_" + this.mi_id_peer + "_" + Math.random().toString(16).substring(2, 6),
            clean: true,
            connectTimeout: 6000,
            reconnectPeriod: 1500,
            keepalive: 20
        };

        if (!this.es_anfitrion && this.codigo_sala) {
            opciones_mqtt.will = {
                topic: this.obtenerTopicCanal("host"),
                payload: JSON.stringify({
                    tipo: "JUGADOR_DESCONECTADO",
                    id_peer: this.mi_id_peer
                }),
                qos: 0,
                retain: false
            };
        }

        try {
            this.cliente_mqtt = mqtt.connect(url_broker, opciones_mqtt);
        } catch (err) {
            if (on_error) on_error("Error al abrir WebSocket: " + err.message);
            return;
        }

        const timeout_fallback = setTimeout(() => {
            if (!conectado_una_vez) {
                // Si el primer broker tarda mas de 5s, probar con el segundo broker automaticamente
                try {
                    this.cliente_mqtt.end(true);
                } catch (e) {
                }
                this.indice_broker_actual = (this.indice_broker_actual + 1) % GestorRedYVoz.LISTA_BROKERS_WSS.length;
                this.conectarBrokerMQTT(on_conectado, on_error);
            }
        }, 5500);

        this.cliente_mqtt.on("connect", () => {
            clearTimeout(timeout_fallback);
            if (!conectado_una_vez) {
                conectado_una_vez = true;
                if (on_conectado) on_conectado();
            } else {
                // Se reconecto tras volver de WhatsApp o cambio de red
                if (this.es_anfitrion) {
                    this.cliente_mqtt.subscribe(this.obtenerTopicCanal("host"), { qos: 0 });
                    this.cliente_mqtt.subscribe(this.obtenerTopicCanal("todos"), { qos: 0 });
                    this.difundirListaJugadoresSala();
                } else {
                    this.cliente_mqtt.subscribe(this.obtenerTopicCanal("todos"), { qos: 0 });
                    this.cliente_mqtt.subscribe(this.obtenerTopicCanal("privado/" + this.mi_id_peer), { qos: 0 });
                    this.enviarLatidoAlHost();
                }
            }
        });

        this.cliente_mqtt.on("message", (topic, payload_buffer) => {
            try {
                const mensaje = JSON.parse(payload_buffer.toString());
                if (this.es_anfitrion) {
                    this.procesarMensajeEnHost(mensaje);
                } else {
                    this.procesarMensajeEnCliente(mensaje);
                }
            } catch (e) {
            }
        });
    }

    // ==================== VIGILANCIA DE DESCONEXION EN EL HOST ====================

    iniciarVigilanciaPresenciaEnHost() {
        if (this.intervalo_vigilancia_host) clearInterval(this.intervalo_vigilancia_host);
        this.intervalo_vigilancia_host = setInterval(() => {
            if (!this.es_anfitrion) return;
            const ahora = Date.now();
            let hubo_cambio = false;

            for (const j of this.jugadores_sala) {
                if (j.es_host) continue;
                // Si no envia latido hace mas de 9 segundos, marcarlo como desconectado
                if (j.conectado !== false && (ahora - (j.ultimo_latido || ahora)) > 9500) {
                    j.conectado = false;
                    hubo_cambio = true;
                }
            }

            if (hubo_cambio) {
                if (!this.en_partida_online) {
                    // Si aun estaban en el lobby antes de empezar, quitar los desconectados
                    this.jugadores_sala = this.jugadores_sala.filter(j => j.es_host || j.conectado !== false);
                }
                this.difundirListaJugadoresSala();
                actualizarVistaLobbyOnline();
                actualizarChipsVozEnJuego();
                actualizarInterfazCompleta();
            }
        }, 3500);
    }

    marcarJugadorDesconectadoEnHost(id_peer_saliente) {
        if (!this.es_anfitrion) return;
        this.eliminarAudioRemoto(id_peer_saliente);

        if (this.en_partida_online) {
            let cambio = false;
            for (const j of this.jugadores_sala) {
                if (j.id_peer === id_peer_saliente && j.conectado !== false) {
                    j.conectado = false;
                    cambio = true;
                }
            }
            if (cambio) {
                this.difundirListaJugadoresSala();
                actualizarChipsVozEnJuego();
                actualizarInterfazCompleta();
            }
        } else {
            const largo_antes = this.jugadores_sala.length;
            this.jugadores_sala = this.jugadores_sala.filter(j => j.id_peer !== id_peer_saliente);
            if (this.jugadores_sala.length !== largo_antes) {
                this.difundirListaJugadoresSala();
                actualizarVistaLobbyOnline();
                actualizarChipsVozEnJuego();
            }
        }
    }

    // ==================== PROCESAMIENTO DE MENSAJES EN ANFITRION (HOST) ====================

    procesarMensajeEnHost(mensaje) {
        if (!mensaje || !mensaje.tipo) return;

        switch (mensaje.tipo) {
            case "SOLICITUD_UNIRSE": {
                if (mensaje.id_peer === this.mi_id_peer) return;

                // 1. Verificar si es un jugador que ya estaba en la sala o que se reconecta con su mismo nombre
                const jugador_existente = this.jugadores_sala.find(
                    j => j.id_peer === mensaje.id_peer || (!j.es_host && !j.conectado && j.nombre.toLowerCase() === String(mensaje.nombre || "").toLowerCase())
                );

                if (jugador_existente) {
                    const id_anterior = jugador_existente.id_peer;
                    jugador_existente.id_peer = mensaje.id_peer;
                    jugador_existente.conectado = true;
                    jugador_existente.ultimo_latido = Date.now();
                    jugador_existente.micro_activo = Boolean(mensaje.micro_activo);

                    if (this.en_partida_online && partida_actual) {
                        for (const jug_modelo of partida_actual.obtenerListaJugadores()) {
                            if (jug_modelo.id_peer === id_anterior || jug_modelo.obtenerNombreJugador().toLowerCase() === jugador_existente.nombre.toLowerCase()) {
                                jug_modelo.id_peer = mensaje.id_peer;
                            }
                        }
                    }

                    this.difundirListaJugadoresSala();
                    actualizarVistaLobbyOnline();
                    actualizarChipsVozEnJuego();
                    actualizarInterfazCompleta();

                    if (this.en_partida_online && partida_actual && cubilete_juego) {
                        this.publicarMensajeSala("privado/" + mensaje.id_peer, {
                            tipo: "INICIAR_PARTIDA_ONLINE",
                            estado: gestor_archivos_web.serializarEstadoCompleto(partida_actual, cubilete_juego),
                            jugadores_sala: this.jugadores_sala
                        });
                    }
                    return;
                }

                // 2. Si es un jugador nuevo
                if (this.jugadores_sala.length >= Partida.MAXIMO_JUGADORES) {
                    this.publicarMensajeSala("privado/" + mensaje.id_peer, { tipo: "SALA_LLENA" });
                    return;
                }

                let nombre_final = String(mensaje.nombre || "Jugador").trim() || "Jugador";
                const nombres_actuales = this.jugadores_sala.map(j => j.nombre.toLowerCase());
                if (nombres_actuales.includes(nombre_final.toLowerCase())) {
                    nombre_final = nombre_final + " (" + (this.jugadores_sala.length + 1) + ")";
                }

                this.jugadores_sala.push({
                    id_peer: mensaje.id_peer,
                    nombre: nombre_final,
                    es_host: false,
                    micro_activo: Boolean(mensaje.micro_activo),
                    hablando: false,
                    conectado: true,
                    ultimo_latido: Date.now()
                });

                this.difundirListaJugadoresSala();
                actualizarVistaLobbyOnline();

                if (this.en_partida_online && partida_actual && cubilete_juego) {
                    this.publicarMensajeSala("privado/" + mensaje.id_peer, {
                        tipo: "INICIAR_PARTIDA_ONLINE",
                        estado: gestor_archivos_web.serializarEstadoCompleto(partida_actual, cubilete_juego),
                        jugadores_sala: this.jugadores_sala
                    });
                }
                break;
            }

            case "LATIDO_JUGADOR": {
                const jug = this.jugadores_sala.find(j => j.id_peer === mensaje.id_peer);
                if (jug) {
                    const estaba_desconectado = (jug.conectado === false);
                    jug.conectado = true;
                    jug.ultimo_latido = Date.now();
                    if (estaba_desconectado) {
                        this.difundirListaJugadoresSala();
                        actualizarChipsVozEnJuego();
                        actualizarInterfazCompleta();
                    }
                }
                break;
            }

            case "JUGADOR_DESCONECTADO": {
                this.marcarJugadorDesconectadoEnHost(mensaje.id_peer);
                break;
            }

            case "ACCION_JUGADOR": {
                const jug = this.jugadores_sala.find(j => j.id_peer === mensaje.id_peer);
                if (jug) {
                    jug.conectado = true;
                    jug.ultimo_latido = Date.now();
                }
                ejecutarAccionRemotaEnHost(mensaje.id_peer, mensaje.subtipo, mensaje.indice);
                break;
            }

            case "ESTADO_MICROFONO": {
                this.actualizarEstadoMicrofonoJugador(mensaje.id_peer, mensaje.micro_activo, mensaje.hablando);
                this.publicarMensajeSala("todos", mensaje);
                break;
            }
        }
    }

    // ==================== PROCESAMIENTO DE MENSAJES EN INVITADO (CLIENTE) ====================

    procesarMensajeEnCliente(mensaje) {
        if (!mensaje || !mensaje.tipo) return;

        switch (mensaje.tipo) {
            case "ACTUALIZAR_LOBBY": {
                this.jugadores_sala = mensaje.jugadores_sala || [];
                this.modo_sala = mensaje.modo_sala || "ALALAY";

                // Verificar si el Host ya nos registro en la lista
                const estoy_en_lista = this.jugadores_sala.some(j => j.id_peer === this.mi_id_peer);
                if (estoy_en_lista) {
                    this.unido_confirmado = true;
                    if (this.intervalo_reintento_unirse) {
                        clearInterval(this.intervalo_reintento_unirse);
                        this.intervalo_reintento_unirse = null;
                    }
                } else if (this.unido_confirmado && this.en_partida_online) {
                    // Si estabamos en partida y ya no estamos en la lista, fuimos expulsados
                    mostrarAvisoModal("Expulsado de la sala", "El anfitrión te expulsó de la partida.");
                    accionVolverAlMenu();
                    return;
                }

                actualizarVistaLobbyOnline();
                actualizarChipsVozEnJuego();
                if (this.en_partida_online) {
                    actualizarInterfazCompleta();
                }
                if (this.microfono_activo && this.stream_microfono_local) {
                    this.llamarATodosLosDemasConMiVoz();
                }
                break;
            }

            case "INICIAR_PARTIDA_ONLINE": {
                this.unido_confirmado = true;
                if (this.intervalo_reintento_unirse) {
                    clearInterval(this.intervalo_reintento_unirse);
                    this.intervalo_reintento_unirse = null;
                }
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
                if (mensaje.jugadores_sala) {
                    this.jugadores_sala = mensaje.jugadores_sala;
                }
                const sigo_en_partida = mensaje.estado.jugadores.some(j => j.id_peer === this.mi_id_peer);
                if (!sigo_en_partida && this.en_partida_online) {
                    mostrarAvisoModal("Expulsado de la partida", "El anfitrión continuó la partida sin ti.");
                    accionVolverAlMenu();
                    return;
                }
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

            case "SALA_CERRADA_POR_HOST": {
                mostrarAvisoModal("Sala finalizada", "El anfitrión cerró la sala.");
                accionVolverAlMenu();
                break;
            }
        }
    }

    difundirListaJugadoresSala() {
        this.publicarMensajeSala("todos", {
            tipo: "ACTUALIZAR_LOBBY",
            jugadores_sala: this.jugadores_sala,
            modo_sala: this.modo_sala
        });
        if (this.microfono_activo && this.stream_microfono_local) {
            this.llamarATodosLosDemasConMiVoz();
        }
    }

    difundirATodos(objeto_mensaje) {
        objeto_mensaje.jugadores_sala = this.jugadores_sala;
        this.publicarMensajeSala("todos", objeto_mensaje);
    }

    enviarAccionAlHost(subtipo_accion, indice_valor = 0) {
        if (this.es_anfitrion) {
            ejecutarAccionRemotaEnHost(this.mi_id_peer, subtipo_accion, indice_valor);
        } else {
            this.publicarMensajeSala("host", {
                tipo: "ACCION_JUGADOR",
                id_peer: this.mi_id_peer,
                subtipo: subtipo_accion,
                indice: indice_valor
            });
        }
    }

    // Metodo para que el Anfitrion expulse a un jugador desconectado o ausente
    expulsarJugadorDePartida(id_peer_a_expulsar) {
        if (!this.es_anfitrion || !partida_actual) return;

        const idx_sala = this.jugadores_sala.findIndex(j => j.id_peer === id_peer_a_expulsar);
        if (idx_sala === -1) return;

        const jugador_a_quitar = this.jugadores_sala[idx_sala];
        this.jugadores_sala.splice(idx_sala, 1);

        const lista_partida = partida_actual.obtenerListaJugadores();
        const idx_modelo = lista_partida.findIndex(j => j.id_peer === id_peer_a_expulsar);

        if (idx_modelo !== -1) {
            const era_su_turno = (partida_actual.obtenerIndiceTurnoActual() === idx_modelo);
            lista_partida.splice(idx_modelo, 1);

            if (lista_partida.length < 2) {
                partida_actual.establecerPartidaTerminada(true);
            } else if (era_su_turno) {
                if (partida_actual.indice_turno_actual >= lista_partida.length) {
                    partida_actual.indice_turno_actual = 0;
                }
                cubilete_juego.reiniciarParaNuevoTurno();
            } else if (partida_actual.indice_turno_actual > idx_modelo) {
                partida_actual.indice_turno_actual--;
            }
        }

        this.eliminarAudioRemoto(id_peer_a_expulsar);
        this.difundirListaJugadoresSala();
        sincronizarYActualizarHost(false);
        if (partida_actual.estaPartidaTerminada()) {
            mostrarFinDePartida();
        }
    }

    // ==================== SISTEMA DE AUDIO WEBRTC (TIPO MEET) ====================

    obtenerIdPeerVoz(id_jugador) {
        return `cacho-voz-v3-${this.codigo_sala}-${id_jugador}`;
    }

    iniciarPeerVozEnSegundoPlano() {
        if (typeof Peer === "undefined") return;
        try {
            if (this.peer_actual) {
                this.peer_actual.destroy();
            }
            const mi_id_voz = this.obtenerIdPeerVoz(this.mi_id_peer);
            this.peer_actual = new Peer(mi_id_voz, {
                config: GestorRedYVoz.CONFIGURACION_ICE,
                debug: 0
            });
            this.peer_actual.on("call", (llamada_entrante) => {
                if (this.stream_microfono_local) {
                    llamada_entrante.answer(this.stream_microfono_local);
                } else {
                    llamada_entrante.answer();
                }
                this.registrarEventosLlamadaAudio(llamada_entrante);
            });
            this.peer_actual.on("error", () => {});
        } catch (e) {
        }
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
                    "No se pudo activar el micrófono. Asegúrate de darle permiso al navegador."
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
            if (jugador.id_peer && jugador.id_peer !== this.mi_id_peer && jugador.conectado !== false) {
                const id_voz_remoto = this.obtenerIdPeerVoz(jugador.id_peer);
                const llamada_previa = this.llamadas_audio.get(id_voz_remoto);
                if (!llamada_previa || !llamada_previa.open) {
                    try {
                        const nueva_llamada = this.peer_actual.call(id_voz_remoto, this.stream_microfono_local);
                        if (nueva_llamada) {
                            this.registrarEventosLlamadaAudio(nueva_llamada);
                        }
                    } catch (e) {
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
            this.publicarMensajeSala("todos", msg);
        } else {
            this.publicarMensajeSala("host", msg);
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
        if (this.intervalo_reintento_unirse) {
            clearInterval(this.intervalo_reintento_unirse);
            this.intervalo_reintento_unirse = null;
        }
        if (this.intervalo_latido_cliente) {
            clearInterval(this.intervalo_latido_cliente);
            this.intervalo_latido_cliente = null;
        }
        if (this.intervalo_vigilancia_host) {
            clearInterval(this.intervalo_vigilancia_host);
            this.intervalo_vigilancia_host = null;
        }
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
        if (this.cliente_mqtt) {
            try {
                if (!this.es_anfitrion && this.codigo_sala) {
                    this.publicarMensajeSala("host", {
                        tipo: "JUGADOR_DESCONECTADO",
                        id_peer: this.mi_id_peer
                    });
                }
                this.cliente_mqtt.end(true);
            } catch (e) {
            }
            this.cliente_mqtt = null;
        }
        if (this.peer_actual) {
            try {
                this.peer_actual.destroy();
            } catch (e) {
            }
            this.peer_actual = null;
        }
        this.en_partida_online = false;
        this.unido_confirmado = false;
        this.jugadores_sala = [];
        actualizarBotonesVozUI();
    }
}
