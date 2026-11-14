[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / bindPoints

# Function: bindPoints()

> **bindPoints**(`entry`, `impls`): [`WgslModule`](../interfaces/WgslModule.md)

Defined in: [src/scene/shaders/bindPoints.ts:34](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/bindPoints.ts#L34)

Módulo de entrada com a implementação de cada ponto trocada (spec 009): a árvore de `requires` de `entry` é
reescrita com `impls.get(ponto)` no lugar de `ponto.ready`; módulos sem o pronto na subárvore são reaproveitados.
O resultado se chama `entry@impl[+impl…]` e é memorizado por `(entry, impls)` — o mesmo par devolve o mesmo
módulo, e portanto o mesmo shader montado. Sem impls, devolve `entry`. Lança `WgslCompositionError`
(`point-missing`) se algum ponto não está na árvore de `entry`.

## Parameters

### entry

[`WgslModule`](../interfaces/WgslModule.md)

### impls

`ReadonlyMap`\<[`BindablePoint`](../interfaces/BindablePoint.md), [`WgslModule`](../interfaces/WgslModule.md)\>

## Returns

[`WgslModule`](../interfaces/WgslModule.md)
