# Uso de IA en el proyecto

Usé Claude Code como asistente durante todo el desarrollo. Leí la documentación del proyecto, se la pasé como contexto y trabajamos por etapas: Claude proponía e implementaba cada parte, me explicaba lo que no entendía y me consultaba cada decisión que la documentación no definía. Yo probé el server en Antigravity antes de darlo por terminado y le avisé cada cosa que no funcionaba como esperaba.

## Cómo integré la IA en mi forma de trabajo

1. **Primero la documentación.** Antes de escribir código, leí la consigna, la guía y la rúbrica, se las pasé a Claude y le pedí un plan técnico que cubriera cada punto, separando lo que pide la documentación de lo que proponía por su cuenta.
2. **El plan antes que el código.** Revisé el plan, le pedí que verificara que respetaba el stack pedido y qué extras incluía, y recién con mi OK empezó a construir.
3. **Decisiones consultadas.** Cada vez que había más de una opción, Claude me explicaba las alternativas y yo elegía.
4. **Probar antes de subir.** Antes de publicar el repositorio le pedí probar el flujo completo y listar los desvíos. Después probé yo cada tool en Antigravity.
5. **Revisión final contra la consigna.** Le pedí auditar el proyecto punto por punto contra la consigna, la guía y la rúbrica.

## Prompts principales

Estos son los prompts más importantes que usé durante el desarrollo.

**1. "Necesito que leas toda la documentación del proyecto y me digas qué tenemos que construir, armes el plan técnico para cumplir con cada punto de la documentación y con mi OK empezamos a construir. ¿Tenés acceso a mi GitHub? ¿Qué otras conexiones necesitás?"**

- _Cómo influyó:_ Claude armó el plan por etapas, siguiendo las de la guía, y me explicó qué necesitaba: mi sesión de GitHub para las pruebas y Antigravity instalado para la demo.
- _Qué decidí:_ aprobar el plan después de revisarlo, y no pasarle nunca el token por el chat.

**2. "Revisá de nuevo el plan técnico y fijate que respete el stack pedido y si realiza los extras. Quiero que realices un código limpio, una arquitectura clara y sin comentarios innecesarios de la IA."**

- _Cómo influyó:_ Claude corrigió el plan donde las versiones actuales de las librerías no coincidían con lo previsto (por ejemplo, TypeScript 6 en lugar de 7, porque ESLint todavía no lo soporta) y me mostró qué extras cubría.
- _Qué decidí:_ el código solo lleva comentarios que explican el porqué de una decisión, no qué hace cada línea.

**3. "Primero quiero que pruebes todo el flujo, veamos los desvíos y recién después subir."**

- _Cómo influyó:_ Claude probó el server como lo haría alguien que recién clona el repositorio y encontró desvíos que los tests no mostraban. El más importante: si el agente mandaba un parámetro que el tool no admite (por ejemplo, etiquetas al crear un issue), el server lo ignoraba sin avisar y el agente podía confirmar algo que no se había hecho.
- _Qué decidí:_ corregir ese caso para que se rechace con un mensaje claro, y agregar a `list_issues` el filtro por estado para poder consultar los issues cerrados.

**4. "Dame el paso a paso para probar yo los tools en Antigravity."**

- _Cómo influyó:_ Claude armó una lista de pedidos en lenguaje natural que no nombran el tool, para comprobar que el agente elige el correcto por su cuenta. Yo los ejecuté uno por uno en Antigravity, aprobé cada tool y le pasé las respuestas; Claude revisó en el historial de Antigravity qué tool había usado el agente en cada paso.
- _Qué decidí:_ probar los 10 tools y también un caso de error: al pedir un repositorio llamado "mi repo", el server lo rechazó y el agente me propuso "mi-repo". No acepté crearlo, para no dejar repositorios de prueba en mi cuenta.

**5. "Quiero que audites todo el proyecto para saber si cumple 1:1 con la documentación y la rúbrica, cada punto."**

- _Cómo influyó:_ Claude revisó cada requisito con su evidencia y marcó lo pendiente: publicar el repositorio, las slides, la grabación de la demo y la preparación de preguntas.
- _Qué decidí:_ corregir los detalles que encontró, como el diagrama con la cadena exacta que pide la consigna.

## Decisiones que tomé

| Tema | Qué elegí | Por qué |
|---|---|---|
| Host | Antigravity IDE, sin alternativas | La consigna y la rúbrica lo piden como host y para la demo en vivo |
| Modelo para la demo | Gemini 3.8 Flash | Es el que usé en todas las pruebas, y Antigravity avisa que en el plan gratuito los modelos de otros proveedores dejan de estar disponibles |
| Token | Classic, con `repo`, `user` y `admin:org` | Son los scopes que pide la consigna; los tokens fine-grained no los usan |
| Token expuesto | Regenerarlo | El agente lo leyó del `.env` en una prueba; aunque no se hizo público, salió de mi máquina |
| Permisos del agente | Bloquear `.env` y los comandos que lo leen | Así el agente usa los tools del server y no la API por su cuenta |
| Parámetros desconocidos | Rechazarlos | Si se ignoran, el agente puede decir que hizo algo que no hizo |
| Filtro de issues | `state` con `open`, `closed` y `all` | Sin él, el agente no podía responder qué issues se cerraron |
| Node.js | 22.13 o superior en la línea 22, o 24 o superior | Lo exigen las versiones actuales de ESLint, Vitest y Octokit |
| Extras | 4 tools avanzados, organizaciones y mejoras de experiencia | Suman sin contradecir la consigna |
| Licencia | MIT | Es la que sugiere la consigna |

## Registro por etapa

### Etapa 1: Setup y arquitectura base

- Claude creó el proyecto con la estructura de carpetas que sugiere la consigna y verificó que `.env` quedara fuera del repositorio antes del primer commit.

### Etapa 2: MCP Server y registro de tools

- Claude armó el server con el SDK oficial y lo probó con MCP Inspector antes de conectarlo a Antigravity.

### Etapas 3 a 6: Schemas, GitHub, errores y tests

- Claude implementó la validación, las operaciones, el manejo de errores y los tests. Los tests usan Octokit mockeado; además, probó las operaciones contra GitHub real con repositorios descartables.
- Borré esos repositorios de prueba desde GitHub cuando terminamos.

### Etapa 7: Documentación

- Claude escribió el README y lo actualizamos con lo que aprendimos al probar en Antigravity: la ruta real de la configuración y cómo proteger el token.

### Prueba en Antigravity

- Instalé Antigravity, creé el token y lo cargué directamente en el `.env`, sin pegarlo en el chat.
- Al principio el agente fallaba con todos los modelos. Claude leyó los logs de Antigravity y encontró que era un límite del servicio de Google, no del server; probamos con otra cuenta y volvió a funcionar después de actualizar Antigravity.
- En la primera respuesta, el agente no usó el server: el server estaba desactivado, así que leyó el `.env` y llamó a la API por su cuenta. Regeneré el token y configuré los permisos para que no pueda volver a pasar.
- Probé yo los 10 tools con pedidos en lenguaje natural, sin decirle al agente cuál usar: verifiqué la conexión, listé mis repositorios, creé `demo-mcp`, abrí un issue y listé los abiertos, agregué archivos, creé una rama, abrí un pull request, consulté los últimos commits, cerré el issue y listé los cerrados. Claude revisó en el historial de Antigravity que cada paso pasara por el server.

### Etapa 8: Presentación y defensa

- Armé las slides con Claude Design y le pedí a Claude Code revisarlas contra el código y la consigna. Encontró el número de tests desactualizado y que faltaban una slide de decisiones técnicas y mostrar `npm test` en la demo; también, que la exportación a Google Slides rompía los títulos, así que la entregué en PDF.
- Saqué capturas de cada paso de la demo en Antigravity como plan B por si falla en vivo, y recorté la que mostraba repositorios privados.
- Al revisar las capturas vimos que, ante "Crea un repositorio llamado mi repo", el agente corregía el nombre y creaba `mi-repo` sin preguntar. Para el caso de error le pido que no cambie el nombre y que explique el error.

## En qué situaciones fue más efectiva

- **Confirmar que entendí la documentación:** contrastar qué era obligatorio y qué era extra, y qué decía exactamente sobre Antigravity.
- **Diagnosticar problemas fuera del código:** leer los logs de Antigravity para separar los errores del servicio de los del server.
- **Encontrar lo que los tests no muestran:** probar el server como un usuario real reveló comportamientos que ningún test cubría.
- **Revisar el trabajo:** la auditoría contra la rúbrica encontró detalles que yo no había visto.

## Patrones y buenas prácticas que descubrí

- Pedir el plan antes que el código y aprobarlo antes de empezar.
- Leer la documentación yo primero y usar la IA para contrastarla, no para que la lea por mí.
- Revisar qué tool usó el agente y no solo lo que respondió: una respuesta correcta puede venir por un camino equivocado.
- Restringir lo que el agente puede leer y ejecutar, porque tiene acceso a todo el proyecto.
- No pegar nunca el token en el chat; se carga directamente en el `.env`.
