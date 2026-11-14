[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / CONSUMER\_MISSING\_FRAMES

# Variable: CONSUMER\_MISSING\_FRAMES

> `const` **CONSUMER\_MISSING\_FRAMES**: `120` = `120`

Defined in: [src/scene/readiness/EngineReadiness.ts:11](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/readiness/EngineReadiness.ts#L11)

Quadros seguidos com o mesmo binding sem fonte num Flow ativo até o aviso `consumerMissing` (2 s a 60 Hz): uma fonte
que chega por upload aparece em um ou dois quadros; uma que nunca chega é um consumidor sem resolvedor (H2).
