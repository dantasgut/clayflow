# Function: boxToFEMBody()

> **boxToFEMBody**(`width`, `height`, `depth`, `cellsX`, `cellsY`, `cellsZ`, `opts?`): [`BoxFEMResult`](../interfaces/BoxFEMResult.md)

Defined in: [elements/physics/fem/boxToFEMBody.ts:52](https://github.com/dantasgut/clayflow/blob/206f9504f31474f1f55957b1d36c583844789973/src/elements/physics/fem/boxToFEMBody.ts#L52)

Gera uma malha tetraédrica FEM para uma caixa axis-aligned.

## Parameters

### width

`number`

extensão em X (metros)

### height

`number`

extensão em Y (metros)

### depth

`number`

extensão em Z (metros)

### cellsX

`number`

número de células em X

### cellsY

`number`

número de células em Y

### cellsZ

`number`

número de células em Z

### opts?

[`BoxFEMOptions`](../interfaces/BoxFEMOptions.md) = `{}`

opções de offset e ancoragem

## Returns

[`BoxFEMResult`](../interfaces/BoxFEMResult.md)
