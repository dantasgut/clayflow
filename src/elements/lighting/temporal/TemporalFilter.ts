import { Entity } from '../../../scene/contracts/Entity';
import { ResourceState } from '../../../scene/contracts/ResourceState';
import type { Resource } from '../../../scene/contracts/Resource';
import type { GPUDescriptor } from '../../../scene/descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../../../scene/descriptors/PipelineDescriptor';
import { FieldType } from '../../../scene/descriptors/FieldType';
import { StructSchema } from '../../../scene/descriptors/StructSchema';
import type { HistoryPrecision } from '../../scene/TemporalAntialiasing';

/** Quadros da média temporal: padrão (da ordem do padrão do NRD, 30) e faixa aceita. */
export const TEMPORAL_FILTER_DEFAULT_HISTORY = 32;
export const TEMPORAL_FILTER_MAX_HISTORY = 256;
/** Formato dos alvos do filtro (cor e variância; os momentos da luminância com os quadros) com `historyPrecision: 'half'`. */
export const TEMPORAL_FILTER_FORMAT: GPUTextureFormat = 'rgba16float';

/** O formato dos alvos do filtro na precisão dada (spec 037, R6). */
export const temporalFilterFormat = (precision: HistoryPrecision): GPUTextureFormat =>
    precision === 'full' ? 'rgba32float' : TEMPORAL_FILTER_FORMAT;
/**
 * Formato do guia guardado: os bits do guia (o ponto de mundo e o id do objeto em bits). Inteiro, não float: gravar
 * pelo shader num formato float pode zerar os padrões subnormais — e um id pequeno em bits de float é subnormal.
 */
export const TEMPORAL_FILTER_GUIDE_FORMAT: GPUTextureFormat = 'rgba32uint';
/** Os canais temporais do filtro (spec 037): a média, os momentos e o guia, a fatia de agora e a do quadro anterior. */
export const TEMPORAL_FILTER_CHANNELS = ['accumulated', 'accumulatedMoments', 'guide'] as const;

/** Valores de um `TemporalFilter`. */
export interface TemporalFilterValues {
    /** Liga o filtro. Default `true`; desligado, quem compõe usa a amostra crua. */
    readonly enabled?: boolean;
    /**
     * Quadros, no máximo, da média temporal (o peso mínimo da amostra nova é 1/quadros), em 1–256. Default 32. Mais
     * quadros: menos ruído parado, mais tempo para seguir uma luz que muda devagar (a mudança brusca o gradiente pega).
     */
    readonly maxHistory?: number;
    /** Precisão dos alvos do filtro (a média, os momentos, o histórico e a saída). Default `'half'`. */
    readonly historyPrecision?: HistoryPrecision;
}

/** Dado de um `TemporalFilter` (layout de `TemporalFilter.schema`). */
export interface TemporalFilterData {
    enabled: number;
    history_max: number;
    /** Precisão dos alvos: 0 half, 1 full. */
    historyPrecision: number;
    _pad1: number;
}

function validate(history: number): void {
    if (!Number.isFinite(history) || history < 1 || history > TEMPORAL_FILTER_MAX_HISTORY)
        throw new RangeError(
            `TemporalFilter: maxHistory ${history} fora de 1–${TEMPORAL_FILTER_MAX_HISTORY}`,
        );
}

/**
 * Acumulador temporal de pixel (Camada 3; o filtro de sinal traçado da spec 034, R3, generalizado na spec 037): o que
 * limpa um sinal com uma amostra por pixel e por quadro
 * — a média temporal reprojetada com o histórico recomeçado onde a cena mudou (o gradiente temporal do A-SVGF) e
 * passadas à-trous guiadas pelo ponto que o pixel mostra e pelo albedo dele (o SVGF); pixels sem amostra no quadro (o
 * entrelaçamento de quem não traça todos) ficam com o histórico, e sem ele com os vizinhos. Quem produz o sinal o descreve pelo ponto
 * `temporal_filter_source` (o sinal, o guia, a mudança); o estágio que filtra liga os dois. Guarda os alvos do filtro,
 * do tamanho do canvas e alocados sob demanda por quem filtra: a média, os momentos e o guia como canais temporais da
 * C2 (spec 037: a fatia de agora e a do quadro anterior, sem cópia) e o par das passadas à-trous (`work` e a cor
 * filtrada, `output`). Um por cena (o da refração); mudar valores vale no quadro seguinte, sem recompilar.
 */
export class TemporalFilter extends Entity<TemporalFilterData> implements Resource {
    /** Parâmetros (uniform `TemporalFilter`). */
    static readonly schema = new StructSchema(
        'TemporalFilter',
        {
            enabled: FieldType.u32,
            history_max: FieldType.f32,
            historyPrecision: FieldType.u32,
            _pad1: FieldType.u32,
        },
        { addressSpace: 'uniform' },
    );

    state: ResourceState = ResourceState.Uninitialized;

    constructor(values: TemporalFilterValues = {}) {
        super();
        const history = values.maxHistory ?? TEMPORAL_FILTER_DEFAULT_HISTORY;
        validate(history);
        this.data = {
            enabled: values.enabled === false ? 0 : 1,
            history_max: history,
            historyPrecision: values.historyPrecision === 'full' ? 1 : 0,
            _pad1: 0,
        };
    }

    /** Liga ou desliga o filtro. */
    get enabled(): boolean {
        return this.data.enabled === 1;
    }

    set enabled(on: boolean) {
        this.data.enabled = on ? 1 : 0;
    }

    /** Quadros, no máximo, da média temporal, em 1–256. */
    get maxHistory(): number {
        return this.data.history_max;
    }

    /** @throws RangeError fora de 1–256 (o valor anterior fica). */
    set maxHistory(n: number) {
        validate(n);
        this.data.history_max = n;
    }

    /** Precisão dos alvos do filtro; mudar realoca os alvos (o histórico recomeça). */
    get historyPrecision(): HistoryPrecision {
        return this.data.historyPrecision === 1 ? 'full' : 'half';
    }

    set historyPrecision(precision: HistoryPrecision) {
        const value = precision === 'full' ? 1 : 0;
        if (value === this.rawData.historyPrecision) return;
        this.redescribe(this.getDescriptors(), { ...this.rawData, historyPrecision: value });
    }

    getDescriptors(): readonly GPUDescriptor[] {
        return this.descriptorsFor(this.historyPrecision);
    }

    private descriptorsFor(precision: HistoryPrecision): readonly GPUDescriptor[] {
        const format = temporalFilterFormat(precision);
        const target = (id: string, format: GPUTextureFormat): GPUDescriptor => ({
            id,
            role: 'storage-texture',
            allocation: 'onDemand',
            textureShape: { format, sizeFromCanvas: true, access: 'write-only' },
        });
        // A série da média e dos momentos na precisão do filtro (a C2 resolve o formato; lida sem filtragem).
        const series = (id: string): GPUDescriptor => ({
            ...target(id, TEMPORAL_FILTER_FORMAT),
            history: { depth: 2, precision },
        });
        return [
            { id: 'params', role: 'uniform', schema: TemporalFilter.schema },
            series('accumulated'),
            series('accumulatedMoments'),
            { ...target('guide', TEMPORAL_FILTER_GUIDE_FORMAT), history: { depth: 2 } },
            target('work', format),
            target('output', format),
        ];
    }

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [];
    }
}
