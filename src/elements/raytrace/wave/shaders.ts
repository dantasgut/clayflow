import { FieldType } from '../../../scene/descriptors/FieldType';
import { StructSchema, fieldStruct } from '../../../scene/descriptors/StructSchema';
import { wgslModule } from '../../../scene/shaders/WgslModule';
import { wgslResource } from '../../../scene/shaders/WgslResource';
import { NONE, WORKGROUP_SIZE } from '../../../scene/shaders/engineConstants';
import { ClosureSchema } from '../../material/pbr/ClosureSchema';
import { closure } from '../../material/pbr/shaders';
import { materialPointTypes } from '../../material/point/types/shaders';
import { StandardMaterialSchema } from '../../material/StandardMaterialSchema';
import rayWaveSource from '../../gpu/wgsl/raytrace/ray_wave.wgsl?raw';
import rayWaveReadSource from '../../gpu/wgsl/raytrace/ray_wave_read.wgsl?raw';
import rayWaveBinsSource from '../../gpu/wgsl/raytrace/ray_wave_bins.wgsl?raw';

// A onda dos acertos (spec 039): o material nos acertos dos raios fora dos laços de traçado. Quem traça grava o registro
// do acerto no índice do próprio raio e conta por classe (a função `material` da instância); a separação agrupa os
// registros por classe e um kernel por classe — gerado da função `material` daquele grafo, uma só por kernel — grava o
// fechamento no mesmo índice; quem traça segue o raio pela superfície na rodada seguinte.

/**
 * O registro de um acerto na onda (96 B): o que o material precisa no ponto atingido — a amostra de superfície (ponto,
 * normal, uv, tempo simulado, largura do cone e a derivada isotrópica do uv), as constantes do `StandardMaterial`, o slot
 * dos parâmetros da função, a classe e o índice do raio de quem traça — e a carga de quem traça (`payload`: o que ele
 * guarda do raio entre o traçado e a continuação, também nos índices sem acerto).
 */
export const RayWaveHitSchema = new StructSchema('RayWaveHit', {
    position: FieldType.vec3f,
    width: FieldType.f32,
    normal: FieldType.vec3f,
    time: FieldType.f32,
    albedo: FieldType.vec4f,
    uv: FieldType.vec2f,
    duv: FieldType.f32,
    roughness: FieldType.f32,
    metallic: FieldType.f32,
    slot: FieldType.u32,
    cls: FieldType.u32,
    ray: FieldType.u32,
    payload: FieldType.vec4f,
});

/** Palavras de contagem da onda para `classes` classes: os registros, a contagem e o cursor de cada classe. */
export function rayWaveCountWords(classes: number): number {
    return 1 + 2 * classes;
}

/**
 * Uma entrada da onda: o registro do acerto e o fechamento avaliado nele, no mesmo índice (um buffer só: cada kernel de
 * quem traça liga uma ligação de storage, não duas).
 */
export const RayWaveEntrySchema = new StructSchema('RayWaveEntry', {
    hit: fieldStruct(RayWaveHitSchema),
    closure: fieldStruct(ClosureSchema),
});

/** Recursos da onda (privados de quem traça: cada Flow liga os seus buffers). */
export const rayWaveResources = Object.freeze({
    /** As entradas (quem traça grava o registro; os kernels de material, o fechamento; quem traça os lê). */
    entries: wgslResource({
        name: 'ray_wave_entries',
        binding: { storage: 'read_write' },
        type: { schema: RayWaveEntrySchema, array: true },
        frequency: 'stage',
        provider: 'private',
    }),
    /** As entradas em leitura (o espalhamento). */
    entriesIn: wgslResource({
        name: 'ray_wave_entries_in',
        binding: { storage: 'read' },
        type: { schema: RayWaveEntrySchema, array: true },
        frequency: 'stage',
        provider: 'private',
    }),
    /** As contagens (`rayWaveCountWords`). */
    counts: wgslResource({
        name: 'ray_wave_counts',
        binding: { storage: 'read_write' },
        type: { wgsl: 'atomic<u32>', array: true },
        frequency: 'stage',
        provider: 'private',
    }),
    /** As faixas das classes na ordem (início, tamanho). */
    ranges: wgslResource({
        name: 'ray_wave_ranges',
        binding: { storage: 'read' },
        type: { wgsl: 'vec2u', array: true },
        frequency: 'stage',
        provider: 'private',
    }),
    rangesOut: wgslResource({
        name: 'ray_wave_ranges_out',
        binding: { storage: 'read_write' },
        type: { wgsl: 'vec2u', array: true },
        frequency: 'stage',
        provider: 'private',
    }),
    /** Os índices dos registros agrupados por classe. */
    order: wgslResource({
        name: 'ray_wave_order',
        binding: { storage: 'read' },
        type: { wgsl: 'u32', array: true },
        frequency: 'stage',
        provider: 'private',
    }),
    orderOut: wgslResource({
        name: 'ray_wave_order_out',
        binding: { storage: 'read_write' },
        type: { wgsl: 'u32', array: true },
        frequency: 'stage',
        provider: 'private',
    }),
});

const W = rayWaveResources;

/** Gravar na onda (quem traça): o registro, as constantes avaliadas no traçado, a contagem por classe. */
export const rayWave = wgslModule({
    name: 'ray_wave',
    source: rayWaveSource,
    requires: [NONE.module, materialPointTypes, closure, W.entries, W.counts],
    structs: [StandardMaterialSchema, RayWaveHitSchema, RayWaveEntrySchema],
});

/** Ler um registro como amostra de superfície e constantes (os kernels de material). */
export const rayWaveRead = wgslModule({
    name: 'ray_wave_read',
    source: rayWaveReadSource,
    requires: [materialPointTypes],
    structs: [StandardMaterialSchema, RayWaveHitSchema],
});

/** A separação por classe: zerar, somar as faixas e os argumentos, espalhar. */
export const rayWaveBins = wgslModule({
    name: 'ray_wave_bins',
    source: rayWaveBinsSource,
    requires: [WORKGROUP_SIZE.module, W.entriesIn, W.counts, W.ranges, W.rangesOut, W.orderOut],
    structs: [RayWaveHitSchema, RayWaveEntrySchema],
});
