import type { WgslModule } from '../../../scene/shaders/WgslModule';
import {
    PostProcessEffect,
    type EffectRead,
    type EffectStage,
    type EffectTexture,
    type PostProcessOptions,
} from '../../resources/PostProcessEffect';
import { bloomModules, effectResources } from '../shaders';

/** Níveis da pirâmide (o canvas / 2 … / 128). */
const LEVELS = 7;

const down = (i: number): string => `down${i}`;
const up = (i: number): string => `up${i}`;

/** Opções do `Bloom`. */
export interface BloomOptions extends PostProcessOptions {
    /** Fração da energia espalhada pela lente (`strength`). Default 0,04 (o véu de uma objetiva boa: 1–4 %). */
    readonly strength?: number;
    /**
     * `aux[0]`: o expoente da cauda da função de espalhamento (θ^(−p)). Default 3 (o termo de espalhamento de Spencer et
     * al. 1995); 2 espalha mais longe.
     */
    readonly aux?: readonly [number, number, number];
}

/**
 * Bloom — o espalhamento da lente (spec 041; Camada 4): uma fração `strength` da energia de cada pixel sai do núcleo
 * para uma função de espalhamento de cauda longa (θ^(−p), `aux[0]`), sem limiar — a energia se conserva (a imagem é
 * `(1 − G)·cor + G·espalhada`) e o clarão aparece só em volta do que é muito mais forte que o resto: o sol e as luzes.
 * A pirâmide de 7 níveis (Jimenez 2014) soma os desfoques de largura dobrando a cada nível com o peso da energia por
 * oitava da cauda. Lê a radiância acima do teto da cor da cena (`FrameTargets.overflow`: o disco do sol a ~10⁹ nits, que o
 * meio-float não guarda) e soma a energia inteira dela.
 */
export class Bloom extends PostProcessEffect {
    constructor(options: BloomOptions = {}) {
        super({
            ...(options.enabled === undefined ? {} : { enabled: options.enabled }),
            strength: options.strength ?? 0.04,
            aux: options.aux ?? [3, 0, 0],
        });
    }

    get name(): string {
        return 'Bloom';
    }
    get fragmentEntry(): string {
        return 'fs_bloom';
    }

    override fragmentModule(overflow = false): WgslModule {
        return bloomModules.module(overflow);
    }

    override textures(): readonly EffectTexture[] {
        const out: EffectTexture[] = [];
        for (let i = 1; i <= LEVELS; i++) out.push({ id: down(i), divisor: 2 ** i });
        for (let i = 1; i < LEVELS; i++) out.push({ id: up(i), divisor: 2 ** i });
        return out;
    }

    override stages(): readonly EffectStage[] {
        const out: EffectStage[] = [
            {
                id: down(1),
                entry: 'fs_bloom_down_first',
                target: down(1),
                reads: [[effectResources.source, 'source']],
                overflow: true,
            },
        ];
        for (let i = 2; i <= LEVELS; i++)
            out.push({
                id: down(i),
                entry: 'fs_bloom_down',
                target: down(i),
                reads: [[effectResources.source, down(i - 1)]],
            });
        for (let i = LEVELS - 1; i >= 1; i--)
            out.push({
                id: up(i),
                entry: 'fs_bloom_up',
                target: up(i),
                reads: [
                    [effectResources.source, down(i)],
                    [bloomModules.lower, i === LEVELS - 1 ? down(LEVELS) : up(i + 1)],
                ],
            });
        return out;
    }

    override mainReads(): readonly EffectRead[] {
        return [[bloomModules.lower, up(1)]];
    }
}
