import { Entity } from '../../../scene/contracts/Entity';
import { ResourceState } from '../../../scene/contracts/ResourceState';
import type { Resource } from '../../../scene/contracts/Resource';
import type { GPUDescriptor } from '../../../scene/descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../../../scene/descriptors/PipelineDescriptor';
import { FieldType } from '../../../scene/descriptors/FieldType';
import { StructSchema } from '../../../scene/descriptors/StructSchema';
import { GpuWordSchema } from '../../gpu/compute/schemas';
import { VT_MAX_LEVELS, VT_PAGE_STRIDE } from './reference/virtualTexture';
import type { VirtualImage } from './VirtualImage';

/** Palavras do preâmbulo do buffer `words`: imagens, início da tabela, páginas virtuais, início das informações. */
export const VT_PREAMBLE = 4;
/** Palavras do cabeçalho de cada imagem (ver `vt_common.wgsl`). */
export const VT_HEADER = 32;
/** Bits da entrada da tabela: a página física, residente, pendente (alocada, à espera da carga) e a idade. */
export const VT_PHYS_MASK = 0xffff;
export const VT_RESIDENT = 1 << 16;
export const VT_PENDING = 1 << 17;
export const VT_AGE_SHIFT = 24;
/** Páginas carregadas por quadro no máximo (a fila da alocação é um grupo de trabalho). */
export const VT_MAX_BUDGET = 256;

/** Opções de `VirtualTextures`. */
export interface VirtualTexturesOptions {
    /** As imagens (o índice de cada uma é o que o nó `nodes.image.virtual` recebe). */
    readonly images?: readonly VirtualImage[];
    /**
     * Páginas por lado do atlas (o atlas tem o quadrado delas, de 128² texels cada): 4–64, limitado pelo
     * `maxTextureDimension2D` do adaptador na alocação. Padrão 16 (2048², 256 páginas, 16 MB).
     */
    readonly atlasPages?: number;
    /** Páginas carregadas por quadro no máximo (1–256). Padrão 64. */
    readonly budget?: number;
}

/** Dado de `VirtualTextures` (layout de `VirtualTextures.schema`, mais o buffer `words`). */
export interface VirtualTexturesData {
    atlasPages: number;
    budget: number;
    imageCount: number;
    totalPages: number;
    /** O preâmbulo, os cabeçalhos das imagens, a tabela (zerada; a GPU é dona) e a imagem e o nível de cada página. */
    words: Uint32Array;
}

/**
 * Texturas virtuais dos materiais da cena (Camada 3; spec 034, T060c — o modelo das texturas virtuais do Unreal e do
 * id Tech): o cache de páginas de todas as `VirtualImage`. Cada imagem é uma pirâmide de páginas de 120² texels (com
 * borda de 4) e só as páginas pedidas pelos quadros existem na GPU, num atlas `rgba8unorm` (as imagens lineares filtradas
 * pelo hardware; as em sRGB pelo bilinear em luz linear do nó, depois de decodificar cada texel).
 *
 * O nó `nodes.image.virtual` lê a tabela de páginas (o nível pelas derivadas do uv; a página residente mais fina, com a
 * mistura entre dois níveis) e marca a página que queria na série dos pedidos. O `VirtualTextureFlow` do quadro seguinte
 * lê os pedidos (atraso 1), envelhece e solta as páginas não pedidas, aloca as novas (do nível mais grosso ao mais fino,
 * até o orçamento) e a lista vai de volta à CPU, que escreve os texels das páginas no atlas pela C2; a página só vale
 * carimbada na época da série por páginas do atlas (T060a). Descritores:
 *   - `params` (uniforme): páginas por lado do atlas, orçamento, imagens, páginas virtuais;
 *   - `words` (storage): o preâmbulo, os cabeçalhos, a tabela (uma palavra por página virtual) e a imagem e o nível de
 *     cada página — enviado na alocação, depois só a GPU escreve a tabela;
 *   - `requests` (storage, série de 2 fatias): uma palavra por página virtual, o pedido do quadro;
 *   - `atlas` (textura, série por páginas de 128²) e `sampler` (linear, preso na borda).
 */
export class VirtualTextures extends Entity<VirtualTexturesData> implements Resource {
    static readonly schema = new StructSchema('VirtualTextures', {
        atlasPages: FieldType.u32,
        budget: FieldType.u32,
        imageCount: FieldType.u32,
        totalPages: FieldType.u32,
    });

    state: ResourceState = ResourceState.Uninitialized;
    private readonly list: VirtualImage[] = [];

    constructor(options: VirtualTexturesOptions = {}) {
        super();
        const atlasPages = options.atlasPages ?? 16;
        const budget = options.budget ?? 64;
        if (!(Number.isInteger(atlasPages) && atlasPages >= 4 && atlasPages <= 64))
            throw new RangeError(`VirtualTextures: atlasPages ${atlasPages} fora de 4–64.`);
        if (!(Number.isInteger(budget) && budget >= 1 && budget <= VT_MAX_BUDGET))
            throw new RangeError(`VirtualTextures: budget ${budget} fora de 1–${VT_MAX_BUDGET}.`);
        this.list.push(...(options.images ?? []));
        this.data = { atlasPages, budget, ...layout(this.list) };
    }

    /** As imagens, na ordem dos índices. */
    get images(): readonly VirtualImage[] {
        return this.list;
    }

    /** Acrescenta uma imagem e devolve o índice dela (a tabela recomeça: as páginas são pedidas de novo). */
    addImage(image: VirtualImage): number {
        const previous = this.getDescriptors();
        this.list.push(image);
        this.redescribe(previous, { ...this.rawData, ...layout(this.list) });
        return this.list.length - 1;
    }

    getDescriptors(): readonly GPUDescriptor[] {
        const { atlasPages, totalPages, words } = this.rawData;
        const side = atlasPages * VT_PAGE_STRIDE;
        return [
            { id: 'params', role: 'uniform', schema: VirtualTextures.schema },
            {
                id: 'words',
                role: 'storage-rw',
                schema: GpuWordSchema,
                count: words.length,
                upload: 'initial',
            },
            {
                id: 'requests',
                role: 'storage-rw',
                schema: GpuWordSchema,
                count: Math.max(4, totalPages),
                upload: 'never',
                // Os pedidos do quadro: escritos pelo desenho, lidos pelo `VirtualTextureFlow` do quadro seguinte.
                history: { depth: 2 },
            },
            {
                id: 'atlas',
                role: 'texture',
                textureShape: { format: 'rgba8unorm', width: side, height: side },
                // Série por páginas (T060a): o alvo só; cada página física vale carimbada na época da série.
                history: { depth: 1, pages: { tile: [VT_PAGE_STRIDE, VT_PAGE_STRIDE] } },
            },
            {
                id: 'sampler',
                role: 'sampler',
                samplerShape: {
                    magFilter: 'linear',
                    minFilter: 'linear',
                    addressModeU: 'clamp-to-edge',
                    addressModeV: 'clamp-to-edge',
                },
            },
        ];
    }

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [];
    }
}

/** O preâmbulo, os cabeçalhos, a tabela zerada e as informações das páginas das imagens. */
function layout(images: readonly VirtualImage[]): {
    imageCount: number;
    totalPages: number;
    words: Uint32Array;
} {
    const totalPages = images.reduce((n, img) => n + img.pages, 0);
    const tableStart = VT_PREAMBLE + images.length * VT_HEADER;
    const infoStart = tableStart + totalPages;
    const words = new Uint32Array(Math.max(4, infoStart + totalPages));
    words.set([images.length, tableStart, totalPages, infoStart]);
    let first = 0;
    images.forEach((img, i) => {
        const h = VT_PREAMBLE + i * VT_HEADER;
        const avg = img.pyramid.levels[img.levels - 1]!;
        words[h] = img.width;
        words[h + 1] = img.height;
        words[h + 2] = img.levels;
        words[h + 3] = first;
        // O endereçamento (bit 0: prender) e a codificação (bit 1: linear).
        words[h + 4] = (img.wrap === 'clamp' ? 1 : 0) | (img.colorSpace === 'linear' ? 2 : 0);
        words[h + 5] = (avg[0]! | (avg[1]! << 8) | (avg[2]! << 16) | (avg[3]! << 24)) >>> 0;
        words[h + 6] = img.pages;
        words[h + 7] = first + img.bases[img.levels - 1]!;
        for (let l = 0; l < VT_MAX_LEVELS; l++) words[h + 8 + l] = img.bases[l] ?? 0;
        for (let l = 0; l < img.levels; l++) {
            const end = img.bases[l + 1] ?? img.pages;
            for (let p = img.bases[l]!; p < end; p++) words[infoStart + first + p] = i | (l << 16);
        }
        first += img.pages;
    });
    return { imageCount: images.length, totalPages, words };
}
