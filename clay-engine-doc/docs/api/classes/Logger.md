# Class: Logger

Defined in: [core/debug/Logger.ts:49](https://github.com/dantasgut/clayflow/blob/b3dfee2b900d61c7c75366d8c2100dcee3d4e71a/src/core/debug/Logger.ts#L49)

Logger leve com saída formatada e controle de nível por canal.

Controle via código:
  Logger.setGlobalLevel(LogLevel.DEBUG);

Controle via console do browser (sem tocar no código):
  localStorage.setItem('webgpu:loglevel', 'debug')   // ativa debug
  localStorage.removeItem('webgpu:loglevel')          // volta ao padrão
  — recarregue a página após alterar —

Uso via decorator:

## Loggable

class Foo { declare protected readonly log: Logger; }

## Methods

### debug()

> **debug**(`msg`, ...`data`): `void`

Defined in: [core/debug/Logger.ts:93](https://github.com/dantasgut/clayflow/blob/b3dfee2b900d61c7c75366d8c2100dcee3d4e71a/src/core/debug/Logger.ts#L93)

#### Parameters

##### msg

`string`

##### data

...`unknown`[]

#### Returns

`void`

***

### error()

> **error**(`msg`, ...`data`): `void`

Defined in: [core/debug/Logger.ts:105](https://github.com/dantasgut/clayflow/blob/b3dfee2b900d61c7c75366d8c2100dcee3d4e71a/src/core/debug/Logger.ts#L105)

#### Parameters

##### msg

`string`

##### data

...`unknown`[]

#### Returns

`void`

***

### info()

> **info**(`msg`, ...`data`): `void`

Defined in: [core/debug/Logger.ts:97](https://github.com/dantasgut/clayflow/blob/b3dfee2b900d61c7c75366d8c2100dcee3d4e71a/src/core/debug/Logger.ts#L97)

#### Parameters

##### msg

`string`

##### data

...`unknown`[]

#### Returns

`void`

***

### setLevel()

> **setLevel**(`level`): `this`

Defined in: [core/debug/Logger.ts:82](https://github.com/dantasgut/clayflow/blob/b3dfee2b900d61c7c75366d8c2100dcee3d4e71a/src/core/debug/Logger.ts#L82)

Override de nível para este canal específico.

#### Parameters

##### level

[`LogLevel`](../enumerations/LogLevel.md)

#### Returns

`this`

***

### warn()

> **warn**(`msg`, ...`data`): `void`

Defined in: [core/debug/Logger.ts:101](https://github.com/dantasgut/clayflow/blob/b3dfee2b900d61c7c75366d8c2100dcee3d4e71a/src/core/debug/Logger.ts#L101)

#### Parameters

##### msg

`string`

##### data

...`unknown`[]

#### Returns

`void`

***

### create()

> `static` **create**(`channel`): `Logger`

Defined in: [core/debug/Logger.ts:60](https://github.com/dantasgut/clayflow/blob/b3dfee2b900d61c7c75366d8c2100dcee3d4e71a/src/core/debug/Logger.ts#L60)

Retorna (ou cria) o Logger do canal. Canais são singletons por nome.

#### Parameters

##### channel

`string`

#### Returns

`Logger`

***

### setEnabled()

> `static` **setEnabled**(`enabled`): `void`

Defined in: [core/debug/Logger.ts:77](https://github.com/dantasgut/clayflow/blob/b3dfee2b900d61c7c75366d8c2100dcee3d4e71a/src/core/debug/Logger.ts#L77)

Silencia ou reativa globalmente. Atalho para SILENT / INFO.

#### Parameters

##### enabled

`boolean`

#### Returns

`void`

***

### setGlobalLevel()

> `static` **setGlobalLevel**(`level`): `void`

Defined in: [core/debug/Logger.ts:72](https://github.com/dantasgut/clayflow/blob/b3dfee2b900d61c7c75366d8c2100dcee3d4e71a/src/core/debug/Logger.ts#L72)

Define o nível mínimo global (todos os canais sem override individual).

#### Parameters

##### level

[`LogLevel`](../enumerations/LogLevel.md)

#### Returns

`void`
