# Juego de Cacho

## Características incluidas
1. **Reglas completas del proyecto original (`MVC`):**
   - Modos `TIRO_VOLTEO` (1 tiro y 1 volteo), `ALALAY` (2 tiros y 2 volteos) y `TRIPLETE` (3 tiros y 3 volteos).
   - Jugadas **De Mano** (`+5 pts` en Escalera, Full y Poker), **Grande** doble (`(1/2)` y `(2/2)`) y **Dormida** (`100 pts` y victoria inmediata).
   - Vaso de cuero animado (`canvas_cubilete_animado`), dados 2D interactivos y melodía sintetizada.
   - Cuadrícula **Panza de Oro** (`3x4`), **Ranking** en tiempo real y **Tablero** de puntajes.
2. **Multijugador Online sin servidor de pago (`PeerJS / WebRTC`):**
   - Creación de sala con código corto y **Enlace de invitación directo** (`?sala=XXXX`) para enviar por WhatsApp.
3. **Chat de Voz tipo Meet integrado (`WebRTC Audio`):**
   - Botón `🎤 Micrófono: ON / OFF` y `🔊 Audio: ON / OFF` con indicador visual en vivo cuando un jugador habla.
4. **Modo Local y contra IA:**
   - Permite jugar en un mismo dispositivo (de 2 a 10 jugadores) o contra la computadora (`IA`), con guardado de partidas e historial de ganadores.
