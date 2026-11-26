// Clases del Modelo de Cacho Boliviano (Dado, Cubilete, CalculadorPuntaje, Libreta, Jugador, Partida, GestorArchivos)

class Dado {
    constructor() {
        this.valor_cara = 1;
        this.dado_bloqueado = false;
    }

    // Metodo para lanzar el dado entre 1 y 6
    lanzarDado() {
        if (!this.dado_bloqueado) {
            this.valor_cara = Math.floor(Math.random() * 6) + 1;
        }
        return this.valor_cara;
    }

    // Metodo para voltear el dado a su cara opuesta (7 - valor_cara)
    voltearDado() {
        this.valor_cara = 7 - this.valor_cara;
        return this.valor_cara;
    }

    reiniciarEstadoTurno() {
        this.valor_cara = 1;
        this.dado_bloqueado = false;
    }

    alternarBloqueoDado() {
        this.dado_bloqueado = !this.dado_bloqueado;
    }

    obtenerValorCara() {
        return this.valor_cara;
    }

    establecerValorCara(nuevo_valor) {
        if (nuevo_valor >= 1 && nuevo_valor <= 6) {
            this.valor_cara = nuevo_valor;
        }
    }

    estaDadoBloqueado() {
        return this.dado_bloqueado;
    }

    establecerDadoBloqueado(estado_bloqueo) {
        this.dado_bloqueado = Boolean(estado_bloqueo);
    }
}

class Cubilete {
    static CANTIDAD_DADOS = 5;
    static MODO_TIRO_VOLTEO = "TIRO_VOLTEO";
    static MODO_ALALAY = "ALALAY";
    static MODO_TRIPLETE = "TRIPLETE";

    constructor(modo_juego = Cubilete.MODO_ALALAY) {
        this.arreglo_dados = [];
        for (let indice_i = 0; indice_i < Cubilete.CANTIDAD_DADOS; indice_i++) {
            this.arreglo_dados.push(new Dado());
        }
        this.tiros_realizados = 0;
        this.volteos_realizados = 0;
        this.maximo_tiros_permitidos = 2;
        this.maximo_volteos_permitidos = 2;
        this.modo_juego_actual = Cubilete.MODO_ALALAY;
        this.configurarModoJuego(modo_juego);
        this.reiniciarParaNuevoTurno();
    }

    // Metodo para asignar limites de tiros y volteos
    configurarModoJuego(modo_juego) {
        const modo_limpio = String(modo_juego || "").toUpperCase();
        if (modo_limpio === Cubilete.MODO_TIRO_VOLTEO) {
            this.modo_juego_actual = Cubilete.MODO_TIRO_VOLTEO;
            this.maximo_tiros_permitidos = 1;
            this.maximo_volteos_permitidos = 1;
        } else if (modo_limpio === Cubilete.MODO_TRIPLETE) {
            this.modo_juego_actual = Cubilete.MODO_TRIPLETE;
            this.maximo_tiros_permitidos = 3;
            this.maximo_volteos_permitidos = 3;
        } else {
            this.modo_juego_actual = Cubilete.MODO_ALALAY;
            this.maximo_tiros_permitidos = 2;
            this.maximo_volteos_permitidos = 2;
        }
    }

    // Metodo para reiniciar contadores del turno
    reiniciarParaNuevoTurno() {
        this.tiros_realizados = 0;
        this.volteos_realizados = 0;
        for (let indice_i = 0; indice_i < Cubilete.CANTIDAD_DADOS; indice_i++) {
            this.arreglo_dados[indice_i].reiniciarEstadoTurno();
        }
    }

    // Metodo para lanzar los dados libres
    lanzarDadosDisponibles() {
        if (!this.puedeLanzarDados()) {
            return false;
        }
        if (this.tiros_realizados === 0) {
            for (let indice_i = 0; indice_i < Cubilete.CANTIDAD_DADOS; indice_i++) {
                this.arreglo_dados[indice_i].establecerDadoBloqueado(false);
            }
        }
        let se_lanzo_al_menos_uno = false;
        for (let indice_i = 0; indice_i < Cubilete.CANTIDAD_DADOS; indice_i++) {
            if (!this.arreglo_dados[indice_i].estaDadoBloqueado()) {
                this.arreglo_dados[indice_i].lanzarDado();
                se_lanzo_al_menos_uno = true;
            }
        }
        if (se_lanzo_al_menos_uno) {
            this.tiros_realizados++;
            return true;
        }
        return false;
    }

    // Metodo para voltear un dado segun su posicion
    voltearDadoEnPosicion(indice_dado) {
        if (indice_dado < 0 || indice_dado >= Cubilete.CANTIDAD_DADOS) {
            return false;
        }
        if (!this.puedeVoltearDados()) {
            return false;
        }
        this.arreglo_dados[indice_dado].voltearDado();
        this.volteos_realizados++;
        return true;
    }

    puedeLanzarDados() {
        return this.tiros_realizados < this.maximo_tiros_permitidos && this.volteos_realizados === 0;
    }

    puedeVoltearDados() {
        return this.tiros_realizados >= 1 && this.volteos_realizados < this.maximo_volteos_permitidos;
    }

    esJugadaDeMano() {
        return this.tiros_realizados === 1 && this.volteos_realizados === 0;
    }

    obtenerValoresDados() {
        return this.arreglo_dados.map(dado => dado.obtenerValorCara());
    }

    obtenerDado(indice_dado) {
        if (indice_dado >= 0 && indice_dado < Cubilete.CANTIDAD_DADOS) {
            return this.arreglo_dados[indice_dado];
        }
        return null;
    }

    obtenerTirosRealizados() {
        return this.tiros_realizados;
    }

    obtenerVolteosRealizados() {
        return this.volteos_realizados;
    }

    obtenerMaximoTirosPermitidos() {
        return this.maximo_tiros_permitidos;
    }

    obtenerMaximoVolteosPermitidos() {
        return this.maximo_volteos_permitidos;
    }
}

class CalculadorPuntaje {
    static CATEGORIA_BALAS = 0;
    static CATEGORIA_TONTOS = 1;
    static CATEGORIA_TRENES = 2;
    static CATEGORIA_CUADRAS = 3;
    static CATEGORIA_QUINAS = 4;
    static CATEGORIA_SENAS = 5;
    static CATEGORIA_ESCALERA = 6;
    static CATEGORIA_FULL = 7;
    static CATEGORIA_POKER = 8;
    static CATEGORIA_GRANDE = 9;

    static PUNTOS_ESCALERA_MANO = 25;
    static PUNTOS_ESCALERA_HUEVO = 20;
    static PUNTOS_FULL_MANO = 35;
    static PUNTOS_FULL_HUEVO = 30;
    static PUNTOS_POKER_MANO = 45;
    static PUNTOS_POKER_HUEVO = 40;
    static PUNTOS_GRANDE_HUEVO = 50;
    static PUNTOS_DORMIDA_MANO = 100;

    // Metodo para calcular el puntaje segun la categoria
    calcularPuntajeCategoria(valores_dados, indice_categoria, es_de_mano) {
        if (!this.sonDadosValidos(valores_dados)) {
            return 0;
        }
        if (indice_categoria >= CalculadorPuntaje.CATEGORIA_BALAS && indice_categoria <= CalculadorPuntaje.CATEGORIA_SENAS) {
            return this.sumarPorNumeroEspecifico(valores_dados, indice_categoria + 1);
        }
        switch (indice_categoria) {
            case CalculadorPuntaje.CATEGORIA_ESCALERA:
                return this.esEscalera(valores_dados)
                    ? (es_de_mano ? CalculadorPuntaje.PUNTOS_ESCALERA_MANO : CalculadorPuntaje.PUNTOS_ESCALERA_HUEVO)
                    : 0;
            case CalculadorPuntaje.CATEGORIA_FULL:
                return this.esFull(valores_dados)
                    ? (es_de_mano ? CalculadorPuntaje.PUNTOS_FULL_MANO : CalculadorPuntaje.PUNTOS_FULL_HUEVO)
                    : 0;
            case CalculadorPuntaje.CATEGORIA_POKER:
                return this.esPoker(valores_dados)
                    ? (es_de_mano ? CalculadorPuntaje.PUNTOS_POKER_MANO : CalculadorPuntaje.PUNTOS_POKER_HUEVO)
                    : 0;
            case CalculadorPuntaje.CATEGORIA_GRANDE:
                return this.esGrande(valores_dados)
                    ? (es_de_mano ? CalculadorPuntaje.PUNTOS_DORMIDA_MANO : CalculadorPuntaje.PUNTOS_GRANDE_HUEVO)
                    : 0;
            default:
                return 0;
        }
    }

    // Metodo para verificar escalera (1-2-3-4-5, 2-3-4-5-6 o 1-3-4-5-6)
    esEscalera(valores_dados) {
        if (!this.sonDadosValidos(valores_dados)) {
            return false;
        }
        const frecuencias = this.contarFrecuenciasCaras(valores_dados);
        for (let cara_i = 1; cara_i <= 6; cara_i++) {
            if (frecuencias[cara_i] > 1) {
                return false;
            }
        }
        return frecuencias[6] === 0 || frecuencias[1] === 0 || frecuencias[2] === 0;
    }

    // Metodo para verificar full
    esFull(valores_dados) {
        if (!this.sonDadosValidos(valores_dados)) {
            return false;
        }
        const frecuencias = this.contarFrecuenciasCaras(valores_dados);
        return this.tieneCaraConFrecuencia(frecuencias, 3, true) && this.tieneCaraConFrecuencia(frecuencias, 2, true);
    }

    // Metodo para verificar poker
    esPoker(valores_dados) {
        if (!this.sonDadosValidos(valores_dados)) {
            return false;
        }
        return this.tieneCaraConFrecuencia(this.contarFrecuenciasCaras(valores_dados), 4, false);
    }

    // Metodo para verificar grande
    esGrande(valores_dados) {
        if (!this.sonDadosValidos(valores_dados)) {
            return false;
        }
        return this.tieneCaraConFrecuencia(this.contarFrecuenciasCaras(valores_dados), 5, true);
    }

    esDormida(valores_dados, es_de_mano) {
        return Boolean(es_de_mano) && this.esGrande(valores_dados);
    }

    tieneCaraConFrecuencia(frecuencias, cantidad_buscada, exacta) {
        for (let cara_i = 1; cara_i <= 6; cara_i++) {
            if (exacta && frecuencias[cara_i] === cantidad_buscada) {
                return true;
            }
            if (!exacta && frecuencias[cara_i] >= cantidad_buscada) {
                return true;
            }
        }
        return false;
    }

    sumarPorNumeroEspecifico(valores_dados, numero_buscado) {
        let suma_puntos = 0;
        for (const valor of valores_dados) {
            if (valor === numero_buscado) {
                suma_puntos += numero_buscado;
            }
        }
        return suma_puntos;
    }

    contarFrecuenciasCaras(valores_dados) {
        const frecuencias_caras = [0, 0, 0, 0, 0, 0, 0];
        for (const valor_actual of valores_dados) {
            if (valor_actual >= 1 && valor_actual <= 6) {
                frecuencias_caras[valor_actual]++;
            }
        }
        return frecuencias_caras;
    }

    sonDadosValidos(valores_dados) {
        if (!Array.isArray(valores_dados) || valores_dados.length !== 5) {
            return false;
        }
        for (const valor of valores_dados) {
            if (valor < 1 || valor > 6) {
                return false;
            }
        }
        return true;
    }
}

class Libreta {
    static CATEGORIA_BALAS = 0;
    static CATEGORIA_TONTOS = 1;
    static CATEGORIA_TRENES = 2;
    static CATEGORIA_CUADRAS = 3;
    static CATEGORIA_QUINAS = 4;
    static CATEGORIA_SENAS = 5;
    static CATEGORIA_ESCALERA = 6;
    static CATEGORIA_FULL = 7;
    static CATEGORIA_POKER = 8;
    static CATEGORIA_GRANDE = 9;
    static TOTAL_CATEGORIAS = 10;
    static MAXIMO_USOS_GRANDE = 2;

    static NOMBRES_CATEGORIAS = [
        "Balas", "Tontos", "Trenes", "Cuadras", "Quinas",
        "Senas", "Escalera", "Full", "Poker", "Grande / Dormida"
    ];

    constructor() {
        this.puntajes_casillas = new Array(Libreta.TOTAL_CATEGORIAS).fill(0);
        this.casillas_usadas = new Array(Libreta.TOTAL_CATEGORIAS).fill(false);
        this.usos_casillas = new Array(Libreta.TOTAL_CATEGORIAS).fill(0);
    }

    // Metodo para anotar puntaje (la Grande permite anotarse hasta 2 veces)
    anotarPuntaje(indice_categoria, puntos_obtenidos) {
        if (indice_categoria < 0 || indice_categoria >= Libreta.TOTAL_CATEGORIAS || puntos_obtenidos < 0) {
            return false;
        }
        if (this.casillas_usadas[indice_categoria]) {
            return false;
        }

        if (indice_categoria === Libreta.CATEGORIA_GRANDE) {
            this.puntajes_casillas[indice_categoria] += puntos_obtenidos;
            this.usos_casillas[indice_categoria]++;
            if (this.usos_casillas[indice_categoria] >= Libreta.MAXIMO_USOS_GRANDE) {
                this.casillas_usadas[indice_categoria] = true;
            }
            return true;
        }

        this.puntajes_casillas[indice_categoria] = puntos_obtenidos;
        this.usos_casillas[indice_categoria] = 1;
        this.casillas_usadas[indice_categoria] = true;
        return true;
    }

    restaurarCasillaConUsos(indice_categoria, puntos_guardados, estado_usada, cantidad_usos) {
        if (indice_categoria >= 0 && indice_categoria < Libreta.TOTAL_CATEGORIAS) {
            this.puntajes_casillas[indice_categoria] = puntos_guardados;
            this.casillas_usadas[indice_categoria] = Boolean(estado_usada);
            this.usos_casillas[indice_categoria] = cantidad_usos;
        }
    }

    estaCasillaUsada(indice_categoria) {
        return Boolean(this.casillas_usadas[indice_categoria]);
    }

    tieneAnotacionEnCasilla(indice_categoria) {
        return this.usos_casillas[indice_categoria] > 0 || Boolean(this.casillas_usadas[indice_categoria]);
    }

    obtenerUsosCasilla(indice_categoria) {
        return this.usos_casillas[indice_categoria] || 0;
    }

    obtenerPuntajeCasilla(indice_categoria) {
        return this.puntajes_casillas[indice_categoria] || 0;
    }

    // Metodo para sumar todos los puntos de la libreta
    calcularPuntajeTotal() {
        let suma_total = 0;
        for (let indice_i = 0; indice_i < Libreta.TOTAL_CATEGORIAS; indice_i++) {
            if (this.tieneAnotacionEnCasilla(indice_i)) {
                suma_total += this.puntajes_casillas[indice_i];
            }
        }
        return suma_total;
    }

    contarCasillasUsadas() {
        let contador_usadas = 0;
        for (let indice_i = 0; indice_i < Libreta.TOTAL_CATEGORIAS; indice_i++) {
            if (this.casillas_usadas[indice_i]) {
                contador_usadas++;
            }
        }
        return contador_usadas;
    }

    estaLibretaLlena() {
        return this.contarCasillasUsadas() === Libreta.TOTAL_CATEGORIAS;
    }

    static obtenerNombreCategoria(indice_categoria) {
        return Libreta.NOMBRES_CATEGORIAS[indice_categoria] || "Categoria";
    }
}

class Jugador {
    constructor(nombre_jugador, es_computadora = false, id_peer = null) {
        const texto_limpio = String(nombre_jugador || "").trim();
        this.nombre_jugador = texto_limpio.length > 0 ? texto_limpio : "Jugador";
        this.libreta_jugador = new Libreta();
        this.es_computadora = Boolean(es_computadora);
        this.gano_por_dormida = false;
        this.id_peer = id_peer;
    }

    anotarEnLibreta(indice_categoria, puntos_obtenidos) {
        return this.libreta_jugador.anotarPuntaje(indice_categoria, puntos_obtenidos);
    }

    obtenerPuntajeTotal() {
        return this.libreta_jugador.calcularPuntajeTotal();
    }

    terminoSusTurnos() {
        return this.libreta_jugador.estaLibretaLlena();
    }

    obtenerNombreJugador() {
        return this.nombre_jugador;
    }

    obtenerLibretaJugador() {
        return this.libreta_jugador;
    }

    esComputadora() {
        return this.es_computadora;
    }

    obtenerGanoPorDormida() {
        return this.gano_por_dormida;
    }

    establecerGanoPorDormida(estado_dormida) {
        this.gano_por_dormida = Boolean(estado_dormida);
    }
}

class Partida {
    static MODO_TIRO_VOLTEO = "TIRO_VOLTEO";
    static MODO_ALALAY = "ALALAY";
    static MODO_TRIPLETE = "TRIPLETE";
    static MINIMO_JUGADORES = 2;
    static MAXIMO_JUGADORES = 10;

    constructor(jugadores_iniciales, modo_seleccionado, permitir_solitario = false) {
        this.lista_jugadores = [];
        if (Array.isArray(jugadores_iniciales)) {
            for (let indice_i = 0; indice_i < jugadores_iniciales.length && indice_i < Partida.MAXIMO_JUGADORES; indice_i++) {
                this.lista_jugadores.push(jugadores_iniciales[indice_i]);
            }
        }
        const minimo_requerido = permitir_solitario ? 1 : Partida.MINIMO_JUGADORES;
        while (this.lista_jugadores.length < minimo_requerido) {
            const numero_jugador = this.lista_jugadores.length + 1;
            this.lista_jugadores.push(new Jugador("Jugador " + numero_jugador));
        }
        this.indice_turno_actual = 0;
        this.modo_juego = Partida.MODO_ALALAY;
        this.establecerModoJuego(modo_seleccionado);
        this.partida_terminada = false;
    }

    establecerModoJuego(modo_seleccionado) {
        const modo_upper = String(modo_seleccionado || "").toUpperCase();
        if (modo_upper === Partida.MODO_TIRO_VOLTEO) {
            this.modo_juego = Partida.MODO_TIRO_VOLTEO;
        } else if (modo_upper === Partida.MODO_TRIPLETE) {
            this.modo_juego = Partida.MODO_TRIPLETE;
        } else {
            this.modo_juego = Partida.MODO_ALALAY;
        }
    }

    // Metodo para pasar al siguiente jugador con turnos pendientes
    pasarSiguienteJugador() {
        if (this.partida_terminada || this.lista_jugadores.length === 0) {
            return;
        }
        const total_jugadores = this.lista_jugadores.length;
        for (let intento_i = 0; intento_i < total_jugadores; intento_i++) {
            this.indice_turno_actual = (this.indice_turno_actual + 1) % total_jugadores;
            if (!this.lista_jugadores[this.indice_turno_actual].terminoSusTurnos()) {
                break;
            }
        }
    }

    verificarTodasLasLibretasLlenas() {
        for (const jugador of this.lista_jugadores) {
            if (!jugador.terminoSusTurnos()) {
                return false;
            }
        }
        return true;
    }

    // Metodo para obtener el jugador ganador o null en caso de empate
    obtenerJugadorGanador() {
        for (const jugador_revision of this.lista_jugadores) {
            if (jugador_revision.obtenerGanoPorDormida()) {
                return jugador_revision;
            }
        }

        let mejor_jugador = null;
        let puntaje_maximo = -1;
        let hay_empate = false;

        for (const jugador_revision of this.lista_jugadores) {
            const puntaje_jugador = jugador_revision.obtenerPuntajeTotal();
            if (puntaje_jugador > puntaje_maximo) {
                puntaje_maximo = puntaje_jugador;
                mejor_jugador = jugador_revision;
                hay_empate = false;
            } else if (puntaje_jugador === puntaje_maximo) {
                hay_empate = true;
            }
        }

        return hay_empate ? null : mejor_jugador;
    }

    obtenerPuntajeMaximoActual() {
        let maximo_actual = 0;
        for (const jugador of this.lista_jugadores) {
            const puntos_j = jugador.obtenerPuntajeTotal();
            if (puntos_j > maximo_actual) {
                maximo_actual = puntos_j;
            }
        }
        return maximo_actual;
    }

    obtenerResumenResultado() {
        const ganador_partida = this.obtenerJugadorGanador();
        if (ganador_partida !== null) {
            if (ganador_partida.obtenerGanoPorDormida()) {
                return "Ganador por DORMIDA: " + ganador_partida.obtenerNombreJugador()
                    + " (" + ganador_partida.obtenerPuntajeTotal() + " pts)";
            }
            return "Ganador: " + ganador_partida.obtenerNombreJugador()
                + " con " + ganador_partida.obtenerPuntajeTotal() + " puntos";
        }
        return "Empate con " + this.obtenerPuntajeMaximoActual() + " puntos";
    }

    obtenerJugadorActual() {
        return this.lista_jugadores[this.indice_turno_actual];
    }

    obtenerJugadorPorIndice(indice_jugador) {
        return this.lista_jugadores[indice_jugador] || null;
    }

    obtenerCantidadJugadores() {
        return this.lista_jugadores.length;
    }

    obtenerListaJugadores() {
        return this.lista_jugadores;
    }

    obtenerIndiceTurnoActual() {
        return this.indice_turno_actual;
    }

    establecerIndiceTurnoActual(nuevo_indice) {
        if (nuevo_indice >= 0 && nuevo_indice < this.lista_jugadores.length) {
            this.indice_turno_actual = nuevo_indice;
        }
    }

    obtenerModoJuego() {
        return this.modo_juego;
    }

    estaPartidaTerminada() {
        return this.partida_terminada;
    }

    establecerPartidaTerminada(estado_terminada) {
        this.partida_terminada = Boolean(estado_terminada);
    }
}

// Clase para guardar partidas y lista de ganadores en el navegador (equivalente a GestorArchivos.java)
class GestorArchivosWeb {
    static CLAVE_PARTIDAS = "cacho_lista_partidas_guardadas_v1";
    static CLAVE_GANADORES = "cacho_historial_ganadores_v1";

    obtenerFechaHoraActual() {
        const ahora = new Date();
        const yyyy = ahora.getFullYear();
        const mm = String(ahora.getMonth() + 1).padStart(2, "0");
        const dd = String(ahora.getDate()).padStart(2, "0");
        const hh = String(ahora.getHours()).padStart(2, "0");
        const min = String(ahora.getMinutes()).padStart(2, "0");
        return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
    }

    // Metodo para serializar partida + cubilete para red o almacenamiento
    serializarEstadoCompleto(partida_actual, cubilete_juego) {
        return {
            fecha: this.obtenerFechaHoraActual(),
            modo_juego: partida_actual.obtenerModoJuego(),
            indice_turno_actual: partida_actual.obtenerIndiceTurnoActual(),
            partida_terminada: partida_actual.estaPartidaTerminada(),
            cubilete: {
                tiros_realizados: cubilete_juego.obtenerTirosRealizados(),
                volteos_realizados: cubilete_juego.obtenerVolteosRealizados(),
                dados: cubilete_juego.arreglo_dados.map(d => ({
                    valor_cara: d.obtenerValorCara(),
                    dado_bloqueado: d.estaDadoBloqueado()
                }))
            },
            jugadores: partida_actual.obtenerListaJugadores().map(j => ({
                nombre_jugador: j.obtenerNombreJugador(),
                es_computadora: j.esComputadora(),
                gano_por_dormida: j.obtenerGanoPorDormida(),
                id_peer: j.id_peer,
                puntajes_casillas: [...j.obtenerLibretaJugador().puntajes_casillas],
                casillas_usadas: [...j.obtenerLibretaJugador().casillas_usadas],
                usos_casillas: [...j.obtenerLibretaJugador().usos_casillas]
            }))
        };
    }

    // Metodo para reconstruir objetos Partida y Cubilete desde un objeto serializado
    reconstruirDesdeEstado(datos_estado) {
        const lista_jugadores = datos_estado.jugadores.map(j_data => {
            const nuevo_j = new Jugador(j_data.nombre_jugador, j_data.es_computadora, j_data.id_peer);
            nuevo_j.establecerGanoPorDormida(j_data.gano_por_dormida);
            const lib = nuevo_j.obtenerLibretaJugador();
            for (let c = 0; c < Libreta.TOTAL_CATEGORIAS; c++) {
                lib.restaurarCasillaConUsos(
                    c,
                    j_data.puntajes_casillas[c] || 0,
                    j_data.casillas_usadas[c] || false,
                    j_data.usos_casillas[c] || 0
                );
            }
            return nuevo_j;
        });

        const partida_reconstruida = new Partida(lista_jugadores, datos_estado.modo_juego, true);
        partida_reconstruida.establecerIndiceTurnoActual(datos_estado.indice_turno_actual || 0);
        partida_reconstruida.establecerPartidaTerminada(Boolean(datos_estado.partida_terminada));

        const cubilete_reconstruido = new Cubilete(datos_estado.modo_juego);
        if (datos_estado.cubilete) {
            cubilete_reconstruido.tiros_realizados = datos_estado.cubilete.tiros_realizados || 0;
            cubilete_reconstruido.volteos_realizados = datos_estado.cubilete.volteos_realizados || 0;
            if (Array.isArray(datos_estado.cubilete.dados)) {
                for (let i = 0; i < Cubilete.CANTIDAD_DADOS; i++) {
                    if (datos_estado.cubilete.dados[i]) {
                        cubilete_reconstruido.obtenerDado(i).establecerValorCara(datos_estado.cubilete.dados[i].valor_cara);
                        cubilete_reconstruido.obtenerDado(i).establecerDadoBloqueado(datos_estado.cubilete.dados[i].dado_bloqueado);
                    }
                }
            }
        }
        return { partida: partida_reconstruida, cubilete: cubilete_reconstruido };
    }

    guardarPartida(partida_actual, cubilete_juego) {
        try {
            const lista = this.leerPartidasGuardadas();
            const estado = this.serializarEstadoCompleto(partida_actual, cubilete_juego);
            estado.resumen_jugadores = partida_actual.obtenerListaJugadores()
                .map(j => `${j.obtenerNombreJugador()} (${j.obtenerPuntajeTotal()} pts)`)
                .join(", ");
            lista.unshift(estado);
            localStorage.setItem(GestorArchivosWeb.CLAVE_PARTIDAS, JSON.stringify(lista));
            return true;
        } catch (error_guardar) {
            return false;
        }
    }

    leerPartidasGuardadas() {
        try {
            const texto = localStorage.getItem(GestorArchivosWeb.CLAVE_PARTIDAS);
            return texto ? JSON.parse(texto) : [];
        } catch (e) {
            return [];
        }
    }

    eliminarPartidaPorIndice(indice_borrar) {
        const lista = this.leerPartidasGuardadas();
        if (indice_borrar >= 0 && indice_borrar < lista.length) {
            lista.splice(indice_borrar, 1);
            localStorage.setItem(GestorArchivosWeb.CLAVE_PARTIDAS, JSON.stringify(lista));
        }
    }

    borrarTodasLasPartidas() {
        localStorage.removeItem(GestorArchivosWeb.CLAVE_PARTIDAS);
    }

    registrarGanador(nombre_ganador, puntaje_final, modo_jugado) {
        try {
            const lista = this.leerHistorialGanadores();
            lista.unshift({
                fecha: this.obtenerFechaHoraActual(),
                nombre: nombre_ganador,
                puntaje: puntaje_final,
                modo: modo_jugado
            });
            localStorage.setItem(GestorArchivosWeb.CLAVE_GANADORES, JSON.stringify(lista));
        } catch (e) {
        }
    }

    leerHistorialGanadores() {
        try {
            const texto = localStorage.getItem(GestorArchivosWeb.CLAVE_GANADORES);
            return texto ? JSON.parse(texto) : [];
        } catch (e) {
            return [];
        }
    }

    borrarHistorialGanadores() {
        localStorage.removeItem(GestorArchivosWeb.CLAVE_GANADORES);
    }

    // ==================== PERFIL DE USUARIO Y ESTADISTICAS ====================
    static CLAVE_PERFIL_USUARIO = "cacho_perfil_usuario_v1";

    obtenerPerfilUsuario() {
        try {
            const raw = localStorage.getItem(GestorArchivosWeb.CLAVE_PERFIL_USUARIO);
            if (raw) {
                const p = JSON.parse(raw);
                return {
                    nombre: p.nombre || "Jugador 1",
                    alias: p.alias || ("#" + Math.floor(1000 + Math.random() * 9000)),
                    ganadas: Number(p.ganadas) || 0,
                    perdidas: Number(p.perdidas) || 0,
                    dormidas: Number(p.dormidas) || 0,
                    jugadas: Number(p.jugadas) || 0
                };
            }
        } catch (e) {
        }
        const perfil_inicial = {
            nombre: "Jugador 1",
            alias: "#" + Math.floor(1000 + Math.random() * 9000),
            ganadas: 0,
            perdidas: 0,
            dormidas: 0,
            jugadas: 0
        };
        this.guardarPerfilUsuario(perfil_inicial);
        return perfil_inicial;
    }

    guardarPerfilUsuario(datos_perfil) {
        try {
            const actual = this.obtenerPerfilUsuarioInterno();
            const nuevo = {
                nombre: String(datos_perfil.nombre ?? actual.nombre ?? "Jugador 1").trim() || "Jugador 1",
                alias: String(datos_perfil.alias ?? actual.alias ?? "#1000").trim() || "#1000",
                ganadas: Number(datos_perfil.ganadas ?? actual.ganadas ?? 0),
                perdidas: Number(datos_perfil.perdidas ?? actual.perdidas ?? 0),
                dormidas: Number(datos_perfil.dormidas ?? actual.dormidas ?? 0),
                jugadas: Number(datos_perfil.jugadas ?? actual.jugadas ?? 0)
            };
            localStorage.setItem(GestorArchivosWeb.CLAVE_PERFIL_USUARIO, JSON.stringify(nuevo));
            return nuevo;
        } catch (e) {
            return datos_perfil;
        }
    }

    obtenerPerfilUsuarioInterno() {
        try {
            const raw = localStorage.getItem(GestorArchivosWeb.CLAVE_PERFIL_USUARIO);
            return raw ? JSON.parse(raw) : {};
        } catch (e) {
            return {};
        }
    }

    registrarResultadoEnPerfil(gano_partida, fue_dormida) {
        const p = this.obtenerPerfilUsuario();
        p.jugadas = (p.jugadas || 0) + 1;
        if (gano_partida) {
            p.ganadas = (p.ganadas || 0) + 1;
            if (fue_dormida) {
                p.dormidas = (p.dormidas || 0) + 1;
            }
        } else {
            p.perdidas = (p.perdidas || 0) + 1;
        }
        return this.guardarPerfilUsuario(p);
    }
}
