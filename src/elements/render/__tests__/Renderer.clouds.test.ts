import { describe, expect, it } from 'vitest';
import { Renderer, RENDER_PROFILES } from '../Renderer';
import { CloudLayer } from '../../media/clouds/CloudLayer';

// Perfis das nuvens no renderizador (spec 041, T034): os valores de R15 por perfil e a camada adotada recebe a qualidade
// a cada troca (os alvos de outro tamanho são realocados: as séries recomeçam pela invalidação do canal).

describe('Renderer — nuvens', () => {
    it('os perfis têm a qualidade das nuvens de R15', () => {
        expect(RENDER_PROFILES.high.clouds).toMatchObject({
            steps: 128,
            lightSteps: 6,
            octaves: 3,
        });
        expect(RENDER_PROFILES.medium.clouds).toMatchObject({
            steps: 64,
            lightSteps: 5,
            octaves: 3,
        });
        expect(RENDER_PROFILES.low.clouds).toMatchObject({
            steps: 48,
            lightSteps: 4,
            octaves: 3,
            marchScale: 4,
        });
        expect(RENDER_PROFILES.high.clouds.marchScale).toBe(2);
        expect(RENDER_PROFILES.medium.clouds.marchScale).toBe(2);
        expect(RENDER_PROFILES.high.clouds.panorama).toEqual([256, 128]);
        // O mapa visto do sol por páginas (R11 revisto): o mesmo atlas, o orçamento de páginas por quadro pelo perfil.
        expect(RENDER_PROFILES.low.clouds.shadow).toEqual({ texel: 50, budget: 64 });
        expect(RENDER_PROFILES.high.clouds.shadow.budget).toBeGreaterThan(
            RENDER_PROFILES.low.clouds.shadow.budget,
        );
    });

    it('a camada adotada segue o perfil', () => {
        const renderer = new Renderer();
        const layer = new CloudLayer();
        renderer.adopt(layer);
        expect(layer.quality.steps).toBe(128);
        renderer.profile = 'low';
        expect(layer.quality.steps).toBe(48);
        expect(layer.getDescriptors().find((d) => d.id === 'panorama')?.textureShape?.width).toBe(
            128,
        );
        // No baixo, o alvo reconstruído a 1/16 da tela e a marcha a 1/64 (T035); no alto, ¼ e 1/16.
        const divisor = (id: string): number | undefined =>
            layer.getDescriptors().find((d) => d.id === id)?.textureShape?.canvasDivisor;
        expect([divisor('march'), divisor('marchDepth'), divisor('trace')]).toEqual([4, 4, 8]);
        renderer.profile = 'high';
        expect([divisor('march'), divisor('trace')]).toEqual([2, 4]);
        renderer.profile = 'low';
        renderer.release(layer);
        renderer.profile = 'high';
        expect(layer.quality.steps).toBe(48);
    });
});
