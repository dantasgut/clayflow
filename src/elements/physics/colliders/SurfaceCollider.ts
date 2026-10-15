import type { GPUDescriptor } from '../../../scene/descriptors/GPUDescriptor';
import { FieldType } from '../../../scene/descriptors/FieldType';
import { StructSchema } from '../../../scene/descriptors/StructSchema';
import { Collider } from './Collider';

/** Modo do colisor de superfície: altura sobre o plano xz local (terreno) ou distância com sinal (superfície geral). */
export type SurfaceColliderMode = 'height' | 'distance';

/** Índice do modo no registro (`SurfaceCollider.mode` no WGSL). */
export const SURFACE_COLLIDER_MODE_INDEX: Readonly<Record<SurfaceColliderMode, number>> = {
    height: 0,
    distance: 1,
};

/**
 * Floats do cabeçalho de cada cópia do campo, escrito pela GPU na construção: caixa local (mín. e máx.) com o tamanho
 * da célula, a inversa da matriz de mundo, a matriz normal (mundo ← local), a escala local → mundo das distâncias e o
 * número de cópias construídas no quadro e os tempos delas (`surface_collider_hit.wgsl`).
 */
export const SURFACE_COLLIDER_HEADER = 64;

/** Cópias do campo por padrão: uma por passo fixo do quadro (`Time.maxStepsPerFrame` padrão). */
export const SURFACE_COLLIDER_STEPS = 4;

/** Opções do `SurfaceCollider`. */
export interface SurfaceColliderOptions {
    /** `'height'` (gráfico y = h(x, z) no espaço local; padrão) ou `'distance'` (superfície geral). */
    readonly mode?: SurfaceColliderMode;
    /**
     * Resolução do campo: altura `[nx, nz]` (padrão 128²); distância `[n, n, n]` (padrão 64³). Um número vale para
     * todos os eixos.
     */
    readonly resolution?: number | readonly number[];
    /** Folga de contato (m), somada ao raio de quem colide. Padrão 0,01. */
    readonly margin?: number;
    /** Células de folga em volta da caixa da superfície (distância). Padrão 2. */
    readonly band?: number;
    /**
     * Cópias do campo — uma por passo fixo do quadro quando a superfície anima (spec 010, R2). Padrão 4
     * (`Time.maxStepsPerFrame` padrão); quadros com mais passos repetem a última cópia.
     */
    readonly steps?: number;
    /** Resolução `[nu, nv]` da grade em que a superfície é avaliada para o campo. Padrão: a do campo (xz) ou 2 × n. */
    readonly sampling?: readonly [number, number];
}

/** Dado de um `SurfaceCollider` (layout de `SurfaceCollider.schema`). */
export interface SurfaceColliderData {
    /** Modo (`SURFACE_COLLIDER_MODE_INDEX`). */
    mode: number;
    /** Células em x. */
    nx: number;
    /** Células em y (1 no modo altura). */
    ny: number;
    /** Células em z. */
    nz: number;
    /** Primeiro slot do campo (índice local 0, resolvido pela C2). */
    first: number;
    /** Cópias alocadas. */
    copies: number;
    /** Floats por cópia (cabeçalho + células). */
    copy_stride: number;
    /** Células de folga (distância). */
    band: number;
    /** Folga de contato (m). */
    margin: number;
    /** Preenchimento do layout. */
    _pad0: number;
    /** Preenchimento do layout. */
    _pad1: number;
    /** Preenchimento do layout. */
    _pad2: number;
}

const RES_MIN = 2;
const RES_MAX_HEIGHT = 2048;
const RES_MAX_DISTANCE = 256;

/**
 * Colisor derivado de uma superfície paramétrica (spec 010): anexado à entidade da `ParametricSurface`, o
 * `SurfaceColliderFlow` constrói na GPU um campo de alturas (`'height'`, terreno) ou de distâncias com sinal
 * (`'distance'`, superfície geral) a partir da mesma função que desenha a superfície, com o espaço da cena e a
 * transformação da entidade. Corpos rígidos, fluidos, corpos moles e emissores colidem com ele pela fronteira comum
 * (`ColliderHit`), adesão da 030 inclusive. Unilateral: a superfície não é empurrada.
 *
 * Quando a superfície anima, há uma cópia do campo por passo fixo do quadro (mesma trajetória a 30/60/144 Hz).
 */
export class SurfaceCollider extends Collider<SurfaceColliderData> {
    /** Registro do colisor (pool `collider` do tipo superfície). */
    static readonly schema = new StructSchema('SurfaceCollider', {
        mode: FieldType.u32,
        nx: FieldType.u32,
        ny: FieldType.u32,
        nz: FieldType.u32,
        first: FieldType.u32,
        copies: FieldType.u32,
        copy_stride: FieldType.u32,
        band: FieldType.u32,
        margin: FieldType.f32,
        _pad0: FieldType.f32,
        _pad1: FieldType.f32,
        _pad2: FieldType.f32,
    });

    /** Célula do campo (pool `field`; cabeçalho e valores, um `f32` por slot). */
    static readonly cellSchema = new StructSchema('SurfaceColliderCell', { value: FieldType.f32 });

    /** Resolução `[nu, nv]` da grade de avaliação da superfície. */
    readonly sampling: readonly [number, number];

    constructor(options: SurfaceColliderOptions = {}) {
        super();
        const mode = options.mode ?? 'height';
        if (!(mode in SURFACE_COLLIDER_MODE_INDEX))
            throw new RangeError(`SurfaceCollider: modo '${mode}' desconhecido.`);
        const [nx, ny, nz] = resolutionOf(mode, options.resolution);
        const margin = options.margin ?? 0.01;
        if (!(margin >= 0) || !Number.isFinite(margin))
            throw new RangeError(`SurfaceCollider: folga ${margin} inválida (≥ 0).`);
        const band = options.band ?? 2;
        if (!Number.isInteger(band) || band < 0 || band > 16)
            throw new RangeError(`SurfaceCollider: banda ${band} fora de [0, 16].`);
        const steps = options.steps ?? SURFACE_COLLIDER_STEPS;
        if (!Number.isInteger(steps) || steps < 1 || steps > 16)
            throw new RangeError(`SurfaceCollider: cópias ${steps} fora de [1, 16].`);
        this.sampling = options.sampling ?? (mode === 'height' ? [nx, nz] : [2 * nx, 2 * nx]);
        for (const n of this.sampling) {
            if (!Number.isInteger(n) || n < RES_MIN || n > 4096)
                throw new RangeError(`SurfaceCollider: amostragem ${n} fora de [2, 4096].`);
        }
        this.data = {
            mode: SURFACE_COLLIDER_MODE_INDEX[mode],
            nx,
            ny,
            nz,
            first: 0,
            copies: steps,
            copy_stride: SURFACE_COLLIDER_HEADER + nx * ny * nz,
            band,
            margin,
            _pad0: 0,
            _pad1: 0,
            _pad2: 0,
        };
    }

    /** Modo do colisor. */
    get mode(): SurfaceColliderMode {
        return this.data.mode === SURFACE_COLLIDER_MODE_INDEX.distance ? 'distance' : 'height';
    }

    /** Células do campo (uma cópia). */
    get cellCount(): number {
        return this.data.nx * this.data.ny * this.data.nz;
    }

    /** Registro (pool `collider`) e campo (pool `field`, produzido pela GPU) com as cópias. */
    getDescriptors(): readonly GPUDescriptor[] {
        return [
            {
                id: 'collider',
                role: 'storage-ro',
                schema: SurfaceCollider.schema,
                storage: 'pool',
                slotRefs: { first: 'self:field' },
            },
            {
                id: 'field',
                role: 'storage-rw',
                schema: SurfaceCollider.cellSchema,
                storage: 'pool',
                upload: 'never',
                count: this.data.copies * this.data.copy_stride,
            },
        ];
    }
}

function resolutionOf(
    mode: SurfaceColliderMode,
    resolution: number | readonly number[] | undefined,
): [number, number, number] {
    const max = mode === 'height' ? RES_MAX_HEIGHT : RES_MAX_DISTANCE;
    const def = mode === 'height' ? 128 : 64;
    const r =
        resolution === undefined
            ? [def, def, def]
            : typeof resolution === 'number'
              ? [resolution, resolution, resolution]
              : [...resolution];
    const check = (n: number | undefined): number => {
        if (n === undefined || !Number.isInteger(n) || n < RES_MIN || n > max)
            throw new RangeError(
                `SurfaceCollider: resolução ${String(n)} fora de [${RES_MIN}, ${max}].`,
            );
        return n;
    };
    if (mode === 'height') return [check(r[0]), 1, check(r[1] ?? r[0])];
    return [check(r[0]), check(r[1] ?? r[0]), check(r[2] ?? r[0])];
}
