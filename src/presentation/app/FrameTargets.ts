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
    /**
     * Desenho conduzido pela GPU (spec 034, T060d): o desenho principal descarta na GPU as instâncias fora do tronco da
     * câmera e as escondidas atrás do que já foi desenhado (a hierarquia de profundidade em duas fases). Desligado, todas
     * as instâncias desenham — a mesma imagem, para conferir o descarte. Default ligado.
     */
    readonly culling?: boolean;
}

/**
 * Dado dos `FrameTargets`, lido pelo desenho a cada quadro: o passe de profundidade e o descarte pela GPU (1 ligado, 0
 * desligado).
 */
export interface FrameTargetsData {
    depthPrepass: number;
    culling: number;
}

/** Formato da cor da cena (spec 011): ponto flutuante de 16 bits por canal — nada é cortado em [0, 1] antes da apresentação. */
export const SCENE_COLOR_FORMAT: GPUTextureFormat = 'rgba16float';

/**
 * Formato do alvo da luz que chega (spec 034): a direta e a total, demoduladas (r, g; b e a sem uso). Quatro canais
 * (spec 041, T074): o `rg16float` não tem storage de leitura e escrita em formato nenhum do WebGPU, e a composição das
 * nuvens por compute sobre a lista de blocos lê e escreve a luz no mesmo despacho.
 */
export const LIGHT_FORMAT: GPUTextureFormat = 'rgba16float';

/**
 * Unidade do alvo da radiância acima do teto da cor (`overflow`, spec 041): ele guarda o excesso dividido por ela (o disco
 * do sol, ~10⁹ nits, cabe no meio-float de 16 bits, máx. 65504).
 */
export const OVERFLOW_UNIT = 65536;

/**
 * Alvos da cena do quadro (Camada 4): a cor (`color`, HDR em `rgba16float`, lida pelo pós e pela apresentação) e a
 * profundidade (`depth`, `depth24plus`), do tamanho do canvas e recriadas pela C2 quando ele muda. Com MSAA (spec 008,
 * `samples: 4`, o padrão), também a cor multiamostrada (`samples`): os passes da cena desenham nela e resolvem na
 * `color`; a profundidade tem as mesmas amostras. Um por cena, inserido pela aplicação.
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
        this.data = {
            depthPrepass: options.depthPrepass === true ? 1 : 0,
            culling: options.culling === false ? 0 : 1,
        };
    }

    getDescriptors(): readonly GPUDescriptor[] {
        const samples = this.samples;
        return [
            {
                id: 'color',
                role: 'texture',
                // Composta por compute nos blocos com nuvem (spec 041, T074), quando o device permite.
                textureShape: { format: SCENE_COLOR_FORMAT, sizeFromCanvas: true, storage: 'read-write' },
            },
            // Vetores de movimento (spec 034): o deslocamento em uv do ponto de cada pixel desde o quadro anterior (rg) e
            // o do que está atrás dele (ba: difere de rg só sob um transmissivo, cuja cor é a do que está atrás),
            // escritos pelo passe de movimento do forward (sem MSAA) e lidos pela resolução temporal.
            ...(samples === 1
                ? [
                      {
                          id: 'motion',
                          role: 'texture' as const,
                          textureShape: { format: 'rgba16float' as const, sizeFromCanvas: true },
                      },
                      // Máscara reativa (spec 034, T044a): 1 onde o que o pixel mostra mudou de um quadro para o outro sem
                      // que o vetor de movimento o leve até lá (o conteúdo visto pelo vidro) — a resolução temporal
                      // recomeça o histórico ali. Escrita por quem sabe da mudança (a refração), lida pela resolução.
                      {
                          id: 'reactive',
                          role: 'texture' as const,
                          textureShape: {
                              format: 'r8unorm' as const,
                              sizeFromCanvas: true,
                              storage: 'read-write' as const,
                          },
                      },
                      // A luz que chega ao ponto de cada pixel (spec 034), sem a textura (a radiância refletida sobre a
                      // refletância do fechamento): r a direta, g toda (a direta mais a rebatida). Escrita pelo passe
                      // principal do forward e lida pela resolução temporal: a direta separa a sombra ou a luz que passa
                      // sobre a superfície parada; a razão das totais reilumina o histórico.
                      {
                          id: 'light',
                          role: 'texture' as const,
                          textureShape: {
                              format: LIGHT_FORMAT,
                              sizeFromCanvas: true,
                              storage: 'read-write' as const,
                          },
                      },
                  ]
                : []),
            // A radiância acima do teto da cor (spec 041): o meio-float guarda até 65504 e o disco do sol tem ~10⁹ nits —
            // quem desenha uma fonte mais forte que o alvo põe aqui o excesso (em unidades de `OVERFLOW_UNIT`), já
            // atenuado pelo que está na frente dela; o espalhamento da lente (o `Bloom`) soma a energia inteira e limpa o
            // alvo depois de ler. Alocado quando alguém o pede.
            {
                id: 'overflow',
                role: 'texture',
                allocation: 'onDemand',
                textureShape: { format: SCENE_COLOR_FORMAT, sizeFromCanvas: true },
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
