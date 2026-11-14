[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / WgslPointSignature

# Interface: WgslPointSignature

Defined in: [src/scene/shaders/WgslPoint.ts:17](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/WgslPoint.ts#L17)

Assinatura de uma função de ponto: nome, tipos dos parâmetros (na ordem) e retorno.

## Properties

### alternatives?

> `readonly` `optional` **alternatives?**: readonly `string`[]

Defined in: [src/scene/shaders/WgslPoint.ts:28](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/WgslPoint.ts#L28)

Retornos alternativos aceitos (spec 011): a função pode devolver um deles no lugar de `returns`; quem hospeda o
ponto escolhe o adaptador pelo retorno lido (ex.: o ponto `material` aceita `SurfaceParams` ou `Closure`).

***

### name

> `readonly` **name**: `string`

Defined in: [src/scene/shaders/WgslPoint.ts:19](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/WgslPoint.ts#L19)

Nome da função WGSL.

***

### names?

> `readonly` `optional` **names?**: readonly `string`[]

Defined in: [src/scene/shaders/WgslPoint.ts:33](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/WgslPoint.ts#L33)

Nomes dos parâmetros (spec 031: os argumentos que um grafo de nós lê pelo nome); padrão `a0`, `a1`… O parâmetro
de `POINT_PARAMS` é sempre `data`.

***

### params

> `readonly` **params**: readonly `string`[]

Defined in: [src/scene/shaders/WgslPoint.ts:21](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/WgslPoint.ts#L21)

Tipos WGSL dos parâmetros; `POINT_PARAMS` = struct de parâmetros da função.

***

### returns

> `readonly` **returns**: `string`

Defined in: [src/scene/shaders/WgslPoint.ts:23](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/WgslPoint.ts#L23)

Tipo de retorno (`''` = sem retorno).
