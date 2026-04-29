export interface GltfNode {
    readonly name?: string;
    readonly meshIndex?: number;
    readonly skinIndex?: number;
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
    readonly joints: Uint16Array | null;
    readonly weights: Float32Array | null;
    readonly indices: Uint16Array | Uint32Array | null;
    readonly materialIndex: number | null;
}

export interface GltfMaterial {
    readonly name?: string;
    readonly baseColorFactor: readonly [number, number, number, number];
    readonly roughnessFactor: number;
    readonly metallicFactor: number;
}

export type GltfAnimationPath = 'translation' | 'rotation' | 'scale' | 'weights';
export type GltfInterpolation = 'LINEAR' | 'STEP' | 'CUBICSPLINE';

export interface GltfAnimationSampler {
    readonly input: Float32Array;     // tempos (segundos)
    readonly output: Float32Array;    // valores (vec3 ou vec4)
    readonly interpolation: GltfInterpolation;
}

export interface GltfAnimationChannel {
    readonly samplerIndex: number;
    readonly targetNode: number;
    readonly targetPath: GltfAnimationPath;
}

export interface GltfAnimation {
    readonly name?: string;
    readonly samplers: readonly GltfAnimationSampler[];
    readonly channels: readonly GltfAnimationChannel[];
}

export interface GltfSkin {
    readonly name?: string;
    readonly inverseBindMatrices: Float32Array | null;  // mat4 × jointCount
    readonly joints: readonly number[];                 // node indices
    readonly skeleton: number | null;                   // root node (optional)
}

export interface GltfDocument {
    readonly raw: unknown;
    readonly url: string;
    readonly nodes: readonly GltfNode[];
    readonly meshes: readonly GltfMesh[];
    readonly materials: readonly GltfMaterial[];
    readonly animations: readonly GltfAnimation[];
    readonly skins: readonly GltfSkin[];
    readonly scene: number;
}

interface RawAccessor {
    bufferView: number;
    byteOffset?: number;
    componentType: number;
    count: number;
    type: string;
}
interface RawBufferView { buffer: number; byteOffset?: number; byteLength: number }
interface RawBuffer { uri?: string; byteLength: number }
interface RawPrimitive { attributes: Record<string, number>; indices?: number; material?: number }
interface RawMesh { name?: string; primitives: RawPrimitive[] }
interface RawMaterial { name?: string; pbrMetallicRoughness?: { baseColorFactor?: number[]; roughnessFactor?: number; metallicFactor?: number } }
interface RawNode { name?: string; mesh?: number; skin?: number; translation?: number[]; rotation?: number[]; scale?: number[]; children?: number[] }
interface RawAnimSampler { input: number; output: number; interpolation?: string }
interface RawAnimChannel { sampler: number; target: { node?: number; path: string } }
interface RawAnimation { name?: string; samplers: RawAnimSampler[]; channels: RawAnimChannel[] }
interface RawSkin { name?: string; inverseBindMatrices?: number; joints: number[]; skeleton?: number }
interface RawScene { nodes?: number[] }

interface RawGltf {
    accessors?: RawAccessor[];
    bufferViews?: RawBufferView[];
    buffers?: RawBuffer[];
    meshes?: RawMesh[];
    materials?: RawMaterial[];
    nodes?: RawNode[];
    animations?: RawAnimation[];
    skins?: RawSkin[];
    scene?: number;
    scenes?: RawScene[];
}

const COMPONENT_BYTES: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const TYPE_COMPONENTS: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };

const GLB_MAGIC = 0x46546c67;        // "glTF"
const GLB_CHUNK_JSON = 0x4e4f534a;   // "JSON"
const GLB_CHUNK_BIN  = 0x004e4942;   // "BIN\0"

export class GltfLoader {
    /**
     * Load a glTF document from URL. Suporta:
     *   - .gltf JSON com buffers externos (URI)
     *   - .gltf JSON com buffers data: (base64)
     *   - .glb binário (magic 0x46546c67, JSON chunk + BIN chunk)
     *
     * O loader detecta o formato pela extensão da URL e fallback para magic
     * sniffing nos primeiros 4 bytes da resposta.
     */
    async load(url: string): Promise<GltfDocument> {
        const response = await fetch(url);
        const buffer = await response.arrayBuffer();
        return this.parse(buffer, url);
    }

    /**
     * Parse de um glTF (.gltf JSON ou .glb binário) já em memória. Útil para
     * testes determinísticos e para casos em que o cliente já possui os bytes.
     */
    async parse(data: ArrayBuffer, url: string): Promise<GltfDocument> {
        const dv = new DataView(data);
        const isGlb = data.byteLength >= 12 && dv.getUint32(0, true) === GLB_MAGIC;
        if (isGlb) return this.parseGlb(data, url);
        const text = new TextDecoder().decode(new Uint8Array(data));
        const raw = JSON.parse(text) as RawGltf;
        const buffers = await this.loadExternalBuffers(raw, url);
        return this.buildDocument(raw, buffers, url);
    }

    private async parseGlb(data: ArrayBuffer, url: string): Promise<GltfDocument> {
        const dv = new DataView(data);
        const version = dv.getUint32(4, true);
        if (version !== 2) throw new Error(`GLB version ${version} unsupported (need 2)`);
        const totalLen = dv.getUint32(8, true);
        if (totalLen > data.byteLength) throw new Error(`GLB length ${totalLen} > buffer ${data.byteLength}`);

        let offset = 12;
        let json: RawGltf | null = null;
        const binChunks: ArrayBuffer[] = [];
        while (offset < totalLen) {
            const chunkLen = dv.getUint32(offset, true);
            const chunkType = dv.getUint32(offset + 4, true);
            const chunkStart = offset + 8;
            const chunk = data.slice(chunkStart, chunkStart + chunkLen);
            if (chunkType === GLB_CHUNK_JSON) {
                if (json !== null) throw new Error('GLB: multiple JSON chunks');
                json = JSON.parse(new TextDecoder().decode(new Uint8Array(chunk))) as RawGltf;
            } else if (chunkType === GLB_CHUNK_BIN) {
                binChunks.push(chunk);
            }
            offset = chunkStart + chunkLen;
        }
        if (json === null) throw new Error('GLB: missing JSON chunk');

        // Em GLB válido, buffers[0] é o BIN chunk (sem URI). Os demais (raros)
        // seguem URIs externos como em .gltf.
        const buffers: ArrayBuffer[] = [];
        const rawBuffers = json.buffers ?? [];
        for (let i = 0; i < rawBuffers.length; i++) {
            const b = rawBuffers[i]!;
            if (b.uri === undefined) {
                buffers.push(binChunks.shift() ?? new ArrayBuffer(0));
            } else {
                buffers.push(await this.fetchBufferUri(b.uri, url));
            }
        }
        return this.buildDocument(json, buffers, url);
    }

    private async loadExternalBuffers(raw: RawGltf, baseUrl: string): Promise<ArrayBuffer[]> {
        const out: ArrayBuffer[] = [];
        for (const buf of raw.buffers ?? []) {
            if (buf.uri === undefined) {
                out.push(new ArrayBuffer(0));
                continue;
            }
            out.push(await this.fetchBufferUri(buf.uri, baseUrl));
        }
        return out;
    }

    private async fetchBufferUri(uri: string, baseUrl: string): Promise<ArrayBuffer> {
        if (uri.startsWith('data:')) {
            const idx = uri.indexOf(',');
            const b64 = uri.slice(idx + 1);
            const binary = atob(b64);
            const ab = new ArrayBuffer(binary.length);
            const view = new Uint8Array(ab);
            for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i);
            return ab;
        }
        const resolved = new URL(uri, baseUrl).toString();
        const r = await fetch(resolved);
        return r.arrayBuffer();
    }

    private buildDocument(raw: RawGltf, buffers: ArrayBuffer[], url: string): GltfDocument {
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
                ...(n.skin !== undefined ? { skinIndex: n.skin } : {}),
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
        const animations: GltfAnimation[] = (raw.animations ?? []).map(a => {
            const samplers: GltfAnimationSampler[] = a.samplers.map(s => ({
                input: this.readAccessorF32(raw, buffers, s.input) ?? new Float32Array(0),
                output: this.readAccessorF32(raw, buffers, s.output) ?? new Float32Array(0),
                interpolation: ((s.interpolation as GltfInterpolation | undefined) ?? 'LINEAR'),
            }));
            const channels: GltfAnimationChannel[] = a.channels
                .filter(c => c.target.node !== undefined)
                .map(c => ({
                    samplerIndex: c.sampler,
                    targetNode: c.target.node!,
                    targetPath: (c.target.path as GltfAnimationPath),
                }));
            const anim: GltfAnimation = {
                samplers, channels,
                ...(a.name !== undefined ? { name: a.name } : {}),
            };
            return anim;
        });
        const skins: GltfSkin[] = (raw.skins ?? []).map(s => {
            const ibm = s.inverseBindMatrices !== undefined
                ? this.readAccessorF32(raw, buffers, s.inverseBindMatrices)
                : null;
            const skin: GltfSkin = {
                inverseBindMatrices: ibm,
                joints: s.joints,
                skeleton: s.skeleton ?? null,
                ...(s.name !== undefined ? { name: s.name } : {}),
            };
            return skin;
        });
        return { raw, url, nodes, meshes, materials, animations, skins, scene: raw.scene ?? 0 };
    }

    private extractPrimitive(raw: RawGltf, buffers: ArrayBuffer[], p: RawPrimitive): GltfPrimitive {
        const positions = this.readAccessorF32(raw, buffers, p.attributes['POSITION']);
        const normals = p.attributes['NORMAL'] !== undefined ? this.readAccessorF32(raw, buffers, p.attributes['NORMAL']) : null;
        const uvs = p.attributes['TEXCOORD_0'] !== undefined ? this.readAccessorF32(raw, buffers, p.attributes['TEXCOORD_0']) : null;
        const joints = p.attributes['JOINTS_0'] !== undefined ? this.readAccessorU16(raw, buffers, p.attributes['JOINTS_0']) : null;
        const weights = p.attributes['WEIGHTS_0'] !== undefined ? this.readAccessorF32(raw, buffers, p.attributes['WEIGHTS_0']) : null;
        const indices = p.indices !== undefined ? this.readAccessorIndices(raw, buffers, p.indices) : null;
        return {
            positions: positions ?? new Float32Array(0),
            normals,
            uvs,
            joints,
            weights,
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

    private readAccessorU16(raw: RawGltf, buffers: ArrayBuffer[], idx: number): Uint16Array | null {
        const acc = raw.accessors?.[idx];
        if (acc === undefined) return null;
        const view = raw.bufferViews?.[acc.bufferView];
        if (view === undefined) return null;
        const buf = buffers[view.buffer];
        if (buf === undefined) return null;
        const components = TYPE_COMPONENTS[acc.type] ?? 1;
        const offset = (view.byteOffset ?? 0) + (acc.byteOffset ?? 0);
        return new Uint16Array(buf, offset, acc.count * components);
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
