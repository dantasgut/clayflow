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
    cloudCoverageWeatherKernel,
    cloudLightArgsKernel,
    cloudLightSamplesKernel,
    cloudLightTransmission,
    cloudMarchComposeKernel,
    cloudMarchKernel,
    cloudNoiseKernel,
    cloudPanoramaKernel,
    cloudPressureAt,
    cloudPressureAtPoint,
    cloudReconstructKernel,
    cloudScatterKernel,
    cloudShadowKernel,
    cloudShapeAt,
    cloudShapeAtPoint,
    cloudSkyCover,
    cloudUpsampleKernel,
    cloudWeatherKernel,
    cloudWindAtPoint,
    cloudWindWeather,
} from '../shaders';

// Módulos das nuvens (spec 041, T017): cada kernel monta (cada símbolo uma vez, recursos resolvidos) e o layout das
// entradas é inferido; a forma padrão (o grafo) entra no kernel dos volumes no lugar do pronto.

const kernels: [string, Parameters<typeof composeWgsl>[0], string][] = [
    ['cloud_noise shape', cloudNoiseKernel, 'cloud_noise_shape_main'],
    ['cloud_noise detail', cloudNoiseKernel, 'cloud_noise_detail_main'],
    ['cloud_coverage', cloudCoverageKernel, 'cloud_coverage_draw_main'],
    ['cloud_coverage select', cloudCoverageKernel, 'cloud_coverage_select_main'],
    ['cloud_ambient', cloudAmbientKernel, 'cloud_ambient_main'],
    ['cloud_shadow', cloudShadowKernel.plain, 'cloud_shadow_main'],
    ['cloud_shadow select', cloudShadowKernel.plain, 'cloud_shadow_select_main'],
    ['cloud_shadow select com o tempo', cloudShadowKernel.weather, 'cloud_shadow_select_main'],
    ['cloud_march', cloudMarchKernel.single, 'cloud_march_main'],
    ['cloud_march_ms', cloudMarchKernel.multisampled, 'cloud_march_main'],
    ['cloud_light_samples', cloudLightSamplesKernel, 'cloud_light_samples_main'],
    ['cloud_light_args', cloudLightArgsKernel, 'cloud_light_args_main'],
    ['cloud_march_compose', cloudMarchComposeKernel.single, 'cloud_march_compose_main'],
    ['cloud_march_compose_ms', cloudMarchComposeKernel.multisampled, 'cloud_march_compose_main'],
    ['cloud_reconstruct', cloudReconstructKernel.single, 'cloud_reconstruct_main'],
    ['cloud_reconstruct_ms', cloudReconstructKernel.multisampled, 'cloud_reconstruct_main'],
    ['cloud_check', cloudReconstructKernel.single, 'cloud_check_main'],
    ['cloud_check_ms', cloudReconstructKernel.multisampled, 'cloud_check_main'],
    ['cloud_upsample', cloudUpsampleKernel.single, 'cloud_upsample_main'],
    ['cloud_upsample_ms', cloudUpsampleKernel.multisampled, 'cloud_upsample_main'],
    ['cloud_panorama', cloudPanoramaKernel, 'cloud_panorama_main'],
    ['cloud_scatter', cloudScatterKernel, 'cloud_scatter_main'],
    ['sky_aerial', skyAerialKernel, 'sky_aerial_main'],
    ['cloud_weather_map', cloudWeatherKernel, 'cloud_weather_main'],
    ['cloud_coverage_weather', cloudCoverageWeatherKernel, 'cloud_coverage_draw_main'],
    ['cloud_coverage_weather select', cloudCoverageWeatherKernel, 'cloud_coverage_select_main'],
    [
        'cloud_reconstruct com o tempo',
        bindPoints(cloudReconstructKernel.single, new Map([[cloudWindAtPoint, cloudWindWeather]])),
        'cloud_reconstruct_main',
    ],
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

    it('a composição das nuvens monta nas duas variantes de amostras, com e sem o alvo da luz que chega', () => {
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
                // A luz que chega (spec 041): as variantes com o alvo dela a levam à das nuvens passa-baixa.
                expect(composed.spec.source).toContain(`${entry.replace('_fs', '_light_fs')}(`);
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

    it('o tempo (R19): o padrão de sistemas no lugar pronto; a função de pressão do usuário no lugar dele', () => {
        // Arrange
        const plain = composeWgsl(cloudWeatherKernel).spec.source;
        const layer = new CloudLayer({
            weather: {
                pressure: {
                    code: 'fn pressure_fn(xz: vec2f, time: f32, data: PressureFnParams) -> f32 {\n    return -1500.0 * exp(-dot(xz, xz) / 3.2e11);\n}',
                },
            },
        });
        const composite = layer.pressureFunction!.composite!;
        // Act
        const user = composeWgsl(
            bindPoints(
                cloudWeatherKernel,
                new Map([[cloudPressureAtPoint, cloudPressureAt(composite)]]),
            ),
        ).spec.source;
        // Assert
        expect(plain).toContain('fn cloud_pressure_default(');
        expect(user).toContain(
            `return ${composite.functionName}(xz, time, ${composite.loaderName}(slot));`,
        );
        expect(user).not.toContain('cloud_pressure_fn_at_ready');
        // laços de teto constante: as 9 células, a varredura e a bisseção do vento
        expect(plain).toContain('for (var k = 0u; k < 9u; k++)');
        expect(plain).toContain('for (var k = 1u; k <= CLOUD_WIND_SCAN; k++)');
        expect(plain).toContain('for (var k = 0u; k < CLOUD_WIND_BISECT; k++)');
        expect(plain).not.toMatch(/\bwhile\b|\bloop\b/);
    });

    it('sem o tempo, a reconstrução reprojeta pelo vento uniforme (o lugar pronto)', () => {
        const source = composeWgsl(cloudReconstructKernel.single).spec.source;
        expect(source).toContain(
            'fn cloud_wind_at(p: vec3f) -> vec2f {\n    return clouds.wind.zw;\n}',
        );
        expect(source).not.toContain('cloud_weather_wind_tex');
    });

    it('todo laço da marcha tem teto constante (o orçamento total é passos × (1 + passos de luz))', () => {
        const source = composeWgsl(cloudMarchKernel.single).spec.source;
        expect(source).toContain('for (var i = 0u; i < CLOUD_MAX_STEPS; i++)');
        expect(source).toContain('for (var i = 0u; i < CLOUD_MAX_LIGHT_STEPS; i++)');
        expect(source).not.toMatch(/\bwhile\b|\bloop\b/);
    });

    it('a marcha da tela adia a luz das amostras para a lista do quadro; a que não cabe é calculada no laço (T074)', () => {
        const march = composeWgsl(cloudMarchKernel.single).spec.source;
        const panorama = composeWgsl(cloudPanoramaKernel).spec.source;
        // A marcha da tela: a implementação da lista no lugar do pronto, com a luz no próprio laço só no excedente.
        expect(march).toContain('atomicAdd(&cloud_light_args[3], 1u)');
        expect(march).toContain(
            'if (slot >= min(size.x * size.y, CLOUD_LIGHT_LIST_MAX)) {\n        return weight * cloud_radiance(p, cos_theta, light_steps, occ);',
        );
        expect(march).not.toContain('sky_aerial');
        // O panorama: o pronto, a luz no laço.
        expect(panorama).not.toContain('cloud_light_args');
        expect(panorama).toContain(
            'return weight * cloud_radiance(p, cos_theta, light_steps, occ);',
        );
    });

    it('o passe da luz calcula uma amostra por invocação e a composição soma as do raio com teto constante (T074)', () => {
        const light = composeWgsl(cloudLightSamplesKernel).spec.source;
        const compose = composeWgsl(cloudMarchComposeKernel.single).spec.source;
        expect(light).toContain('if (i >= cloud_light_args_read[4]) { return; }');
        expect(light).not.toContain('CLOUD_MAX_STEPS; i++');
        expect(compose).toContain('for (var k = 0u; k < CLOUD_MAX_STEPS; k++)');
        expect(compose).not.toMatch(/\bwhile\b|\bloop\b/);
    });
});
