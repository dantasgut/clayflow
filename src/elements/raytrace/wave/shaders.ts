import { FieldType } from '../../../scene/descriptors/FieldType';
import { StructSchema } from '../../../scene/descriptors/StructSchema';
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
 * O registro de um acerto na onda (80 B): o que o material precisa no ponto atingido — a amostra de superfície (ponto,
 * normal, uv, tempo simulado, largura do cone e a derivada isotrópica do uv), as constantes do `StandardMaterial`, o slot
 * dos parâmetros da função, a classe e o índice do raio de quem traça.
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
});

/** Palavras de contagem da onda para `classes` classes: os registros, a contagem e o cursor de cada classe. */
export function rayWaveCountWords(classes: number): number {
    return 1 + 2 * classes;
}

/** Palavras dos argumentos indiretos da onda para `classes` classes: um despacho por classe e o do espalhamento. */
export function rayWaveArgsWords(classes: number): number {
    return 3 * (classes + 1);
}

/** Byte, nos argumentos da onda, do despacho do kernel de material da classe `cls`. */
export function rayWaveClassArgsOffset(cls: number): number {
    return cls * 12;
}

/** Byte, nos argumentos da onda de `classes` classes, do despacho do espalhamento. */
export function rayWaveScatterArgsOffset(classes: number): number {
    return classes * 12;
}

/** Recursos da onda (privados de quem traça: cada Flow liga os seus buffers). */
export const rayWaveResources = Object.freeze({
    /** Os registros (quem traça grava; a separação e os kernels de material leem por `hitsIn`). */
    hits: wgslResource({
        name: 'ray_wave_hits',
        binding: { storage: 'read_write' },
        type: { schema: RayWaveHitSchema, array: true },
        frequency: 'stage',
        provider: 'private',
    }),
    hitsIn: wgslResource({
        name: 'ray_wave_hits_in',
        binding: { storage: 'read' },
        type: { schema: RayWaveHitSchema, array: true },
        frequency: 'stage',
        provider: 'private',
    }),
    /** O fechamento de cada registro (os kernels de material gravam; quem traça lê e grava as constantes). */
    surfaces: wgslResource({
        name: 'ray_wave_surfaces',
        binding: { storage: 'read_write' },
        type: { schema: ClosureSchema, array: true },
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
    /** Os argumentos indiretos (`rayWaveArgsWords`). */
    args: wgslResource({
        name: 'ray_wave_args',
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
    requires: [NONE.module, materialPointTypes, closure, W.hits, W.surfaces, W.counts],
    structs: [StandardMaterialSchema, RayWaveHitSchema],
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
    requires: [
        WORKGROUP_SIZE.module,
        W.hitsIn,
        W.counts,
        W.ranges,
        W.rangesOut,
        W.orderOut,
        W.args,
    ],
    structs: [RayWaveHitSchema],
});
