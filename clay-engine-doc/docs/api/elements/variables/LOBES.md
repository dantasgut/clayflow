[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / LOBES

# Variable: LOBES

> `const` **LOBES**: `object`

Defined in: [src/elements/material/pbr/lobes.ts:5](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/material/pbr/lobes.ts#L5)

Lobos do fechamento (spec 011, R5) e os bits da máscara de especialização (`CLOSURE_LOBES` no WGSL; os mesmos valores
de `CLOSURE_*` em `closure.wgsl`). Os nós de material declaram os lobos que produzem pela marca `lobe:<nome>`.

## Type Declaration

### anisotropy

> `readonly` **anisotropy**: `256` = `256`

### coat

> `readonly` **coat**: `4` = `4`

### diffuse

> `readonly` **diffuse**: `1` = `1`

### emission

> `readonly` **emission**: `64` = `64`

### opacity

> `readonly` **opacity**: `512` = `512`

### sheen

> `readonly` **sheen**: `8` = `8`

### specular

> `readonly` **specular**: `2` = `2`

### subsurface

> `readonly` **subsurface**: `32` = `32`

### thinFilm

> `readonly` **thinFilm**: `128` = `128`

### translucent

> `readonly` **translucent**: `1024` = `1024`

### transmission

> `readonly` **transmission**: `16` = `16`
