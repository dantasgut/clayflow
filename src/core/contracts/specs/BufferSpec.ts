export type BufferSubkind = 'vertex' | 'index' | 'uniform' | 'storage' | 'indirect' | 'staging';

export interface BufferSpec {
    readonly kind: 'buffer';
    readonly subkind: BufferSubkind;
    readonly discriminator?: string;
    readonly label?: string;
}
