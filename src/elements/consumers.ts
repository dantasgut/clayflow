import type { ConsumerResolver } from '../scene/consumers/ConsumerResolver';
import { SingletonResolver } from '../scene/consumers/strategies/SingletonResolver';
import { Camera } from './scene/Camera';
import { GravityField } from './physics/forcefields/GravityField';
import { ParticleMaterial } from './physics/materials/ParticleMaterial';

/**
 * Resolvers de `consumes` dos Resources únicos da Camada 3, registrados pela aplicação na cena (sem substituir os da
 * aplicação): `Camera` (a primeira câmera inserida que continua na cena), `GravityField` e `ParticleMaterial`. Os
 * pools (`WorldTransform`, `Transform`, `Light`, `ShadowMap`, materiais, corpos, colliders, restrições) têm o
 * `PoolResolver` registrado pela C2 ao serem criados; o `Time` é registrado pela cena.
 */
export const ELEMENT_CONSUMERS: readonly ConsumerResolver[] = [
    new SingletonResolver(Camera.schema, 'camera'),
    new SingletonResolver(GravityField.schema, 'gravity'),
    new SingletonResolver(ParticleMaterial.schema, 'material'),
];
