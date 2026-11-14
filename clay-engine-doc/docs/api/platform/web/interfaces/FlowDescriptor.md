[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / FlowDescriptor

# Interface: FlowDescriptor

Defined in: [src/scene/descriptors/FlowDescriptor.ts:9](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/FlowDescriptor.ts#L9)

FlowDescriptor declara qual flow integra um Resource. Usado por
Resources que querem auto-roteamento (RigidBody → LCPFlow ou XPBDFlow,
SoftBody → XPBDFlow/FEMFlow/MPMFlow, etc.).

O FlowRegistry mapeia `bodyType` → flow concreto; o FlowDescriptor
é a "request" do Resource ("integrar-me com algoritmo X").

## Properties

### algorithm

> `readonly` **algorithm**: `string`

Defined in: [src/scene/descriptors/FlowDescriptor.ts:11](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/FlowDescriptor.ts#L11)

Nome do algoritmo (e.g. 'LCP', 'XPBD', 'SPH', 'MPM').

***

### bodyType

> `readonly` **bodyType**: `string`

Defined in: [src/scene/descriptors/FlowDescriptor.ts:13](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/FlowDescriptor.ts#L13)

BodyType chave usada pelo FlowRegistry (e.g. 'RigidBody', 'SoftBody').
