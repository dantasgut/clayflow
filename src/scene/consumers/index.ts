export type {
    ConsumerResolver,
    ResolveContext,
    ResolvedSource,
    BindableBufferSpec,
} from './ConsumerResolver';
export { ConsumerResolverRegistry, ConsumerResolutionError } from './ConsumerResolverRegistry';
export { SingletonResolver } from './strategies/SingletonResolver';
export type { SingletonResolverOptions } from './strategies/SingletonResolver';
export { PoolResolver } from './strategies/PoolResolver';
export { TextureResolver } from './strategies/TextureResolver';
