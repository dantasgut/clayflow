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
 * Estratégia que fornece a fonte de um recurso declarado com fornecedor `{ pool: name }` ou `{ consumer: name }` (spec
 * 031). `name` é o nome do fornecedor (nome do schema ou chave do pool); `typeName`, o struct WGSL que a fonte preenche.
 */
export interface ConsumerResolver {
    /** Nome do fornecedor (nome do schema ou chave do pool). */
    readonly name: string;
    /** Struct WGSL que a fonte preenche (tipo do binding, ou do elemento de `array<…>`). */
    readonly typeName: string;
    /** Fonte atual, ou `undefined` se o dado ainda não existe na cena. */
    resolve(ctx: ResolveContext): ResolvedSource | undefined;
}
