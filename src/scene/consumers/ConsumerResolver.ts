import type { BindingEntry } from '../../core/contracts/index';
import type { World } from '../world/World';
import type { EntityId } from '../world/EntityId';

export interface ResolveContext {
    readonly world: World;
    readonly forEntityId?: EntityId;
    readonly bindingBase: number;
}

export interface ConsumerResolver {
    readonly name: string;
    resolve(ctx: ResolveContext): readonly BindingEntry[];
}
