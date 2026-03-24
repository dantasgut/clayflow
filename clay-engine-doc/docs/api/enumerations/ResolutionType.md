# Enumeration: ResolutionType

Defined in: [scene/systems/resolution/ResolutionType.ts:11](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/scene/systems/resolution/ResolutionType.ts#L11)

Enum dos métodos de resolução de colisão disponíveis.

| Tipo                | Características                                                         |
|---------------------|-------------------------------------------------------------------------|
| IMPULSE             | 1 pass por substep. Rápido; pilhas podem tremer.                        |
| SEQUENTIAL_IMPULSE  | K iterações por substep (PGS). Estável para pilhas e stacks.            |
| XPBD                | Extended PBD com compliance α. Suave e incondicionalmente estável.      |
| XPBD_SOFT           | Pipeline XPBD para corpos deformáveis (SoftBody). Sem colisão rígida.  |

## Enumeration Members

### IMPULSE

> **IMPULSE**: `"IMPULSE"`

Defined in: [scene/systems/resolution/ResolutionType.ts:12](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/scene/systems/resolution/ResolutionType.ts#L12)

***

### SEQUENTIAL\_IMPULSE

> **SEQUENTIAL\_IMPULSE**: `"SEQUENTIAL_IMPULSE"`

Defined in: [scene/systems/resolution/ResolutionType.ts:13](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/scene/systems/resolution/ResolutionType.ts#L13)

***

### XPBD

> **XPBD**: `"XPBD"`

Defined in: [scene/systems/resolution/ResolutionType.ts:14](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/scene/systems/resolution/ResolutionType.ts#L14)

***

### XPBD\_SOFT

> **XPBD\_SOFT**: `"XPBD_SOFT"`

Defined in: [scene/systems/resolution/ResolutionType.ts:15](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/scene/systems/resolution/ResolutionType.ts#L15)
