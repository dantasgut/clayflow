import { FieldType } from '../../../../scene/descriptors/FieldType';
import { StructSchema } from '../../../../scene/descriptors/StructSchema';

/**
 * Schema dos nós soft body integrados pelo FEMFlow (3 vec4f = 48B).
 * Layout idêntico ao XPBDSoftSchema (mesmo struct WGSL `Particle`); schema
 * separado para que softs FEM coexistam em pool distinta de softs XPBD
 * com solvers distintos no mesmo frame. FEM agrega esses nós em tetraedros
 * via FEMElement (estrutura separada gerenciada pelo FEMFlow).
 */
export const FEMSchema = new StructSchema('FEMSchema', {
    pos: FieldType.vec4f,
    pred: FieldType.vec4f,
    vel: FieldType.vec4f,
});
