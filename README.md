# Gordo Royale: Bajada del Kebab

Battle royale 3D de humor absurdo para Windows, creado en Godot 4.7.2 y GDScript.

## Probarlo

1. Extrae `Gordo-Royale-Prueba-Windows.zip` completo.
2. Abre `iniciar-editor.bat`.
3. Cuando Godot termine de abrir el proyecto, pulsa **F5**.

El editor portátil de Godot va incluido. La exportación independiente `.exe` no está firmada y Windows App Control la bloqueó en este equipo; este paquete abre el proyecto con el editor oficial firmado.

## Jugar solo contra bots

En la pantalla inicial, pulsa **JUGAR EN SOLITARIO · 19 BOTS**. Se inicia una partida offline con 20 participantes en total: tú y 19 bots. En un lobby normal, el anfitrión puede pulsar **LLENAR SALA HASTA 20 CON BOTS** para añadir bots a la partida online.

Los bots saltan del autobús, buscan botín, persiguen rivales y atacan con espada o granadas.

## Controles

- **WASD / flechas**: moverse.
- **Shift**: correr; consume resistencia.
- **Espacio**: saltar, escalar o saltar del autobús.
- **Ratón**: mirar; **Escape** libera el cursor.
- **Clic izquierdo**: espada.
- **Q**: granada de caca.
- **E**: recoger botín o montar/salir del vehículo.
- **Tab**: inventario.
- **G**: baile.

## Jugar en red

El anfitrión pulsa **Crear partida** y comparte la IP que muestra la sala. El otro jugador la escribe y pulsa **Unirse**. Ambos marcan **Listo** y el anfitrión inicia.

La sala usa ENet por UDP 7777. Para jugar desde otra casa, el anfitrión tendrá que permitir UDP 7777 en el firewall y reenviar ese puerto en el router. La conexión real entre dos PCs aún necesita prueba.

Incluye `docs/THIRD_PARTY_NOTICES.md` y `docs/licenses` al redistribuir. Los modelos y animaciones de Quaternius son CC0; Godot usa licencia MIT.