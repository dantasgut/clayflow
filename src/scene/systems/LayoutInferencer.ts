import type { BindingLayoutEntry } from '../../core/contracts/index';
import type { GPUDescriptor, GPUDescriptorRole } from '../descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../descriptors/PipelineDescriptor';

export interface WgslBinding {
    readonly group: number;
    readonly binding: number;
    readonly name: string;
    readonly addressSpace?: 'uniform' | 'storage' | 'private' | 'workgroup' | 'function';
    readonly access?: 'read' | 'write' | 'read_write';
    readonly typeText: string;
    readonly stages: ReadonlySet<'vertex' | 'fragment' | 'compute'>;
}

export interface WgslBindingInfo {
    readonly bindings: readonly WgslBinding[];
}

const ATTRIBUTE_PATTERN = /@group\s*\(\s*(\d+)\s*\)\s*@binding\s*\(\s*(\d+)\s*\)\s*var(?:\s*<\s*([a-z_]+)(?:\s*,\s*([a-z_]+))?\s*>)?\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([^;]+);/g;
const ENTRY_PATTERN = /@(?<stage>vertex|fragment|compute)\b(?:\s*@\w+(?:\([^)]*\))?)*\s+fn\s+(?<name>[A-Za-z_][A-Za-z0-9_]*)/g;

export class LayoutInferencer {
    parseWGSL(source: string): WgslBindingInfo {
        const bindings: WgslBinding[] = [];
        const stageBlocks = this.collectEntryBlocks(source);

        let match: RegExpExecArray | null;
        const re = new RegExp(ATTRIBUTE_PATTERN.source, 'g');
        while ((match = re.exec(source)) !== null) {
            const [, groupStr, bindingStr, addressSpace, access, name, typeText] = match;
            const stages = new Set<'vertex' | 'fragment' | 'compute'>();
            for (const block of stageBlocks) {
                if (block.referencesIdentifier(name ?? '')) stages.add(block.stage);
            }
            const binding = {
                group: Number(groupStr),
                binding: Number(bindingStr),
                name: name ?? '',
                typeText: (typeText ?? '').trim(),
                stages,
            } as WgslBinding & { addressSpace?: WgslBinding['addressSpace']; access?: WgslBinding['access'] };
            if (addressSpace !== undefined) {
                (binding as { addressSpace: WgslBinding['addressSpace'] }).addressSpace =
                    addressSpace as WgslBinding['addressSpace'];
            }
            if (access !== undefined) {
                (binding as { access: WgslBinding['access'] }).access = access as WgslBinding['access'];
            }
            bindings.push(binding);
        }

        return { bindings };
    }

    inferUsageFromRole(role: GPUDescriptorRole): number {
        const U = GPUBufferUsage;
        switch (role) {
            case 'uniform':         return U.UNIFORM | U.COPY_DST;
            case 'storage-rw':
            case 'storage-ro':      return U.STORAGE | U.COPY_SRC | U.COPY_DST;
            case 'vertex':          return U.VERTEX | U.STORAGE | U.COPY_SRC | U.COPY_DST;
            case 'index':           return U.INDEX | U.STORAGE | U.COPY_SRC | U.COPY_DST;
            case 'indirect':        return U.INDIRECT | U.STORAGE | U.COPY_SRC | U.COPY_DST;
            case 'staging':         return U.COPY_DST | U.MAP_READ;
            case 'texture':
            case 'storage-texture':
            case 'sampler':
            default:
                return 0;
        }
    }

    inferLayoutEntry(
        descriptor: GPUDescriptor,
        binding: WgslBinding | undefined,
        bindingIndex: number,
    ): BindingLayoutEntry {
        const visibility = this.visibilityFromBindingOrDescriptor(descriptor, binding);
        const bindingNumber = descriptor.binding ?? binding?.binding ?? bindingIndex;
        switch (descriptor.role) {
            case 'uniform':
                return {
                    binding: bindingNumber,
                    visibility,
                    kind: 'buffer',
                    type: 'uniform',
                };
            case 'storage-ro':
                return {
                    binding: bindingNumber,
                    visibility,
                    kind: 'buffer',
                    type: 'read-only-storage',
                };
            case 'storage-rw':
                return {
                    binding: bindingNumber,
                    visibility,
                    kind: 'buffer',
                    type: 'storage',
                };
            case 'sampler':
                return {
                    binding: bindingNumber,
                    visibility,
                    kind: 'sampler',
                    type: 'filtering',
                };
            case 'texture':
                return {
                    binding: bindingNumber,
                    visibility,
                    kind: 'texture',
                    sampleType: 'float',
                    viewDimension: descriptor.textureShape?.viewDimension ?? '2d',
                };
            case 'storage-texture': {
                if (descriptor.textureShape === undefined) {
                    throw new Error(`LayoutInferencer: storage-texture descriptor '${descriptor.id}' missing textureShape`);
                }
                return {
                    binding: bindingNumber,
                    visibility,
                    kind: 'storage-texture',
                    access: descriptor.textureShape.access ?? 'write-only',
                    format: descriptor.textureShape.format,
                    viewDimension: descriptor.textureShape.viewDimension ?? '2d',
                };
            }
            default:
                throw new Error(`LayoutInferencer: cannot derive layout entry for role '${descriptor.role}'`);
        }
    }

    private visibilityFromBindingOrDescriptor(descriptor: GPUDescriptor, binding: WgslBinding | undefined): number {
        if (descriptor.visibility !== undefined) return descriptor.visibility;
        if (binding === undefined) return GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE;
        let v = 0;
        if (binding.stages.has('vertex')) v |= GPUShaderStage.VERTEX;
        if (binding.stages.has('fragment')) v |= GPUShaderStage.FRAGMENT;
        if (binding.stages.has('compute')) v |= GPUShaderStage.COMPUTE;
        return v === 0 ? GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE : v;
    }

    extractEntryStages(source: string, pipeline: PipelineDescriptor): Map<string, 'vertex' | 'fragment' | 'compute'> {
        const out = new Map<string, 'vertex' | 'fragment' | 'compute'>();
        const re = new RegExp(ENTRY_PATTERN.source, 'g');
        let match: RegExpExecArray | null;
        while ((match = re.exec(source)) !== null) {
            const stage = match.groups?.stage as 'vertex' | 'fragment' | 'compute' | undefined;
            const name = match.groups?.name;
            if (stage !== undefined && name !== undefined) out.set(name, stage);
        }
        for (const ep of pipeline.entryPoints) {
            if (!out.has(ep)) {
                const fallback: 'compute' | 'vertex' = pipeline.role === 'compute' ? 'compute' : 'vertex';
                out.set(ep, fallback);
            }
        }
        return out;
    }

    private collectEntryBlocks(source: string): { stage: 'vertex' | 'fragment' | 'compute'; referencesIdentifier(name: string): boolean }[] {
        const blocks: { stage: 'vertex' | 'fragment' | 'compute'; referencesIdentifier(name: string): boolean }[] = [];
        const re = new RegExp(ENTRY_PATTERN.source, 'g');
        let match: RegExpExecArray | null;
        while ((match = re.exec(source)) !== null) {
            const stage = match.groups?.stage as 'vertex' | 'fragment' | 'compute' | undefined;
            if (stage === undefined) continue;
            const start = source.indexOf('{', match.index);
            if (start < 0) continue;
            const end = this.findMatchingBrace(source, start);
            const body = end > start ? source.slice(start, end + 1) : '';
            blocks.push({
                stage,
                referencesIdentifier(name: string): boolean {
                    if (name === '') return false;
                    const wordRe = new RegExp(`\\b${name}\\b`);
                    return wordRe.test(body);
                },
            });
        }
        return blocks;
    }

    private findMatchingBrace(source: string, openIdx: number): number {
        let depth = 0;
        for (let i = openIdx; i < source.length; i++) {
            const c = source[i];
            if (c === '{') depth++;
            else if (c === '}') {
                depth--;
                if (depth === 0) return i;
            }
        }
        return -1;
    }
}
