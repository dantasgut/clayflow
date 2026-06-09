# Research — Fachada de Autoria de Domínio para Física (Fase 0)

Decisões de design e verificações de layout. Todas as fontes foram lidas no código de `develop`.

## D1. Forma da fachada: factories estáticas nas classes de body

- **Decision**: métodos estáticos de domínio em cada classe de body —
  `RigidBody.sphere(...)`, `RigidBody.box(...)`, `RigidBody.plane(...)`, `SoftBody.xpbd(...)`,
  `SoftBody.fem(...)`, `FluidBody.sph(...)`, `FluidBody.pbf(...)`, `FluidBody.mpm(...)`. Cada um retorna a
  instância de body já com `{ schema, data }` montados internamente.
- **Rationale**: descobrível por autocomplete (`RigidBody.`), espelha a ergonomia de `new SphereGeometry(...)`,
  aditivo (o construtor `{ schema, data }` permanece). Não introduz um novo tipo público.
- **Alternatives**: (a) funções livres `createSphereBody()` — menos descobrível; (b) builder fluente —
  cerimônia maior; (c) options no construtor com discriminante — colidiria com o ctor cru.

## D2. `mass` → `inv_mass` em `pos.w`

- **Fonte**: `src/elements/gpu/wgsl/structs/rigid_body.wgsl` — `pos.w = inv_mass (0 = cinemático)`.
- **Decision**: a fachada recebe `mass` de domínio. `inv_mass = mass > 0 ? 1/mass : 0`. `mass` omitido ou
  `static: true` → `inv_mass = 0` (corpo cinemático/estático). `pos.xyz` vem de `position`.
- **Rationale**: elimina o número mágico `pos.w`; "estático" passa a ser intenção declarada, não `w=0` cru.

## D3. `mat_props` (vec4) — ordem canônica

- **Fonte**: `rigid_body.wgsl` — `mat_props: x=restitution, y=friction, z=lin_damping, w=ang_damping`.
  (Atenção: **restitution vem primeiro**, não friction.)
- **Decision**: a fachada aceita `{ friction, restitution, linearDamping, angularDamping }` (nomeados) e
  monta `mat_props = [restitution, friction, linearDamping, angularDamping]`. A ordem do struct é encapsulada
  numa única função `packMatProps()` em `bodies/authoring/matProps.ts` (fonte única da ordem).
- **Defaults** (FR-007): `friction=0.5`, `restitution=0.2`, `linearDamping=0.05`, `angularDamping=0.05`
  (a ratificar com o mantenedor; valores coerentes com a cena atual do `claflow-web`).

## D4. `body_shape` (vec4) + colisor coerente

- **Fonte**: `rigid_body.wgsl` — `body_shape: x=shape_type (0=Sphere, 1=Box), yzw=half_extents`.
- **Decision**: `sphere({ radius })` → `body_shape=[0, radius, radius, radius]` + anexa `SphereCollider`;
  `box({ halfExtents })` → `body_shape=[1, hx, hy, hz]` + anexa `BoxCollider`; `plane({ normal, offset })` →
  corpo cinemático + `PlaneCollider`. O mapeamento forma→(enum, dims, colisor) vive em
  `bodies/authoring/shape.ts`. Resolve FR-008 (colisor implícito) sem cerimônia extra.

## D5. `I_inv` — tensor de inércia inverso analítico

- **Fonte**: `LCPSchema` tem `I_inv: vec4f` (diagonal do tensor inverso; `w` reservado). A cena atual usa o
  placeholder `[1,1,1,0]` — **incorreto fisicamente**.
- **Decision**: a fachada calcula a inércia analítica a partir de `mass` + forma e inverte (diagonal):
  - Esfera sólida: `I = (2/5)·m·r²` (isotrópica).
  - Caixa sólida (half-extents h): `Ix = (1/3)·m·(hy²+hz²)`, etc.
  - `inv_mass=0` (estático) → `I_inv = [0,0,0,0]`.
    Implementado em `bodies/authoring/inertia.ts` (puro, testável). Bônus: corrige o placeholder atual.
- **Rationale**: o usuário não deve conhecer tensor de inércia; é derivável de massa+forma.

## D6. Auto-registro de Flow por `schema.name`

- **Fonte**: `flows/*Flow.ts` — ctor `(core, world, resources, options)`, `bodyType` default = `schema.name`;
  registro hoje manual via `app.flows.register(...)` (FlowRegistry).
- **Decision**: um registro `schema.name → (core, world, resources) => Flow` (default factories para
  LCP/XPBD/FEM/MPM/SPH/PBF). A `Application`, ao `world.insert` de um body, verifica o `FlowRegistry`; se não
  houver flow para o `schema.name` do body, instancia e registra a factory default. `register` manual continua
  para casos avançados (e tem precedência — não sobrescreve). Resolve FR-004.
- **Alternatives**: (a) declarar `flows: ['LCP']` na `Application.create` — menos automático; (b) flow
  registrar-se via side-effect de import — frágil/implícito. Escolhido o registro lazy por schema.
- **A verificar na implementação**: ponto de hook exato no `world.insert`/ciclo da `Application` para o
  auto-registro (sem custo por frame; só na primeira inserção de cada schema).

## D7. Fonte única de transform

- **Decision**: a factory recebe `position` (e `rotation` opcional) **uma vez**; escreve `data.pos.xyz` e
  adiciona um `Transform` derivado para o render. O sync runtime física→Transform já existe (o renderer lê o
  Transform atualizado pelos kernels). A duplicação some na _autoria_ (FR-005).
- **A verificar na implementação**: o mecanismo de sync física→Transform por frame (confirmar que escrever só
  `data.pos` na criação basta e o Transform inicial é coerente).

## Itens sem incerteza de decisão (resolvidos por leitura de fonte)

Ordem de `mat_props`/`body_shape`/`pos.w` e fórmulas de inércia são fatos, não escolhas — encapsulados em
funções de fonte única (`matProps.ts`, `shape.ts`, `inertia.ts`) para que qualquer mudança futura de layout
seja um ponto único de alteração.

## Pendências para ratificação (não bloqueiam o design)

- Valores default de material (D3).
- Política de testes C3/C4 (Constituição, TODO TESTING_C3_C4) — esta feature já entrega testes CPU-side da
  tradução, servindo de precedente.
