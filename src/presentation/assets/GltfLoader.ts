export interface GltfNode {
    readonly name?: string;
    readonly meshIndex?: number;
    readonly translation: readonly [number, number, number];
    readonly rotation: readonly [number, number, number, number];
    readonly scale: readonly [number, number, number];
    readonly children: readonly number[];
}

export interface GltfMesh {
    readonly name?: string;
    readonly primitives: readonly GltfPrimitive[];
}

export interface GltfPrimitive {
    readonly positions: Float32Array;
    readonly normals: Float32Array | null;
    readonly uvs: Float32Array | null;
    readonly indices: Uint16Array | Uint32Array | null;
    readonly materialIndex: number | null;
}

export interface GltfMaterial {
    readonly name?: string;
    readonly baseColorFactor: readonly [number, number, number, number];
    readonly roughnessFactor: number;
    readonly metallicFactor: number;
}

export interface GltfDocument {
    readonly raw: unknown;
    readonly url: string;
    readonly nodes: readonly GltfNode[];
    readonly meshes: readonly GltfMesh[];
    readonly materials: readonly GltfMaterial[];
    readonly scene: number;
}

interface RawGltf {
    accessors?: Array<{ bufferView: number; byteOffset?: number; componentType: number; count: number; type: string }>;
    bufferViews?: Array<{ buffer: number; byteOffset?: number; byteLength: number }>;
    buffers?: Array<{ uri?: string; byteLength: number }>;
    meshes?: Array<{ name?: string; primitives: Array<{ attributes: Record<string, number>; indices?: number; material?: number }> }>;
    materials?: Array<{ name?: string; pbrMetallicRoughness?: { baseColorFactor?: number[]; roughnessFactor?: number; metallicFactor?: number } }>;
    nodes?: Array<{ name?: string; mesh?: number; translation?: number[]; rotation?: number[]; scale?: number[]; children?: number[] }>;
    scene?: number;
    scenes?: Array<{ nodes?: number[] }>;
}

const COMPONENT_BYTES: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const TYPE_COMPONENTS: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };

export class GltfLoader {
    async load(url: string): Promise<GltfDocument> {
        const response = await fetch(url);
        const raw = await response.json() as RawGltf;
        const buffers = await this.loadBuffers(raw, url);
        const nodes: GltfNode[] = (raw.nodes ?? []).map(n => {
            const t = n.translation ?? [0, 0, 0];
            const r = n.rotation ?? [0, 0, 0, 1];
            const s = n.scale ?? [1, 1, 1];
            const node: GltfNode = {
                translation: [t[0] ?? 0, t[1] ?? 0, t[2] ?? 0],
                rotation: [r[0] ?? 0, r[1] ?? 0, r[2] ?? 0, r[3] ?? 1],
                scale: [s[0] ?? 1, s[1] ?? 1, s[2] ?? 1],
                children: n.children ?? [],
                ...(n.name !== undefined ? { name: n.name } : {}),
                ...(n.mesh !== undefined ? { meshIndex: n.mesh } : {}),
            };
            return node;
        });
        const meshes: GltfMesh[] = (raw.meshes ?? []).map(m => {
            const mesh: GltfMesh = {
                primitives: m.primitives.map(p => this.extractPrimitive(raw, buffers, p)),
                ...(m.name !== undefined ? { name: m.name } : {}),
            };
            return mesh;
        });
        const materials: GltfMaterial[] = (raw.materials ?? []).map(m => {
            const bc = m.pbrMetallicRoughness?.baseColorFactor ?? [1, 1, 1, 1];
            const mat: GltfMaterial = {
                baseColorFactor: [bc[0] ?? 1, bc[1] ?? 1, bc[2] ?? 1, bc[3] ?? 1],
                roughnessFactor: m.pbrMetallicRoughness?.roughnessFactor ?? 0.5,
                metallicFactor: m.pbrMetallicRoughness?.metallicFactor ?? 0,
                ...(m.name !== undefined ? { name: m.name } : {}),
            };
            return mat;
        });
        return { raw, url, nodes, meshes, materials, scene: raw.scene ?? 0 };
    }

    private async loadBuffers(raw: RawGltf, baseUrl: string): Promise<ArrayBuffer[]> {
        const out: ArrayBuffer[] = [];
        for (const buf of raw.buffers ?? []) {
            if (buf.uri === undefined) {
                out.push(new ArrayBuffer(0));
                continue;
            }
            if (buf.uri.startsWith('data:')) {
                const idx = buf.uri.indexOf(',');
                const b64 = buf.uri.slice(idx + 1);
                const binary = atob(b64);
                const ab = new ArrayBuffer(binary.length);
                const view = new Uint8Array(ab);
                for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i);
                out.push(ab);
            } else {
                const url = new URL(buf.uri, baseUrl).toString();
                const r = await fetch(url);
                out.push(await r.arrayBuffer());
            }
        }
        return out;
    }

    private extractPrimitive(raw: RawGltf, buffers: ArrayBuffer[], p: { attributes: Record<string, number>; indices?: number; material?: number }): GltfPrimitive {
        const positions = this.readAccessorF32(raw, buffers, p.attributes['POSITION']);
        const normals = p.attributes['NORMAL'] !== undefined ? this.readAccessorF32(raw, buffers, p.attributes['NORMAL']) : null;
        const uvs = p.attributes['TEXCOORD_0'] !== undefined ? this.readAccessorF32(raw, buffers, p.attributes['TEXCOORD_0']) : null;
        const indices = p.indices !== undefined ? this.readAccessorIndices(raw, buffers, p.indices) : null;
        return {
            positions: positions ?? new Float32Array(0),
            normals,
            uvs,
            indices,
            materialIndex: p.material ?? null,
        };
    }

    private readAccessorF32(raw: RawGltf, buffers: ArrayBuffer[], idx: number | undefined): Float32Array | null {
        if (idx === undefined) return null;
        const acc = raw.accessors?.[idx];
        if (acc === undefined) return null;
        const view = raw.bufferViews?.[acc.bufferView];
        if (view === undefined) return null;
        const buf = buffers[view.buffer];
        if (buf === undefined) return null;
        const components = TYPE_COMPONENTS[acc.type] ?? 1;
        const offset = (view.byteOffset ?? 0) + (acc.byteOffset ?? 0);
        return new Float32Array(buf, offset, acc.count * components);
    }

    private readAccessorIndices(raw: RawGltf, buffers: ArrayBuffer[], idx: number): Uint16Array | Uint32Array | null {
        const acc = raw.accessors?.[idx];
        if (acc === undefined) return null;
        const view = raw.bufferViews?.[acc.bufferView];
        if (view === undefined) return null;
        const buf = buffers[view.buffer];
        if (buf === undefined) return null;
        const offset = (view.byteOffset ?? 0) + (acc.byteOffset ?? 0);
        const bytes = COMPONENT_BYTES[acc.componentType] ?? 2;
        return bytes === 4 ? new Uint32Array(buf, offset, acc.count) : new Uint16Array(buf, offset, acc.count);
    }
}
