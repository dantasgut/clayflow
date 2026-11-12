import { wgslModule } from '../../../scene/shaders/WgslModule';
import { wgslResource } from '../../../scene/shaders/WgslResource';
import { WORKGROUP_SIZE } from '../../../scene/shaders/engineConstants';
import { FieldType } from '../../../scene/descriptors/FieldType';
import { StructSchema } from '../../../scene/descriptors/StructSchema';
import { color } from '../../gpu/shaders/math';
import { pageAlloc } from '../../gpu/shaders/pageAlloc';
import vtCommonSource from '../../gpu/wgsl/virtual/vt_common.wgsl?raw';
import vtPagesSource from '../../gpu/wgsl/virtual/vt_pages.wgsl?raw';
import imageSource from '../../gpu/wgsl/nodes/image.wgsl?raw';
import { VirtualTextures } from './VirtualTextures';

// Texturas virtuais dos materiais (spec 034, T060c): a disposição comum, o nó da imagem (os recursos das
// `VirtualTextures` da cena pelos resolvers `VirtualTextures.*`) e os kernels das páginas do `VirtualTextureFlow`.

/** A disposição comum ao nó e aos kernels (páginas, cabeçalho, bits da tabela). */
export const vtCommon = wgslModule({ name: 'vt_common', source: vtCommonSource });

/** Os cabeçalhos, a tabela e as informações das páginas (resolver `VirtualTextures.words`), só lidos no nó. */
const wordsResource = wgslResource({
    name: 'vt_words',
    binding: { storage: 'read' },
    type: { wgsl: 'u32', array: true },
    frequency: 'frame',
    provider: { consumer: 'VirtualTextures.words' },
});

/** Os pedidos do quadro (a fatia atual da série; resolver `VirtualTextures.requests`). */
const requestsResource = wgslResource({
    name: 'vt_requests',
    binding: { storage: 'read_write' },
    type: { wgsl: 'atomic<u32>', array: true },
    frequency: 'frame',
    provider: { consumer: 'VirtualTextures.requests' },
});

/** O atlas das páginas (resolver `VirtualTextures.atlas`). */
const atlasResource = wgslResource({
    name: 'vt_atlas',
    binding: { texture: { sample: 'f32' } },
    frequency: 'frame',
    provider: { consumer: 'VirtualTextures.atlas' },
});

/** O amostrador do atlas, linear e preso na borda (resolver `VirtualTextures.sampler`). */
const samplerResource = wgslResource({
    name: 'vt_sampler',
    binding: { sampler: 'filtering' },
    frequency: 'frame',
    provider: { consumer: 'VirtualTextures.sampler' },
});

/** Nó da imagem virtual (`nodes.image.virtual`): a cor da imagem no uv pelas páginas residentes. */
export const nodeImage = wgslModule({
    name: 'node_image',
    source: imageSource,
    requires: [vtCommon, color, wordsResource, requestsResource, atlasResource, samplerResource],
});

/**
 * Parâmetros do quadro do `VirtualTextureFlow`: os pedidos do quadro anterior valem? quantas cargas a CPU fez; a CPU lê
 * de volta a lista deste quadro (só então a GPU aloca: nenhuma alocação se perde sem leitura).
 */
export const VirtualTextureFrameSchema = new StructSchema('VirtualTextureFrame', {
    requestsValid: FieldType.u32,
    commits: FieldType.u32,
    allocate: FieldType.u32,
    _pad0: FieldType.u32,
});

/** Slots do `VirtualTextureFlow` que ligam os recursos dos kernels. */
export const vtSlots = {
    cache: 'cache',
    requests: 'requests',
    atlas: 'atlas',
    work: 'work',
} as const;

/** Recursos dos kernels das páginas. */
export const vtPageResources = {
    cache: wgslResource({
        name: 'vt_cache',
        binding: { uniform: true },
        type: { schema: VirtualTextures.schema },
        frequency: 'stage',
        provider: { slot: vtSlots.cache, descriptor: 'params' },
    }),
    table: wgslResource({
        name: 'vt_table',
        binding: { storage: 'read_write' },
        type: { wgsl: 'u32', array: true },
        frequency: 'stage',
        provider: { slot: vtSlots.cache, descriptor: 'words' },
    }),
    requestsPrevious: wgslResource({
        name: 'vt_requests_previous',
        binding: { storage: 'read' },
        type: { wgsl: 'u32', array: true },
        frequency: 'stage',
        provider: { slot: vtSlots.requests, lag: 1 },
    }),
    requestsNow: wgslResource({
        name: 'vt_requests_now',
        binding: { storage: 'read_write' },
        type: { wgsl: 'u32', array: true },
        frequency: 'stage',
        provider: { slot: vtSlots.requests, lag: 0 },
    }),
    stamps: wgslResource({
        name: 'vt_atlas_stamps',
        binding: { storage: 'read_write' },
        type: { wgsl: 'u32', array: true },
        frequency: 'stage',
        provider: { slot: vtSlots.atlas, part: 'stamps' },
    }),
    clock: wgslResource({
        name: 'vt_atlas_clock',
        binding: { uniform: true },
        type: { wgsl: 'vec4u' },
        frequency: 'stage',
        provider: { slot: vtSlots.atlas, part: 'clock' },
    }),
    frame: wgslResource({
        name: 'vt_frame',
        binding: { uniform: true },
        type: { schema: VirtualTextureFrameSchema },
        frequency: 'stage',
        provider: { slot: vtSlots.work, descriptor: 'vt_frame' },
    }),
    scratch: wgslResource({
        name: 'vt_scratch',
        binding: { storage: 'read_write' },
        type: { wgsl: 'atomic<u32>', array: true },
        frequency: 'stage',
        provider: { slot: vtSlots.work, descriptor: 'vt_scratch' },
    }),
    loads: wgslResource({
        name: 'vt_loads',
        binding: { storage: 'read_write' },
        type: { wgsl: 'u32', array: true },
        frequency: 'stage',
        provider: { slot: vtSlots.work, descriptor: 'vt_loads' },
    }),
    commits: wgslResource({
        name: 'vt_commits',
        binding: { storage: 'read' },
        type: { wgsl: 'u32', array: true },
        frequency: 'stage',
        provider: { slot: vtSlots.work, descriptor: 'vt_commits' },
    }),
} as const;

/** Os kernels das páginas (uma entrada por etapa, ver `vt_pages.wgsl`). */
export const vtPages = wgslModule({
    name: 'vt_pages',
    source: vtPagesSource,
    requires: [vtCommon, pageAlloc, WORKGROUP_SIZE.module, ...Object.values(vtPageResources)],
    structs: [VirtualTextures.schema],
});
