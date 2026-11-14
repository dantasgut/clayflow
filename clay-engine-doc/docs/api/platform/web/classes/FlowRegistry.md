[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / FlowRegistry

# Class: FlowRegistry

Defined in: [src/scene/flows/FlowRegistry.ts:93](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowRegistry.ts#L93)

Registro dos estágios da cena, por factory. A ordem do quadro é a regra única do documento: fases fixas
(`PHASE_ORDER`); dentro da fase, `priority` decrescente; empate pela ordem de registro. A seleção do Flow de um tipo
de corpo segue a mesma regra: `override` → maior `priority` → último registrado.

Registros com `bodyType` não instanciam nada até o pool existir; a C2 (`ResourceSystem`) emite `poolCreated` e o
registro instancia o vencedor, que é alocado (`ensureFlowAllocated`) e só entra no quadro depois de `flowReady`.

## Constructors

### Constructor

> **new FlowRegistry**(`host?`): `FlowRegistry`

Defined in: [src/scene/flows/FlowRegistry.ts:98](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowRegistry.ts#L98)

#### Parameters

##### host?

[`FlowRegistryHost`](../interfaces/FlowRegistryHost.md)

#### Returns

`FlowRegistry`

## Methods

### allFlows()

> **allFlows**(): `IterableIterator`\<[`Flow`](Flow.md)\<`Readonly`\<`Record`\<`string`, [`SlotDeclaration`](../type-aliases/SlotDeclaration.md)\>\>, `string`\>\>

Defined in: [src/scene/flows/FlowRegistry.ts:177](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowRegistry.ts#L177)

Todos os estágios instanciados, na ordem do quadro.

#### Returns

`IterableIterator`\<[`Flow`](Flow.md)\<`Readonly`\<`Record`\<`string`, [`SlotDeclaration`](../type-aliases/SlotDeclaration.md)\>\>, `string`\>\>

***

### allRegistrations()

> **allRegistrations**(): readonly [`FlowRegistration`](../interfaces/FlowRegistration.md)\<[`Flow`](Flow.md)\<`Readonly`\<`Record`\<`string`, [`SlotDeclaration`](../type-aliases/SlotDeclaration.md)\>\>, `string`\>\>[]

Defined in: [src/scene/flows/FlowRegistry.ts:156](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowRegistry.ts#L156)

Todos os registros, na ordem de registro.

#### Returns

readonly [`FlowRegistration`](../interfaces/FlowRegistration.md)\<[`Flow`](Flow.md)\<`Readonly`\<`Record`\<`string`, [`SlotDeclaration`](../type-aliases/SlotDeclaration.md)\>\>, `string`\>\>[]

***

### dispose()

> **dispose**(): `void`

Defined in: [src/scene/flows/FlowRegistry.ts:182](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowRegistry.ts#L182)

Desregistra tudo e desfaz as inscrições (descarte da cena).

#### Returns

`void`

***

### flowsInPhase()

> **flowsInPhase**(`phase`): readonly [`Flow`](Flow.md)\<`Readonly`\<`Record`\<`string`, [`SlotDeclaration`](../type-aliases/SlotDeclaration.md)\>\>, `string`\>[]

Defined in: [src/scene/flows/FlowRegistry.ts:161](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowRegistry.ts#L161)

Instâncias existentes na fase, na ordem do quadro.

#### Parameters

##### phase

[`Phase`](../type-aliases/Phase.md)

#### Returns

readonly [`Flow`](Flow.md)\<`Readonly`\<`Record`\<`string`, [`SlotDeclaration`](../type-aliases/SlotDeclaration.md)\>\>, `string`\>[]

***

### override()

> **override**\<`F`\>(`bodyType`, `factory`, `options`): [`FlowRegistration`](../interfaces/FlowRegistration.md)\<`F`\>

Defined in: [src/scene/flows/FlowRegistry.ts:123](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowRegistry.ts#L123)

Substitui o Flow de `bodyType`: o registro vence a prioridade dos demais para esse tipo de corpo.

#### Type Parameters

##### F

`F` *extends* [`Flow`](Flow.md)\<`Readonly`\<`Record`\<`string`, [`SlotDeclaration`](../type-aliases/SlotDeclaration.md)\>\>, `string`\>

#### Parameters

##### bodyType

`string`

##### factory

[`FlowFactory`](../type-aliases/FlowFactory.md)\<`F`\>

##### options

`Omit`\<[`RegisterOptions`](../interfaces/RegisterOptions.md), `"bodyType"`\>

#### Returns

[`FlowRegistration`](../interfaces/FlowRegistration.md)\<`F`\>

***

### phasesInOrder()

> **phasesInOrder**(): readonly [`Phase`](../type-aliases/Phase.md)[]

Defined in: [src/scene/flows/FlowRegistry.ts:172](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowRegistry.ts#L172)

Ordem fixa das fases.

#### Returns

readonly [`Phase`](../type-aliases/Phase.md)[]

***

### register()

> **register**\<`F`\>(`factory`, `options`): [`FlowRegistration`](../interfaces/FlowRegistration.md)\<`F`\>

Defined in: [src/scene/flows/FlowRegistry.ts:113](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowRegistry.ts#L113)

Registra uma factory. Sem `bodyType`, instancia e aloca agora; com `bodyType`, instancia quando o pool existir
e o registro vencer a seleção.

#### Type Parameters

##### F

`F` *extends* [`Flow`](Flow.md)\<`Readonly`\<`Record`\<`string`, [`SlotDeclaration`](../type-aliases/SlotDeclaration.md)\>\>, `string`\>

#### Parameters

##### factory

[`FlowFactory`](../type-aliases/FlowFactory.md)\<`F`\>

##### options

[`RegisterOptions`](../interfaces/RegisterOptions.md)

#### Returns

[`FlowRegistration`](../interfaces/FlowRegistration.md)\<`F`\>

#### Throws

FlowRegistrationError se `type` já está registrado na fase ou `bodyType` é vazio.

***

### resolve()

> **resolve**(`bodyType`): [`FlowRegistration`](../interfaces/FlowRegistration.md)\<[`Flow`](Flow.md)\<`Readonly`\<`Record`\<`string`, [`SlotDeclaration`](../type-aliases/SlotDeclaration.md)\>\>, `string`\>\> \| `undefined`

Defined in: [src/scene/flows/FlowRegistry.ts:146](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowRegistry.ts#L146)

Registro que atende `bodyType`: override → maior prioridade → último registrado.

#### Parameters

##### bodyType

`string`

#### Returns

[`FlowRegistration`](../interfaces/FlowRegistration.md)\<[`Flow`](Flow.md)\<`Readonly`\<`Record`\<`string`, [`SlotDeclaration`](../type-aliases/SlotDeclaration.md)\>\>, `string`\>\> \| `undefined`

***

### unregister()

> **unregister**(`registration`): `boolean`

Defined in: [src/scene/flows/FlowRegistry.ts:135](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowRegistry.ts#L135)

Remove um registro: descarta a instância (objetos de GPU, inscrições, compilação em
curso) e, para `bodyType`, instancia o próximo vencedor. Devolve `false` se não estava registrado.

#### Parameters

##### registration

[`FlowRegistration`](../interfaces/FlowRegistration.md)

#### Returns

`boolean`
