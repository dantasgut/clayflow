[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / WorkPart

# Interface: WorkPart

Defined in: [src/scene/flows/FlowWork.ts:18](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowWork.ts#L18)

Parte do espaço de trabalho de um Flow (spec 039): quem precisa de dado de GPU além do da cena — os parâmetros por
passo, os níveis de uma soma de prefixos, as listas de uma busca de vizinhos — declara os descritores dele, com ids
próprios (um prefixo por instância). Os descritores mudam quando a capacidade da parte muda; o `FlowWork` dono se
redescreve no `refresh()`.

## Methods

### descriptors()

> **descriptors**(): readonly [`GPUDescriptor`](GPUDescriptor.md)[]

Defined in: [src/scene/flows/FlowWork.ts:20](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowWork.ts#L20)

Os descritores atuais da parte (ids únicos no Resource de trabalho).

#### Returns

readonly [`GPUDescriptor`](GPUDescriptor.md)[]
