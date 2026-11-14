[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / ResourceState

# Enumeration: ResourceState

Defined in: [src/scene/contracts/ResourceState.ts:14](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/ResourceState.ts#L14)

Estados do lifecycle de um Resource. Transições válidas são definidas
pelos `ResourceStateHandler`s correspondentes em `scene/lifecycle/states/`.

Diagrama:
```
Uninitialized → Loading → Ready ⇄ Dirty
      ↑                      ↓
      │                 GpuManaged
      │                      ↓
      └──── Destroyed ← Disposed        (Destroyed → Uninitialized: reinserção após remoção)
```

## Enumeration Members

### Destroyed

> **Destroyed**: `"destroyed"`

Defined in: [src/scene/contracts/ResourceState.ts:34](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/ResourceState.ts#L34)

GPU buffers liberados. A instância pode voltar ao World (reinserção após remoção): segue para
`Uninitialized` e é alocada de novo.

***

### Dirty

> **Dirty**: `"dirty"`

Defined in: [src/scene/contracts/ResourceState.ts:22](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/ResourceState.ts#L22)

App modificou `data` — ResourceSystem precisa fazer re-upload no próximo tick.

***

### Disposed

> **Disposed**: `"disposed"`

Defined in: [src/scene/contracts/ResourceState.ts:29](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/ResourceState.ts#L29)

App removeu do World; ResourceSystem vai liberar recursos GPU.

***

### GpuManaged

> **GpuManaged**: `"gpu-managed"`

Defined in: [src/scene/contracts/ResourceState.ts:27](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/ResourceState.ts#L27)

Resource é gerenciado direto na GPU (writes apenas via compute shader).
CPU não faz upload — `data` é só metadado read-only.

***

### Loading

> **Loading**: `"loading"`

Defined in: [src/scene/contracts/ResourceState.ts:18](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/ResourceState.ts#L18)

ResourceSystem está alocando buffers/bindgroups + uploading inicial.

***

### Ready

> **Ready**: `"ready"`

Defined in: [src/scene/contracts/ResourceState.ts:20](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/ResourceState.ts#L20)

Resource pronto para uso — buffers GPU populados, bindgroups válidos.

***

### Uninitialized

> **Uninitialized**: `"uninitialized"`

Defined in: [src/scene/contracts/ResourceState.ts:16](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/ResourceState.ts#L16)

Estado inicial após `new Resource(...)`. ResourceSystem ainda não viu.
