# Enumeration: CollisionAlgorithmType

Defined in: [scene/systems/collision/CollisionAlgorithmType.ts:17](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/scene/systems/collision/CollisionAlgorithmType.ts#L17)

Enum dos algoritmos de detecção de colisão narrowphase disponíveis.

Usado em NarrowphaseConfig para configurar qual algoritmo o CollisionDispatcher
instancia para cada par de formas.

AABB é intencionalmente excluído: pertence exclusivamente ao broadphase.

| Tipo              | Formas alvo         | Características                             |
|-------------------|---------------------|---------------------------------------------|
| SAT               | OBB vs OBB          | Exato, 15 eixos, manifold multi-ponto        |
| GJK_EPA           | Convexas genéricas  | Iterativo, suporte a formas arbitrárias     |
| PLANE_ANALYTIC    | Plano vs qualquer   | Gradiente SDF + clipping; sem iteração      |
| SPHERE_ANALYTIC   | Esfera vs Esfera    | Distância entre centros; O(1)               |
| SDF_GRADIENT      | Qualquer par c/ SDF | Fallback genérico via gradiente numérico    |

## Enumeration Members

### GJK\_EPA

> **GJK\_EPA**: `"GJK_EPA"`

Defined in: [scene/systems/collision/CollisionAlgorithmType.ts:19](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/scene/systems/collision/CollisionAlgorithmType.ts#L19)

***

### PLANE\_ANALYTIC

> **PLANE\_ANALYTIC**: `"PLANE_ANALYTIC"`

Defined in: [scene/systems/collision/CollisionAlgorithmType.ts:20](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/scene/systems/collision/CollisionAlgorithmType.ts#L20)

***

### SAT

> **SAT**: `"SAT"`

Defined in: [scene/systems/collision/CollisionAlgorithmType.ts:18](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/scene/systems/collision/CollisionAlgorithmType.ts#L18)

***

### SDF\_GRADIENT

> **SDF\_GRADIENT**: `"SDF_GRADIENT"`

Defined in: [scene/systems/collision/CollisionAlgorithmType.ts:22](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/scene/systems/collision/CollisionAlgorithmType.ts#L22)

***

### SPHERE\_ANALYTIC

> **SPHERE\_ANALYTIC**: `"SPHERE_ANALYTIC"`

Defined in: [scene/systems/collision/CollisionAlgorithmType.ts:21](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/scene/systems/collision/CollisionAlgorithmType.ts#L21)
