import { Entity } from '../../../scene/contracts/Entity';
import { ResourceState } from '../../../scene/contracts/ResourceState';
import type { Resource } from '../../../scene/contracts/Resource';
import type { GPUDescriptor } from '../../../scene/descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../../../scene/descriptors/PipelineDescriptor';
import { FieldType } from '../../../scene/descriptors/FieldType';
import { StructSchema } from '../../../scene/descriptors/StructSchema';
import { SetCountSchema } from '../../../scene/graph/SetCountSchema';
import { sharedConstant } from '../../../scene/shaders/SharedConstant';

/** Meios na pilha de um caminho (spec 034, R1): fixo no WGSL; um meio além disso é erro de autoria. */
export const REFRACTION_MAX_MEDIA = 4;
/** Interfaces por caminho, padrão e teto (spec 034, R1). */
export const REFRACTION_DEFAULT_INTERFACES = 16;
export const REFRACTION_MAX_INTERFACES = 32;
/** Unidades do contador de energia por unidade de vazão (ponto fixo de 16 bits). */
export const REFRACTION_ENERGY_SCALE = 65536;

/** Formato do pedido por pixel: a distância da câmera à primeira interface (bits de f32) e as marcas. */
export const REFRACTION_REQUEST_FORMAT: GPUTextureFormat = 'rg32uint';
/** Marcas do pedido (palavra y): há pedido; a primeira interface é uma face de trás (a câmera dentro do meio). */
export const REFRACTION_REQUEST_VALID = sharedConstant('REFRACTION_REQUEST_VALID', 1, 'u32');
export const REFRACTION_REQUEST_BACK_FACE = sharedConstant(
    'REFRACTION_REQUEST_BACK_FACE',
    2,
    'u32',
);
/** Formato das radiâncias traçadas (transmitida e refletida). */
export const REFRACTION_RADIANCE_FORMAT: GPUTextureFormat = 'rgba16float';
/** Formato da fila de pixels: o índice linear do pixel (`x + y · largura`), um por texel. */
export const REFRACTION_QUEUE_FORMAT: GPUTextureFormat = 'r32uint';

/**
 * Contadores da energia de um quadro (storage, só da GPU): a vazão inicial de todos os caminhos e a que sobrou no limite
 * de interfaces (contada como absorvida), em unidades de `1 / REFRACTION_ENERGY_SCALE` da luminância da vazão, cada um
 * em 64 bits (palavra baixa e alta, com o vai-um somado à alta).
 */
export const RefractionStatsSchema = new StructSchema('RefractionStats', {
    total_lo: FieldType.u32,
    total_hi: FieldType.u32,
    truncated_lo: FieldType.u32,
    truncated_hi: FieldType.u32,
});

/** Valores de um `Refraction`. */
export interface RefractionValues {
    /** Liga a refração traçada. Default `true`. */
    readonly enabled?: boolean;
    /**
     * Interfaces cruzadas por caminho, em 1–32. Default 16. No limite a energia restante conta como absorvida (o contador
     * `stats` registra a fração).
     */
    readonly maxInterfaces?: number;
}

/** Dado de um `Refraction` (layout de `Refraction.schema`). */
export interface RefractionData {
    /** 1 ligada, 0 desligada. */
    enabled: number;
    /** Interfaces por caminho. */
    max_interfaces: number;
    /** Preenchimento. */
    _pad0: number;
    _pad1: number;
}

/**
 * Valida os valores de autoria.
 * @throws RangeError fora dos intervalos documentados.
 */
function validate(d: RefractionData): void {
    const n = d.max_interfaces;
    if (!Number.isInteger(n) || n < 1 || n > REFRACTION_MAX_INTERFACES)
        throw new RangeError(
            `Refraction: maxInterfaces ${n} fora de 1–${REFRACTION_MAX_INTERFACES}.`,
        );
}

/**
 * Refração traçada (Camada 3, spec 034, R1): o que se vê através de vidro, água e de todo transmissivo, por raios na
 * estrutura de raios (`RayScene`), sem cópia da tela. Depois dos opacos, o desenho dos transmissivos (as duas faces, com
 * profundidade própria em `requestDepth`, à frente dos opacos) marca os pixels cuja primeira superfície é uma interface
 * (`request`: a distância e as marcas); a fila compacta esses pixels (`queue`, com a contagem e os argumentos do
 * despacho indireto em `queueCount`); o estágio da refração refaz o raio da câmera de cada um (o mesmo deslocamento da
 * amostra) e traça o caminho — Fresnel exato, reflexão interna total, GGX pela distribuição visível de normais, pilha
 * de até `REFRACTION_MAX_MEDIA` meios, absorção de Beer–Lambert e dispersão por canal — escrevendo a radiância
 * transmitida e a refletida (`radiance`, `reflection`), lidas pela composição no próprio pixel. O raster só escolhe os
 * pixels: o valor traçado é o do raio do pixel, também na borda. Os alvos têm o tamanho do canvas e são alocados sob
 * demanda, por quem desenha um transmissivo. Desligada, os transmissivos usam só a reflexão traçada e a opacidade. Um
 * por cena; mudar valores vale no quadro seguinte, sem recompilar.
 */
export class Refraction extends Entity<RefractionData> implements Resource {
    /** Parâmetros (uniform `Refraction`). */
    static readonly schema = new StructSchema(
        'Refraction',
        {
            enabled: FieldType.u32,
            max_interfaces: FieldType.u32,
            _pad0: FieldType.u32,
            _pad1: FieldType.u32,
        },
        { addressSpace: 'uniform' },
    );

    state: ResourceState = ResourceState.Uninitialized;

    constructor(values: RefractionValues = {}) {
        super();
        const data = {
            enabled: values.enabled === false ? 0 : 1,
            max_interfaces: values.maxInterfaces ?? REFRACTION_DEFAULT_INTERFACES,
            _pad0: 0,
            _pad1: 0,
        };
        validate(data);
        this.data = data;
    }

    /** Liga ou desliga a refração traçada. */
    get enabled(): boolean {
        return this.data.enabled === 1;
    }

    set enabled(on: boolean) {
        this.data.enabled = on ? 1 : 0;
    }

    /** Interfaces por caminho, em 1–32. */
    get maxInterfaces(): number {
        return this.data.max_interfaces;
    }

    /** @throws RangeError fora de 1–32 (o valor anterior fica). */
    set maxInterfaces(n: number) {
        validate({ ...this.rawData, max_interfaces: n });
        this.data.max_interfaces = n;
    }

    getDescriptors(): readonly GPUDescriptor[] {
        const target = (id: string, format: GPUTextureFormat): GPUDescriptor => ({
            id,
            role: 'storage-texture',
            allocation: 'onDemand',
            textureShape: { format, sizeFromCanvas: true, access: 'write-only' },
        });
        return [
            { id: 'params', role: 'uniform', schema: Refraction.schema },
            // Pedido por pixel (alvo de render do desenho dos transmissivos, sem amostras): x a distância da câmera à
            // primeira interface (bits de f32), y as marcas; e a profundidade própria desse desenho.
            {
                id: 'request',
                role: 'texture',
                allocation: 'onDemand',
                textureShape: { format: REFRACTION_REQUEST_FORMAT, sizeFromCanvas: true },
            },
            {
                id: 'requestDepth',
                role: 'texture',
                allocation: 'onDemand',
                textureShape: { format: 'depth24plus', sizeFromCanvas: true },
            },
            target('radiance', REFRACTION_RADIANCE_FORMAT),
            target('reflection', REFRACTION_RADIANCE_FORMAT),
            // A fila compacta: o texel i guarda o pixel do i-ésimo pedido (a largura do canvas linha a linha).
            target('queue', REFRACTION_QUEUE_FORMAT),
            {
                id: 'queueCount',
                role: 'indirect',
                schema: SetCountSchema,
                count: 1,
                upload: 'never',
                allocation: 'onDemand',
            },
            {
                id: 'stats',
                role: 'storage-rw',
                schema: RefractionStatsSchema,
                count: 1,
                upload: 'never',
                allocation: 'onDemand',
            },
        ];
    }

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [];
    }
}
