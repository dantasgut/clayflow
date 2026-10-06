import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Humanoide procedural para a cena de personagens animados (R9): cápsulas fundidas
 * (~3k vértices), esqueleto de 20 ossos e um ciclo de caminhada sintético com quaternions
 * senoidais. Determinístico e sem assets.
 */

interface BoneDef {
    readonly name: string;
    readonly parent: string | null;
    /** Posição local em relação ao pai (pose de ligação). */
    readonly offset: readonly [number, number, number];
}

/** 20 ossos: tronco (6) + braços (2 × 4) + pernas (2 × 3). */
const BONES: readonly BoneDef[] = [
    { name: 'hips', parent: null, offset: [0, 0.95, 0] },
    { name: 'spine', parent: 'hips', offset: [0, 0.12, 0] },
    { name: 'spine2', parent: 'spine', offset: [0, 0.14, 0] },
    { name: 'chest', parent: 'spine2', offset: [0, 0.14, 0] },
    { name: 'neck', parent: 'chest', offset: [0, 0.16, 0] },
    { name: 'head', parent: 'neck', offset: [0, 0.1, 0] },
    ...(['L', 'R'] as const).flatMap((side): BoneDef[] => {
        const s = side === 'L' ? 1 : -1;
        return [
            { name: `shoulder${side}`, parent: 'chest', offset: [0.08 * s, 0.12, 0] },
            { name: `upperArm${side}`, parent: `shoulder${side}`, offset: [0.12 * s, 0, 0] },
            { name: `foreArm${side}`, parent: `upperArm${side}`, offset: [0, -0.28, 0] },
            { name: `hand${side}`, parent: `foreArm${side}`, offset: [0, -0.26, 0] },
        ];
    }),
    ...(['L', 'R'] as const).flatMap((side): BoneDef[] => {
        const s = side === 'L' ? 1 : -1;
        return [
            { name: `thigh${side}`, parent: 'hips', offset: [0.1 * s, -0.05, 0] },
            { name: `shin${side}`, parent: `thigh${side}`, offset: [0, -0.42, 0] },
            { name: `foot${side}`, parent: `shin${side}`, offset: [0, -0.42, 0] },
        ];
    }),
];

/** Peças de malha: cápsula ligada rigidamente a um osso, centrada entre dois pontos da pose. */
interface PartDef {
    readonly bone: string;
    readonly radius: number;
    readonly length: number;
    /** Deslocamento do centro da cápsula em relação ao osso (pose de ligação, mundo). */
    readonly center: readonly [number, number, number];
    readonly horizontal?: boolean;
}

const PARTS: readonly PartDef[] = [
    { bone: 'hips', radius: 0.14, length: 0.1, center: [0, 0.04, 0], horizontal: true },
    { bone: 'spine', radius: 0.13, length: 0.06, center: [0, 0.07, 0] },
    { bone: 'spine2', radius: 0.14, length: 0.06, center: [0, 0.07, 0] },
    { bone: 'chest', radius: 0.16, length: 0.12, center: [0, 0.07, 0], horizontal: true },
    { bone: 'neck', radius: 0.05, length: 0.05, center: [0, 0.05, 0] },
    { bone: 'head', radius: 0.1, length: 0.08, center: [0, 0.1, 0] },
    ...(['L', 'R'] as const).flatMap((side): PartDef[] => [
        { bone: `upperArm${side}`, radius: 0.045, length: 0.2, center: [0, -0.14, 0] },
        { bone: `foreArm${side}`, radius: 0.04, length: 0.18, center: [0, -0.13, 0] },
        { bone: `hand${side}`, radius: 0.035, length: 0.05, center: [0, -0.05, 0] },
        { bone: `thigh${side}`, radius: 0.07, length: 0.3, center: [0, -0.21, 0] },
        { bone: `shin${side}`, radius: 0.055, length: 0.32, center: [0, -0.21, 0] },
        {
            bone: `foot${side}`,
            radius: 0.045,
            length: 0.1,
            center: [0, -0.03, 0.06],
            horizontal: true,
        },
    ]),
];

/** Personagem-protótipo: malha com esqueleto + clipe de caminhada. */
export interface CharacterPrototype {
    readonly mesh: THREE.SkinnedMesh;
    readonly clip: THREE.AnimationClip;
    readonly vertexCount: number;
    readonly boneCount: number;
}

function bindPositions(): Map<string, THREE.Vector3> {
    const world = new Map<string, THREE.Vector3>();
    for (const b of BONES) {
        const parent =
            b.parent === null ? new THREE.Vector3() : (world.get(b.parent) ?? new THREE.Vector3());
        world.set(b.name, parent.clone().add(new THREE.Vector3(...b.offset)));
    }
    return world;
}

function buildGeometry(world: Map<string, THREE.Vector3>): THREE.BufferGeometry {
    const index = new Map(BONES.map((b, i) => [b.name, i]));
    const parts = PARTS.map((p) => {
        const g = new THREE.CapsuleGeometry(p.radius, p.length, 6, 12);
        if (p.horizontal === true) g.rotateZ(Math.PI / 2);
        const at = (world.get(p.bone) ?? new THREE.Vector3())
            .clone()
            .add(new THREE.Vector3(...p.center));
        g.translate(at.x, at.y, at.z);
        const n = g.attributes.position?.count ?? 0;
        const skinIndex = new Uint16Array(n * 4);
        const skinWeight = new Float32Array(n * 4);
        const bone = index.get(p.bone) ?? 0;
        for (let v = 0; v < n; v++) {
            skinIndex[v * 4] = bone;
            skinWeight[v * 4] = 1;
        }
        g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
        g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
        return g;
    });
    return mergeGeometries(parts, false);
}

function walkClip(): THREE.AnimationClip {
    const duration = 1;
    const steps = 8;
    const times = Array.from({ length: steps + 1 }, (_, i) => (i / steps) * duration);
    const swing = (
        name: string,
        amplitude: number,
        phase: number,
        bias = 0,
    ): THREE.QuaternionKeyframeTrack => {
        const values: number[] = [];
        const q = new THREE.Quaternion();
        const axis = new THREE.Vector3(1, 0, 0);
        for (const t of times) {
            q.setFromAxisAngle(
                axis,
                bias + amplitude * Math.sin((t / duration) * Math.PI * 2 + phase),
            );
            values.push(q.x, q.y, q.z, q.w);
        }
        return new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, times, values);
    };
    return new THREE.AnimationClip('walk', duration, [
        swing('thighL', 0.5, 0),
        swing('thighR', 0.5, Math.PI),
        swing('shinL', 0.35, Math.PI / 2, 0.35),
        swing('shinR', 0.35, Math.PI * 1.5, 0.35),
        swing('upperArmL', 0.4, Math.PI),
        swing('upperArmR', 0.4, 0),
        swing('foreArmL', 0.2, Math.PI, -0.3),
        swing('foreArmR', 0.2, 0, -0.3),
        swing('spine', 0.05, 0),
        swing('head', 0.04, Math.PI / 2),
    ]);
}

/** Cria o personagem-protótipo (clonar com `SkeletonUtils.clone` para cada instância). */
export function createCharacter(material: THREE.Material): CharacterPrototype {
    const world = bindPositions();
    const geometry = buildGeometry(world);
    const bones = new Map<string, THREE.Bone>();
    for (const b of BONES) {
        const bone = new THREE.Bone();
        bone.name = b.name;
        bone.position.set(...b.offset);
        bones.set(b.name, bone);
        if (b.parent !== null) bones.get(b.parent)?.add(bone);
    }
    const ordered = BONES.map((b) => bones.get(b.name) as THREE.Bone);
    const root = ordered[0] as THREE.Bone;
    const mesh = new THREE.SkinnedMesh(geometry, material);
    mesh.add(root);
    mesh.bind(new THREE.Skeleton(ordered));
    return {
        mesh,
        clip: walkClip(),
        vertexCount: geometry.attributes.position?.count ?? 0,
        boneCount: ordered.length,
    };
}
