[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / ProbeSlots

# Interface: ProbeSlots

Defined in: [src/elements/lighting/ProbeFlow.ts:66](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/lighting/ProbeFlow.ts#L66)

Slots do estágio das sondas.

## Extends

- [`SlotMap`](../../platform/web/type-aliases/SlotMap.md)

## Indexable

> \[`key`: `string`\]: [`SlotDeclaration`](../../platform/web/type-aliases/SlotDeclaration.md)

## Properties

### camera

> `readonly` **camera**: [`SingletonSlot`](../../platform/web/interfaces/SingletonSlot.md)\<`true`\>

Defined in: [src/elements/lighting/ProbeFlow.ts:72](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/lighting/ProbeFlow.ts#L72)

A câmera ativa (o centro das cascatas).

***

### cameras

> `readonly` **cameras**: [`PoolSlot`](../../platform/web/interfaces/PoolSlot.md)\<`true`\>

Defined in: [src/elements/lighting/ProbeFlow.ts:76](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/lighting/ProbeFlow.ts#L76)

As matrizes das câmeras (o slot da câmera ativa, para a coleta final na tela).

***

### caustics

> `readonly` **caustics**: [`SingletonSlot`](../../platform/web/interfaces/SingletonSlot.md)\<`true`\>

Defined in: [src/elements/lighting/ProbeFlow.ts:85](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/lighting/ProbeFlow.ts#L85)

As cáusticas (spec 034): com elas ativas, as sondas não leem o especular direto de vidro e metal liso.

***

### gi

> `readonly` **gi**: [`SingletonSlot`](../../platform/web/interfaces/SingletonSlot.md)\<`false`\>

Defined in: [src/elements/lighting/ProbeFlow.ts:68](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/lighting/ProbeFlow.ts#L68)

A iluminação global da cena.

***

### giProbes

> `readonly` **giProbes**: `ChannelSlot`\<`false`\>

Defined in: [src/elements/lighting/ProbeFlow.ts:83](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/lighting/ProbeFlow.ts#L83)

A série por páginas das sondas (spec 034, T060b): os carimbos e a época (o histórico de cada sonda vale?) e a
contagem de quadros (as sementes e a rotação das sondas atualizadas).

***

### giScreenHistory

> `readonly` **giScreenHistory**: `ChannelSlot`\<`false`\>

Defined in: [src/elements/lighting/ProbeFlow.ts:78](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/lighting/ProbeFlow.ts#L78)

O histórico das sondas de tela: um canal temporal (spec 037), reservado pelo estágio para o alvo.

***

### rays

> `readonly` **rays**: [`SingletonSlot`](../../platform/web/interfaces/SingletonSlot.md)\<`false`\>

Defined in: [src/elements/lighting/ProbeFlow.ts:70](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/lighting/ProbeFlow.ts#L70)

A estrutura de raios (os raios das sondas).

***

### time

> `readonly` **time**: [`SingletonSlot`](../../platform/web/interfaces/SingletonSlot.md)\<`true`\>

Defined in: [src/elements/lighting/ProbeFlow.ts:74](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/lighting/ProbeFlow.ts#L74)

O tempo simulado (a amostra de superfície dos materiais nos acertos).

***

### work

> `readonly` **work**: [`WorkSlot`](../../platform/web/interfaces/WorkSlot.md)\<`ProbeWork`\>

Defined in: [src/elements/lighting/ProbeFlow.ts:87](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/lighting/ProbeFlow.ts#L87)

O espaço de trabalho das sondas: raios, gerações, radiância, visibilidade, a coleta de tela, a onda (spec 039).
