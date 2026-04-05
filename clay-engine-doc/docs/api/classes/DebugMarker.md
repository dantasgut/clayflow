# Class: DebugMarker

Defined in: [core/debug/DebugMarker.ts:15](https://github.com/dantasgut/clayflow/blob/7f07eedac2c1cf94d44b78ad841d845219723bba/src/core/debug/DebugMarker.ts#L15)

Marcadores de depuração para GPU (Camada 1).
Mapeia para pushDebugGroup / popDebugGroup / insertDebugMarker do WebGPU,
visíveis em ferramentas de captura (Chrome WebGPU Inspector, RenderDoc).

Controlado por flag global — zero overhead em produção.

## Example

```ts
DebugMarker.push(encoder, 'Frame');
  DebugMarker.push(encoder, 'ForwardPass');
    // ... render commands
  DebugMarker.pop(encoder);
DebugMarker.pop(encoder);
```

## Constructors

### Constructor

> **new DebugMarker**(): `DebugMarker`

#### Returns

`DebugMarker`

## Methods

### disable()

> `static` **disable**(): `void`

Defined in: [core/debug/DebugMarker.ts:19](https://github.com/dantasgut/clayflow/blob/7f07eedac2c1cf94d44b78ad841d845219723bba/src/core/debug/DebugMarker.ts#L19)

#### Returns

`void`

***

### enable()

> `static` **enable**(): `void`

Defined in: [core/debug/DebugMarker.ts:18](https://github.com/dantasgut/clayflow/blob/7f07eedac2c1cf94d44b78ad841d845219723bba/src/core/debug/DebugMarker.ts#L18)

#### Returns

`void`

***

### isEnabled()

> `static` **isEnabled**(): `boolean`

Defined in: [core/debug/DebugMarker.ts:20](https://github.com/dantasgut/clayflow/blob/7f07eedac2c1cf94d44b78ad841d845219723bba/src/core/debug/DebugMarker.ts#L20)

#### Returns

`boolean`

***

### mark()

> `static` **mark**(`encoder`, `label`): `void`

Defined in: [core/debug/DebugMarker.ts:35](https://github.com/dantasgut/clayflow/blob/7f07eedac2c1cf94d44b78ad841d845219723bba/src/core/debug/DebugMarker.ts#L35)

Insere um marcador pontual (snapshot) na fila de comandos GPU.

#### Parameters

##### encoder

`GPUCommandEncoder`

##### label

`string`

#### Returns

`void`

***

### pop()

> `static` **pop**(`encoder`): `void`

Defined in: [core/debug/DebugMarker.ts:29](https://github.com/dantasgut/clayflow/blob/7f07eedac2c1cf94d44b78ad841d845219723bba/src/core/debug/DebugMarker.ts#L29)

Fecha o grupo de debug aberto mais recentemente.

#### Parameters

##### encoder

`GPUCommandEncoder`

#### Returns

`void`

***

### push()

> `static` **push**(`encoder`, `label`): `void`

Defined in: [core/debug/DebugMarker.ts:23](https://github.com/dantasgut/clayflow/blob/7f07eedac2c1cf94d44b78ad841d845219723bba/src/core/debug/DebugMarker.ts#L23)

Abre um grupo de debug hierárquico na fila de comandos GPU.

#### Parameters

##### encoder

`GPUCommandEncoder`

##### label

`string`

#### Returns

`void`
