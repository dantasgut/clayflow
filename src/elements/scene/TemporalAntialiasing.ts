import { Entity } from '../../scene/contracts/Entity';
import { ResourceState } from '../../scene/contracts/ResourceState';
import type { Resource } from '../../scene/contracts/Resource';
import type { GPUDescriptor } from '../../scene/descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../../scene/descriptors/PipelineDescriptor';
import { FieldType } from '../../scene/descriptors/FieldType';
import { StructSchema } from '../../scene/descriptors/StructSchema';
import type { HistoryPrecision } from '../../scene/descriptors/HistoryShape';

/**
 * Modo do antisserrilhado: `temporal` (amostra deslocada dentro do pixel a cada quadro, histórico reprojetado com
 * rejeição), `accumulate` (média uniforme de todos os quadros desde o último corte, sem rejeição — imagem parada de
 * referência ou captura de alta qualidade), `msaa` (4 amostras por pixel nas bordas da geometria) ou `off`.
 */
export type AntialiasingMode = 'off' | 'temporal' | 'msaa' | 'accumulate';

const MODES: readonly AntialiasingMode[] = ['off', 'temporal', 'msaa', 'accumulate'];

/**
 * Precisão de um histórico temporal (spec 037, R6): `half` (16 bits por canal, o padrão) ou `full` (32 bits — dobra a
 * banda; para a acumulação longa ou onde o erro de 16 bits aparece).
 */
export type { HistoryPrecision };

/**
 * Formatos das séries do antisserrilhado (spec 037: canais temporais da C2): a cor no formato da cena (o
 * `SCENE_COLOR_FORMAT` da apresentação; 32 bits com `historyPrecision: 'full'`), o estado por pixel (distância à
 * câmera, movimento, quadros: rgba32float) e a luz que chegava ao pixel (o `LIGHT_FORMAT` da apresentação).
 */
export const TAA_HISTORY_FORMAT: GPUTextureFormat = 'rgba16float';
export const TAA_STATE_FORMAT: GPUTextureFormat = 'rgba32float';
export const TAA_LIGHT_FORMAT: GPUTextureFormat = 'rg16float';

const PRECISIONS: readonly HistoryPrecision[] = ['half', 'full'];

/** Opções de `TemporalAntialiasing`. */
export interface TemporalAntialiasingOptions {
    /** Modo. Padrão `'temporal'`. */
    readonly mode?: AntialiasingMode;
    /** Posições da sequência de Halton (2, 3) antes de repetir. Padrão 64 (a memória do que está parado cobre a sequência inteira; `accumulate` usa até 1024). */
    readonly sequence?: number;
    /**
     * Precisão do histórico de cor. Padrão `'full'` (spec 037, R6: o erro de 16 bits aparece na imagem parada — medido no
     * smoke `antialiasing`, sem custo mensurável no M4). `'full'` exige a feature `float32-filterable` (o histórico é lido
     * filtrado); sem ela, o histórico fica em `'half'` com aviso.
     */
    readonly historyPrecision?: HistoryPrecision;
}

/** Dado de `TemporalAntialiasing` (layout de `TemporalAntialiasing.schema`). */
export interface TemporalAntialiasingData {
    /** Modo: 0 off, 1 temporal, 2 msaa, 3 accumulate. */
    mode: number;
    /** Posições da sequência antes de repetir. */
    sequence: number;
    /** Precisão do histórico de cor: 0 half, 1 full. */
    historyPrecision: number;
    /** Preenchimento. */
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
            historyPrecision: FieldType.u32,
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
            historyPrecision: Math.max(0, PRECISIONS.indexOf(options.historyPrecision ?? 'full')),
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

    /** A precisão do histórico de cor. */
    get historyPrecision(): HistoryPrecision {
        return PRECISIONS[this.data.historyPrecision] ?? 'half';
    }

    /** Mudar realoca a série da cor no formato novo (o histórico recomeça). */
    set historyPrecision(precision: HistoryPrecision) {
        const value = Math.max(0, PRECISIONS.indexOf(precision));
        if (value === this.rawData.historyPrecision) return;
        this.redescribe(this.getDescriptors(), { ...this.rawData, historyPrecision: value });
    }

    /** O deslocamento da amostra vale neste modo (temporal ou acumulação). */
    get jitters(): boolean {
        return this.mode === 'temporal' || this.mode === 'accumulate';
    }

    /**
     * Os parâmetros e as séries da resolução temporal (spec 037): a cor, o estado e a luz de cada pixel como canais
     * temporais da C2 — a fatia do quadro anterior e a do quadro —, do tamanho do canvas e alocados sob demanda por quem
     * resolve (alvos de render e lidos como textura).
     */
    getDescriptors(): readonly GPUDescriptor[] {
        const series = (
            id: string,
            format: GPUTextureFormat,
            history: NonNullable<GPUDescriptor['history']>,
        ): GPUDescriptor => ({
            id,
            role: 'texture',
            allocation: 'onDemand',
            textureShape: { format, sizeFromCanvas: true },
            history,
        });
        return [
            { id: 'params', role: 'uniform', schema: TemporalAntialiasing.schema },
            series('history', TAA_HISTORY_FORMAT, {
                depth: 2,
                precision: this.historyPrecision,
                filtered: true,
            }),
            series('state', TAA_STATE_FORMAT, { depth: 2 }),
            series('light', TAA_LIGHT_FORMAT, { depth: 2 }),
        ];
    }

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [];
    }
}
