[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / SoftBodyEnergySchema

# Variable: SoftBodyEnergySchema

> `const` **SoftBodyEnergySchema**: [`StructSchema`](../../platform/web/classes/StructSchema.md)

Defined in: [src/elements/physics/energy/schemas.ts:89](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/energy/schemas.ts#L89)

A energia de um corpo mole num passo (J), uma fatia do canal temporal `SoftBodyEnergy`: a cinética (½·m·|v|² das
partículas), a potencial no campo uniforme, a elástica pelo modelo do algoritmo (XPBD: ½·C²/α das arestas com α > 0;
MPM: V₀·ψ(F), Neo-Hookean; FEM: 0, sem modelo elástico no motor), a potência dissipada no passo (W) e a energia
dissipada na janela — as duas últimas 0 enquanto a série não tem a fatia de que precisam.
