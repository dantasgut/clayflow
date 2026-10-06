import { clone } from 'three/addons/utils/SkeletonUtils.js';
import type { AnimationMixer } from 'three/webgpu';
import { gridScatter } from '../../core/rng';
import type { SceneImplementation } from '../../core/types';
import type { ThreeHandle } from '../../engines/three';
import { createCharacter } from './character';
import { CHARACTERS_EXTENT } from './scene';

let mixers: AnimationMixer[] = [];

/** 500 `SkinnedMesh` clonados do protótipo, cada um com seu `AnimationMixer` e fase do `rng`. */
const impl: SceneImplementation<ThreeHandle> = {
    setup({ engine, variant, rng }) {
        const { THREE } = engine;
        const proto = createCharacter(
            new THREE.MeshStandardMaterial({ color: 0xb08060, roughness: 0.7 }),
        );
        mixers = [];
        for (const p of gridScatter(rng, Number(variant.params.count), CHARACTERS_EXTENT)) {
            const character = clone(proto.mesh);
            character.position.set(p.position[0], 0, p.position[2]);
            character.quaternion.set(...p.rotation);
            character.frustumCulled = false;
            engine.scene.add(character);
            const mixer = new THREE.AnimationMixer(character);
            const action = mixer.clipAction(proto.clip);
            action.play();
            action.time = rng() * proto.clip.duration;
            mixers.push(mixer);
        }
    },
    update(dt) {
        for (const m of mixers) m.update(dt);
    },
};

export default impl;
