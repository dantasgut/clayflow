import { wgslModule } from '../../scene/shaders/WgslModule';
import { noise } from '../gpu/shaders/math';
import { materialPointTypes } from '../material/point/shaders';
import mathSource from '../gpu/wgsl/nodes/math.wgsl?raw';
import noiseSource from '../gpu/wgsl/nodes/noise.wgsl?raw';
import colorSource from '../gpu/wgsl/nodes/color.wgsl?raw';
import surfaceSource from '../gpu/wgsl/nodes/surface.wgsl?raw';

/** Nós de matemática (spec 031). */
export const nodeMath = wgslModule({ name: 'node_math', source: mathSource });

/** Nó de ruído de gradiente 3D (spec 031). */
export const nodeNoise = wgslModule({ name: 'node_noise', source: noiseSource, requires: [noise] });

/** Nó de rampa de cor (spec 031). */
export const nodeColor = wgslModule({ name: 'node_color', source: colorSource });

/** Nó de saída do ponto `material` (spec 031). */
export const nodeSurface = wgslModule({
    name: 'node_surface',
    source: surfaceSource,
    requires: [materialPointTypes],
});
