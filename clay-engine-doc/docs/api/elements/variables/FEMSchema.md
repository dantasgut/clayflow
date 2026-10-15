[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / FEMSchema

# Variable: FEMSchema

> `const` **FEMSchema**: `StructSchema`

Defined in: [elements/physics/bodies/schemas/FEMSchema.ts:11](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/physics/bodies/schemas/FEMSchema.ts#L11)

Schema dos nós soft body integrados pelo FEMFlow (3 vec4f = 48B).
Layout idêntico ao XPBDSoftSchema (mesmo struct WGSL `Particle`); schema
separado para que softs FEM coexistam em pool distinta de softs XPBD
com solvers distintos no mesmo frame. FEM agrega esses nós em tetraedros
via FEMElement (estrutura separada gerenciada pelo FEMFlow).
