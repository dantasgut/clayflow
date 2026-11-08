[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / WorkContext

# Interface: WorkContext

Defined in: [src/scene/flows/FlowWork.ts:69](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowWork.ts#L69)

O que uma parte do espaço de trabalho recebe (spec 039): o Resource de trabalho dono (com os pipelines do Flow dono,
`work.pipelines`), o diretório da C2 (os objetos alocados, `writeRegions`, `read`) e o core só para consultas.

## Properties

### core

> `readonly` **core**: [`EngineCore`](EngineCore.md)

Defined in: [src/scene/flows/FlowWork.ts:71](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowWork.ts#L71)

O core da cena, só para consultas (as capacidades do adaptador): nenhum objeto de GPU é criado por ele.

***

### resources

> `readonly` **resources**: [`ResourceDirectory`](ResourceDirectory.md)

Defined in: [src/scene/flows/FlowWork.ts:73](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowWork.ts#L73)

O diretório da C2: os objetos alocados para os descritores do trabalho.

***

### work

> `readonly` **work**: [`FlowWork`](../classes/FlowWork.md)

Defined in: [src/scene/flows/FlowWork.ts:75](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowWork.ts#L75)

O Resource de trabalho dono das partes.
