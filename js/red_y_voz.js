// Gestor de Red Online via WebSockets (MQTT over WSS) + Migracion de Master estilo WolfTeam + Voz WebRTC
// Incluye Worker anti-suspension (evita desconexion a los 3 min), Estado Retenido y Autoridad Instantanea (0-lag)

class GestorRedYVoz {
    static PREFIJO_TOPIC_SALA = "cacho_bolivia_v4/sala/";

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
        this.mi_alias = "#BO1";
        this.mis_stats = { ganadas: 0, perdidas: 0, dormidas: 0, jugadas: 0 };

        this.es_anfitrion = false;
        this.mi_listo = true;
        this.mi_espectador = false;
        this.codigo_sala = "";
        this.modo_sala = "ALALAY";
        this.en_partida_online = false;
        this.unido_confirmado = false;

        // Lista de usuarios en la sala:
        // [{ id_peer, nombre, alias, stats, es_host, listo, espectador, micro_activo, hablando, conectado, orden_ingreso, ultimo_latido }]
        this.jugadores_sala = [];

        // Worker en segundo plano que los navegadores NO congelan tras 3 minutos de inactividad
        this.worker_latido = null;
        this.intervalo_reintento_unirse = null;

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

    obtenerOCrearMiIdUnico() {
        const aleatorio = Math.random().toString(36).substring(2, 8);
        const tiempo = Date.now().toString(36).slice(-4);
        return `jug_${aleatorio}_${tiempo}`;
    }

    sincronizarMiPerfilLocal() {
        if (typeof gestor_archivos_web !== "undefined") {
            const p = gestor_archivos_web.obtenerPerfilUsuario();
            this.mi_nombre = p.nombre || "Jugador 1";
            this.mi_alias = p.alias || "#BO1";
            this.mis_stats = {
                ganadas: p.ganadas || 0,
                perdidas: p.perdidas || 0,
                dormidas: p.dormidas || 0,
                jugadas: p.jugadas || 0
            };
        }
    }

    // Worker anti-throttling: mantiene el WebSocket activo aunque la laptop lleve 10+ minutos sin tocarse
    iniciarWorkerAntisuspension() {
        this.detenerWorkerAntisuspension();
        try {
            const codigo_worker = `
                setInterval(() => {
                    postMessage("LATIDO_WORKER");
                }, 3000);
            `;
            const blob = new Blob([codigo_worker], { type: "application/javascript" });
            this.worker_latido = new Worker(URL.createObjectURL(blob));
            this.worker_latido.onmessage = () => {
                this.ejecutarCicloMantenimientoSala();
            };
        } catch (e) {
            this.worker_latido = setInterval(() => {
                this.ejecutarCicloMantenimientoSala();
            }, 3000);
        }
    }

    detenerWorkerAntisuspension() {
        if (this.worker_latido) {
            if (typeof this.worker_latido.terminate === "function") {
                this.worker_latido.terminate();
            } else {
                clearInterval(this.worker_latido);
            }
            this.worker_latido = null;
        }
    }

    // Ciclo que se ejecuta cada 3 segundos sin importar si la pestana esta en segundo plano
    ejecutarCicloMantenimientoSala() {
        if (!this.cliente_mqtt || !this.codigo_sala) return;

        if (!this.cliente_mqtt.connected) {
            try {
                this.cliente_mqtt.reconnect();
            } catch (e) {
            }
            return;
        }

        // 1. Enviar mi latido de presencia a toda la sala
        this.publicarMensajeSala("eventos", {
            tipo: "LATIDO_PRESENCIA",
            id_peer: this.mi_id_peer,
            nombre: this.mi_nombre,
            alias: this.mi_alias,
            stats: this.mis_stats,
            es_host: this.es_anfitrion,
            listo: this.mi_listo,
            espectador: this.mi_espectador,
            micro_activo: this.microfono_activo
        });

        // 2. Verificar tiempos de inactividad y migracion de Master estilo WolfTeam
        this.verificarPresenciaYMigracionMaster();
    }

    configurarEventosCierreYVisibilidad() {
        const notificarSalida = () => {
            if (this.cliente_mqtt && this.cliente_mqtt.connected && this.codigo_sala) {
                try {
                    // Avisa que este usuario salio; si era el Master, el siguiente hereda la sala automaticamente
                    this.publicarMensajeSala("eventos", {
                        tipo: "USUARIO_SALIO_O_DESCONECTO",
                        id_peer: this.mi_id_peer,
                        era_master: this.es_anfitrion,
                        en_partida: this.en_partida_online
                    });
                } catch (e) {
                }
            }
        };

        window.addEventListener("beforeunload", notificarSalida);
        window.addEventListener("pagehide", notificarSalida);

        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "visible" && this.codigo_sala) {
                if (this.cliente_mqtt && !this.cliente_mqtt.connected) {
                    try {
                        this.cliente_mqtt.reconnect();
                    } catch (e) {
                    }
                }
                this.ejecutarCicloMantenimientoSala();
            }
        });
    }

    generarCodigoSalaAleatorio() {
        const caracteres = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        let codigo = "";
        for (let i = 0; i < 5; i++) {
            codigo += caracteres.charAt(Math.floor(Math.random() * caracteres.length));
        }
        return codigo;
    }

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
        }
    }

    // Guarda el estado completo de la sala con retain:true en el broker para que cualquiera que entre 5 o 10 min despues conecte al instante
    guardarEstadoRetenidoEnBroker() {
        if (!this.es_anfitrion || !this.codigo_sala) return;
        const estado_juego = (this.en_partida_online && partida_actual && cubilete_juego)
            ? gestor_archivos_web.serializarEstadoCompleto(partida_actual, cubilete_juego)
            : null;

        this.publicarMensajeSala("estado_retenido", {
            tipo: "SNAPSHOT_SALA",
            codigo_sala: this.codigo_sala,
            modo_sala: this.modo_sala,
            en_partida_online: this.en_partida_online,
            jugadores_sala: this.jugadores_sala,
            estado_juego: estado_juego,
            timestamp: Date.now()
        }, { retain: true });
    }

    // ==================== CREAR SALA COMO MASTER ====================

    crearSalaComoAnfitrion(nombre_jugador, modo_seleccionado, callback_exito, callback_error) {
        this.cerrarConexionesActuales();
        this.sincronizarMiPerfilLocal();
        this.mi_id_peer = this.obtenerOCrearMiIdUnico();
        if (nombre_jugador) this.mi_nombre = String(nombre_jugador).trim() || this.mi_nombre;
        this.modo_sala = modo_seleccionado;
        this.es_anfitrion = true;
        this.mi_listo = true;
        this.mi_espectador = false;
        this.codigo_sala = this.generarCodigoSalaAleatorio();
        this.unido_confirmado = true;

        this.jugadores_sala = [{
            id_peer: this.mi_id_peer,
            nombre: this.mi_nombre,
            alias: this.mi_alias,
            stats: this.mis_stats,
            es_host: true,
            listo: true,
            espectador: false,
            micro_activo: this.microfono_activo,
            hablando: false,
            conectado: true,
            orden_ingreso: Date.now(),
            ultimo_latido: Date.now()
        }];

        this.conectarBrokerMQTT(
            () => {
                this.suscribirCanalesDeSala();
                this.iniciarPeerVozEnSegundoPlano();
                this.iniciarWorkerAntisuspension();
                this.difundirListaJugadoresSala();
                this.guardarEstadoRetenidoEnBroker();

                if (callback_exito) callback_exito(this.codigo_sala, this.obtenerEnlaceInvitacion());
                actualizarVistaLobbyOnline();
            },
            (err_msg) => {
                if (callback_error) callback_error(err_msg);
            }
        );
    }

    // ==================== UNIRSE A SALA CON CODIGO ====================

    unirseASalaConCodigo(nombre_jugador, codigo_ingresado, callback_exito, callback_error) {
        this.cerrarConexionesActuales();
        const codigo_limpio = String(codigo_ingresado || "").trim().toUpperCase();
        if (!codigo_limpio) {
            if (callback_error) callback_error("Ingresa un código de sala válido.");
            return;
        }

        this.sincronizarMiPerfilLocal();
        this.mi_id_peer = this.obtenerOCrearMiIdUnico();
        if (nombre_jugador) this.mi_nombre = String(nombre_jugador).trim() || this.mi_nombre;
        this.es_anfitrion = false;
        this.mi_listo = true;
        this.mi_espectador = false;
        this.codigo_sala = codigo_limpio;
        this.unido_confirmado = false;

        this.conectarBrokerMQTT(
            () => {
                this.suscribirCanalesDeSala();
                this.iniciarPeerVozEnSegundoPlano();
                this.iniciarWorkerAntisuspension();

                if (callback_exito) callback_exito(this.codigo_sala, this.obtenerEnlaceInvitacion());

                const enviarPeticion = () => {
                    this.publicarMensajeSala("eventos", {
                        tipo: "SOLICITUD_UNIRSE",
                        id_peer: this.mi_id_peer,
                        nombre: this.mi_nombre,
                        alias: this.mi_alias,
                        stats: this.mis_stats,
                        listo: this.mi_listo,
                        espectador: this.mi_espectador,
                        micro_activo: this.microfono_activo,
                        orden_ingreso: Date.now()
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
                    if (intentos > 35) {
                        clearInterval(this.intervalo_reintento_unirse);
                        this.intervalo_reintento_unirse = null;
                        if (callback_error) {
                            callback_error("No se encontró respuesta en la sala '" + this.codigo_sala + "'. Verifica el código.");
                        }
                        return;
                    }
                    enviarPeticion();
                }, 1000);
            },
            (err_msg) => {
                if (callback_error) callback_error(err_msg);
            }
        );
    }

    suscribirCanalesDeSala() {
        if (!this.cliente_mqtt || !this.codigo_sala) return;
        this.cliente_mqtt.subscribe(this.obtenerTopicCanal("eventos"), { qos: 0 });
        this.cliente_mqtt.subscribe(this.obtenerTopicCanal("estado_retenido"), { qos: 0 });
        this.cliente_mqtt.subscribe(this.obtenerTopicCanal("privado/" + this.mi_id_peer), { qos: 0 });
    }

    // ==================== CONEXION WEBSOCKET MQTT ====================

    conectarBrokerMQTT(on_conectado, on_error) {
        if (typeof mqtt === "undefined") {
            if (on_error) on_error("No se pudo cargar la librería WebSocket. Revisa tu conexión a internet.");
            return;
        }

        const url_broker = GestorRedYVoz.LISTA_BROKERS_WSS[this.indice_broker_actual];
        let conectado_una_vez = false;

        const opciones_mqtt = {
            clientId: "cacho_" + this.mi_id_peer + "_" + Math.random().toString(16).substring(2, 6),
            clean: true,
            connectTimeout: 6000,
            reconnectPeriod: 1200,
            keepalive: 45,
            will: {
                topic: this.obtenerTopicCanal("eventos"),
                payload: JSON.stringify({
                    tipo: "USUARIO_SALIO_O_DESCONECTO",
                    id_peer: this.mi_id_peer,
                    era_master: this.es_anfitrion
                }),
                qos: 0,
                retain: false
            }
        };

        try {
            this.cliente_mqtt = mqtt.connect(url_broker, opciones_mqtt);
        } catch (err) {
            if (on_error) on_error("Error WebSocket: " + err.message);
            return;
        }

        const timeout_fallback = setTimeout(() => {
            if (!conectado_una_vez) {
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
                // Al reconectar siempre restauramos las suscripciones de la sala
                this.suscribirCanalesDeSala();
                if (this.es_anfitrion) {
                    this.difundirListaJugadoresSala();
                    this.guardarEstadoRetenidoEnBroker();
                }
            }
        });

        this.cliente_mqtt.on("message", (topic, payload_buffer) => {
            try {
                const mensaje = JSON.parse(payload_buffer.toString());
                this.procesarMensajeSalaUnificado(mensaje);
            } catch (e) {
            }
        });
    }

    // ==================== MIGRACION DE MASTER ESTILO WOLFTEAM Y PRESENCIA ====================

    verificarPresenciaYMigracionMaster() {
        const ahora = Date.now();
        let hubo_cambio = false;

        // Actualizar mi propio latido en la lista
        for (const j of this.jugadores_sala) {
            if (j.id_peer === this.mi_id_peer) {
                j.conectado = true;
                j.ultimo_latido = ahora;
            } else if (j.conectado !== false && (ahora - (j.ultimo_latido || ahora)) > 11000) {
                j.conectado = false;
                hubo_cambio = true;
            }
        }

        // Verificar si el Master actual sigue conectado; si se desconecto, migrar el Master al siguiente jugador conectado mas antiguo (estilo WolfTeam)
        const master_actual = this.jugadores_sala.find(j => j.es_host && j.conectado !== false);
        if (!master_actual && this.jugadores_sala.length > 0) {
            const conectados = this.jugadores_sala
                .filter(j => j.conectado !== false)
                .sort((a, b) => (a.orden_ingreso || 0) - (b.orden_ingreso || 0));

            if (conectados.length > 0) {
                const nuevo_master = conectados[0];
                for (const j of this.jugadores_sala) {
                    j.es_host = (j.id_peer === nuevo_master.id_peer);
                }
                const era_host_antes = this.es_anfitrion;
                this.es_anfitrion = (nuevo_master.id_peer === this.mi_id_peer);
                hubo_cambio = true;

                if (!era_host_antes && this.es_anfitrion) {
                    // Heredamos el Master de la sala
                    if (!this.en_partida_online) {
                        this.jugadores_sala = this.jugadores_sala.filter(j => j.conectado !== false);
                    }
                    this.difundirListaJugadoresSala();
                    this.guardarEstadoRetenidoEnBroker();
                    actualizarVistaLobbyOnline();
                    actualizarChipsVozEnJuego();
                    actualizarInterfazCompleta();
                }
            }
        }

        if (hubo_cambio && this.es_anfitrion) {
            if (!this.en_partida_online) {
                this.jugadores_sala = this.jugadores_sala.filter(j => j.conectado !== false);
            }
            this.difundirListaJugadoresSala();
            this.guardarEstadoRetenidoEnBroker();
            actualizarVistaLobbyOnline();
            actualizarChipsVozEnJuego();
            if (this.en_partida_online) {
                actualizarInterfazCompleta();
            }
        }
    }

    // ==================== PROCESADOR UNIFICADO DE MENSAJES ====================

    procesarMensajeSalaUnificado(mensaje) {
        if (!mensaje || !mensaje.tipo) return;

        switch (mensaje.tipo) {
            case "SNAPSHOT_SALA": {
                // Si soy invitado y aun no estaba confirmado, el snapshot retenido del broker me conecta al instante
                if (!this.es_anfitrion && !this.unido_confirmado && Array.isArray(mensaje.jugadores_sala)) {
                    const hay_host_vivo = mensaje.jugadores_sala.some(j => j.es_host);
                    if (hay_host_vivo) {
                        this.modo_sala = mensaje.modo_sala || this.modo_sala;
                        // Re-enviar solicitud inmediata al detectar snapshot
                        this.publicarMensajeSala("eventos", {
                            tipo: "SOLICITUD_UNIRSE",
                            id_peer: this.mi_id_peer,
                            nombre: this.mi_nombre,
                            alias: this.mi_alias,
                            stats: this.mis_stats,
                            listo: this.mi_listo,
                            espectador: this.mi_espectador,
                            micro_activo: this.microfono_activo,
                            orden_ingreso: Date.now()
                        });
                    }
                }
                break;
            }

            case "LATIDO_PRESENCIA": {
                const jug = this.jugadores_sala.find(j => j.id_peer === mensaje.id_peer);
                if (jug) {
                    const estaba_desc = (jug.conectado === false);
                    jug.conectado = true;
                    jug.ultimo_latido = Date.now();
                    if (mensaje.stats) jug.stats = mensaje.stats;
                    if (mensaje.alias) jug.alias = mensaje.alias;
                    if (estaba_desc) {
                        actualizarVistaLobbyOnline();
                        actualizarChipsVozEnJuego();
                        if (this.en_partida_online) actualizarInterfazCompleta();
                    }
                } else if (this.es_anfitrion && mensaje.id_peer !== this.mi_id_peer) {
                    // Si el Master recibe el latido de alguien que entro mientras la laptop estaba inactiva, lo incorpora automaticamente
                    this.incorporarJugadorEnMaster(mensaje);
                }
                break;
            }

            case "SOLICITUD_UNIRSE": {
                if (this.es_anfitrion && mensaje.id_peer !== this.mi_id_peer) {
                    this.incorporarJugadorEnMaster(mensaje);
                }
                break;
            }

            case "USUARIO_SALIO_O_DESCONECTO": {
                const saliente = this.jugadores_sala.find(j => j.id_peer === mensaje.id_peer);
                if (saliente) {
                    saliente.conectado = false;
                    saliente.es_host = false;
                }
                this.eliminarAudioRemoto(mensaje.id_peer);

                // Si aun estamos en la sala de espera (lobby), quitarlo de la lista
                if (!this.en_partida_online) {
                    this.jugadores_sala = this.jugadores_sala.filter(j => j.id_peer !== mensaje.id_peer);
                }

                // Ejecutar migracion inmediata de Master si el que se salio era el Master
                this.verificarPresenciaYMigracionMaster();
                actualizarVistaLobbyOnline();
                actualizarChipsVozEnJuego();
                if (this.en_partida_online) actualizarInterfazCompleta();
                break;
            }

            case "CAMBIO_ESTADO_LOBBY_JUGADOR": {
                const j_mod = this.jugadores_sala.find(j => j.id_peer === mensaje.id_peer);
                if (j_mod) {
                    if (typeof mensaje.listo === "boolean") j_mod.listo = mensaje.listo;
                    if (typeof mensaje.espectador === "boolean") j_mod.espectador = mensaje.espectador;
                    j_mod.ultimo_latido = Date.now();
                    actualizarVistaLobbyOnline();
                    if (this.es_anfitrion) {
                        this.difundirListaJugadoresSala();
                        this.guardarEstadoRetenidoEnBroker();
                    }
                }
                break;
            }

            case "ACTUALIZAR_LOBBY": {
                if (Array.isArray(mensaje.jugadores_sala)) {
                    // Preservar timestamps de latido locales
                    const mapa_previo = new Map(this.jugadores_sala.map(j => [j.id_peer, j.ultimo_latido]));
                    this.jugadores_sala = mensaje.jugadores_sala.map(j => ({
                        ...j,
                        ultimo_latido: mapa_previo.get(j.id_peer) || Date.now()
                    }));
                }
                if (mensaje.modo_sala) {
                    this.modo_sala = mensaje.modo_sala;
                }

                // Sincronizar si yo soy el Master actual segun la lista
                const mi_registro = this.jugadores_sala.find(j => j.id_peer === this.mi_id_peer);
                if (mi_registro) {
                    this.unido_confirmado = true;
                    this.es_anfitrion = Boolean(mi_registro.es_host);
                    this.mi_listo = Boolean(mi_registro.listo);
                    this.mi_espectador = Boolean(mi_registro.espectador);
                    if (this.intervalo_reintento_unirse) {
                        clearInterval(this.intervalo_reintento_unirse);
                        this.intervalo_reintento_unirse = null;
                    }
                } else if (this.unido_confirmado && this.en_partida_online) {
                    mostrarAvisoModal("Expulsado de la sala", "Fuiste retirado de la sala.");
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
                    const mi_reg = this.jugadores_sala.find(j => j.id_peer === this.mi_id_peer);
                    if (mi_reg) {
                        this.es_anfitrion = Boolean(mi_reg.es_host);
                        this.mi_espectador = Boolean(mi_reg.espectador);
                    }
                }
                recibirInicioOSincronizacionOnline(mensaje.estado, true);
                break;
            }

            case "REGRESAR_TODOS_A_SALA_ESPERA": {
                this.en_partida_online = false;
                if (mensaje.jugadores_sala) {
                    this.jugadores_sala = mensaje.jugadores_sala;
                }
                recibirRegresoASalaDeEspera();
                break;
            }

            case "ANIMAR_LANZAMIENTO": {
                // Si yo mismo fui quien lanzo los dados, ya inicie la animacion en 0ms sin lag
                if (mensaje.id_autor === this.mi_id_peer) return;
                recibirAnimacionLanzamientoOnline(mensaje.estado_final, mensaje.primer_tiro, mensaje.es_mano_especial);
                if (this.es_anfitrion) {
                    this.guardarEstadoRetenidoEnBroker();
                }
                break;
            }

            case "SINCRONIZAR_ESTADO": {
                if (mensaje.jugadores_sala) {
                    this.jugadores_sala = mensaje.jugadores_sala;
                }
                // Si yo mismo envie el cambio, solo guardamos en broker si soy host
                if (mensaje.id_autor === this.mi_id_peer) {
                    if (this.es_anfitrion) this.guardarEstadoRetenidoEnBroker();
                    return;
                }

                const estoy_en_sala = this.jugadores_sala.some(j => j.id_peer === this.mi_id_peer);
                if (!estoy_en_sala && this.en_partida_online) {
                    mostrarAvisoModal("Expulsado de la partida", "El Master continuó la partida sin ti.");
                    accionVolverAlMenu();
                    return;
                }

                recibirInicioOSincronizacionOnline(mensaje.estado, false);
                if (mensaje.pausa_cambio_turno) {
                    mostrarPausaVisualRemota();
                }
                if (this.es_anfitrion) {
                    this.guardarEstadoRetenidoEnBroker();
                }
                break;
            }

            case "ESTADO_MICROFONO": {
                this.actualizarEstadoMicrofonoJugador(mensaje.id_peer, mensaje.micro_activo, mensaje.hablando);
                break;
            }
        }
    }

    // Incorpora un jugador nuevo o reconectado en la lista administrada por el Master actual
    incorporarJugadorEnMaster(mensaje) {
        if (!this.es_anfitrion) return;

        // 1. Verificar si ya existe por id_peer o si es un jugador desconectado que regresa con su mismo nombre
        const jugador_existente = this.jugadores_sala.find(
            j => j.id_peer === mensaje.id_peer || (!j.es_host && !j.conectado && j.nombre.toLowerCase() === String(mensaje.nombre || "").toLowerCase())
        );

        if (jugador_existente) {
            const id_anterior = jugador_existente.id_peer;
            jugador_existente.id_peer = mensaje.id_peer;
            jugador_existente.conectado = true;
            jugador_existente.ultimo_latido = Date.now();
            jugador_existente.micro_activo = Boolean(mensaje.micro_activo);
            if (mensaje.alias) jugador_existente.alias = mensaje.alias;
            if (mensaje.stats) jugador_existente.stats = mensaje.stats;

            let estaba_en_partida_activa = false;
            if (this.en_partida_online && partida_actual) {
                for (const jug_modelo of partida_actual.obtenerListaJugadores()) {
                    if (jug_modelo.id_peer === id_anterior || jug_modelo.obtenerNombreJugador().toLowerCase() === jugador_existente.nombre.toLowerCase()) {
                        jug_modelo.id_peer = mensaje.id_peer;
                        estaba_en_partida_activa = true;
                    }
                }
            }

            if (this.en_partida_online && !estaba_en_partida_activa) {
                jugador_existente.espectador = true;
            }

            this.difundirListaJugadoresSala();
            this.guardarEstadoRetenidoEnBroker();
            actualizarVistaLobbyOnline();
            actualizarChipsVozEnJuego();
            if (this.en_partida_online) actualizarInterfazCompleta();

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

        // Si la partida ya esta en curso (y hay mas de 1 jugador jugando), entra automaticamente como Espectador
        const entra_como_espectador = this.en_partida_online
            ? true
            : Boolean(mensaje.espectador);

        this.jugadores_sala.push({
            id_peer: mensaje.id_peer,
            nombre: nombre_final,
            alias: mensaje.alias || "#BO",
            stats: mensaje.stats || { ganadas: 0, perdidas: 0, dormidas: 0, jugadas: 0 },
            es_host: false,
            listo: true,
            espectador: entra_como_espectador,
            micro_activo: Boolean(mensaje.micro_activo),
            hablando: false,
            conectado: true,
            orden_ingreso: mensaje.orden_ingreso || Date.now(),
            ultimo_latido: Date.now()
        });

        this.difundirListaJugadoresSala();
        this.guardarEstadoRetenidoEnBroker();
        actualizarVistaLobbyOnline();
        actualizarChipsVozEnJuego();
        if (this.en_partida_online) {
            actualizarInterfazCompleta();
        }

        // Si el Master ya tiene la mesa abierta, le sincronizamos la mesa al nuevo integrante (para que vea en Modo Espectador)
        if (this.en_partida_online && partida_actual && cubilete_juego) {
            this.publicarMensajeSala("privado/" + mensaje.id_peer, {
                tipo: "INICIAR_PARTIDA_ONLINE",
                estado: gestor_archivos_web.serializarEstadoCompleto(partida_actual, cubilete_juego),
                jugadores_sala: this.jugadores_sala
            });
        }
    }

    // Cambia mi estado de Listo / No Listo en el Lobby
    alternarMiEstadoListo() {
        this.mi_listo = !this.mi_listo;
        const mi_reg = this.jugadores_sala.find(j => j.id_peer === this.mi_id_peer);
        if (mi_reg) mi_reg.listo = this.mi_listo;

        this.publicarMensajeSala("eventos", {
            tipo: "CAMBIO_ESTADO_LOBBY_JUGADOR",
            id_peer: this.mi_id_peer,
            listo: this.mi_listo,
            espectador: this.mi_espectador
        });
        actualizarVistaLobbyOnline();
    }

    // Cambia mi rol entre Jugador de Mesa y Espectador
    alternarMiRolEspectador(forzar_valor = null) {
        this.mi_espectador = (typeof forzar_valor === "boolean") ? forzar_valor : !this.mi_espectador;
        const mi_reg = this.jugadores_sala.find(j => j.id_peer === this.mi_id_peer);
        if (mi_reg) mi_reg.espectador = this.mi_espectador;

        this.publicarMensajeSala("eventos", {
            tipo: "CAMBIO_ESTADO_LOBBY_JUGADOR",
            id_peer: this.mi_id_peer,
            listo: this.mi_listo,
            espectador: this.mi_espectador
        });
        actualizarVistaLobbyOnline();
    }

    cambiarModoDeSalaComoMaster(nuevo_modo) {
        if (!this.es_anfitrion) return;
        this.modo_sala = nuevo_modo;
        this.difundirListaJugadoresSala();
        this.guardarEstadoRetenidoEnBroker();
        actualizarVistaLobbyOnline();
    }

    difundirListaJugadoresSala() {
        this.publicarMensajeSala("eventos", {
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
        this.publicarMensajeSala("eventos", objeto_mensaje);
        if (this.es_anfitrion) {
            this.guardarEstadoRetenidoEnBroker();
        }
    }

    expulsarJugadorDePartida(id_peer_a_expulsar) {
        if (!this.es_anfitrion) return;

        const idx_sala = this.jugadores_sala.findIndex(j => j.id_peer === id_peer_a_expulsar);
        if (idx_sala === -1) return;

        this.jugadores_sala.splice(idx_sala, 1);

        if (partida_actual) {
            const lista_partida = partida_actual.obtenerListaJugadores();
            const idx_modelo = lista_partida.findIndex(j => j.id_peer === id_peer_a_expulsar);

            if (idx_modelo !== -1) {
                const era_su_turno = (partida_actual.obtenerIndiceTurnoActual() === idx_modelo);
                lista_partida.splice(idx_modelo, 1);

                if (lista_partida.length === 0) {
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
        }

        this.eliminarAudioRemoto(id_peer_a_expulsar);
        this.difundirListaJugadoresSala();
        if (this.en_partida_online && partida_actual) {
            sincronizarYActualizarJugadaDirecta(false);
        } else {
            actualizarVistaLobbyOnline();
        }
    }

    // ==================== SISTEMA DE AUDIO WEBRTC (TIPO MEET) ====================

    obtenerIdPeerVoz(id_jugador) {
        return `cacho-voz-v4-${this.codigo_sala}-${id_jugador}`;
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
        this.publicarMensajeSala("eventos", {
            tipo: "ESTADO_MICROFONO",
            id_peer: this.mi_id_peer,
            micro_activo: this.microfono_activo,
            hablando: Boolean(esta_hablando)
        });
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
        this.detenerWorkerAntisuspension();
        if (this.intervalo_reintento_unirse) {
            clearInterval(this.intervalo_reintento_unirse);
            this.intervalo_reintento_unirse = null;
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
                if (this.codigo_sala) {
                    this.publicarMensajeSala("eventos", {
                        tipo: "USUARIO_SALIO_O_DESCONECTO",
                        id_peer: this.mi_id_peer,
                        era_master: this.es_anfitrion
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
