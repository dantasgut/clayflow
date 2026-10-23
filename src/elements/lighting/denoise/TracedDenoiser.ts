import { Entity } from '../../../scene/contracts/Entity';
import { ResourceState } from '../../../scene/contracts/ResourceState';
import type { Resource } from '../../../scene/contracts/Resource';
import type { GPUDescriptor } from '../../../scene/descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../../../scene/descriptors/PipelineDescriptor';
import { FieldType } from '../../../scene/descriptors/FieldType';
import { StructSchema } from '../../../scene/descriptors/StructSchema';

/** Quadros da média temporal: padrão (da ordem do padrão do NRD, 30) e faixa aceita. */
export const TRACED_DENOISE_DEFAULT_HISTORY = 32;
export const TRACED_DENOISE_MAX_HISTORY = 256;
/** Formato dos alvos do filtro (cor e variância; os momentos da luminância com os quadros). */
export const TRACED_DENOISE_FORMAT: GPUTextureFormat = 'rgba16float';
/** Formato do guia guardado do quadro anterior (o ponto de mundo e o id do objeto em bits). */
export const TRACED_DENOISE_GUIDE_FORMAT: GPUTextureFormat = 'rgba32float';

/** Valores de um `TracedDenoiser`. */
export interface TracedDenoiserValues {
    /** Liga o filtro. Default `true`; desligado, quem compõe usa a amostra crua. */
    readonly enabled?: boolean;
    /**
     * Quadros, no máximo, da média temporal (o peso mínimo da amostra nova é 1/quadros), em 1–256. Default 32. Mais
     * quadros: menos ruído parado, mais tempo para seguir uma luz que muda devagar (a mudança brusca o gradiente pega).
     */
    readonly maxHistory?: number;
}

/** Dado de um `TracedDenoiser` (layout de `TracedDenoiser.schema`). */
export interface TracedDenoiserData {
    enabled: number;
    history_max: number;
    _pad0: number;
    _pad1: number;
}

function validate(history: number): void {
    if (!Number.isFinite(history) || history < 1 || history > TRACED_DENOISE_MAX_HISTORY)
        throw new RangeError(
            `TracedDenoiser: maxHistory ${history} fora de 1–${TRACED_DENOISE_MAX_HISTORY}`,
        );
}

/**
 * Filtro de sinal traçado (Camada 3, spec 034, R3): o que limpa um sinal traçado com uma amostra por pixel e por quadro
 * — a média temporal reprojetada com o histórico recomeçado onde a cena mudou (o gradiente temporal do A-SVGF) e cinco
 * passadas à-trous guiadas pelo ponto que o pixel mostra (o SVGF). Quem produz o sinal o descreve pelo ponto
 * `traced_denoise_source` (o sinal, o guia, a mudança); o estágio que filtra liga os dois. Guarda os alvos do filtro:
 * a média e os momentos deste quadro (`accumulated`, `accumulatedMoments`), os do anterior (`history`,
 * `historyMoments`), o guia do anterior (`guidePrevious`) e a cor filtrada (`output`) — do tamanho do canvas, alocados
 * sob demanda por quem filtra. Um por cena (o da refração); mudar valores vale no quadro seguinte, sem recompilar.
 */
export class TracedDenoiser extends Entity<TracedDenoiserData> implements Resource {
    /** Parâmetros (uniform `TracedDenoiser`). */
    static readonly schema = new StructSchema(
        'TracedDenoiser',
        {
            enabled: FieldType.u32,
            history_max: FieldType.f32,
            _pad0: FieldType.u32,
            _pad1: FieldType.u32,
        },
        { addressSpace: 'uniform' },
    );

    state: ResourceState = ResourceState.Uninitialized;

    constructor(values: TracedDenoiserValues = {}) {
        super();
        const history = values.maxHistory ?? TRACED_DENOISE_DEFAULT_HISTORY;
        validate(history);
        this.data = {
            enabled: values.enabled === false ? 0 : 1,
            history_max: history,
            _pad0: 0,
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

    getDescriptors(): readonly GPUDescriptor[] {
        const target = (id: string, format: GPUTextureFormat): GPUDescriptor => ({
            id,
            role: 'storage-texture',
            allocation: 'onDemand',
            textureShape: { format, sizeFromCanvas: true, access: 'write-only' },
        });
        return [
            { id: 'params', role: 'uniform', schema: TracedDenoiser.schema },
            target('accumulated', TRACED_DENOISE_FORMAT),
            target('accumulatedMoments', TRACED_DENOISE_FORMAT),
            target('history', TRACED_DENOISE_FORMAT),
            target('historyMoments', TRACED_DENOISE_FORMAT),
            target('guidePrevious', TRACED_DENOISE_GUIDE_FORMAT),
            target('output', TRACED_DENOISE_FORMAT),
        ];
    }

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [];
    }
}
