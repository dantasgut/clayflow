[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [presentation](../README.md) / PostSlots

# Interface: PostSlots

Defined in: [src/presentation/flows/PostFlow.ts:63](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/PostFlow.ts#L63)

Slots do pós-processamento.

## Extends

- [`SlotMap`](../../platform/web/type-aliases/SlotMap.md)

## Indexable

> \[`key`: `string`\]: [`SlotDeclaration`](../../platform/web/type-aliases/SlotDeclaration.md)

## Properties

### antialiasing

> `readonly` **antialiasing**: [`SingletonSlot`](../../platform/web/interfaces/SingletonSlot.md)\<`true`\>

Defined in: [src/presentation/flows/PostFlow.ts:73](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/PostFlow.ts#L73)

Antisserrilhado da cena (spec 034): no modo temporal ou de acumulação, a resolução abre a cadeia.

***

### camera

> `readonly` **camera**: [`SingletonSlot`](../../platform/web/interfaces/SingletonSlot.md)\<`true`\>

Defined in: [src/presentation/flows/PostFlow.ts:83](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/PostFlow.ts#L83)

A câmera ativa e o pool das matrizes (o deslocamento, a anterior e o corte).

***

### cameras

> `readonly` **cameras**: [`PoolSlot`](../../platform/web/interfaces/PoolSlot.md)\<`true`\>

Defined in: [src/presentation/flows/PostFlow.ts:84](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/PostFlow.ts#L84)

***

### depth

> `readonly` **depth**: [`TextureSlot`](../../platform/web/interfaces/TextureSlot.md)\<`true`\>

Defined in: [src/presentation/flows/PostFlow.ts:75](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/PostFlow.ts#L75)

Profundidade da cena (`FrameTargets.depth`): a reprojeção do histórico.

***

### light

> `readonly` **light**: [`TextureSlot`](../../platform/web/interfaces/TextureSlot.md)\<`true`\>

Defined in: [src/presentation/flows/PostFlow.ts:81](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/PostFlow.ts#L81)

A luz que chega a cada pixel (`FrameTargets.light`: direta, total).

***

### motion

> `readonly` **motion**: [`TextureSlot`](../../platform/web/interfaces/TextureSlot.md)\<`true`\>

Defined in: [src/presentation/flows/PostFlow.ts:77](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/PostFlow.ts#L77)

Vetores de movimento (`FrameTargets.motion`).

***

### presentation

> `readonly` **presentation**: [`SingletonSlot`](../../platform/web/interfaces/SingletonSlot.md)\<`true`\>

Defined in: [src/presentation/flows/PostFlow.ts:69](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/PostFlow.ts#L69)

A apresentação da cena (`ToneMapping`); sem ela, a padrão (AgX, 0 EV, pontilhamento).

***

### reactive

> `readonly` **reactive**: [`TextureSlot`](../../platform/web/interfaces/TextureSlot.md)\<`true`\>

Defined in: [src/presentation/flows/PostFlow.ts:79](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/PostFlow.ts#L79)

Máscara reativa (`FrameTargets.reactive`): onde o histórico recomeça.

***

### samples

> `readonly` **samples**: [`TextureSlot`](../../platform/web/interfaces/TextureSlot.md)\<`true`\>

Defined in: [src/presentation/flows/PostFlow.ts:67](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/PostFlow.ts#L67)

Cor multiamostrada da cena (`FrameTargets.samples`; ausente sem MSAA), para o resolve mapeado por amostra.

***

### scene

> `readonly` **scene**: [`TextureSlot`](../../platform/web/interfaces/TextureSlot.md)\<`false`\>

Defined in: [src/presentation/flows/PostFlow.ts:65](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/PostFlow.ts#L65)

Cor HDR resolvida da cena (`FrameTargets.color`).

***

### taaHistory

> `readonly` **taaHistory**: `ChannelSlot`\<`true`\>

Defined in: [src/presentation/flows/PostFlow.ts:86](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/PostFlow.ts#L86)

As séries da resolução temporal (spec 037): a cor, o estado e a luz de cada pixel, a anterior e a do quadro.

***

### taaLight

> `readonly` **taaLight**: `ChannelSlot`\<`true`\>

Defined in: [src/presentation/flows/PostFlow.ts:88](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/PostFlow.ts#L88)

***

### taaState

> `readonly` **taaState**: `ChannelSlot`\<`true`\>

Defined in: [src/presentation/flows/PostFlow.ts:87](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/PostFlow.ts#L87)

***

### target

> `readonly` **target**: [`TargetSlot`](../../platform/web/interfaces/TargetSlot.md)

Defined in: [src/presentation/flows/PostFlow.ts:71](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/PostFlow.ts#L71)

O canvas do quadro (o passe de apresentação).

***

### work

> `readonly` **work**: [`WorkSlot`](../../platform/web/interfaces/WorkSlot.md)\<`PostWork`\>

Defined in: [src/presentation/flows/PostFlow.ts:90](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/PostFlow.ts#L90)

O espaço de trabalho da cadeia: pingue-pongue, sampler, parâmetros (spec 039).
