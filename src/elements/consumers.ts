import type { ConsumerResolver } from '../scene/consumers/ConsumerResolver';
import { SingletonResolver } from '../scene/consumers/strategies/SingletonResolver';
import { GravityField } from './physics/forcefields/GravityField';
import { ParticlePhysics } from './physics/ParticlePhysics';
import { ShadowCasterResolver } from './scene/shadowCaster';
import { PbrTablesResolver } from './material/pbr/PbrTablesResolver';
import { HemisphereLightSchema } from './scene/HemisphereLightSchema';
import { RaySceneSchema } from './raytrace/schemas';
import { SkySchema } from './scene/sky/SkySchema';
import { GlobalIlluminationSchema } from './lighting/schemas';
import { CausticsSchema } from './lighting/caustics/schemas';
import { EnvironmentMapSchema } from './scene/environment/schema';
import { FluidFieldSchema } from './fields/schemas';
import { FroxelsSchema } from './media/schemas';
import { CloudSchema } from './media/clouds/schemas';
import { Refraction } from './lighting/refraction/Refraction';
import { TemporalFilter } from './lighting/temporal/TemporalFilter';
import { EnergyMeter } from './physics/energy/EnergyMeter';
import { VirtualTexturesResolver } from './material/virtual/VirtualTexturesResolver';

/**
 * Resolvers (fornecedores `{ consumer }`) dos Resources únicos da Camada 3, registrados pela aplicação na cena (sem substituir os da
 * aplicação): `GravityField`, `ParticlePhysics` e o mapa de sombra que projeta (`ShadowCaster.atlas`: a
 * tabela e as páginas, spec 031 e T060h) as tabelas do sombreamento físico (`PbrTables.dfg`, `PbrTables.sampler`, spec 011), a estrutura de raios (`RayScene.info`), o céu físico (`Sky.*`), as nuvens (`CloudLayer.*`, spec 041) e a iluminação global (`GlobalIllumination.*`, spec 033). Os pools (`Camera`, `CameraMatrices`, `WorldTransform`,
 * `Transform`, `Light`, `ShadowMap`, materiais, corpos, colliders, restrições) têm o `PoolResolver` registrado pela C2
 * ao serem criados; o `Time` é registrado pela cena.
 */
export const ELEMENT_CONSUMERS: readonly ConsumerResolver[] = [
    new SingletonResolver(GravityField.schema, 'gravity'),
    new SingletonResolver(ParticlePhysics.schema, 'physics'),
    new ShadowCasterResolver('atlas', 'array<u32>'),
    // Tabelas do sombreamento físico (spec 011): a DFG e o seu amostrador, lidos pelo avaliador do fechamento.
    new PbrTablesResolver('dfg', 'texture_2d<f32>'),
    new PbrTablesResolver('sampler', 'sampler'),
    // O hemisfério da cena (spec 011), lido pela contribuição dele a `scene_lighting`.
    new SingletonResolver(HemisphereLightSchema, 'params', { name: 'HemisphereLight.params' }),
    // A estrutura de raios da cena (spec 033): o uniform com as faixas nos pools (os pools têm o resolver da C2).
    new SingletonResolver(RaySceneSchema, 'info', { name: 'RayScene.info' }),
    // O céu físico (spec 033): parâmetros, tabelas e amostrador.
    ...(
        [
            'params',
            'transmittance',
            'multiscatter',
            'view',
            'sampler',
            'aerial',
            'aerialTransmittance',
            'aerialShadow',
            'aerialShadowFar',
            'ambient',
        ] as const
    ).map((id) => new SingletonResolver(SkySchema, id, { name: `Sky.${id}` })),
    // A camada de nuvens (spec 041): o uniforme, os volumes, os mapas, a marcha, o cache de espalhamento filtrado, o vento
    // do tempo (R19), as marcas e o registro das páginas do mapa visto do sol e os amostradores.
    ...(
        [
            'params',
            'shape',
            'detail',
            'coverage',
            'ambient',
            'shadow',
            'panorama',
            'trace',
            'traceDepth',
            'view',
            'scatterFiltered',
            'weatherWind',
            'coverageWork',
            'shadowWork',
            'shadowPages',
            'scatterWork',
            'noiseSampler',
            'clampSampler',
        ] as const
    ).map((id) => new SingletonResolver(CloudSchema, id, { name: `CloudLayer.${id}` })),
    // As texturas virtuais dos materiais (spec 034, T060c): os cabeçalhos e a tabela, os pedidos (a fatia atual da
    // série), o atlas e o amostrador, lidos pelo nó `nodes.image.virtual`.
    new VirtualTexturesResolver('words', 'array<u32>'),
    new VirtualTexturesResolver('requests', 'array<atomic<u32>>'),
    new VirtualTexturesResolver('atlas', 'texture_2d<f32>'),
    new VirtualTexturesResolver('sampler', 'sampler'),
    // A imagem do mundo (spec 039 refeita): parâmetros, a imagem e o amostrador.
    ...(['params', 'image', 'sampler'] as const).map(
        (id) => new SingletonResolver(EnvironmentMapSchema, id, { name: `EnvironmentMap.${id}` }),
    ),
    // A iluminação global (spec 033): parâmetros, estado das sondas, atlas, amostrador e as sondas de tela.
    ...(
        [
            'params',
            'probes',
            'probeTexture',
            'irradiance',
            'radiance',
            'visibility',
            'sampler',
            'screenProbe',
            'screenIrradiance',
        ] as const
    ).map(
        (id) =>
            new SingletonResolver(GlobalIlluminationSchema, id, {
                name: `GlobalIllumination.${id}`,
            }),
    ),
    // As cáusticas (spec 034, T067c): os parâmetros e o hash dos fótons.
    ...(['params', 'hash'] as const).map(
        (id) => new SingletonResolver(CausticsSchema, id, { name: `Caustics.${id}` }),
    ),
    // O campo dos fluidos (spec 033, R11): parâmetros, o buffer das consultas (limites, tabela, blocos) e a contagem; o
    // mapa da luz pela água e a malha da superfície com os argumentos do desenho (spec 039 refeita).
    ...(['params', 'data', 'counts', 'lightMap', 'mesh', 'meshArgs'] as const).map(
        (id) => new SingletonResolver(FluidFieldSchema, id, { name: `FluidField.${id}` }),
    ),
    // A refração traçada (spec 034): o uniform (limite de interfaces, câmera, luzes, quadro, tempo).
    new SingletonResolver(Refraction.schema, 'params', { name: 'Refraction.params' }),
    // O medidor de energia dos corpos rígidos (spec 037): o uniform do kernel.
    new SingletonResolver(EnergyMeter.schema, 'params', { name: 'EnergyMeter.params' }),
    // O filtro de sinal traçado (spec 034): o uniform (ligado, quadros da média).
    new SingletonResolver(TemporalFilter.schema, 'params', { name: 'TemporalFilter.params' }),
    // Os froxels dos meios participantes (spec 033, R12): parâmetros, o buffer dos meios, a névoa integrada, o quadro da
    // injeção (lido no acúmulo, spec 034 T058), a luz ambiente, o amostrador e a palavra do máximo da distância vista
    // (spec 041, R21) (o histórico e o alcance são canais temporais, ligados pelo slot do estágio; spec 037).
    ...(
        [
            'params',
            'media',
            'scatter',
            'current',
            'ambient',
            'sampler',
            'reachMax',
            'state',
            'dispatch',
            'open',
        ] as const
    ).map((id) => new SingletonResolver(FroxelsSchema, id, { name: `Froxels.${id}` })),
];
