import { wgslModule } from '../../scene/shaders/WgslModule';
import forwardSource from '../gpu/wgsl/forward.wgsl?raw';

/** Shader do desenho forward (vértice + fragmento), usado pelos materiais padrão. */
export const forward = wgslModule({ name: 'forward', source: forwardSource });
