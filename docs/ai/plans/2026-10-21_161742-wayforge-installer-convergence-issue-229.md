---
status: planned
created: 2026-10-21
task: 0/5
required_gates:
  architect_review: true
  memory_update: true
---

# Convergencia del instalador de wayforge — plan de implementación (Issue #229)

**Goal:** Hacer que cualquier `install`/`update` sobre un repositorio ya instalado termine completo, consistente e idempotente: todo artefacto escrito queda registrado con identidad de contenido, nada se sobrescribe en silencio, lo que ya no se distribuye se poda o se reporta, y una segunda ejecución idéntica no produce cambios.

**Architecture:** El registro `.wayforge-managed` pasa a v2 con entradas `ruta<TAB>sha256<TAB>versión-origen<TAB>estado` y un bloque `seeded_paths` para archivos curados (`AGENTS.md`, config de runtime). Un único `collectArtifactPlan()` reemplaza las cuatro rutinas de descubrimiento y el mapeo por prefijos; cada artefacto se renderiza en memoria (rewrite de rutas + inyección de permisos + generación de config) y se escribe una sola vez, calculando el hash **después** de la transformación final. Una máquina de estados de convergencia (`converge.ts`) clasifica cada artefacto en `new | clean | drifted | missing | stale | legacy | curated` y aplica una política explícita; `--check` reporta sin escribir. El registro por repositorio es la única fuente de verdad y `installed-projects.json` se deriva de él.

**Tech Stack:** TypeScript, Node.js >= 18, Commander, fs-extra, vitest, ESLint + Prettier, `make check`.

**Scope classification:** `multi-task`

**Justificación del presupuesto de tareas (>3):** el intent contiene cinco áreas de aceptación separables y cada una exige su propia suite de regresión y revisión (identidad del registro, escritura transaccional, plan único de artefactos, política de poda/drift, reconciliación del registro global). Se entregan como cinco cortes verticales, cada uno con la suite en verde; no se divide más porque todas comparten la misma API de manifiesto y partirla generaría ramas intermedias inestables.

## Decisiones resueltas

Estas eran las decisiones abiertas del issue; quedan cerradas para esta implementación.

1. **Formato del registro:** texto v2 con metadatos, mismo archivo `.wayforge-managed`. Verificado que está en `.gitignore`, así que no hay riesgo de merge; se mantiene legible y se conserva el nombre para no romper `uninstall` ni instalaciones existentes.
2. **Registro global:** `installed-projects.json` queda como telemetría derivada. El registro por repositorio manda; el global se actualiza desde el registro finalizado en cada instalación (incluido `--force`) y nunca condiciona el comportamiento del instalador.
3. **Poda:** se podan automáticamente solo los artefactos `owned` cuyo hash actual coincide con el registrado. Los modificados localmente y los ausentes se reportan y se preservan. Se añade `wfg install --check` (solo lectura, exit code 1 si hay drift/obsoletos) para consultar propiedad, versión y drift.
4. **Artefactos fuera de `.opencode/**`:** `opencode.jsonc`/`kilo.jsonc` y `AGENTS.md` se registran como `curated`, pero **solo se actualizan con `--force`** (indicación explícita del usuario). Nunca se podan. `.gh-config/app.yml` se registra como `seeded`: se siembra si falta, nunca se sobrescribe ni se poda, y `uninstall` no lo borra.

## Hechos verificados que dirigen el diseño

- `.wayforge-managed` está ignorado por git (`.gitignore`, línea `.wayforge-managed`). El manifiesto real de este repo tiene 50 rutas y **no** incluye `opencode.jsonc` ni `AGENTS.md`: el registro actual ya está incompleto.
- En la actualización, `install.ts:129-131` fuerza `ctx.force = true`, por lo que **todos** los archivos gestionados se sobrescriben, incluidas modificaciones locales.
- `addManagedPath()` retorna en silencio si falta `.wayforge-managed.tmp` (`manifest.ts:88-90`); `finalizeManagedManifest()` también retorna en silencio (`manifest.ts:113-116`); `managedTrackFile()` cae a escribir un sidecar si no hay tmp (`manifest.ts:296-313`). Son las rutas de pérdida silenciosa de tracking.
- `syncGeneratedOpenCodeJsonc()` escribe la config sin registrarla (`config-gen.ts:220-258`) y `syncManagedPathFromManifest()` la ignora explícitamente (`manifest.ts:550-551`). `AGENTS.md` solo se registra si ya existía o como descubrimiento nuevo (`install.ts:150-165`).
- Las mutaciones ocurren después de sincronizar: `rewriteAgentPaths()` (`install.ts:389-406`) recorre **todo** `.opencode/agents/**/*.md` sin comprobar `isManagedFile()`, por lo que puede reescribir agentes del usuario; `injectPermissions()` (`install.ts:408-432`) vuelve a renderizar después de registrar. El hash debe calcularse tras estas transformaciones (o, mejor, integrarlas antes de escribir).
- El descubrimiento está duplicado cuatro veces (`install.ts:167-288`, marcado `ponytail: debt`) y los guards difieren: `commands` filtra `!subpath.endsWith('.md')` (`install.ts:212`) mientras agents/skills/plugins no. Una instalación limpia copia todos los archivos; una actualización no descubre los nuevos que no sean `.md`.
- `findUnmanagedConflicts()` solo recorre `agents|commands|skills|plugins` (`reconcile.ts:17`); `opencode.jsonc` y `AGENTS.md` quedan fuera de la reconciliación.
- `trackInstalledProject()` no hace nada cuando `ctx.force` es verdadero (`tracking.ts:57`), así que un `--force` deja la versión y `lastUpdated` del registro global obsoletos. Además, en la instalación limpia se llama **antes** de finalizar el manifiesto (`install.ts:383-384`).
- `uninstall` borra todo lo listado en `.wayforge-managed` sin distinguir estado (`uninstall.ts:34-43`); al introducir `seeded`/`curated` debe excluirlos.
- Cobertura actual: `manifest.test.ts`, `reconcile.test.ts`, `tracking.test.ts`, `uninstall.test.ts`, `permissions.test.ts`, `config-gen.test.ts`. No existe un test que ejecute un `install` completo ni una secuencia install → update → update.
- Los tests corren con `npx vitest run` desde la raíz (`vitest.config.ts` incluye `cli/tests/**/*.test.ts`); `make check` = vitest + tsc + ESLint + Prettier + jscpd (8%).

## Tasks

### Task 1: Reproducir y documentar los modos de fallo con tests de regresión

**Objective:** Fijar con tests y un informe reproducible los fallos observados, antes de tocar código de producción.

**Files:**
- Create: `cli/tests/helpers/install-fixture.ts`
- Create: `cli/tests/unit/install-convergence.test.ts`
- Create: `docs/ai/reports/installer-convergence-failure-modes-2026-10-21.md`

**Step 1: Establish expected behaviour**

Escenarios que el fixture debe poder montar (árbol `base/AGENTS.md`, `base/opencode/{agents,commands,skills,plugins,permissions/agents.yml}` y `VERSION`; repo temporal vacío o ya instalado):

- **S1 — Registro incompleto:** tras una instalación limpia, `opencode.jsonc`, `AGENTS.md` y todos los archivos de `.opencode/**` deben aparecer en el registro (hoy la config nunca y `AGENTS.md` solo a veces).
- **S2 — Idempotencia:** dos updates consecutivos sin cambios upstream no modifican bytes ni crean conflictos nuevos.
- **S3 — Podado:** al eliminar un archivo del árbol `base/`, el update borra la copia intacta y su entrada.
- **S4 — Modificación local:** si el usuario edita un archivo gestionado, el update lo preserva y avisa; con `--force` lo sobrescribe.
- **S5 — Agente no gestionado:** un `.md` propio del usuario en `.opencode/agents/` no se reescribe ni se registra.
- **S6 — Ejecución interrumpida:** un `.tmp` huérfano no convierte archivos ajenos en gestionados y la siguiente ejecución recupera el estado final.
- **S7 — Registro global:** `--force` actualiza versión/`lastUpdated` de `installed-projects.json`; la entrada se identifica por `projectId` antes que por ruta.

**Step 2: Add or update validation**

Crear `install-fixture.ts` con: `makeSourceTree()`, `makeRepo()`, `runInstall(repo, sourceDir, opts)` que fije `WAYFORGE_HOME`, aísle `LOCALAPPDATA`/`HOME` (misma técnica de `tracking.test.ts`), use `skipNodeCheck: true`, `noTrack` según escenario y restaure env en `afterEach`. Escribir los siete escenarios en `install-convergence.test.ts` como `it.skip('S1 ... (Issue #229)')` con las aserciones deseadas, y ejecutar una vez con el `skip` quitado localmente para capturar la salida real. Dejar documentado en el informe el par “esperado vs actual” de cada escenario.

**Step 3: Write minimal implementation**

Solo el fixture y el informe; ningún cambio en `cli/src/**`. El informe incluye comandos de reproducción exactos para Windows y POSIX y explica el fallo con las líneas citadas en “Hechos verificados”.

**Step 4: Run test to verify pass**

Run: `npx vitest run cli/tests/unit/install-convergence.test.ts`
Expected: suite en verde con los 7 escenarios en `skip`; el informe documenta que, sin `skip`, S1–S7 fallan (S1/S3/S4/S5/S7 en la implementación actual). Validación: **agent**.

**Step 5: Commit**

`git add cli/tests/helpers/install-fixture.ts cli/tests/unit/install-convergence.test.ts docs/ai/reports/installer-convergence-failure-modes-2026-10-21.md`
`git commit -m "test(cli): reproduce installer convergence failures (Issue #229)"`

---

### Task 2: Registro v2 con identidad de artefacto y ciclo de vida transaccional

**Objective:** Sustituir el registro de rutas por un registro v2 con hash, versión de origen, estado y bloques `managed_paths`/`seeded_paths`, sin pérdidas silenciosas y con lectura compatible de v1.

**Files:**
- Modify: `cli/src/lib/context.ts`
- Modify: `cli/src/lib/manifest.ts`
- Validate: `cli/tests/unit/manifest.test.ts`

**Step 1: Establish expected behaviour**

Formato v2 exacto (las entradas van separadas por tabulador; la cabecera documenta las columnas):

```text
project_id: <uuid>
record_version: 2
# Generated by wayforge v<version>
version: <version>
ref: <ref>                     # solo si se instaló con --ref

managed_paths:

- <ruta>	<sha256hex>	<versión>	owned
- AGENTS.md	<sha256hex>	<versión>	curated

seeded_paths:

- .gh-config/app.yml	<versión>
```

Invariantes: (a) `recordManagedArtifact()` lanza error si no hay manifiesto pendiente; (b) `finalizeManagedManifest()` lanza error si falta el `.tmp` o si alguna ruta `owned` registrada no existe; (c) toda ruta escrita por el instalador debe estar en `managed_paths` o `seeded_paths`; (d) el lector v1 acepta `- ruta` y `  - ruta` y las expone como `status: 'legacy'` con hash vacío; (e) no se consulta el `.tmp` para decidir propiedad (solo el manifiesto finalizado), evitando que una ejecución interrumpida “adopte” archivos ajenos.

**Step 2: Add or update validation**

En `manifest.test.ts`: round-trip v2 con todos los campos; parseo de v1 con ambas indentaciones; `recordManagedArtifact` sin `begin` lanza `managed record not initialized`; `abortManagedManifest` elimina el `.tmp`; `finalizeManagedManifest` sin `.tmp` lanza; finalize con una ruta registrada ausente lanza; deduplicación por ruta; hash estable con CRLF (se hashea el byte exacto en disco); `readManagedRecord()` devuelve entradas tipadas y `readManagedManifest()` sigue devolviendo `string[]` para `uninstall`.

**Step 3: Write minimal implementation**

En `context.ts`: `export type ArtifactStatus = 'owned' | 'curated' | 'legacy'`, `export interface ManagedEntry { path; sha256; sourceVersion; sourceRef?; status }`, `export interface ManagedRecord { projectId; schemaVersion; version; ref?; managed: ManagedEntry[]; seeded: SeededEntry[] }`, y `MANAGED_RECORD_VERSION = 2`.

En `manifest.ts`:

- `beginManagedManifest(repo, version, ref, ctx)` (reemplaza `initManagedManifest`, conserva export alias temporal si algún test lo usa) escribe la cabecera v2; error explícito si no puede escribir.
- `sha256File(absPath)` y `sha256Content(content|Buffer)` con `node:crypto`.
- `recordManagedArtifact(repo, relPath, { sha256, sourceVersion, sourceRef?, status }, ctx)` — **lanza** si no existe el `.tmp`; deduplica por ruta; escribe `- ruta\tsha\tversión\tstatus`.
- `recordSeededPath(repo, relPath, sourceVersion, ctx)`.
- `abortManagedManifest(repo, ctx)` — borra el `.tmp` y limpia `ctx.repoRoot`.
- `finalizeManagedManifest()` — deja de retornar en silencio; `moveSync`, relee, y si alguna entrada `owned`/`curated` no existe lanza con la lista; conserva la limpieza de sidecars y marcadores legacy.
- `readManagedRecord(repo)` + parser v1/v2; `readManagedManifest()` delega en él.
- `isManagedFile`/`isManagedDir`: eliminar la búsqueda de `.wayforge-managed.tmp`.

Mantener los helpers de sync existentes compilando hasta Task 3 (se eliminarán allí), pero hacer que su tracking use la nueva API.

**Step 4: Run test to verify pass**

Run: `npx vitest run cli/tests/unit/manifest.test.ts`
Expected: todos los casos nuevos y los existentes en verde (los existentes se adaptan a `beginManagedManifest` y a la cabecera `record_version`). Validación: **agent**.

**Step 5: Commit**

`git add cli/src/lib/context.ts cli/src/lib/manifest.ts cli/tests/unit/manifest.test.ts`
`git commit -m "feat(cli): add v2 managed artifact record with content identity (Issue #229)"`

---

### Task 3: Plan único de artefactos y transformación antes de escribir

**Objective:** Un solo origen de verdad para descubrir/renderizar artefactos, de modo que ninguna categoría pueda saltarse el registro y el hash corresponda siempre al contenido final.

**Files:**
- Create: `cli/src/lib/artifacts.ts`
- Modify: `cli/src/lib/permissions.ts`
- Modify: `cli/src/lib/config-gen.ts`
- Modify: `cli/src/lib/manifest.ts`
- Modify: `cli/src/lib/reconcile.ts`
- Modify: `cli/src/commands/install.ts`
- Validate: `cli/tests/unit/artifacts.test.ts`
- Validate: `cli/tests/unit/install-convergence.test.ts` (S1, S2, S5)

**Step 1: Establish expected behaviour**

`collectArtifactPlan(sourceDir, runtime, genOpts)` devuelve una lista estable y ordenada de descriptores:

| Categoría | Origen | `relPath` | Estado |
| --- | --- | --- | --- |
| Agentes | `base/opencode/agents/**` | `.opencode/agents/<sub>` | `owned` (contenido transformado) |
| Comandos | `base/opencode/commands/**` (todos los archivos) | `.opencode/commands/<sub>` | `owned` |
| Skills | `base/opencode/skills/**` | `.opencode/skills/<sub>` | `owned` |
| Plugins | `base/opencode/plugins/**` | `.opencode/plugins/<sub>` | `owned` |
| AGENTS | `base/AGENTS.md` | `AGENTS.md` | `curated` |
| Config | generación | `opencode.jsonc` o `kilo.jsonc` | `curated` |

Reglas: los agentes se renderizan en memoria aplicando `rewriteAgentPaths` (`base/opencode/` → `.opencode/`) y luego la inyección de permisos, antes de escribir; no existe post-proceso sobre el directorio destino. Se elimina `syncAgentsTreeWithPermissions`, `rewriteAgentPaths` e `injectPermissions` de `install.ts`. El descubrimiento para reconciliación se deriva de este mismo plan (un único listado). Una instalación limpia y una actualización consumen exactamente el mismo plan.

**Step 2: Add or update validation**

`artifacts.test.ts`: el plan incluye todas las categorías; comandos incluye archivos no `.md`; cada agente contiene el bloque `permission:` esperado y ninguna referencia `base/opencode/`; la config contiene la cabecera gestionada; el plan es determinista (mismo orden para el mismo árbol); no hay rutas duplicadas. Habilitar S1, S2 y S5 en `install-convergence.test.ts`. Añadir en `reconcile.test.ts` el caso de que los conflictos se derivan del plan (sin listas propias).

**Step 3: Write minimal implementation**

- `permissions.ts`: extraer `renderAgentContent(content, agentName, permissionsFile): string` (reutiliza `renderAgentPermissionBlock` y la lógica de inserción); `renderAgentWithCentralPermissions` pasa a ser un wrapper de compatibilidad o se elimina si ningún consumidor queda.
- `config-gen.ts`: extraer `renderRuntimeConfigJsonc(opts): string` (ya existe `generateOpenCodeJsonc`) y dejar de escribir desde allí; el plan aporta una función `render(): string`.
- `artifacts.ts`: `walkFiles` + `posixPath` reutilizados; descriptor `{ relPath, ownership, render(ctx): Buffer|string }`; `collectArtifactPlan()`.
- `manifest.ts`: sustituir `syncManagedFile`/`syncManagedTree`/`syncManagedPathFromManifest` por `writeArtifact(descriptor, record, ctx)`: `ensureDir`, comparar bytes con el destino, escribir solo si difieren, `sha256Content` del resultado y `recordManagedArtifact`. En `dry-run` registra la intención sin escribir ni hashear.
- `install.ts`: un único camino: `findUnmanagedConflicts` (sobre plan) → `resolveUnmanagedConflicts` → `beginManagedManifest` → `writeArtifact` por entrada → `finalize`. Eliminar el bloque `if (fs.pathExistsSync(...)) { ... }`, los cuatro bucles de descubrimiento y el forzado temporal `ctx.force = true`.
- `reconcile.ts`: `findUnmanagedConflicts(repo, plan)` recorre `plan.filter(p => p.ownership === 'owned' && p.relPath.startsWith('.opencode/'))`; se mantiene la semántica de `--force`/TTY/no-TTY.

**Step 4: Run test to verify pass**

Run: `npx vitest run cli/tests/unit/artifacts.test.ts cli/tests/unit/reconcile.test.ts cli/tests/unit/install-convergence.test.ts`
Expected: S1, S2 y S5 pasan; todo artefacto escrito aparece en `managed_paths`/`seeded_paths`; dos ejecuciones seguidas no cambian bytes. Además: `cd cli && npx tsc --noEmit`. Validación: **agent**.

**Step 5: Commit**

`git add cli/src/lib/artifacts.ts cli/src/lib/permissions.ts cli/src/lib/config-gen.ts cli/src/lib/manifest.ts cli/src/lib/reconcile.ts cli/src/commands/install.ts cli/tests/unit/artifacts.test.ts cli/tests/unit/install-convergence.test.ts cli/tests/unit/reconcile.test.ts`
`git commit -m "refactor(cli): unify artifact discovery and record final content (Issue #229)"`

---

### Task 4: Política de convergencia (clean/drifted/stale/missing/legacy) y `--check`

**Objective:** Aplicar una política determinista a cada estado del artefacto y exponer un informe de drift sin efectos secundarios.

**Files:**
- Create: `cli/src/lib/converge.ts`
- Modify: `cli/src/commands/install.ts`
- Modify: `cli/src/index.ts`
- Modify: `cli/src/types.ts`
- Modify: `cli/tests/unit/install-convergence.test.ts` (habilitar S3, S4, S6, S7)
- Validate: `cli/tests/unit/converge.test.ts`

**Step 1: Establish expected behaviour**

Tabla de política (el instalador nunca escribe sin clasificar antes):

| Estado | Detección | Acción por defecto | Acción con `--force` |
| --- | --- | --- | --- |
| `new` | en el plan, no en el registro | escribir + registrar | igual |
| `clean` | hash actual == registrado y el render es idéntico | omitir (sin tocar mtime) | re-renderizar si hace falta |
| `drifted` (`owned`) | hash actual != registrado | preservar, avisar `skipped (locally modified)` y conservar el hash registrado | sobrescribir + registrar |
| `missing` (`owned`) | registrado y ausente, sigue en el plan | recrear + registrar | igual |
| `stale` (`owned`) | registrado y fuera del plan; hash coincide | borrar archivo + quitar entrada | igual |
| `stale-drifted` | fuera del plan y modificado | preservar + quitar entrada + avisar “ahora es un archivo del usuario” | borrar + quitar |
| `legacy` (v1) | entrada sin hash | adoptar el hash actual como `owned` sin sobrescribir; avisar que `--force` refresca | refrescar + `owned` |
| `curated` | `AGENTS.md`, config | no sobrescribir; informar como `curated` (drift esperado, no error); nunca podar | regenerar + registrar; nunca podar |
| `curated` ausente | no existe | reportar; no recrear | recrear + registrar |

`--check`: resuelve origen y plan, imprime una línea por artefacto `estado<TAB>ruta<TAB>detalle`, no escribe, no pregunta, y sale con código 1 si hay `drifted`, `stale*`, `missing` (`owned`) o `legacy`; `curated` modificado no altera el exit code. En `dry-run` se mantiene el comportamiento actual de previsualización y no se aplica poda.

Recuperación de ejecución interrumpida: al inicio, si existe `.wayforge-managed.tmp`, se avisa y se elimina (nunca se usa como propiedad); cualquier excepción dentro del pipeline llama `abortManagedManifest()` y propaga el error con un mensaje “instalación abortada; vuelve a ejecutar”.

**Step 2: Add or update validation**

`converge.test.ts` (unitario, sin filesystem real cuando sea posible): clasificación de cada fila de la tabla; `--check` no llama a ningún helper de escritura; exit codes; `legacy` adopta sin sobrescribir; `curated` no se poda ni se sobrescribe sin `--force`. En `install-convergence.test.ts` habilitar S3 (poda), S4 (modificación local + `--force`), S6 (tmp huérfano) y S7 (registro global con `--force`, que depende de Task 5 — si Task 5 aún no está, marcar S7 como pendiente explícita y habilitarlo allí). No ejecutar validaciones humanas.

**Step 3: Write minimal implementation**

- `converge.ts`: `classifyArtifacts(record, plan, repo)` y `applyConvergence(actions, ctx)` con un `switch` por estado; sin nuevas dependencias. Reutiliza `sha256File`, `writeArtifact` y `rm`/`rmRf` existentes.
- `install.ts`: sustituir el flujo por `classify` → aplicar → `finalizeManagedManifest`; el manejo de conflictos no gestionados sigue antes de escribir; `--check` retorna antes de cualquier escritura.
- `index.ts`: `--check` en `install` (implica `dryRun` lógico no mutante y sin prompts); documentar en la ayuda que no escribe y que el exit code 1 indica drift/obsoletos.
- `types.ts`: `check: boolean` en `InstallOptions`.

**Step 4: Run test to verify pass**

Run: `npx vitest run cli/tests/unit/converge.test.ts cli/tests/unit/install-convergence.test.ts`
Expected: S3, S4 y S6 pasan; S7 se habilita en Task 5; `--check` sale 0 en un repo limpio y 1 tras editar un archivo gestionado. Validación: **agent**.

**Step 5: Commit**

`git add cli/src/lib/converge.ts cli/src/commands/install.ts cli/src/index.ts cli/src/types.ts cli/tests/unit/converge.test.ts cli/tests/unit/install-convergence.test.ts`
`git commit -m "feat(cli): converge managed artifacts with drift reporting (Issue #229)"`

---

### Task 5: Registro global derivado, uninstall seguro, ADR y validación final

**Objective:** Eliminar la contradicción entre el registro por repositorio y el global, evitar que `uninstall` borre archivos curados/sembrados, y cerrar con ADR, documentación y `make check`.

**Files:**
- Modify: `cli/src/lib/tracking.ts`
- Modify: `cli/src/commands/install.ts`
- Modify: `cli/src/commands/uninstall.ts`
- Modify: `cli/tests/unit/tracking.test.ts`
- Modify: `cli/tests/unit/uninstall.test.ts`
- Modify: `cli/tests/unit/install-convergence.test.ts` (habilitar S7)
- Create: `docs/ai/decisions/ADR-0046-managed-artifact-identity-and-convergence.md`
- Modify: `docs/ai/decisions/ADR-0009-unified-managed-file-format.md`
- Modify: `docs/ai/decisions/ADR-0041-unmanaged-file-reconciliation.md`
- Modify: `docs/ai/architecture.md`
- Modify: `README.md`
- Modify: `CHANGELOG.md`

**Step 1: Establish expected behaviour**

- `finalizeManagedManifest()` ocurre **antes** de `trackInstalledProject()`; el registro global recibe `projectId`, versión y ref desde el registro finalizado.
- `trackInstalledProject()` escribe/actualiza también con `--force` (se elimina el early return de `tracking.ts:57`); `--dry-run` y `--no-track` siguen sin escribir. Si falla la escritura del registro global, se emite un warning y la instalación **no** falla (es telemetría, no propiedad).
- La reconciliación es por `projectId` y, si no hay, por ruta; si una entrada con la misma ruta tiene otro `projectId`, gana el registro del repositorio y se corrige el global.
- `uninstall` borra solo `managed_paths` con estado `owned`; omite `curated` y `seeded_paths`; elimina la entrada global por `projectId` y, como fallback, por ruta.
- ADR-0046 documenta el formato v2, la tabla de convergencia, `--check`, la semántica `curated`/`seeded` y la decisión de registro derivado. ADR-0009 pasa a `Status: Superseded by ADR-0046`. ADR-0041 se enmienda: la reconciliación ahora se deriva del plan de artefactos y la poda está definida.
- `architecture.md` actualiza “Installed Surface”, “Installed Projects Tracking” y el contrato de `--force`/`--check`; `README.md` documenta `--check` y qué se preserva por defecto; `CHANGELOG.md` añade la entrada de corrección.

**Step 2: Add or update validation**

`tracking.test.ts`: `--force` actualiza `wayforgeVersion`/`lastUpdated`; `projectId` gana sobre ruta; corrección de una entrada con ruta coincidente y `projectId` distinto; fallo de escritura no lanza. `uninstall.test.ts`: no borra `AGENTS.md`, config ni `.gh-config/app.yml`; sí borra agentes/comandos/skills/plugins `owned` y limpia directorios vacíos; elimina la entrada global por `projectId` aunque la ruta haya cambiado. Habilitar S7.

**Step 3: Write minimal implementation**

- `tracking.ts`: `trackInstalledProject(repo, { projectId, version, installRef }, ctx)` sin depender de `ctx.force`; `try/catch` que hace `ctx.log('warning: ...')`; `removeTrackingEntry` prioriza `projectId` leyendo el registro del repo (o recibe el `projectId` ya resuelto desde `uninstall`).
- `install.ts`: mover `trackInstalledProject` después de `finalize`; pasar los valores del registro.
- `uninstall.ts`: `readManagedRecord()`; borrar solo `managed_paths` con estado `owned`; omitir `curated` y `seeded_paths`; borrar el manifiesto al final (la propiedad termina), dejando en disco los archivos curados/sembrados como archivos del usuario; eliminar la entrada global por `projectId` y, como fallback, por ruta.
- Redactar ADR-0046 y actualizar los documentos listados. No añadir nuevas dependencias.

**Step 4: Run test to verify pass**

Run: `npx vitest run cli/tests/unit/tracking.test.ts cli/tests/unit/uninstall.test.ts cli/tests/unit/install-convergence.test.ts`
Expected: S7 y el resto en verde. Después: `make check` (vitest + tsc + ESLint + Prettier + jscpd 8%) en verde. Validación: **agent**.

**Validación humana (no la ejecuta el agente):** sobre una copia de un repo consumidor ya instalado, ejecutar

```powershell
npx tsx cli/src/index.ts install --repo <copia> --force
npx tsx cli/src/index.ts install --repo <copia>
npx tsx cli/src/index.ts install --repo <copia>
npx tsx cli/src/index.ts install --repo <copia> --check
```

Esperado: la segunda y la tercera ejecución no modifican ningún archivo gestionado; `--check` sale 0; editar a mano un archivo gestionado y repetir `--check` sale 1 y el update posterior lo preserva con aviso. Validación: **human**.

**Step 5: Commit**

`git add cli/src/lib/tracking.ts cli/src/commands/install.ts cli/src/commands/uninstall.ts cli/tests/unit/tracking.test.ts cli/tests/unit/uninstall.test.ts cli/tests/unit/install-convergence.test.ts docs/ai/decisions/ADR-0046-managed-artifact-identity-and-convergence.md docs/ai/decisions/ADR-0009-unified-managed-file-format.md docs/ai/decisions/ADR-0041-unmanaged-file-reconciliation.md docs/ai/architecture.md README.md CHANGELOG.md`
`git commit -m "feat(cli): derive install registry and document convergence (Issue #229)"`

## Gates y decisiones bloqueantes

- **Sin decisiones bloqueantes pendientes.** Las cuatro decisiones abiertas del issue quedaron resueltas arriba; el matiz de `AGENTS.md`/config (solo `--force`) está incorporado como estado `curated`.
- **`architect_review: true`**: obligatorio antes de implementar Task 2 (el formato v2 sucede a ADR-0009 y cambia el límite de propiedad `owned`/`curated`/`seeded`). Repetir al cierre si el diseño se desvía de ADR-0046.
- **`memory_update: true`**: al cerrar, registrar el plan y la entrada de log en `docs/ai/logs/2026-10.md`, y marcar el plan `completed`.
- **Confirmación de alcance:** 5 tareas (>3) — se aplica la justificación incluida; no requiere la confirmación de 6–8, pero el handoff a `delivery` debe ser explícito.
- **Fuera de alcance respetado:** no se renombra `.opencode/` a `.agents/`, no se mueve memoria a base de datos, no se añaden prompts nuevos y no se intenta reparar instalaciones consumidoras ya rotas más allá de la ruta documentada de reinstalación con `--force`.
