import type { TextureViewSpec } from '../specs/TextureViewSpec';

export interface TextureViewBindingEntry {
    readonly binding: number;
    readonly kind: 'textureview';
    readonly view: TextureViewSpec;
}
