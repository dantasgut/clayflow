import { Entity } from '../../scene/contracts/Entity';
import { ResourceState } from '../../scene/contracts/ResourceState';
import type { Resource } from '../../scene/contracts/Resource';
import type { GPUDescriptor } from '../../scene/descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../../scene/descriptors/PipelineDescriptor';
import { FieldType } from '../../scene/descriptors/FieldType';
import { StructSchema } from '../../scene/descriptors/StructSchema';

/**
 * Modo do antisserrilhado: `temporal` (amostra deslocada dentro do pixel a cada quadro, histórico reprojetado com
 * rejeição), `accumulate` (média uniforme de todos os quadros desde o último corte, sem rejeição — imagem parada de
 * referência ou captura de alta qualidade), `msaa` (4 amostras por pixel nas bordas da geometria) ou `off`.
 */
export type AntialiasingMode = 'off' | 'temporal' | 'msaa' | 'accumulate';

const MODES: readonly AntialiasingMode[] = ['off', 'temporal', 'msaa', 'accumulate'];

/** Opções de `TemporalAntialiasing`. */
export interface TemporalAntialiasingOptions {
    /** Modo. Padrão `'temporal'`. */
    readonly mode?: AntialiasingMode;
    /** Posições da sequência de Halton (2, 3) antes de repetir. Padrão 64 (a memória do que está parado cobre a sequência inteira; `accumulate` usa até 1024). */
    readonly sequence?: number;
}

/** Dado de `TemporalAntialiasing` (layout de `TemporalAntialiasing.schema`). */
export interface TemporalAntialiasingData {
    /** Modo: 0 off, 1 temporal, 2 msaa, 3 accumulate. */
    mode: number;
    /** Posições da sequência antes de repetir. */
    sequence: number;
    /** Preenchimento. */
    _pad0: number;
    _pad1: number;
}

/** Número de Halton de `index` (≥ 1) na base `base`, em [0, 1). */
export function halton(index: number, base: number): number {
    let f = 1;
    let r = 0;
    let i = index;
    while (i > 0) {
        f /= base;
        r += f * (i % base);
        i = Math.floor(i / base);
    }
    return r;
}

/**
 * Deslocamento da amostra dentro do pixel no quadro `frame` (spec 034, R3): Halton (2, 3) a partir do índice 1, em
 * pixels, centrado (cada eixo em [−½, ½)).
 */
export function pixelJitter(frame: number, sequence: number): readonly [number, number] {
    const i = (frame % Math.max(1, sequence)) + 1;
    return [halton(i, 2) - 0.5, halton(i, 3) - 0.5];
}

/**
 * Antisserrilhado da cena (Camada 3, spec 034): o modo e a sequência das posições da amostra dentro do pixel. O
 * estágio de câmera desloca a projeção por quadro (`CameraMatrices.jitter`) e o estágio de resolução da apresentação
 * reprojeta e acumula a imagem. Um por cena, inserido pelos estágios padrão (`defaults.antialiasing`); mudar o modo
 * vale no quadro seguinte (o histórico recomeça).
 */
export class TemporalAntialiasing extends Entity<TemporalAntialiasingData> implements Resource {
    /** Parâmetros (uniform `TemporalAntialiasing`). */
    static readonly schema = new StructSchema(
        'TemporalAntialiasing',
        {
            mode: FieldType.u32,
            sequence: FieldType.u32,
            _pad0: FieldType.u32,
            _pad1: FieldType.u32,
        },
        { addressSpace: 'uniform' },
    );

    state: ResourceState = ResourceState.Uninitialized;

    constructor(options: TemporalAntialiasingOptions = {}) {
        super();
        this.data = {
            mode: MODES.indexOf(options.mode ?? 'temporal'),
            sequence: Math.max(1, Math.min(1024, Math.round(options.sequence ?? 64))),
            _pad0: 0,
            _pad1: 0,
        };
    }

    /** O modo atual. */
    get mode(): AntialiasingMode {
        return MODES[this.data.mode] ?? 'off';
    }

    set mode(mode: AntialiasingMode) {
        this.data.mode = MODES.indexOf(mode);
    }

    /** O deslocamento da amostra vale neste modo (temporal ou acumulação). */
    get jitters(): boolean {
        return this.mode === 'temporal' || this.mode === 'accumulate';
    }

    getDescriptors(): readonly GPUDescriptor[] {
        return [{ id: 'params', role: 'uniform', schema: TemporalAntialiasing.schema }];
    }

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [];
    }
}
