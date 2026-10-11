[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / FEMSchema

# Variable: FEMSchema

> `const` **FEMSchema**: `StructSchema`

Defined in: [elements/physics/bodies/schemas/FEMSchema.ts:11](https://github.com/dantasgut/clayflow/blob/b17d5d6aad8e58344ec396008fda32fab9b22987/src/elements/physics/bodies/schemas/FEMSchema.ts#L11)

Schema dos nós soft body integrados pelo FEMFlow (3 vec4f = 48B).
Layout idêntico ao XPBDSoftSchema (mesmo struct WGSL `Particle`); schema
separado para que softs FEM coexistam em pool distinta de softs XPBD
com solvers distintos no mesmo frame. FEM agrega esses nós em tetraedros
via FEMElement (estrutura separada gerenciada pelo FEMFlow).
