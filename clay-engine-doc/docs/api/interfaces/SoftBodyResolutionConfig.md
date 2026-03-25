# Interface: SoftBodyResolutionConfig

Defined in: [scene/systems/simulation/SoftBodySimConfig.ts:11](https://github.com/dantasgut/clayflow/blob/c86fce0a7735698989d78d56ab3a1c0f3b119da1/src/scene/systems/simulation/SoftBodySimConfig.ts#L11)

Config mínima de resolução para o pipeline SoftBody.

Mantida separada de `ResolutionConfig` (que é exclusiva do pipeline RigidBody)
para deixar explícita a independência entre os dois pipelines.
O único tipo suportado atualmente é `XPBD` — o campo existe para documentação
e para tornar a seleção de pipeline simétrica em relação ao RigidBody.

## Properties

### type?

> `optional` **type?**: [`XPBD`](../enumerations/ResolutionType.md#xpbd)

Defined in: [scene/systems/simulation/SoftBodySimConfig.ts:17](https://github.com/dantasgut/clayflow/blob/c86fce0a7735698989d78d56ab3a1c0f3b119da1/src/scene/systems/simulation/SoftBodySimConfig.ts#L17)

Tipo de pipeline para corpos deformáveis.
Atualmente apenas `ResolutionType.XPBD` é implementado (e é o default).
Campo reservado para futuros backends (GPU spring-mass, FEM, MPM).
