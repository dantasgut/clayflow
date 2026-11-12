import { defineNode } from '../../../scene/graph/NodeDefinition';
import { nodeImage } from '../../material/virtual/shaders';

// Nó da imagem virtual (spec 034, T060c). Referência: `material/virtual/reference/virtualTexture.ts` (`vtSample`).

/**
 * A cor (luz linear) e a opacidade da `VirtualImage` de índice `image` nas `VirtualTextures` da cena, no uv `uv` (padrão
 * o da amostra), filtrada pelas derivadas do uv na tela (`duvdx`, `duvdy`; padrão as da amostra — no acerto de um raio,
 * as do cone): o nível pela pegada do pixel, a página residente mais fina a partir dele e a mistura entre dois níveis. A
 * página que faltava é pedida e chega em poucos quadros; até lá, a de um nível mais grosso. Depende de um recurso da cena
 * (as `VirtualTextures`): fica fora dos nós de ponto da biblioteca (`pointNodes`), com a referência e os testes próprios.
 */
const virtual = defineNode({
    name: 'image.virtual',
    inputs: { uv: 'vec2f', duvdx: 'vec2f', duvdy: 'vec2f' },
    outputs: { color: 'vec3f', alpha: 'f32' },
    defaults: { uv: 's.uv', duvdx: 's.duvdx', duvdy: 's.duvdy' },
    params: { image: { type: 'u32', default: 0 } },
    code: nodeImage,
    fn: 'node_image_virtual',
});

/** Imagens nos materiais. */
export const image = { virtual } as const;
