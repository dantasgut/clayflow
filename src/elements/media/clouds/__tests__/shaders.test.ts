import { describe, expect, it } from 'vitest';
import { bindPoints } from '../../../../scene/shaders/bindPoints';
import { composeWgsl } from '../../../../scene/shaders/composeWgsl';
import { LayoutInferencer } from '../../../../scene/systems/LayoutInferencer';
import { skyAerialKernel, skyAerialLookup } from '../../../scene/sky/shaders';
import { skyComposite } from '../../../../presentation/flows/shaders';
import { CloudLayer } from '../CloudLayer';
import {
    cloudAmbientKernel,
    cloudCoverageKernel,
    cloudLightTransmission,
    cloudMarchKernel,
    cloudNoiseKernel,
    cloudPanoramaKernel,
    cloudReconstructKernel,
    cloudScatterKernel,
    cloudShadowKernel,
    cloudShapeAt,
    cloudShapeAtPoint,
    cloudSkyCover,
    cloudUpsampleKernel,
} from '../shaders';

// Módulos das nuvens (spec 041, T017): cada kernel monta (cada símbolo uma vez, recursos resolvidos) e o layout das
// entradas é inferido; a forma padrão (o grafo) entra no kernel dos volumes no lugar do pronto.

const kernels: [string, Parameters<typeof composeWgsl>[0], string][] = [
    ['cloud_noise shape', cloudNoiseKernel, 'cloud_noise_shape_main'],
    ['cloud_noise detail', cloudNoiseKernel, 'cloud_noise_detail_main'],
    ['cloud_coverage', cloudCoverageKernel, 'cloud_coverage_main'],
    ['cloud_ambient', cloudAmbientKernel, 'cloud_ambient_main'],
    ['cloud_shadow', cloudShadowKernel, 'cloud_shadow_main'],
    ['cloud_march', cloudMarchKernel.single, 'cloud_march_main'],
    ['cloud_march_ms', cloudMarchKernel.multisampled, 'cloud_march_main'],
    ['cloud_reconstruct', cloudReconstructKernel.single, 'cloud_reconstruct_main'],
    ['cloud_reconstruct_ms', cloudReconstructKernel.multisampled, 'cloud_reconstruct_main'],
    ['cloud_upsample', cloudUpsampleKernel.single, 'cloud_upsample_main'],
    ['cloud_upsample_ms', cloudUpsampleKernel.multisampled, 'cloud_upsample_main'],
    ['cloud_panorama', cloudPanoramaKernel, 'cloud_panorama_main'],
    ['cloud_scatter', cloudScatterKernel, 'cloud_scatter_main'],
    ['sky_aerial', skyAerialKernel, 'sky_aerial_main'],
];

describe('módulos das nuvens', () => {
    it.each(kernels)('%s monta e o layout é inferido', (_name, module, entry) => {
        // Act
        const composed = composeWgsl(module);
        const layout = new LayoutInferencer().infer(composed, [entry]);
        // Assert
        expect(composed.spec.source).toContain(`fn ${entry}(`);
        expect(layout).toBeDefined();
    });

    it('a composição das nuvens monta nas duas variantes de amostras, sem escrever a luz que chega', () => {
        for (const ms of [false, true])
            for (const entry of ['sky_composite_multiply_fs', 'sky_composite_add_fs']) {
                const composed = composeWgsl(skyComposite.module(ms));
                const layout = new LayoutInferencer().infer(composed, [
                    'refraction_screen_vs',
                    entry,
                ]);
                expect(layout).toBeDefined();
                expect(composed.spec.source).toContain('cloud_view_tex');
                // A atmosfera da geometria é do `scene_fog` (o `Sky`), não da composição.
                expect(composed.spec.source).not.toContain('sky_aerial_lut');
                // A luz que chega fica a do céu atrás das nuvens (a resolução temporal reilumina o fundo por ela).
                expect(composed.spec.source).not.toContain('_light_fs');
            }
    });

    it('as contribuições montam sozinhas', () => {
        expect(composeWgsl(cloudLightTransmission).spec.source).toContain(
            'fn light_transmission(light: u32, p: vec3f) -> vec3f',
        );
        expect(composeWgsl(cloudSkyCover).spec.source).toContain(
            'fn sky_cover(dir: vec3f) -> vec4f',
        );
        expect(composeWgsl(skyAerialLookup).spec.source).toContain('fn sky_aerial(');
    });

    it('o grafo padrão de forma entra no kernel dos volumes no lugar do pronto', () => {
        // Arrange
        const layer = new CloudLayer();
        const composite = layer.shapeFunction.composite!;
        // Act
        const shader = bindPoints(
            cloudNoiseKernel,
            new Map([[cloudShapeAtPoint, cloudShapeAt(composite)]]),
        );
        const source = composeWgsl(shader).spec.source;
        // Assert
        expect(source).toContain(
            `return ${composite.functionName}(p, ${composite.loaderName}(slot));`,
        );
        expect(source).toContain('node_noise_cellular3');
        expect(source).not.toContain('cloud_shape_at_ready');
    });

    it('todo laço da marcha tem teto constante (o orçamento total é passos × (1 + passos de luz))', () => {
        const source = composeWgsl(cloudMarchKernel.single).spec.source;
        expect(source).toContain('for (var i = 0u; i < CLOUD_MAX_STEPS; i++)');
        expect(source).toContain('for (var i = 0u; i < CLOUD_MAX_LIGHT_STEPS; i++)');
        expect(source).not.toMatch(/\bwhile\b|\bloop\b/);
    });
});
