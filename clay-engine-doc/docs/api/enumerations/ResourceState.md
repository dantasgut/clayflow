# Enumeration: ResourceState

Defined in: [scene/core/ResourceState.ts:5](https://github.com/dantasgut/clayflow/blob/c86fce0a7735698989d78d56ab3a1c0f3b119da1/src/scene/core/ResourceState.ts#L5)

Enumeração que gerencia o ciclo de vida rigoroso de componentes 
(como Geometry e Material) que necessitam de alocação física na Camada 1.

## Enumeration Members

### Destroyed

> **Destroyed**: `5`

Defined in: [scene/core/ResourceState.ts:22](https://github.com/dantasgut/clayflow/blob/c86fce0a7735698989d78d56ab3a1c0f3b119da1/src/scene/core/ResourceState.ts#L22)

Estado terminal após disposeResource. O ResourceLoader ignora este estado.

***

### Dirty

> **Dirty**: `3`

Defined in: [scene/core/ResourceState.ts:16](https://github.com/dantasgut/clayflow/blob/c86fce0a7735698989d78d56ab3a1c0f3b119da1/src/scene/core/ResourceState.ts#L16)

Desenvolvedor alterou vértices/texturas. O buffer na VRAM está defasado e requer update via writeBuffer.

***

### Disposed

> **Disposed**: `4`

Defined in: [scene/core/ResourceState.ts:19](https://github.com/dantasgut/clayflow/blob/c86fce0a7735698989d78d56ab3a1c0f3b119da1/src/scene/core/ResourceState.ts#L19)

Componente marcado para ser destruído da Cena. O ResourceLoader irá desalocar da GPU no próximo frame.

***

### GpuManaged

> **GpuManaged**: `6`

Defined in: [scene/core/ResourceState.ts:30](https://github.com/dantasgut/clayflow/blob/c86fce0a7735698989d78d56ab3a1c0f3b119da1/src/scene/core/ResourceState.ts#L30)

O buffer de vértices é gerenciado por um compute shader GPU.
O ResourceLoader suprime qualquer upload CPU→GPU enquanto neste estado.
Transição: Ready → GpuManaged via Geometry.enterGpuManagedMode().
Saída:      GpuManaged → Dirty   via Geometry.exitGpuManagedMode().

***

### Loading

> **Loading**: `1`

Defined in: [scene/core/ResourceState.ts:10](https://github.com/dantasgut/clayflow/blob/c86fce0a7735698989d78d56ab3a1c0f3b119da1/src/scene/core/ResourceState.ts#L10)

Promessa de compilação em andamento. Protege contra dupla alocação no ECS multithread.

***

### Ready

> **Ready**: `2`

Defined in: [scene/core/ResourceState.ts:13](https://github.com/dantasgut/clayflow/blob/c86fce0a7735698989d78d56ab3a1c0f3b119da1/src/scene/core/ResourceState.ts#L13)

Dados subidos na VRAM com sucesso, IDs de buffer gerados e prontos para RenderExtractor.

***

### Uninitialized

> **Uninitialized**: `0`

Defined in: [scene/core/ResourceState.ts:7](https://github.com/dantasgut/clayflow/blob/c86fce0a7735698989d78d56ab3a1c0f3b119da1/src/scene/core/ResourceState.ts#L7)

Recém-criado, dados crus estão na CPU, aguardando ResourceLoader alocar na GPU.
