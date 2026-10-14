import type { ResourceDirectory } from '../contracts/ResourceDirectory';
import type { World } from '../world/World';
import type { ResolvedSource } from './ResolvedSource';

/** O que um resolver consulta: o World da cena e o que a C2 alocou. */
export interface ResolveContext {
    /** World da cena. */
    readonly world: World;
    /** Objetos de GPU alocados pela C2 (buffers, texturas, pools). */
    readonly resources: ResourceDirectory;
}

/**
 * Estratégia que traduz um nome de `consumes` numa fonte de binding. `name` é o nome em `consumes` (nome do schema
 * ou chave do pool); `typeName` é o struct WGSL que a fonte preenche — um binding do shader cujo tipo (ou elemento de
 * `array<…>`) é `typeName` recebe a fonte deste resolver quando `name` está em `consumes`.
 */
export interface ConsumerResolver {
    /** Nome em `consumes` (nome do schema ou chave do pool). */
    readonly name: string;
    /** Struct WGSL que a fonte preenche (tipo do binding, ou do elemento de `array<…>`). */
    readonly typeName: string;
    /** Fonte atual, ou `undefined` se o dado ainda não existe na cena. */
    resolve(ctx: ResolveContext): ResolvedSource | undefined;
}
