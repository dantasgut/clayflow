import { Entity } from '../../../scene/contracts/Entity';
import { ResourceState } from '../../../scene/contracts/ResourceState';
import type { Resource } from '../../../scene/contracts/Resource';
import type { GPUDescriptor } from '../../../scene/descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../../../scene/descriptors/PipelineDescriptor';
import { FieldType } from '../../../scene/descriptors/FieldType';
import { StructSchema } from '../../../scene/descriptors/StructSchema';
import { SetCountSchema } from '../../../scene/graph/SetCountSchema';
import { sharedConstant } from '../../../scene/shaders/SharedConstant';

/**
 * Meios na pilha de um caminho (spec 034, R1): fixo no WGSL; um meio além disso conta a energia do caminho como no
 * limite de interfaces.
 */
export const REFRACTION_MAX_MEDIA = sharedConstant('REFRACTION_MAX_MEDIA', 4, 'u32');
/** Interfaces por caminho, padrão e teto (spec 034, R1). */
export const REFRACTION_DEFAULT_INTERFACES = 16;
export const REFRACTION_MAX_INTERFACES = 32;
/**
 * Estado do quadro (`frame`, rgba32uint, uma linha): os meios em que a câmera está (dois texels por meio, os
 * `REFRACTION_MAX_MEDIA` primeiros) e, no texel `REFRACTION_FRAME_COUNT`, a contagem da fila.
 */
export const REFRACTION_FRAME_COUNT = sharedConstant('REFRACTION_FRAME_COUNT', 8, 'u32');

/** Formato do pedido por pixel: a distância da câmera à primeira interface (bits de f32) e as marcas. */
export const REFRACTION_REQUEST_FORMAT: GPUTextureFormat = 'rg32uint';
/** Marcas do pedido (palavra y): há pedido; a primeira interface é uma face de trás (a câmera dentro do meio). */
export const REFRACTION_REQUEST_VALID = sharedConstant('REFRACTION_REQUEST_VALID', 1, 'u32');
export const REFRACTION_REQUEST_BACK_FACE = sharedConstant(
    'REFRACTION_REQUEST_BACK_FACE',
    2,
    'u32',
);
/** Formato da radiância traçada (a transmitida mais a refletida na primeira interface; no alfa, a energia truncada). */
export const REFRACTION_RADIANCE_FORMAT: GPUTextureFormat = 'rgba16float';
/**
 * Formato do ponto que o pixel mostra (`hit`): xyz o ponto de mundo em que termina o caminho que mais contribui para a
 * cor (o transmitido ou o refletido), w o registro `Renderable` do objeto atingido em bits (`NONE`: o céu, a um
 * milhão de unidades na direção do raio, ou um objeto sem registro). Quem quiser saber como esse conteúdo se move
 * (vetores de movimento do antisserrilhado temporal) o lê; o traçado não sabe de movimento.
 */
export const REFRACTION_HIT_FORMAT: GPUTextureFormat = 'rgba32float';
/**
 * Lado do bloco de pixels do gradiente temporal (spec 034, T044a): em cada bloco, a amostra de um pixel do quadro
 * anterior é refeita na cena de agora.
 */
export const REFRACTION_STRATUM = sharedConstant('REFRACTION_STRATUM', 3, 'u32');
/**
 * Formato do gradiente temporal (`gradient`, um texel por bloco): x |Δ| da luminância da amostra refeita, y a maior das
 * duas.
 */
export const REFRACTION_GRADIENT_FORMAT: GPUTextureFormat = 'rgba16float';
/**
 * Formato do raio guardado por bloco para o gradiente do quadro seguinte (`gradientOrigin`: a origem e o plano
 * próximo + 1, 0 sem amostra; `gradientDirection`: a direção e o pixel em bits).
 */
export const REFRACTION_GRADIENT_RAY_FORMAT: GPUTextureFormat = 'rgba32float';
/** Formato da fila de pixels: o índice linear do pixel (`x + y · largura`), um por texel. */
export const REFRACTION_QUEUE_FORMAT: GPUTextureFormat = 'r32uint';

/** Valores de um `Refraction`. */
export interface RefractionValues {
    /** Liga a refração traçada. Default `true`. */
    readonly enabled?: boolean;
    /**
     * Interfaces cruzadas por caminho, em 1–32. Default 16. No limite a energia restante conta como absorvida (a
     * luminância dela vai para o alfa de `radiance`, por pixel).
     */
    readonly maxInterfaces?: number;
}

/** Dado de um `Refraction` (layout de `Refraction.schema`). */
export interface RefractionData {
    /** 1 ligada, 0 desligada. */
    enabled: number;
    /** Interfaces por caminho. */
    max_interfaces: number;
    /** Slot da câmera ativa no pool `CameraMatrices` (escrito pelo estágio a cada quadro). */
    camera_slot: number;
    /** Slots usados do pool de luzes (escrito pelo estágio). */
    light_count: number;
    /** Quadro (a semente dos caminhos; escrito pelo estágio). */
    frame: number;
    /** Tempo simulado (as funções `material` nos acertos; escrito pelo estágio). */
    time: number;
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
 * de até `REFRACTION_MAX_MEDIA` meios, absorção de Beer–Lambert e dispersão por canal — escrevendo a radiância (a
 * transmitida mais a refletida na primeira interface, em `radiance`), lida pela composição no próprio pixel, e o ponto
 * que o pixel mostra (`hit`). Quem recomeça históricos (o filtro do sinal traçado, a máscara reativa) aloca o gradiente
 * temporal (`gradient`, pelos raios guardados em `gradientOrigin` e `gradientDirection`), e o traçado passa a medi-lo.
 * O raster só escolhe os pixels: o valor traçado é o do raio do pixel, também na borda. Os alvos têm o tamanho do
 * canvas (os do gradiente, um texel por bloco de `REFRACTION_STRATUM` pixels de lado) e são alocados sob demanda, por
 * quem desenha um transmissivo ou por quem os lê. Desligada, os transmissivos usam só a reflexão traçada e a opacidade.
 * Um por cena; mudar valores vale no quadro seguinte, sem recompilar.
 */
export class Refraction extends Entity<RefractionData> implements Resource {
    /** Parâmetros (uniform `Refraction`). */
    static readonly schema = new StructSchema(
        'Refraction',
        {
            enabled: FieldType.u32,
            max_interfaces: FieldType.u32,
            camera_slot: FieldType.u32,
            light_count: FieldType.u32,
            frame: FieldType.u32,
            time: FieldType.f32,
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
            camera_slot: 0,
            light_count: 0,
            frame: 0,
            time: 0,
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
        const target = (
            id: string,
            format: GPUTextureFormat,
            canvasDivisor = 1,
        ): GPUDescriptor => ({
            id,
            role: 'storage-texture',
            allocation: 'onDemand',
            textureShape: {
                format,
                sizeFromCanvas: true,
                access: 'write-only',
                ...(canvasDivisor === 1 ? {} : { canvasDivisor }),
            },
        });
        const stratum = REFRACTION_STRATUM.value;
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
            target('hit', REFRACTION_HIT_FORMAT),
            // O gradiente temporal, um texel por bloco (sob demanda, por quem recomeça históricos: com ele alocado, o
            // traçado o mede); os raios do quadro anterior e os deste (copiados para aqueles depois do gradiente).
            target('gradient', REFRACTION_GRADIENT_FORMAT, stratum),
            target('gradientOrigin', REFRACTION_GRADIENT_RAY_FORMAT, stratum),
            target('gradientDirection', REFRACTION_GRADIENT_RAY_FORMAT, stratum),
            target('gradientOriginNext', REFRACTION_GRADIENT_RAY_FORMAT, stratum),
            target('gradientDirectionNext', REFRACTION_GRADIENT_RAY_FORMAT, stratum),
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
                id: 'frame',
                role: 'storage-texture',
                allocation: 'onDemand',
                textureShape: {
                    format: 'rgba32uint',
                    width: 2 * REFRACTION_MAX_MEDIA.value + 1,
                    height: 1,
                    access: 'write-only',
                },
            },
        ];
    }

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [];
    }
}
