import { Entity } from '../../scene/contracts/Entity';
import { ResourceState } from '../../scene/contracts/ResourceState';
import type { Resource } from '../../scene/contracts/Resource';
import type { GPUDescriptor } from '../../scene/descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../../scene/descriptors/PipelineDescriptor';
import { FieldType } from '../../scene/descriptors/FieldType';
import { StructSchema } from '../../scene/descriptors/StructSchema';

/** Operadores de mapeamento de tons da apresentação. */
export type ToneOperator = 'agx' | 'aces' | 'neutral' | 'linear';

/** Saída da apresentação: a padrão (8 bits por canal, mapeada) ou HDR estendida (telas que suportam). */
export type PresentationOutput = 'sdr' | 'hdr';

/** Opções da apresentação. */
export interface ToneMappingOptions {
    /**
     * Operador: `agx` (default, o do Blender 4 — preserva a matiz em realces saturados), `aces` (ajuste de Hill),
     * `neutral` (Khronos PBR Neutral — identidade até ~0,76) ou `linear` (sem compressão, para depuração).
     */
    readonly operator?: ToneOperator;
    /** Exposição em EV, como numa câmera: 0 = ×1, +1 dobra a luz. Default 0. */
    readonly exposure?: number;
    /** Pontilhamento de ±1 nível de código na saída de 8 bits, contra faixas. Default `true`. */
    readonly dither?: boolean;
    /**
     * `sdr` (default) ou `hdr`: com navegador e tela que suportam, o canvas passa a `rgba16float` com mapeamento de
     * tons estendido e os valores acima do branco de referência chegam à tela (a exposição vale; o operador não
     * comprime). Sem suporte, cai em `sdr` e a cena emite `presentationFallback`.
     */
    readonly output?: PresentationOutput;
}

/** Dado da apresentação (domínio). */
export interface ToneMappingData {
    /** Operador de mapeamento de tons. */
    operator: ToneOperator;
    /** Exposição em EV. */
    exposure: number;
    /** Pontilhamento na saída de 8 bits. */
    dither: boolean;
    /** Saída pedida. */
    output: PresentationOutput;
}

const OPERATORS: readonly ToneOperator[] = ['agx', 'aces', 'neutral', 'linear'];

/** Índice do operador no uniform da apresentação (`PresentationParams.operator`). */
export function operatorIndex(operator: ToneOperator): number {
    return OPERATORS.indexOf(operator);
}

/**
 * Apresentação da cena (Camada 4, spec 011): o último passo do quadro, do HDR linear para a tela — exposição,
 * mapeamento de tons, codificação sRGB e pontilhamento. Um por cena, inserido pelos estágios padrão e exposto em
 * `defaults.presentation`; o `PostFlow` o lê pelo slot e o aplica no fim da cadeia (com MSAA e sem efeitos, mapeia cada
 * amostra antes da média — bordas de alto contraste suaves). Mudar `data` vale no quadro seguinte, sem recompilar.
 */
export class ToneMapping extends Entity<ToneMappingData> implements Resource {
    /** Identidade da apresentação na cena; o uniform é do `PostFlow` (empacotado de `data`). */
    static readonly schema = new StructSchema('ToneMapping', { _unused: FieldType.u32 });

    state: ResourceState = ResourceState.Uninitialized;

    constructor(options: ToneMappingOptions = {}) {
        super();
        const operator = options.operator ?? 'agx';
        if (!OPERATORS.includes(operator))
            throw new Error(`ToneMapping: operador desconhecido '${operator}'.`);
        const exposure = options.exposure ?? 0;
        if (!Number.isFinite(exposure))
            throw new Error(`ToneMapping: exposição não finita (${exposure}).`);
        this.data = {
            operator,
            exposure,
            dither: options.dither ?? true,
            output: options.output ?? 'sdr',
        };
    }

    getDescriptors(): readonly GPUDescriptor[] {
        return [];
    }

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [];
    }
}
