# Contract — Superfície Pública da Fachada de Autoria (Fase 1)

Padrão: **construtor de vocabulário de domínio na classe concreta** (igual a `StandardMaterial`/`BoxGeometry`).
**Aditivo**: a forma crua `{ schema, data }` e o `flows.register(...)` manual permanecem. Tipos ilustrativos
(refinados na implementação); `vec3`/`quat` = tuplas numéricas.

## RigidBody — construtor de domínio

```ts
// Material + transform (campos nomeados; defaults entre parênteses)
interface RigidBodyBase {
  mass?: number;            // ≥ 0; omitido + static:true ⇒ inv_mass=0
  static?: boolean;
  friction?: number;        // (0.5)
  restitution?: number;     // (0.2)
  linearDamping?: number;   // (0.05)
  angularDamping?: number;  // (0.05)
  position?: [number, number, number];          // ([0,0,0])
  rotation?: [number, number, number, number];  // quat ([0,0,0,1])
}

// Forma discriminada (deriva body_shape + colisor coerente — FR-008)
type RigidBodyDomainOpts = RigidBodyBase & (
  | { shape: 'sphere'; radius: number }
  | { shape: 'box'; halfExtents: [number, number, number] }
  | { shape: 'plane'; normal: [number, number, number]; offset: number }   // estático
);

// Overload cru (avançado, retrocompat — FR-006)
type RigidBodyRawOpts = { schema: StructSchema; data: Record<string, unknown> };

new RigidBody(opts: RigidBodyDomainOpts | RigidBodyRawOpts): RigidBody
// Discriminação: 'schema' in opts ⇒ caminho cru; senão ⇒ caminho de domínio.
```

**Comportamento (domínio)**: monta `{ schema: LCPSchema, data }` com `pos.xyz=position`, `pos.w=inv_mass`,
`mat_props=[restitution,friction,linDamp,angDamp]`, `body_shape` e `I_inv` (setup-time) derivados — helpers
co-localizados em `RigidBody.ts`. A forma do body deriva o colisor coerente (auto, FR-008). Valida domínio e
lança erro legível em entrada inválida.

## SoftBody / FluidBody — construtor de domínio por algoritmo

```ts
new SoftBody(opts: { algorithm: 'XPBD' | 'FEM'; position?; mass?; /* params do algoritmo */ }
                    | { schema; data }): SoftBody
new FluidBody(opts: { algorithm: 'SPH' | 'PBF' | 'MPM'; position?; /* params */ }
                    | { schema; data }): FluidBody
```

`algorithm` seleciona o schema interno (XPBDSoftSchema/FEMSchema; SPHSchema/PBFSchema/MPMFluidSchema). Campos
de domínio por algoritmo definidos na implementação a partir dos schemas existentes. Raw `{ schema, data }`
permanece como overload.

## Auto-registro de Flow (Application)

```ts
// Implícito: ao inserir um body, se nenhum Flow atende seu schema.name, a Application registra
// a factory default do FlowRegistry. Idempotente; só na 1ª inserção daquele schema.
app.world.insert(new RigidBody({ shape: 'sphere', radius: 0.4, mass: 1, position: [0, 4, 0] }));
// ⇒ LCPFlow auto-registrado. Sem app.flows.register(...) manual.

// Avançado: registro manual continua e tem precedência (não é sobrescrito).
app.flows.register(
  new LCPFlow(app.core, app.world, app.resources, {
    /* tuning */
  }),
);
```

## Retrocompatibilidade (FR-006)

```ts
// Forma crua continua válida e coexiste com o construtor de domínio na mesma cena:
new RigidBody({ schema: LCPSchema, data: { pos:[…], mat_props:[…], body_shape:[…], … } });
```

## Contrato de erros (FR-007)

- `mass < 0` → `Error("RigidBody: massa deve ser ≥ 0")`.
- `radius <= 0` / `halfExtents` com componente ≤ 0 → erro de domínio.
- `algorithm`/`shape` sem flow/colisor disponível → erro claro na criação/inserção, não falha silenciosa de GPU.
