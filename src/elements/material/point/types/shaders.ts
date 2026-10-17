import { wgslModule } from '../../../../scene/shaders/WgslModule';
import materialPointTypesSource from '../../../gpu/wgsl/material_point_types.wgsl?raw';

/** Tipos do ponto `material`: `SurfaceSample` e `SurfaceParams`. */
export const materialPointTypes = wgslModule({
    name: 'material_point_types',
    source: materialPointTypesSource,
});
