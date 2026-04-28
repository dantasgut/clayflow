import type { BindGroupSpec } from '../../core/contracts/index';

export interface BindGroupReplacedEvent {
    readonly poolKey: string;
    readonly oldSpec: BindGroupSpec;
    readonly newSpec: BindGroupSpec;
}
