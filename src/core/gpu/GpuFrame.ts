import type { ComputePass } from '../contracts/passes/ComputePass';
import type { RenderPass } from '../contracts/passes/RenderPass';
import type { RenderTarget } from '../contracts/render_target/RenderTarget';
import type { AnyBufferSpec } from '../contracts/specs/ResourceSpec';
import type { StagingBufferSpec } from '../contracts/specs/StagingBufferSpec';
import type { TextureSpec } from '../contracts/specs/TextureSpec';
import type { TextureViewSpec } from '../contracts/specs/TextureViewSpec';
import type {
    Frame,
    Extent3D,
    TextureCopyOptions,
    TextureDataLayout,
} from '../contracts/Frame';
import type { GpuContext } from './GpuContext';
import { GpuCommandState } from './GpuCommandState';
import { GpuComputePass } from './passes/GpuComputePass';
import { GpuRenderPass } from './passes/GpuRenderPass';
import { GpuResourceStore } from './GpuResourceStore';
import { specHash } from './specHash';

const CANVAS_TEXTURE_KIND = 'texture' as const;
const CANVAS_TEXTURE_DISCRIMINATOR = '__canvas__';

export class GpuFrame implements Frame {
    private readonly _canvasView: TextureViewSpec;

    constructor(
        private readonly ctx: GpuContext,
        private readonly store: GpuResourceStore,
        private readonly command: GpuCommandState,
    ) {
        const surfaceTexture: TextureSpec = {
            kind: CANVAS_TEXTURE_KIND,
            discriminator: CANVAS_TEXTURE_DISCRIMINATOR,
            width: ctx.canvas?.width ?? 0,
            height: ctx.canvas?.height ?? 0,
            format: ctx.canvasFormat,
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        };
        this._canvasView = {
            kind: 'textureview',
            discriminator: '__canvas_view__',
            source: surfaceTexture,
        };
    }

    get canvasView(): TextureViewSpec {
        return this._canvasView;
    }

    compute(...args: [body: (pass: ComputePass) => void] | [label: string, body: (pass: ComputePass) => void]): void {
        const [label, body] = args.length === 1
            ? [undefined, args[0]] as const
            : [args[0], args[1]] as const;
        const encoder = this.command.requireEncoder();
        const desc: GPUComputePassDescriptor = label !== undefined ? { label } : {};
        const passEncoder = encoder.beginComputePass(desc);
        const pass = new GpuComputePass(passEncoder, this.store);
        this.command.pushPass({ kind: 'compute', encoder: passEncoder });
        try {
            body(pass);
        } finally {
            pass.end();
            this.command.popPass('compute');
        }
    }

    render(target: RenderTarget, ...args: [body: (pass: RenderPass) => void] | [label: string, body: (pass: RenderPass) => void]): void {
        const [label, body] = args.length === 1
            ? [undefined, args[0]] as const
            : [args[0], args[1]] as const;
        const encoder = this.command.requireEncoder();
        const desc = this.toRenderPassDescriptor(target, label);
        const passEncoder = encoder.beginRenderPass(desc);
        const pass = new GpuRenderPass(passEncoder, this.store);
        this.command.pushPass({ kind: 'render', encoder: passEncoder });
        try {
            body(pass);
        } finally {
            pass.end();
            this.command.popPass('render');
        }
    }

    copy(src: AnyBufferSpec, dst: AnyBufferSpec, size: number, srcOffset = 0, dstOffset = 0): void {
        const encoder = this.command.requireEncoder();
        const srcBuf = this.store.require<GPUBuffer>(specHash(src), 'buffer');
        const dstBuf = this.store.require<GPUBuffer>(specHash(dst), 'buffer');
        encoder.copyBufferToBuffer(srcBuf, srcOffset, dstBuf, dstOffset, size);
    }

    copyBufferToTexture(
        src: AnyBufferSpec,
        dst: TextureSpec,
        layout: TextureDataLayout,
        size: Extent3D,
        options?: TextureCopyOptions,
    ): void {
        const encoder = this.command.requireEncoder();
        const srcBuf = this.store.require<GPUBuffer>(specHash(src), 'buffer');
        const dstTex = this.store.require<GPUTexture>(specHash(dst), 'texture');
        encoder.copyBufferToTexture(
            { buffer: srcBuf, offset: layout.offset ?? 0, bytesPerRow: layout.bytesPerRow, ...(layout.rowsPerImage !== undefined ? { rowsPerImage: layout.rowsPerImage } : {}) },
            { texture: dstTex, ...(options?.mipLevel !== undefined ? { mipLevel: options.mipLevel } : {}), ...(options?.origin !== undefined ? { origin: [...options.origin] as number[] } : {}), ...(options?.aspect !== undefined ? { aspect: options.aspect } : {}) },
            [...size] as number[],
        );
    }

    copyTextureToBuffer(
        src: TextureSpec,
        dst: AnyBufferSpec,
        layout: TextureDataLayout,
        size: Extent3D,
        options?: TextureCopyOptions,
    ): void {
        const encoder = this.command.requireEncoder();
        const srcTex = this.store.require<GPUTexture>(specHash(src), 'texture');
        const dstBuf = this.store.require<GPUBuffer>(specHash(dst), 'buffer');
        encoder.copyTextureToBuffer(
            { texture: srcTex, ...(options?.mipLevel !== undefined ? { mipLevel: options.mipLevel } : {}), ...(options?.origin !== undefined ? { origin: [...options.origin] as number[] } : {}), ...(options?.aspect !== undefined ? { aspect: options.aspect } : {}) },
            { buffer: dstBuf, offset: layout.offset ?? 0, bytesPerRow: layout.bytesPerRow, ...(layout.rowsPerImage !== undefined ? { rowsPerImage: layout.rowsPerImage } : {}) },
            [...size] as number[],
        );
    }

    copyTextureToTexture(
        src: TextureSpec,
        dst: TextureSpec,
        size: Extent3D,
        options?: TextureCopyOptions,
    ): void {
        const encoder = this.command.requireEncoder();
        const srcTex = this.store.require<GPUTexture>(specHash(src), 'texture');
        const dstTex = this.store.require<GPUTexture>(specHash(dst), 'texture');
        encoder.copyTextureToTexture(
            { texture: srcTex, ...(options?.mipLevel !== undefined ? { mipLevel: options.mipLevel } : {}), ...(options?.origin !== undefined ? { origin: [...options.origin] as number[] } : {}), ...(options?.aspect !== undefined ? { aspect: options.aspect } : {}) },
            { texture: dstTex, ...(options?.mipLevel !== undefined ? { mipLevel: options.mipLevel } : {}), ...(options?.aspect !== undefined ? { aspect: options.aspect } : {}) },
            [...size] as number[],
        );
    }

    marker(label: string, body: () => void): void {
        const encoder = this.command.requireEncoder();
        encoder.pushDebugGroup(label);
        this.command.enterMarker();
        try {
            body();
        } finally {
            this.command.leaveMarker();
            encoder.popDebugGroup();
        }
    }

    resolveTimestamps(dst: StagingBufferSpec, first: number, count: number): void {
        const encoder = this.command.requireEncoder();
        const dstBuf = this.store.require<GPUBuffer>(specHash(dst), 'staging-buffer');
        const querySet = this.requireQuerySetForTimestamps();
        if (querySet === null) return;
        encoder.resolveQuerySet(querySet, first, count, dstBuf, 0);
    }

    private requireQuerySetForTimestamps(): GPUQuerySet | null {
        return null;
    }

    private toRenderPassDescriptor(target: RenderTarget, label: string | undefined): GPURenderPassDescriptor {
        const colorAttachments = target.colorAttachments.map(att => {
            const view = this.resolveView(att.view);
            const out: GPURenderPassColorAttachment = {
                view,
                loadOp: att.loadOp,
                storeOp: att.storeOp,
                ...(att.clearValue !== undefined ? { clearValue: [...att.clearValue] } : {}),
                ...(att.resolveTarget !== undefined ? { resolveTarget: this.resolveView(att.resolveTarget) } : {}),
                ...(att.depthSlice !== undefined ? { depthSlice: att.depthSlice } : {}),
            };
            return out;
        });
        const desc: GPURenderPassDescriptor = {
            colorAttachments,
            ...(label !== undefined ? { label } : {}),
            ...(target.maxDrawCount !== undefined ? { maxDrawCount: target.maxDrawCount } : {}),
        };
        if (target.depthStencilAttachment !== undefined) {
            const ds = target.depthStencilAttachment;
            (desc as { depthStencilAttachment: GPURenderPassDepthStencilAttachment }).depthStencilAttachment = {
                view: this.resolveView(ds.view),
                ...(ds.depthClearValue !== undefined ? { depthClearValue: ds.depthClearValue } : {}),
                ...(ds.depthLoadOp !== undefined ? { depthLoadOp: ds.depthLoadOp } : {}),
                ...(ds.depthStoreOp !== undefined ? { depthStoreOp: ds.depthStoreOp } : {}),
                ...(ds.depthReadOnly !== undefined ? { depthReadOnly: ds.depthReadOnly } : {}),
                ...(ds.stencilClearValue !== undefined ? { stencilClearValue: ds.stencilClearValue } : {}),
                ...(ds.stencilLoadOp !== undefined ? { stencilLoadOp: ds.stencilLoadOp } : {}),
                ...(ds.stencilStoreOp !== undefined ? { stencilStoreOp: ds.stencilStoreOp } : {}),
                ...(ds.stencilReadOnly !== undefined ? { stencilReadOnly: ds.stencilReadOnly } : {}),
            };
        }
        return desc;
    }

    private resolveView(spec: TextureViewSpec): GPUTextureView {
        if (spec.discriminator === '__canvas_view__' && spec.source.discriminator === CANVAS_TEXTURE_DISCRIMINATOR) {
            if (this.ctx.canvasContext === null) {
                throw new Error('GpuFrame: requested canvasView with no canvas configured.');
            }
            return this.ctx.canvasContext.getCurrentTexture().createView();
        }
        return this.store.require<GPUTextureView>(specHash(spec), 'textureview');
    }
}
