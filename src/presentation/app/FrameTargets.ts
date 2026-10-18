import { Entity } from '../../scene/contracts/Entity';
import { ResourceState } from '../../scene/contracts/ResourceState';
import type { Resource } from '../../scene/contracts/Resource';
import type { GPUDescriptor } from '../../scene/descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../../scene/descriptors/PipelineDescriptor';
import { FieldType } from '../../scene/descriptors/FieldType';
import { StructSchema } from '../../scene/descriptors/StructSchema';

/** Opções dos alvos da cena. */
export interface FrameTargetsOptions {
    /** Amostras por pixel (MSAA): 4 suaviza as bordas da geometria; 1 desliga. Default 4. */
    readonly samples?: 1 | 4;
    /**
     * Passe de profundidade dos opacos antes da cor (spec 033): cada pixel sombreado uma vez. Vale quando o sombreamento
     * por pixel é caro (a luz rebatida); com sombreamento barato só dobra o trabalho dos vértices. Os estágios padrão o
     * ligam quando entra uma `GlobalIllumination` e desligam quando sai a última. Default desligado.
     */
    readonly depthPrepass?: boolean;
}

/** Dado dos `FrameTargets`: o passe de profundidade (1 ligado, 0 desligado), lido pelo desenho a cada quadro. */
export interface FrameTargetsData {
    depthPrepass: number;
}

/** Cor de limpeza da cena: o fundo onde nada desenha e não há céu (também o que vê o raio refratado que escapa). */
export const SCENE_CLEAR_COLOR: readonly [number, number, number, number] = [0.05, 0.07, 0.12, 1.0];

/** Formato da cor da cena (spec 011): ponto flutuante de 16 bits por canal — nada é cortado em [0, 1] antes da apresentação. */
export const SCENE_COLOR_FORMAT: GPUTextureFormat = 'rgba16float';

/**
 * Alvos da cena do quadro (Camada 4): a cor (`color`, HDR em `rgba16float`, lida pelo pós e pela apresentação) e a
 * profundidade (`depth`, `depth24plus`), do tamanho do canvas e recriadas pela C2 quando ele muda. Com MSAA (spec 008,
 * `samples: 4`, o padrão), também a cor multiamostrada (`samples`): os passes da cena desenham nela e resolvem na
 * `color`; a profundidade tem as mesmas amostras. A cópia da cena com mips (`sceneCopy`, spec 011) e os alvos da
 * refração (`refraction*`, spec 034: pedidos, distância, profundidade própria, radiância traçada) são alocados sob
 * demanda, por quem os usa (a água e os transmissivos). Um por cena, inserido pela aplicação.
 */
export class FrameTargets extends Entity<FrameTargetsData> implements Resource {
    /** Identidade dos alvos na cena (o World indexa pelo schema da classe); sem dados de GPU próprios. */
    static readonly schema = new StructSchema('FrameTargets', { _unused: FieldType.u32 });

    state: ResourceState = ResourceState.Uninitialized;
    /** Amostras por pixel (1 = sem MSAA). */
    readonly samples: 1 | 4;

    constructor(options: FrameTargetsOptions = {}) {
        super();
        this.samples = options.samples ?? 4;
        this.data = { depthPrepass: options.depthPrepass === true ? 1 : 0 };
    }

    getDescriptors(): readonly GPUDescriptor[] {
        const samples = this.samples;
        return [
            {
                id: 'color',
                role: 'texture',
                textureShape: { format: SCENE_COLOR_FORMAT, sizeFromCanvas: true },
            },
            {
                // Cópia da cor resolvida com a cadeia de mips (borrada por nível): o que está atrás, para refratar.
                id: 'sceneCopy',
                role: 'storage-texture',
                allocation: 'onDemand',
                textureShape: {
                    format: SCENE_COLOR_FORMAT,
                    sizeFromCanvas: true,
                    mipLevelCount: 'full',
                    access: 'write-only',
                },
            },
            {
                // Pedido de refração por pixel (spec 034): normal, IOR e Abbe, rugosidade, absorção e peso.
                id: 'refractionRequest',
                role: 'texture',
                allocation: 'onDemand',
                textureShape: { format: 'rgba32uint', sizeFromCanvas: true },
            },
            {
                // Distância da câmera ao ponto de cada pedido de refração.
                id: 'refractionDistance',
                role: 'texture',
                allocation: 'onDemand',
                textureShape: { format: 'r32float', sizeFromCanvas: true },
            },
            {
                // Profundidade própria do passe de pedidos (a face da frente mais próxima por pixel).
                id: 'refractionZ',
                role: 'texture',
                allocation: 'onDemand',
                textureShape: { format: 'depth24plus', sizeFromCanvas: true },
            },
            {
                // Radiância transmitida traçada por pixel (rgb) e a distância à superfície vista (a).
                id: 'refractionRadiance',
                role: 'storage-texture',
                allocation: 'onDemand',
                textureShape: { format: 'rgba16float', sizeFromCanvas: true, access: 'write-only' },
            },
            {
                // O que o traçado traz sem as luzes e o passo intermediário do desfoque da rugosidade.
                id: 'refractionBlur',
                role: 'storage-texture',
                allocation: 'onDemand',
                textureShape: { format: 'rgba16float', sizeFromCanvas: true, access: 'write-only' },
            },
            {
                // A superfície vista pelo raio refratado: ponto e se há superfície a iluminar.
                id: 'refractionHit',
                role: 'storage-texture',
                allocation: 'onDemand',
                textureShape: { format: 'rgba32float', sizeFromCanvas: true, access: 'write-only' },
            },
            {
                // Normal, instância, uv e a direção de onde se vê a superfície.
                id: 'refractionHitInfo',
                role: 'storage-texture',
                allocation: 'onDemand',
                textureShape: { format: 'rgba32uint', sizeFromCanvas: true, access: 'write-only' },
            },
            {
                // O quanto chega da superfície vista.
                id: 'refractionThroughput',
                role: 'storage-texture',
                allocation: 'onDemand',
                textureShape: { format: 'rgba16float', sizeFromCanvas: true, access: 'write-only' },
            },
            {
                id: 'depth',
                role: 'texture',
                textureShape: {
                    format: 'depth24plus',
                    sizeFromCanvas: true,
                    ...(samples > 1 ? { sampleCount: samples } : {}),
                },
            },
            ...(samples > 1
                ? [
                      {
                          id: 'samples',
                          role: 'texture' as const,
                          textureShape: {
                              format: SCENE_COLOR_FORMAT,
                              sizeFromCanvas: true,
                              sampleCount: samples,
                          },
                      },
                  ]
                : []),
        ];
    }

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [];
    }
}
