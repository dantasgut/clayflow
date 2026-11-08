[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / WorkSlot

# Interface: WorkSlot\<R\>

Defined in: [src/scene/flows/slots.ts:176](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/slots.ts#L176)

O Resource de trabalho da instância do Flow (spec 039): o espaço de trabalho que não é de nenhuma entidade nem de um
Resource com um por cena (parâmetros por passo, pares, contadores, filas, a grade do domínio). A C2 chama `create`,
insere o Resource no World quando aloca o Flow e o remove quando o libera — um por instância. Sempre resolvido.

## Type Parameters

### R

`R` *extends* [`Resource`](Resource.md) = [`Resource`](Resource.md)

## Properties

### create

> `readonly` **create**: () => `R`

Defined in: [src/scene/flows/slots.ts:180](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/slots.ts#L180)

Fábrica do Resource de trabalho (chamada uma vez por instância do Flow).

#### Returns

`R`

***

### kind

> `readonly` **kind**: `"work"`

Defined in: [src/scene/flows/slots.ts:178](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/slots.ts#L178)

Discriminante.
