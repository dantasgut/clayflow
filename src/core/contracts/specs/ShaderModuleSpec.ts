export interface ShaderModuleSpec {
    readonly kind: 'shader';
    readonly discriminator?: string;
    readonly label?: string;
    readonly source: string;
}
