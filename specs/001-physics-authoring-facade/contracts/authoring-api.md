# Contract — Superfície Pública da Fachada de Autoria (Fase 1)

Assinaturas públicas propostas. **Aditivas**: o construtor `{ schema, data }` e `flows.register(...)` manual
permanecem. Tipos ilustrativos (refinados na implementação); `vec3`/`quat` = tuplas numéricas.

## RigidBody (factories estáticas)

```ts
interface RigidBodyMaterialOpts {
  mass?: number;            // ≥ 0; omitido + static:true ⇒ inv_mass=0
  static?: boolean;         // corpo cinemático
  friction?: number;        // default 0.5
  restitution?: number;     // default 0.2
  linearDamping?: number;   // default 0.05
  angularDamping?: number;  // default 0.05
  position?: [number, number, number];          // default [0,0,0]
  rotation?: [number, number, number, number];  // quat, default [0,0,0,1]
}

RigidBody.sphere(opts: RigidBodyMaterialOpts & { radius: number }): RigidBody
RigidBody.box(opts: RigidBodyMaterialOpts & { halfExtents: [number,number,number] }): RigidBody
RigidBody.plane(opts: { normal: [number,number,number]; offset: number;
                        friction?: number; restitution?: number }): RigidBody  // estático
```

**Comportamento**: monta `{ schema: LCPSchema, data }` com `pos.xyz=position`, `pos.w=inv_mass`,
`mat_props=[restitution,friction,linDamp,angDamp]`, `body_shape` e `I_inv` derivados; anexa o colisor
correspondente; adiciona `Transform` derivado de `position`/`rotation`. Valida domínio e lança erro legível
em entrada inválida.

## SoftBody / FluidBody (factories por algoritmo)

```ts
SoftBody.xpbd(opts): SoftBody     // schema XPBDSoftSchema  → XPBDFlow
SoftBody.fem(opts): SoftBody      // schema FEMSchema       → FEMFlow
FluidBody.sph(opts): FluidBody    // schema SPHSchema       → SPHFlow
FluidBody.pbf(opts): FluidBody    // schema PBFSchema       → PBFFlow
FluidBody.mpm(opts): FluidBody    // schema MPMFluidSchema  → MPMFlow
```

`opts` em vocabulário de domínio (`position`, `mass`, contagem/posições de partículas, parâmetros materiais
do algoritmo). Campos exatos por algoritmo definidos na implementação a partir dos schemas existentes.

## Auto-registro de Flow (Application)

```ts
// Comportamento implícito: ao inserir um body, se nenhum Flow atende seu schema.name,
// a Application registra a factory default correspondente. Idempotente; só na 1ª inserção do schema.
app.world.insert(RigidBody.sphere({ position: [0, 4, 0], mass: 1, radius: 0.4 }));
// ⇒ LCPFlow auto-registrado. Sem app.flows.register(...) manual.

// Opt-out / avançado: registro manual continua e tem precedência.
app.flows.register(
  new LCPFlow(app.core, app.world, app.resources, {
    /* tuning */
  }),
);
```

## Retrocompatibilidade (FR-006)

```ts
// Forma crua continua válida e coexiste com a fachada na mesma cena:
new RigidBody({ schema: LCPSchema, data: { pos:[…], mat_props:[…], body_shape:[…], … } });
```

## Contrato de erros (FR-007)

- `mass < 0` → `Error("RigidBody: massa deve ser ≥ 0")`.
- `radius <= 0` / `halfExtents` com componente ≤ 0 → erro de domínio.
- Algoritmo/forma sem flow/colisor disponível → erro claro na criação/inserção, não falha silenciosa de GPU.
