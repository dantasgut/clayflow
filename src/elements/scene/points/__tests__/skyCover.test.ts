import { describe, expect, it } from 'vitest';
import { composeWgsl } from '../../../../scene/shaders/composeWgsl';
import { bindPoints } from '../../../../scene/shaders/bindPoints';
import { DirectionalLight } from '../../DirectionalLight';
import { Sky } from '../../sky/Sky';
import { sceneEnvironmentPoint, skyCoverPoint } from '../lighting';
import { cloudSkyCover } from '../../../media/clouds/shaders';
import { instantiateModule } from '../../../../scene/shaders/instantiate';

// O ponto `sky_cover` (spec 041, T013): sem contribuinte, o ambiente do `Sky` é o WGSL de antes; com uma `CloudLayer`, ele
// lê `sky_cover` (o céu tapado e a luz das nuvens); a composição de vários é "na frente de".

const environmentOf = (sky: Sky) =>
    sky
        .getSceneContributions()
        .find((c) => c.point === sceneEnvironmentPoint)!
        .build(() => undefined)!;

describe('sky_cover', () => {
    it('sem nada cobrindo, o ambiente do Sky é o de antes (o mesmo texto composto)', () => {
        const sky = new Sky({ sun: new DirectionalLight() });
        const source = composeWgsl(environmentOf(sky)).spec.source;
        expect(source).toContain('return sky_radiance(dir);');
        expect(source).not.toContain('sky_cover');
    });

    it('coberto, o ambiente compõe o céu atrás do que cobre', () => {
        const sky = new Sky({ sun: new DirectionalLight() });
        sky.setCovered(true);
        const module = environmentOf(sky);
        const ready = composeWgsl(module).spec.source;
        expect(ready).toContain('return sky_radiance(dir) * cover.a + cover.rgb;');
        // Com as nuvens no lugar do pronto.
        const bound = composeWgsl(bindPoints(module, new Map([[skyCoverPoint, cloudSkyCover]])))
            .spec.source;
        expect(bound).toContain('cloud_panorama_tex');
    });

    it('vários contribuintes: cada um na frente do seguinte', () => {
        const combined = skyCoverPoint.combine([
            instantiateModule(cloudSkyCover, '_0'),
            instantiateModule(cloudSkyCover, '_1'),
        ]);
        const source = combined.source;
        expect(source).toContain('cover = vec4f(cover.rgb + cover.a * c0.rgb, cover.a * c0.a);');
        expect(source).toContain('let c1 = sky_cover_1(dir);');
    });
});
