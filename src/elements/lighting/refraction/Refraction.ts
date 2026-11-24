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

/**
 * Formato do pedido por pixel: x a distância da câmera à primeira superfície (bits de f32), y as marcas e, nos pedidos
 * de reflexo (`REFRACTION_REQUEST_REFLECT`), z a direção refletida e w a normal geométrica da superfície, cada uma em
 * coordenadas octaédricas de 16 + 16 bits.
 */
export const REFRACTION_REQUEST_FORMAT: GPUTextureFormat = 'rgba32uint';
/** Marcas do pedido (palavra y): há pedido; a primeira interface é uma face de trás (a câmera dentro do meio). */
export const REFRACTION_REQUEST_VALID = sharedConstant('REFRACTION_REQUEST_VALID', 1, 'u32');
export const REFRACTION_REQUEST_BACK_FACE = sharedConstant(
    'REFRACTION_REQUEST_BACK_FACE',
    2,
    'u32',
);
/**
 * Marca do pedido de reflexo (spec 011, T114): a primeira superfície do pixel é opaca com um lobo especular liso — o
 * caminho parte dela na direção refletida, e a radiância traçada soma-se à cor do desenho pelo peso do lobo
 * (`reflectance`) em vez de substituí-la.
 */
export const REFRACTION_REQUEST_REFLECT = sharedConstant('REFRACTION_REQUEST_REFLECT', 4, 'u32');
/**
 * Formato do peso do reflexo traçado (`reflectance`): rgb o que os lobos lisos do fechamento devolvem a quem vê por
 * unidade de radiância que chega pela direção refletida, com a névoa até o ponto.
 */
export const REFRACTION_REFLECTANCE_FORMAT: GPUTextureFormat = 'rgba16float';
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
 * Formato do último traçado de cada pixel (`trace`, série temporal): xyz o ponto em que terminou o caminho que mais
 * contribui para a cor (bits de f32) e w a etiqueta — o registro do objeto atingido nos 20 bits de baixo (`NONE` e os
 * acima: 0xFFFFF), o deslocamento da amostra dentro do pixel no traçado (em pixels, [−½, ½] em 31 passos) em x nos
 * bits 20–24 e em y nos 25–29, no bit 30 se o ponto discordava dos traçados anteriores em volta e o bit 31 marcando o
 * texel traçado.
 */
export const REFRACTION_TRACE_FORMAT: GPUTextureFormat = 'rgba32uint';

/**
 * Formato do albedo do ponto que o pixel mostra (`albedo`): a refletância (`closure_albedo`) da superfície em que termina
 * o caminho que mais contribui para a cor; 1 no céu e sem superfície — o guia de textura do filtro do sinal traçado
 * (casas de albedo diferente não se misturam). No alfa, 1 se algum caminho do pixel tocou uma instância que se moveu.
 */
export const REFRACTION_ALBEDO_FORMAT: GPUTextureFormat = 'rgba16float';
/**
 * Formato da marca de movimento do quadro anterior (`gradient`, por pixel): x a parte da luz do pixel que veio por
 * caminhos que tocaram algo em movimento (a do alfa de `albedo`, copiada antes do traçado a reescrever).
 */
export const REFRACTION_GRADIENT_FORMAT: GPUTextureFormat = 'rgba16float';
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
    /**
     * Liga o reflexo traçado dos opacos lisos (o metal polido, o verniz, o plástico brilhante). Default `true`; só há
     * traçado numa cena com a estrutura de raios (`RayScene`).
     */
    readonly reflection?: boolean;
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
    /** 1: metade dos blocos 2×2 traçada por quadro, em xadrez (spec 039, Opção B2); 0: todos. */
    checkerboard: number;
    /**
     * Quadro do último corte da câmera (escrito pelo estágio): a vez do representante do bloco 2×2 conta os quadros
     * desde ele, como a sequência das posições da amostra, que recomeça no corte (T075).
     */
    sample_origin: number;
    /** 1: o reflexo dos opacos lisos é traçado; 0: vem da luz indireta da cena. */
    reflection: number;
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
 * temporal (`gradient`: a mudança da cena por bloco, pelas marcas de movimento que o traçado deixa no alfa de
 * `albedo`), e o estágio passa a medi-lo.
 * O raster só escolhe os pixels: o valor traçado é o do raio do pixel, também na borda. Os alvos têm o tamanho do
 * canvas e são alocados sob demanda, por
 * quem desenha um transmissivo ou por quem os lê. Desligada, os transmissivos usam só a reflexão traçada e a opacidade.
 * O mesmo traçado serve ao reflexo dos opacos lisos (`reflection`, spec 011, T114): o desenho marca os pixels deles com
 * `REFRACTION_REQUEST_REFLECT`, a direção refletida e o peso do lobo (`reflectance`); o caminho parte da superfície e a
 * composição soma a radiância dele à cor do desenho.
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
            checkerboard: FieldType.u32,
            sample_origin: FieldType.u32,
            reflection: FieldType.u32,
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
            checkerboard: 0,
            sample_origin: 0,
            reflection: values.reflection === false ? 0 : 1,
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

    /**
     * O reflexo traçado dos opacos lisos (spec 011, T114): com a estrutura de raios na cena, o pixel de um opaco com um
     * lobo especular liso (rugosidade abaixo de 0,2: o metal polido, o verniz, o plástico brilhante) pede um raio na
     * direção refletida, e o que ele acha soma-se à cor do desenho no lugar da luz indireta da cena naquele lobo.
     */
    get reflection(): boolean {
        return this.data.reflection === 1;
    }

    set reflection(on: boolean) {
        this.data.reflection = on ? 1 : 0;
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

    /**
     * Metade dos blocos 2×2 traçada por quadro, em xadrez (spec 039, Opção B2): com a imagem parada cada pixel recebe o
     * valor exato a cada 8 quadros (o filtro temporal guarda o histórico); em movimento, o bloco não traçado é
     * reconstruído dos vizinhos traçados.
     */
    get checkerboard(): boolean {
        return this.data.checkerboard === 1;
    }

    set checkerboard(on: boolean) {
        this.data.checkerboard = on ? 1 : 0;
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
            // O peso do reflexo traçado dos opacos lisos (alvo de render do pedido de reflexo; sob demanda, por quem
            // desenha um opaco liso).
            {
                id: 'reflectance',
                role: 'texture',
                allocation: 'onDemand',
                textureShape: { format: REFRACTION_REFLECTANCE_FORMAT, sizeFromCanvas: true },
            },
            target('radiance', REFRACTION_RADIANCE_FORMAT),
            // Série temporal (spec 037): o ponto de agora e o do quadro anterior (quem mede o quanto a imagem que a água
            // ou o vidro levam andou: o movimento da refração).
            { ...target('hit', REFRACTION_HIT_FORMAT), history: { depth: 2 } },
            // Série temporal (spec 037): o último traçado de cada pixel — o representante de agora o compara com o
            // traçado dele ou de um vizinho pela posição da amostra mais próxima: o que o bloco mostra mudou?
            { ...target('trace', REFRACTION_TRACE_FORMAT), history: { depth: 2 } },
            target('albedo', REFRACTION_ALBEDO_FORMAT),
            // A fração da luz de cada pixel que veio por caminhos com sorteio (a de ruído, que o filtro do sinal limpa).
            target('noise', 'r32float'),
            // A mudança da cena por bloco (sob demanda, por quem recomeça históricos: com ela alocada, o estágio a
            // mede pelas marcas de movimento que o traçado deixa no alfa de `albedo`).
            target('gradient', REFRACTION_GRADIENT_FORMAT),
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
            // As rodadas do traçado ao fim das quais ainda havia caminho vivo no quadro (escrita pela GPU; o estágio a lê
            // de volta para despachar só as rodadas que os caminhos usam).
            {
                id: 'roundCount',
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
