import type { ConsumerResolver } from '../scene/consumers/ConsumerResolver';
import { SingletonResolver } from '../scene/consumers/strategies/SingletonResolver';
import { GravityField } from './physics/forcefields/GravityField';
import { ParticleMaterial } from './physics/materials/ParticleMaterial';
import { ShadowCasterResolver } from './scene/shadowCaster';

/**
 * Resolvers de `consumes` dos Resources únicos da Camada 3, registrados pela aplicação na cena (sem substituir os da
 * aplicação): `GravityField`, `ParticleMaterial` e o mapa de sombra que projeta (`ShadowCaster.depth`,
 * `ShadowCaster.sampler`, spec 031). Os pools (`Camera`, `CameraMatrices`, `WorldTransform`,
 * `Transform`, `Light`, `ShadowMap`, materiais, corpos, colliders, restrições) têm o `PoolResolver` registrado pela C2
 * ao serem criados; o `Time` é registrado pela cena.
 */
export const ELEMENT_CONSUMERS: readonly ConsumerResolver[] = [
    new SingletonResolver(GravityField.schema, 'gravity'),
    new SingletonResolver(ParticleMaterial.schema, 'material'),
    new ShadowCasterResolver('depth', 'texture_depth_2d'),
    new ShadowCasterResolver('compare', 'sampler_comparison'),
];
