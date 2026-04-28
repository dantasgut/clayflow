import type { RenderPass } from '../passes/RenderPass';

export interface BundleFormats {
    readonly colorFormats: readonly (GPUTextureFormat | null)[];
    readonly depthStencilFormat?: GPUTextureFormat;
    readonly sampleCount?: 1 | 4;
    readonly depthReadOnly?: boolean;
    readonly stencilReadOnly?: boolean;
}

export interface BundleSpec {
    readonly kind: 'bundle';
    readonly discriminator: string;
    readonly label?: string;
    readonly formats: BundleFormats;
    readonly body: (pass: RenderPass) => void;
}
