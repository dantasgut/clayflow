import { wgslModule } from '../../../scene/shaders/WgslModule';
import pageAllocSource from '../wgsl/pages/page_alloc.wgsl?raw';

/**
 * Alocação de páginas em ordem (spec 034, T060/T060c): a soma de prefixos de um grupo de 256 invocações, comum ao mapa
 * de sombra virtual e às texturas virtuais.
 */
export const pageAlloc = wgslModule({ name: 'page_alloc', source: pageAllocSource });
