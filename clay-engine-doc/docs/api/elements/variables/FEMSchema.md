[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / FEMSchema

# Variable: FEMSchema

> `const` **FEMSchema**: [`StructSchema`](../../platform/web/classes/StructSchema.md)

Defined in: [src/elements/physics/bodies/schemas/FEMSchema.ts:11](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/bodies/schemas/FEMSchema.ts#L11)

Schema dos nós soft body integrados pelo FEMFlow (3 vec4f = 48B).
Layout idêntico ao XPBDSoftSchema (mesmo struct WGSL `Particle`); schema
separado para que softs FEM coexistam em pool distinta de softs XPBD
com solvers distintos no mesmo frame. FEM agrega esses nós em tetraedros
via FEMElement (estrutura separada gerenciada pelo FEMFlow).
