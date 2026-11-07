import { wgslModule } from '../../../scene/shaders/WgslModule';
import { shadowVirtual } from '../../gpu/shaders/math';
import shadowVirtualReadSource from '../../gpu/wgsl/math/shadow_virtual_read.wgsl?raw';
import { shadowCasterAtlasResource } from '../resources';

/** A leitura do mapa que projeta (T060h): a tabela e a penumbra pelo atlas em buffer (`shadow_atlas`). */
export const shadowVirtualRead = wgslModule({
    name: 'shadow_virtual_read',
    source: shadowVirtualReadSource,
    requires: [shadowVirtual, shadowCasterAtlasResource],
});
