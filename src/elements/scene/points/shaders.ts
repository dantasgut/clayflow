import { wgslModule } from '../../../scene/shaders/WgslModule';
import { constants, shadowVirtual } from '../../gpu/shaders/math';
import shadowVirtualReadSource from '../../gpu/wgsl/math/shadow_virtual_read.wgsl?raw';
import shadowVirtualThicknessSource from '../../gpu/wgsl/math/shadow_virtual_thickness.wgsl?raw';
import { shadowCasterAtlasResource } from '../resources';

/** A leitura do mapa que projeta (T060h): a tabela e a penumbra pelo atlas em buffer (`shadow_atlas`). */
export const shadowVirtualRead = wgslModule({
    name: 'shadow_virtual_read',
    source: shadowVirtualReadSource,
    requires: [constants, shadowVirtual, shadowCasterAtlasResource],
});

/**
 * A espessura do corpo entre a luz e um ponto pelo mapa que projeta (spec 011, T113): da primeira superfície que a luz
 * vê até o ponto, e a inclinação dessa superfície — a luz que atravessa as partes finas de um material com
 * subsuperfície.
 */
export const shadowVirtualThickness = wgslModule({
    name: 'shadow_virtual_thickness',
    source: shadowVirtualThicknessSource,
    requires: [shadowVirtual, shadowVirtualRead],
});
