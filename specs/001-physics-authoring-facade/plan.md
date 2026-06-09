# Implementation Plan: Fachada de Autoria de Domínio para Física

**Branch**: `feature/001-physics-authoring-facade` | **Date**: 2026-06-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-physics-authoring-facade/spec.md`

## Summary

Adicionar uma **fachada de autoria em vocabulário de domínio** sobre os corpos físicos (C3), espelhando o que
Geometry/Material já fazem para a renderização. O usuário cria física com `mass`, `friction`, `restitution`,
`radius`/`halfExtents` e um algoritmo semântico — a fachada deriva internamente `schema`+`data`
(`invMass` em `pos.w`, `I_inv`, `mat_props`, `body_shape`), anexa o colisor coerente e garante o registro
automático do `Flow`. Aditivo: a forma crua `{ schema, data }` e o `flows.register` manual continuam válidos.
Sem tocar kernels WGSL, semântica de simulação ou coalescência em pool.

## Technical Context

**Language/Version**: TypeScript 5.9 (estrito), ESM.

**Primary Dependencies**: WebGPU (`@webgpu/types`), `gl-matrix` (math de inércia/transform), `uuid`.

**Storage**: N/A (estado em GPU buffers via pools; nenhum storage persistente).

**Testing**: Vitest (unit, CPU-side). Smokes de browser (manuais) para validação GPU — `claflow-web` é o
consumidor de referência (cena chão+plataforma+esfera+bastão).

**Target Platform**: Navegador com WebGPU (Chrome/Edge 113+).

**Project Type**: Biblioteca (motor) — camada C3 (`src/elements/physics`) + ponto de fiação em C4
(`src/presentation`, auto-registro de flow).

**Performance Goals**: 60 fps; a fachada roda **apenas na criação** (CPU, custo desprezível), zero overhead
por frame; nenhuma regressão na coalescência/dispatch.

**Constraints**: NÃO alterar kernels WGSL, layouts de struct, semântica de simulação nem a estratégia de pool;
manter 100% retrocompat com `{ schema, data }` cru e `flows.register` manual.

**Scale/Scope**: 3 famílias de body (Rigid/Soft/Fluid), 7 schemas/algoritmos, 4 formas de colisor. Mudança
concentrada em `src/elements/physics/bodies/` + um registro de mapeamento algoritmo→flow + fiação na
`Application`. Estimativa: ~10–15 arquivos novos/alterados, todos C3/C4.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Princípio                                     | Avaliação                                                                                   |
| --------------------------------------------- | ------------------------------------------------------------------------------------------- |
| I. Camadas e importação                       | ✅ Mudança restrita a C3 (`elements/physics`) + fiação em C4. Sem importar `core/gpu`.      |
| II. Domínio na borda, data-oriented no núcleo | ✅ **É a materialização deste princípio** — fachada de domínio sobre o núcleo de schema.    |
| III. `Resource` como contrato                 | ✅ A fachada produz o mesmo `Resource` ({schema,data}); nada acessa C1 direto.              |
| IV. ECS + Flows                               | ✅ Auto-registro respeita o roteamento por `schema.name`; ordenação de flow inalterada.     |
| V. Testes/verificação                         | ✅ Toda a tradução é CPU-side e testável (FR/SC-005); smokes do `claflow-web` cobrem a GPU. |
| VI. Documentação                              | ✅ FR-009 exige doc de autoria em vocabulário de domínio; raw vai para "avançado".          |

**Resultado**: PASS, sem violações. Nenhuma entrada em Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/001-physics-authoring-facade/
├── plan.md              # Este arquivo
├── research.md          # Fase 0 — decisões de design + verificações de layout
├── data-model.md        # Fase 1 — entidades de autoria e mapeamento → schema/data
├── quickstart.md        # Fase 1 — a cena do claflow-web reescrita na fachada (SC-001)
├── contracts/
│   └── authoring-api.md  # Fase 1 — superfície pública das factories
└── tasks.md             # Fase 2 (/speckit-tasks — NÃO criado aqui)
```

### Source Code (repository root)

```text
src/elements/physics/
├── bodies/
│   ├── RigidBody.ts        # + factories estáticas .sphere()/.box()/.plane() (aditivo ao ctor {schema,data})
│   ├── SoftBody.ts         # + .xpbd()/.fem()
│   ├── FluidBody.ts        # + .sph()/.pbf()/.mpm()
│   ├── authoring/          # NOVO — tradução domínio → data, sem tocar schemas
│   │   ├── inertia.ts       # I_inv analítico por forma (esfera/caixa) via gl-matrix
│   │   ├── matProps.ts      # mapeia {friction,restitution,linDamp,angDamp} → vec4 (ordem canônica única)
│   │   ├── shape.ts         # mapeia forma+dims → body_shape vec4 + colisor correspondente
│   │   └── index.ts
│   └── schemas/            # INALTERADO
├── flows/
│   └── registry/           # NOVO ou estende FlowRegistry — mapa schema.name → (core,world,resources)=>Flow
└── colliders/             # INALTERADO (reusados pela fachada)

src/presentation/
└── Application.ts          # fiação: auto-registro de flow por schema no world.insert (opt-out p/ avançado)

src/elements/physics/__tests__/   # NOVO — testes CPU-side da tradução (massa→invMass, inertia, matProps, shape, routing)
```

**Structure Decision**: mudança **aditiva** concentrada em `src/elements/physics/bodies/` (factories +
subpasta `authoring/` de tradução pura CPU) e um registro algoritmo→flow consumido pela `Application`. Os
`schemas/`, `colliders/`, `flows/*Flow.ts` e kernels WGSL permanecem intactos. Nenhum arquivo de C1/C2 é tocado.

## Complexity Tracking

> Sem violações de constituição — seção vazia intencionalmente.
