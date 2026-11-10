# GitHub MCP Server

Servidor [Model Context Protocol](https://modelcontextprotocol.io) en Node.js y TypeScript que permite a un agente de IA operar GitHub mediante lenguaje natural. Se conecta a [Antigravity](https://antigravity.google) por stdio y funciona con cualquier LLM que el host soporte.

```text
"Crea una rama feat/docs en mi repo demo, agrega docs/guia.md y abre un pull request"
```

A partir de ese pedido, el agente elige los tools `create_branch`, `create_commit` y `create_pull_request`, los ejecuta en orden y devuelve el enlace al pull request.

## Objetivo del proyecto

**GitHub MCP Server** es el MVP que AutomateHub, una startup de herramientas de automatización para equipos de desarrollo, construye para explorar el ecosistema de AI Agents y MCP.

### Problemática

Los equipos de desarrollo repiten muchas veces por día las mismas tareas en GitHub: crear repositorios, abrir y cerrar issues, crear ramas, subir un archivo, abrir un pull request. Cada una obliga a salir del editor, entrar a la web o recordar comandos. Un asistente de IA que solo conversa puede explicar cómo hacerlo, pero no lo hace.

### Solución

Un server MCP que expone operaciones de GitHub como tools. El LLM lee la descripción y el schema de cada tool, decide cuál usar a partir de un pedido en lenguaje natural y el server lo ejecuta con Octokit. Antes de llamar a GitHub, cada input se valida con Zod, y cualquier error vuelve como un mensaje que el agente puede explicar al usuario.

### Casos de uso principales

1. **Arrancar un proyecto:** crear un repositorio y su primera documentación con un solo pedido.
2. **Registrar trabajo sin cambiar de contexto:** abrir un issue desde el chat del IDE mientras se programa.
3. **Triage conversacional:** "¿qué issues abiertos tiene el repo api?" y cerrar los que ya están resueltos.
4. **Proponer cambios:** crear una rama, commitear un archivo y abrir el pull request.
5. **Seguimiento rápido:** consultar los últimos commits de una rama.
6. **Diagnóstico guiado:** los errores llegan en lenguaje natural, por lo que el agente puede explicar qué pasó y cómo seguir.

### Alcance

- **Incluye:** 10 tools (los 5 obligatorios, 4 avanzados y `health_check`), validación de inputs con Zod, errores clasificados y traducidos, reintentos ante rate limit, logs sin datos sensibles, repositorios en organizaciones y 123 tests.
- **No incluye:** borrado de repositorios, labels, colaboradores, comentarios en issues, caché de resultados ni varias cuentas de GitHub a la vez. Cada commit agrega o reemplaza un único archivo de texto.

## Stack

- Node.js + TypeScript
- `@modelcontextprotocol/sdk`, el SDK oficial de MCP, con transporte stdio
- `@octokit/rest`, el cliente oficial de la API de GitHub
- Zod para validación de schemas e inferencia de tipos
- Vitest para los tests, con Octokit mockeado
- ESLint con `typescript-eslint`
- MCP Inspector para depurar y Antigravity como host

## Requisitos

| Requisito | Versión o detalle |
|---|---|
| Node.js | 22.13 o superior en la línea 22, o 24 o superior. Las versiones impares 23 y 25 no están soportadas |
| npm | Incluido con Node.js |
| Antigravity IDE | Con sesión iniciada y un modelo disponible |
| GitHub | Cuenta con un Personal Access Token |

> La consigna parte de Node 18, pero las versiones actuales de las dependencias exigen más: `@octokit/rest` necesita Node 20, ESLint 10 necesita 22.13 y Vitest 5 no soporta las versiones impares.

## Instalación

```bash
git clone https://github.com/rominababiel/github-mcp-server.git
cd github-mcp-server
npm install
npm run build
```

`npm run build` compila TypeScript en `dist/`, que es lo que ejecuta Antigravity.

## Configuración

### 1. Obtener un GitHub Personal Access Token

1. Abre [github.com/settings/tokens/new](https://github.com/settings/tokens/new) para crear un token **classic**. Los tokens fine-grained no usan scopes, y este server necesita los de la tabla siguiente.
2. Escribe un nombre, como `github-mcp-server`, y elige una fecha de vencimiento.
3. Selecciona los scopes de la tabla siguiente.
4. Haz clic en **Generate token** y copia el valor. GitHub no lo vuelve a mostrar.

### 2. Scopes del token

| Scope | Para qué se usa |
|---|---|
| `repo` | Repositorios, issues, commits, ramas y pull requests, públicos y privados |
| `user` | Información del usuario autenticado |
| `admin:org` | Operaciones sobre organizaciones |

`admin:org` da permisos amplios. Si no vas a trabajar con organizaciones, puedes omitirlo; `health_check` lo informará como faltante, pero los demás tools seguirán funcionando en tus repositorios.

### 3. Configurar `.env`

```bash
cp .env.example .env
```

En Windows con PowerShell, usa `Copy-Item .env.example .env`. Luego completa el token:

```dotenv
GITHUB_TOKEN=tu_token
LOG_LEVEL=info
```

`.env` está en `.gitignore` y no debe subirse nunca. Si un token llega al repositorio, **revócalo de inmediato**: seguirá en el historial aunque borres el archivo después.

### 4. Configurar el server en Antigravity

Antigravity IDE lee los servers MCP de `~/.gemini/config/mcp_config.json` (en Windows, `C:\Users\<usuario>\.gemini\config\mcp_config.json`). También se llega a ese archivo desde el panel del agente, con **…** > **MCP Servers** > **Manage MCP Servers** > **View raw config**; la ubicación del menú puede cambiar entre versiones.

1. Abre `mcp_config.json`, o créalo si no existe.
2. Agrega el server con la ruta absoluta a `dist/server.js`:

```json
{
  "mcpServers": {
    "github": {
      "command": "node",
      "args": ["C:/ruta/a/github-mcp-server/dist/server.js"]
    }
  }
}
```

3. Guarda el archivo y reinicia Antigravity. Deben aparecer los 10 tools.

Si el server figura con `"disabled": true`, está desactivado: quita esa línea o actívalo desde el panel de MCP Servers.

El server encuentra su `.env` por su propia ubicación, sin importar desde qué carpeta lo lance Antigravity. Si prefieres no usar `.env`, agrega el token en la configuración; esa variable tiene prioridad:

```json
"env": { "GITHUB_TOKEN": "tu_token" }
```

### 5. Proteger el token del agente

El agente de Antigravity puede leer archivos y ejecutar comandos en el proyecto. Sin restricciones, ante un pedido sobre GitHub puede leer `.env` y llamar a la API por su cuenta, en lugar de usar los tools: el token terminaría en el contexto del modelo. Para evitarlo, en **Settings** > **General** > **Tool Permissions**:

| Sección | Regla |
|---|---|
| **File Access Rules** | `Deny` de lectura y escritura sobre la ruta absoluta de `.env` |
| **Terminal Commands** | `Deny` para `node`, `gh`, `curl`, `Get-Content`, `type` y `cat` |

Estas reglas no afectan al server: Antigravity lo inicia desde `mcp_config.json`, no desde la terminal del agente.

### 6. Verificar la instalación

Pídele al agente:

```text
Verifica la conexión con GitHub.
```

El agente debe usar `github/health_check` y responder con tu usuario, los scopes del token y el rate limit disponible.

## Variables de entorno

Se definen en `.env` (ver `.env.example`) o en el bloque `env` de `mcp_config.json`, que tiene prioridad.

| Variable | Obligatoria | Descripción |
|---|---|---|
| `GITHUB_TOKEN` | Sí | Personal Access Token classic con los scopes `repo`, `user` y `admin:org` |
| `LOG_LEVEL` | No | Nivel de los logs en stderr: `debug`, `info`, `warn`, `error` o `silent`. Por defecto `info` |

## Tools

Los campos con valor por defecto o marcados como opcionales pueden omitirse. Si el agente envía un parámetro que el tool no admite, la validación lo rechaza e indica cuáles acepta.

### Tools principales

#### `create_repository`

Crea un repositorio en la cuenta personal o en una organización.

| Parámetro | Tipo | Detalle |
|---|---|---|
| `name` | `string` | 3 a 100 caracteres: letras, números y guiones |
| `description` | `string` opcional | Hasta 350 caracteres, en una línea |
| `private` | `boolean` | Por defecto `false` |
| `autoInit` | `boolean` | Crea un README inicial. Por defecto `true` |
| `organization` | `string` opcional | Si se omite, se usa la cuenta personal |

> **Prompt:** Crea un repositorio privado llamado `api-pagos` con la descripción "API de pagos".

#### `list_repositories`

Lista los repositorios a los que accede el usuario, por actividad reciente.

| Parámetro | Tipo | Detalle |
|---|---|---|
| `visibility` | `"all" \| "public" \| "private"` | Por defecto `all` |
| `limit` | `integer` | 1 a 100. Por defecto 30 |

> **Prompt:** Muéstrame mis 5 repositorios privados más recientes.

#### `create_issue`

Abre un issue en un repositorio.

| Parámetro | Tipo | Detalle |
|---|---|---|
| `owner` | `string` | Usuario u organización dueña |
| `repo` | `string` | Nombre del repositorio |
| `title` | `string` | 1 a 256 caracteres |
| `body` | `string` opcional | Markdown, hasta 65536 caracteres |

> **Prompt:** Abre un issue en `octocat/api-pagos` titulado "Error al procesar reembolsos" y explica que falla con montos en cero.

#### `list_issues`

Lista los issues de un repositorio, sin incluir pull requests.

| Parámetro | Tipo | Detalle |
|---|---|---|
| `owner` | `string` | Usuario u organización dueña |
| `repo` | `string` | Nombre del repositorio |
| `state` | `"open" \| "closed" \| "all"` | Por defecto `open` |
| `limit` | `integer` | 1 a 100. Por defecto 30 |

> **Prompt:** ¿Qué issues abiertos tiene `octocat/api-pagos`? ¿Y cuáles se cerraron?

#### `create_commit`

Agrega o reemplaza un archivo de texto mediante un commit.

| Parámetro | Tipo | Detalle |
|---|---|---|
| `owner` | `string` | Usuario u organización dueña |
| `repo` | `string` | Nombre del repositorio |
| `path` | `string` | Ruta relativa a la raíz, como `docs/guia.md` |
| `content` | `string` | Contenido final completo, hasta 1.000.000 de caracteres |
| `message` | `string` | Mensaje del commit |
| `branch` | `string` opcional | Rama existente. Si se omite, se usa la rama por defecto |

> **Prompt:** En `octocat/api-pagos`, agrega `docs/guia.md` con un título "Guía" y una descripción breve. Usa el mensaje de commit "docs: add guide".

### Tools avanzados

#### `create_branch`

Crea una rama a partir de otra.

| Parámetro | Tipo | Detalle |
|---|---|---|
| `owner` | `string` | Usuario u organización dueña |
| `repo` | `string` | Nombre del repositorio |
| `branch` | `string` | Nombre de la rama nueva |
| `fromBranch` | `string` opcional | Si se omite, parte de la rama por defecto |

> **Prompt:** Crea la rama `feat/reembolsos` en `octocat/api-pagos`.

#### `create_pull_request`

Abre un pull request entre dos ramas del mismo repositorio.

| Parámetro | Tipo | Detalle |
|---|---|---|
| `owner` | `string` | Usuario u organización dueña |
| `repo` | `string` | Nombre del repositorio |
| `title` | `string` | 1 a 256 caracteres |
| `head` | `string` | Rama con los cambios |
| `base` | `string` opcional | Si se omite, apunta a la rama por defecto |
| `body` | `string` opcional | Descripción en Markdown, hasta 65536 caracteres |

> **Prompt:** Abre un pull request de `feat/reembolsos` hacia `main` en `octocat/api-pagos`, titulado "Corregir reembolsos".

#### `list_commits`

Lista los commits recientes de un repositorio o rama.

| Parámetro | Tipo | Detalle |
|---|---|---|
| `owner` | `string` | Usuario u organización dueña |
| `repo` | `string` | Nombre del repositorio |
| `branch` | `string` opcional | Si se omite, usa la rama por defecto |
| `limit` | `integer` | 1 a 100. Por defecto 30 |

> **Prompt:** Muéstrame los últimos 3 commits de `octocat/api-pagos`.

#### `close_issue`

Cierra un issue. Rechaza el pedido si el número corresponde a un pull request.

| Parámetro | Tipo | Detalle |
|---|---|---|
| `owner` | `string` | Usuario u organización dueña |
| `repo` | `string` | Nombre del repositorio |
| `issueNumber` | `integer` | Número del issue, mayor que 0 |
| `reason` | `"completed" \| "not_planned"` | Por defecto `completed` |

> **Prompt:** Cierra el issue #12 de `octocat/api-pagos` porque ya está resuelto.

#### `health_check`

Verifica la conexión e informa el usuario, los scopes concedidos y faltantes, y el rate limit. No recibe parámetros.

> **Prompt:** Verifica mi conexión con GitHub y dime si al token le falta algún permiso.

## Ejemplos de uso

Cada flujo combina tools, y juntos cubren los 10. Los cinco primeros se probaron en Antigravity con Gemini 3.8 Flash, sobre GitHub real; el último, directamente contra la API de GitHub por stdio:

| Pedido | Tools que usa el agente |
|---|---|
| "Verifica la conexión con GitHub y lista mis 5 repositorios más recientes." | `health_check`, `list_repositories` |
| "Crea un repositorio llamado `demo-mcp`, abre un issue 'Agregar documentación' y muéstrame los issues abiertos." | `create_repository`, `create_issue`, `list_issues` |
| "En `demo-mcp`, crea la rama `feat/docs`, agrega `docs/guia.md` con una guía breve y abre un pull request hacia `main`." | `create_branch`, `create_commit`, `create_pull_request` |
| "Muéstrame los últimos commits de `demo-mcp`, cierra el issue de documentación y lista los issues cerrados." | `list_commits`, `close_issue`, `list_issues` |
| "Crea un repositorio llamado `mi repo`." | Ninguna llamada a GitHub: la validación explica el error y el agente propone `mi-repo` |
| "¿Qué issues tiene el repo `no-existe-xyz`?" | `list_issues`, que responde "El repositorio … no fue encontrado. Verifica el nombre e intenta de nuevo." |

## Arquitectura

```mermaid
flowchart LR
    H["Antigravity (Host)"] --> L["LLM (Client)"] --> S["MCP Server"] --> G["GitHub API"]
```

El recorrido completo de una solicitud, de ida y de vuelta:

```mermaid
sequenceDiagram
    actor U as Usuario
    participant H as Antigravity (Host)
    participant L as LLM (Client)
    participant S as MCP Server
    participant G as GitHub API

    H->>S: Lanza el proceso y lista los tools (stdio, JSON-RPC)
    S-->>H: Nombres, descripciones y schemas
    U->>H: "Abre un issue en demo-mcp"
    H->>L: Prompt y tools disponibles
    L-->>H: Decide create_issue y sus parámetros
    H->>S: tools/call create_issue
    S->>S: Valida con Zod
    S->>G: POST /repos/{owner}/{repo}/issues (Octokit)
    G-->>S: Issue creado o error HTTP
    S-->>H: Resultado o error en lenguaje natural
    H->>L: Resultado del tool
    L-->>U: Respuesta final
```

Según la especificación de MCP, el cliente es un componente del host que mantiene la conexión con el server; el LLM es quien decide qué tool usar a partir de sus descripciones.

## Estructura del proyecto

```text
src/
├── server.ts          Entry point: carga el entorno y conecta el transporte stdio
├── mcp-server.ts      Handlers del protocolo: listar y ejecutar tools
├── config.ts          Identidad del server, scopes y carga de .env
├── types.ts           Modelos de dominio que devuelven las operaciones
├── tools/             Un archivo por tool, define-tool.ts e index.ts con la lista de tools
├── schemas/           Schemas de Zod y tipos inferidos
├── github/
│   ├── client.ts      Configuración de Octokit
│   └── operations.ts  Operaciones de GitHub
├── errors/            Tipos de error y traducción a lenguaje natural
└── utils/             Logging y reintentos
tests/                 Tests unitarios con Octokit mockeado; helpers.ts arma errores HTTP de prueba
```

La estructura sigue la sugerida por la consigna y suma cuatro archivos: `mcp-server.ts` separa el protocolo del entry point para poder testearlo con un cliente en memoria, `config.ts` centraliza la configuración, `tools/define-tool.ts` aplica a todos los tools la misma validación, el mismo manejo de errores y los mismos logs, y `tools/index.ts` reúne los tools que se registran en el server.

## Decisiones de arquitectura

- **Capas con una sola dirección de dependencia:** `tools → schemas / operations → client`. Las operaciones no conocen MCP y los tools no llaman a Octokit directamente, por eso los tests reemplazan solo el cliente.

| Decisión | Motivo |
|---|---|
| Stdio en lugar de HTTP | Es un proceso local del usuario: no abre puertos y el token no sale de su máquina |
| `Server` en lugar de `McpServer` | `McpServer` valida antes del handler y su error mezcla texto del SDK; así, toda validación pasa por `ValidationError` |
| Errores como resultado con `isError: true` | El LLM los puede leer y explicar; un fallo de protocolo no le daría esa oportunidad |
| Parámetros desconocidos rechazados | Si se ignoraran, el agente podría confirmar algo que no se hizo, como un issue "con etiqueta" |
| Logs solo en stderr | Stdout transporta JSON-RPC y cualquier otra salida rompería la comunicación |
| Dos reglas para nombres de repositorio | Al crear se aplica la regla de la consigna; al referenciar, la de GitHub, para no bloquear repos como `mi_repo` |
| Reintentos según el tipo de error | El rate limit se reintenta siempre porque GitHub rechazó el pedido; los fallos de red solo en lecturas, para no duplicar escrituras |
| Contents API para commits | Permite el primer commit de un repositorio vacío y resuelve un archivo por operación |

## Manejo de errores

| Tipo | Cuándo ocurre | Ejemplo de mensaje |
|---|---|---|
| `ValidationError` | Input inválido o con parámetros que el tool no admite, antes de llamar a GitHub | `Parámetros inválidos. name: El nombre del repositorio solo admite letras, números y guiones.` |
| `AuthenticationError` | Token ausente o inválido (401), falta de permisos (403) | `GitHub rechazó las credenciales. Verifica que GITHUB_TOKEN sea válido y no haya vencido.` |
| `GitHubAPIError` | 404, 409, 422, 5xx y rate limit | `El repositorio octocat/demo no fue encontrado. Verifica el nombre e intenta de nuevo.` |
| `NetworkError` | No se pudo conectar con GitHub | `No se pudo conectar con GitHub. Verifica tu conexión a internet e intenta de nuevo.` |
| `UnexpectedError` | Cualquier otro fallo | Mensaje genérico; el detalle queda en los logs |

**Rate limit:** se respetan `retry-after` y `x-ratelimit-reset`. Sin esos datos se aplica backoff exponencial con jitter, hasta 3 intentos. Si la espera supera los 30 segundos, no se bloquea al agente: se informa cuándo reintentar.

**Sugerencias:** si falta permiso para crear un repositorio en una organización, el mensaje sugiere crearlo en la cuenta personal.

**Logs:** se escriben en stderr como JSON, en los niveles `debug`, `info`, `warn` y `error`. Las claves sensibles y los valores con formato de token de GitHub se ocultan. Para más detalle, usa `LOG_LEVEL=debug` o `npm run dev`, que activa `--verbose`.

## Tests

```bash
npm test
```

123 tests con Vitest. Octokit se reemplaza con `vi.mock()` y los timers son simulados: no hay llamadas reales a GitHub y los resultados son deterministas. Los mocks simulan tanto respuestas exitosas como errores (404, 401, 403, 422, rate limit y fallos de red).

| Archivo | Qué verifica |
|---|---|
| `tests/tools.test.ts` | Schemas: inputs válidos, inválidos y sus mensajes |
| `tests/github.test.ts` | Operaciones con Octokit mockeado y casos edge: repositorio inexistente, credenciales inválidas, repo vacío |
| `tests/client.test.ts` | Creación del cliente de Octokit y error claro si falta el token |
| `tests/errors.test.ts` | Clasificación y traducción de errores a lenguaje natural |
| `tests/retry.test.ts` | Backoff, límite de espera y reintentos seguros |
| `tests/logging.test.ts` | Uso de stderr, niveles y ocultamiento del token |
| `tests/server.test.ts` | Flujo MCP completo con un cliente en memoria |

## Scripts

| Script | Función |
|---|---|
| `npm run build` | Compila TypeScript en `dist/` |
| `npm run dev` | Ejecuta desde el código fuente con logs detallados |
| `npm start` | Ejecuta la versión compilada |
| `npm test` | Ejecuta los tests |
| `npm run test:watch` | Tests en modo watch |
| `npm run lint` | Ejecuta ESLint |
| `npm run typecheck` | Verifica los tipos sin compilar |
| `npm run inspect` | Abre MCP Inspector con la versión compilada |

Para depurar sin Antigravity:

```bash
npm run build
npm run inspect
```

## Troubleshooting

| Síntoma | Causa probable | Solución |
|---|---|---|
| `No se encontró GITHUB_TOKEN` | Falta `.env` o está vacío | Revisa el paso 3 de la configuración |
| `GitHub rechazó las credenciales` | Token inválido o vencido | Genera uno nuevo y actualiza `.env` |
| `El token no tiene permisos` | Faltan scopes o acceso a la organización | Ejecuta `health_check` y revisa `missingScopes` |
| Un repo privado da "no fue encontrado" | GitHub responde 404 si el token no tiene acceso | Verifica el dueño, el nombre y el scope `repo` |
| Antigravity no muestra los tools | Ruta incorrecta, falta compilar o el server está desactivado | Usa una ruta absoluta a `dist/server.js`, ejecuta `npm run build` y revisa que no tenga `"disabled": true` |
| El agente responde "Agent execution terminated due to error" | Antigravity no pudo acceder al modelo (`429 RESOURCE_EXHAUSTED`), no es un error del server | Actualiza Antigravity, cambia de modelo o reintenta más tarde |
| El agente usa la terminal en lugar de los tools | Puede resolver el pedido por su cuenta | Aplica las reglas de [Proteger el token del agente](#5-proteger-el-token-del-agente) |
| Los cambios de código no se reflejan | Antigravity usa `dist/` | Ejecuta `npm run build` y reinicia Antigravity |
| `list_issues` no muestra un cambio reciente | El listado de GitHub puede demorar unos segundos | Espera un momento y vuelve a consultar |
| `create_branch` indica que el repo está vacío | No hay commits de los que partir | Crea uno con `create_commit` |
| El server se desconecta al arrancar | Salida ajena al protocolo en stdout | Usa `logger`, nunca `console.log` |
| `npm install` avisa que no ejecutó el script de `esbuild` | npm pide aprobar los scripts de instalación de dependencias | No afecta al proyecto: `build`, `dev` y `test` funcionan igual |

## Uso de IA

Desarrollé el proyecto con Claude Code como asistente: Claude escribió el código y yo lo guié, decidí y probé cada etapa en Antigravity.

- **Cómo lo integré:** primero leí la consigna, la guía y la rúbrica, se las pasé como contexto y le pedí un plan técnico que cubriera cada punto, separando lo que pide la documentación de lo que proponía por su cuenta. No empezó a construir hasta que aprobé el plan, y antes de subir el repositorio le pedí probar el flujo completo para encontrar desvíos.
- **Dónde fue más efectiva:** para diagnosticar los errores de Antigravity leyendo sus logs, para encontrar comportamientos que los tests no mostraban (parámetros que se ignoraban sin aviso) y para auditar el proyecto contra la rúbrica.
- **Buenas prácticas que descubrí:** pedir el plan antes que el código, revisar qué tool usa el agente y no solo su respuesta, restringir los permisos del agente y no pegar nunca el token en el chat.

El detalle completo, con los prompts principales y las decisiones de cada etapa, está en [docs/AI_USAGE.md](docs/AI_USAGE.md).

## Licencia

[MIT](LICENSE)
