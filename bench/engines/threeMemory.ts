import type {
    BufferAttribute,
    BufferGeometry,
    InterleavedBufferAttribute,
    Material,
    Object3D,
    Texture,
} from 'three';

type AnyAttribute = BufferAttribute | InterleavedBufferAttribute;

function attributeBytes(attr: AnyAttribute, seen: Set<object>): number {
    const owner: object = 'data' in attr ? attr.data : attr;
    if (seen.has(owner)) return 0;
    seen.add(owner);
    const array = 'data' in attr ? attr.data.array : attr.array;
    return array.byteLength;
}

function geometryBytes(geometry: BufferGeometry, seen: Set<object>): number {
    if (seen.has(geometry)) return 0;
    seen.add(geometry);
    let total = 0;
    for (const attr of Object.values(geometry.attributes)) total += attributeBytes(attr, seen);
    if (geometry.index !== null) total += attributeBytes(geometry.index, seen);
    return total;
}

function textureBytes(texture: Texture, seen: Set<object>): number {
    if (seen.has(texture)) return 0;
    seen.add(texture);
    const image = texture.image as { width?: number; height?: number } | null | undefined;
    const w = image?.width ?? 0;
    const h = image?.height ?? 0;
    if (w === 0 || h === 0) return 0;
    let total = 0;
    const levels = texture.generateMipmaps ? Math.floor(Math.log2(Math.max(w, h))) + 1 : 1;
    for (let m = 0; m < levels; m++) total += Math.max(1, w >> m) * Math.max(1, h >> m) * 4;
    return total;
}

function materialBytes(material: Material, seen: Set<object>): number {
    let total = 0;
    for (const value of Object.values(material)) {
        if (
            value !== null
            && typeof value === 'object'
            && (value as { isTexture?: boolean }).isTexture === true
        ) {
            total += textureBytes(value as Texture, seen);
        }
    }
    return total;
}

/**
 * Memória GPU estimada de uma cena Three (o `renderer.info.memory` só dá contagens): Σ bytes
 * de atributos/índices únicos + texturas (largura × altura × 4 × mips) + `instanceMatrix`/
 * `instanceColor` de `InstancedMesh`. Recursos compartilhados contam uma vez. Marcada como
 * "estimada" no relatório.
 */
export function estimateThreeMemory(root: Object3D): number {
    const seen = new Set<object>();
    let total = 0;
    root.traverse((object) => {
        const mesh = object as Object3D & {
            geometry?: BufferGeometry;
            material?: Material | Material[];
            instanceMatrix?: AnyAttribute;
            instanceColor?: AnyAttribute | null;
            skeleton?: { boneTexture?: Texture | null; bones: unknown[] };
        };
        if (mesh.geometry !== undefined) total += geometryBytes(mesh.geometry, seen);
        if (mesh.instanceMatrix !== undefined) total += attributeBytes(mesh.instanceMatrix, seen);
        if (mesh.instanceColor !== undefined && mesh.instanceColor !== null) {
            total += attributeBytes(mesh.instanceColor, seen);
        }
        if (mesh.skeleton !== undefined && !seen.has(mesh.skeleton)) {
            seen.add(mesh.skeleton);
            total += mesh.skeleton.bones.length * 64;
        }
        const materials =
            mesh.material === undefined
                ? []
                : Array.isArray(mesh.material)
                  ? mesh.material
                  : [mesh.material];
        for (const m of materials) total += materialBytes(m, seen);
    });
    return total;
}
