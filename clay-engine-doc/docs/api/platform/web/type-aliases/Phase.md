[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / Phase

# Type Alias: Phase

> **Phase** = `"physics"` \| `"transform"` \| `"shadow"` \| `"forward"` \| `"post"` \| `"ui"`

Defined in: [src/scene/flows/Phase.ts:6](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/Phase.ts#L6)

Fase de um Flow no quadro. Ordem fixa: `physics` (integração e colisões) → `transform` (transformações de mundo a
partir dos `Transform`) → `shadow` (mapas de profundidade) → `forward` (render principal) → `post`
(pós-processamento) → `ui`. Dentro da fase: prioridade decrescente; empate pela ordem de registro.
