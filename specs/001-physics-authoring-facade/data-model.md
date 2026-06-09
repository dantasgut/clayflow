# Data Model — Entidades de Autoria (Fase 1)

Entidades **de autoria** (vocabulário de domínio) e seu mapeamento para o núcleo data-oriented
(`schema`+`data`). Nenhuma entidade nova é persistida; são tipos de entrada que traduzem para `Resource`.

## RigidBodyShape (entrada de autoria)

Discriminado por forma:

| Forma  | Campos de domínio                | → `body_shape` vec4 | Colisor anexado                     |
| ------ | -------------------------------- | ------------------- | ----------------------------------- |
| sphere | `radius: number`                 | `[0, r, r, r]`      | `SphereCollider({ radius })`        |
| box    | `halfExtents: [x,y,z]`           | `[1, hx, hy, hz]`   | `BoxCollider({ halfExtents })`      |
| plane  | `normal: vec3`, `offset: number` | (cinemático)        | `PlaneCollider({ normal, offset })` |

## RigidBodyMaterial (entrada de autoria)

| Campo            | Tipo       | Default     | → destino                         |
| ---------------- | ---------- | ----------- | --------------------------------- |
| `mass`           | number ≥ 0 | obrigatório | `pos.w = mass>0 ? 1/mass : 0`     |
| `static`         | boolean    | false       | se true → `inv_mass=0`, `I_inv=0` |
| `friction`       | number     | 0.5         | `mat_props.y`                     |
| `restitution`    | number     | 0.2         | `mat_props.x`                     |
| `linearDamping`  | number     | 0.05        | `mat_props.z`                     |
| `angularDamping` | number     | 0.05        | `mat_props.w`                     |

**Validação (FR-007)**: `mass < 0` → erro "massa deve ser ≥ 0"; `radius<=0`/`halfExtents` com componente ≤0
→ erro de domínio. Mensagens em vocabulário do usuário, antes de qualquer escrita de buffer.

## Transform de autoria

| Campo      | Tipo             | Default     | Efeito                                                  |
| ---------- | ---------------- | ----------- | ------------------------------------------------------- |
| `position` | `[x,y,z]`        | `[0,0,0]`   | `data.pos.xyz` **e** `Transform.position` (fonte única) |
| `rotation` | quat `[x,y,z,w]` | `[0,0,0,1]` | `data.rot` (e `rot_pred`) + `Transform.rotation`        |

## Derivações internas (tradução pura, CPU-side)

```
mass        → inv_mass            (D2)  → pos.w
shape+dims  → body_shape, collider(D4) → body_shape vec4 + Collider
mass+shape  → I_inv (analítico)   (D5)  → I_inv.xyz
material    → mat_props           (D3)  → mat_props vec4 [rest, fric, linD, angD]
position    → pos.xyz + Transform (D7)
```

Cada derivação é uma função pura em `bodies/authoring/` (testável isoladamente — SC-005).

## AlgorithmSelector → Flow

| Seletor (domínio) | schema (pool key) | Flow auto-registrado |
| ----------------- | ----------------- | -------------------- |
| RigidBody (LCP)   | `LCPSchema`       | `LCPFlow`            |
| SoftBody `'XPBD'` | `XPBDSoftSchema`  | `XPBDFlow`           |
| SoftBody `'FEM'`  | `FEMSchema`       | `FEMFlow`            |
| FluidBody `'SPH'` | `SPHSchema`       | `SPHFlow`            |
| FluidBody `'PBF'` | `PBFSchema`       | `PBFFlow`            |
| FluidBody `'MPM'` | `MPMFluidSchema`  | `MPMFlow`            |
| SoftBody `'MPM'`  | `MPMSoftSchema`   | `MPMFlow`            |

O registro mapeia `schema.name → (core,world,resources)=>Flow`. O body já carrega o schema; a `Application`
resolve o flow na primeira inserção daquele schema (D6).

## Soft/Fluid (entrada de autoria — esboço)

`SoftBody.xpbd({ position, particles | fromGeometry, mass, compliance?, ... })`,
`FluidBody.sph({ position, particleCount | particles, ... })` etc. — preenchem `pos`/`vel` (e campos do schema
respectivo) a partir de parâmetros de domínio; detalhes por-algoritmo refinados na fase de tasks/implementação
(os schemas já existem e definem os campos).

## Invariantes

- A fachada produz **exatamente** o mesmo `Resource` que a forma crua equivalente (FR-006) → mesma pool,
  mesma coalescência (FR-010).
- Nenhuma derivação ocorre por frame: tudo na criação.
