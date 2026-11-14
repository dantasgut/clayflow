[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / BindingFrequency

# Type Alias: BindingFrequency

> **BindingFrequency** = `"frame"` \| `"stage"` \| `"batch"` \| `"draw"`

Defined in: [src/scene/shaders/WgslResource.ts:12](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/WgslResource.ts#L12)

Frequência com que a fonte de um recurso muda durante a gravação de um quadro (spec 031, R2) — decide o grupo:
`frame` (igual para todos os pipelines e passes do quadro: câmeras, luzes, tempo), `stage` (igual para os pipelines
de um estágio: matrizes de mundo, registros de desenho), `batch` (muda entre grupos de desenho: pool de material,
registros de função) e `draw` (do pipeline ou da chamada: vértices, parâmetros por despacho). O grupo de um recurso
é o posto da sua frequência entre as presentes no shader.
