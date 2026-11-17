import { describe, expect, it } from 'vitest';
import { Renderer, RENDER_PROFILES } from '../Renderer';
import { CloudLayer } from '../../media/clouds/CloudLayer';

// Perfis das nuvens no renderizador (spec 041, T034): os valores de R15 por perfil e a camada adotada recebe a qualidade
// a cada troca (os alvos de outro tamanho são realocados: as séries recomeçam pela invalidação do canal).

describe('Renderer — nuvens', () => {
    it('os perfis têm a qualidade das nuvens de R15', () => {
        expect(RENDER_PROFILES.high.clouds).toMatchObject({ steps: 96, lightSteps: 6, octaves: 3 });
        expect(RENDER_PROFILES.medium.clouds).toMatchObject({
            steps: 64,
            lightSteps: 5,
            octaves: 3,
        });
        expect(RENDER_PROFILES.low.clouds).toMatchObject({ steps: 48, lightSteps: 4, octaves: 3 });
        expect(RENDER_PROFILES.high.clouds.panorama).toEqual([256, 128]);
        expect(RENDER_PROFILES.low.clouds.shadow).toEqual({ size: 256, extent: 16_000 });
    });

    it('a camada adotada segue o perfil', () => {
        const renderer = new Renderer();
        const layer = new CloudLayer();
        renderer.adopt(layer);
        expect(layer.quality.steps).toBe(96);
        renderer.profile = 'low';
        expect(layer.quality.steps).toBe(48);
        expect(layer.getDescriptors().find((d) => d.id === 'panorama')?.textureShape?.width).toBe(
            128,
        );
        renderer.release(layer);
        renderer.profile = 'high';
        expect(layer.quality.steps).toBe(48);
    });
});
