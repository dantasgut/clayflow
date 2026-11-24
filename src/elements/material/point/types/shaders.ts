import { wgslModule } from '../../../../scene/shaders/WgslModule';
import materialPointTypesSource from '../../../gpu/wgsl/material_point_types.wgsl?raw';
import surfaceSampleSource from '../../../gpu/wgsl/surface_sample.wgsl?raw';

/** A amostra de superfície (`SurfaceSample`): o argumento dos pontos `material` e `displacement`. */
export const surfaceSampleType = wgslModule({
    name: 'surface_sample',
    source: surfaceSampleSource,
});

/** Tipos do ponto `material`: `SurfaceSample` (de `surface_sample`) e `SurfaceParams`. */
export const materialPointTypes = wgslModule({
    name: 'material_point_types',
    source: materialPointTypesSource,
    requires: [surfaceSampleType],
});
