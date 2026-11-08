[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / BodyEnergySchema

# Variable: BodyEnergySchema

> `const` **BodyEnergySchema**: [`StructSchema`](../../platform/web/classes/StructSchema.md)

Defined in: [src/elements/physics/energy/schemas.ts:17](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/energy/schemas.ts#L17)

A energia de um corpo rígido num passo (J), uma fatia do canal temporal `BodyEnergy` (o pool divide o slot com o
corpo): a cinética (translação + rotação), a potencial no campo uniforme, a potência dissipada no passo (W:
(E_anterior − E)/dt) e a energia dissipada na janela (E de 7 passos atrás − E). As duas últimas valem 0 enquanto a
série não tem a fatia de que precisam.
