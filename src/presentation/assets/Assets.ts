import { TextureLoader } from './TextureLoader';
import { GltfLoader } from './GltfLoader';
import { HeightmapLoader } from './HeightmapLoader';
import { AudioLoader } from './AudioLoader';
import { FontLoader } from './FontLoader';

export class Assets {
    readonly texture = new TextureLoader();
    readonly gltf = new GltfLoader();
    readonly heightmap = new HeightmapLoader();
    readonly audio = new AudioLoader();
    readonly font = new FontLoader();
}
