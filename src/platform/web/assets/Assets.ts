import { TextureLoader } from './TextureLoader';
import { GltfLoader } from './GltfLoader';
import { HeightmapLoader } from './HeightmapLoader';
import { AudioLoader } from './AudioLoader';
import { FontLoader } from './FontLoader';

/**
 * Assets é o ponto de acesso unificado para os asset loaders. Cria
 * uma instância de cada loader; consumers acessam via `assets.texture.load(...)`,
 * `assets.gltf.load(...)`, etc.
 *
 * Loaders são stateful (alguns mantêm cache), então criar um Assets
 * por Application é a prática recomendada.
 */
export class Assets {
    /** Loader de texturas 2D (PNG/JPG/HDR via fetch + ImageBitmap). */
    readonly texture = new TextureLoader();
    /** Loader de glTF/GLB models (mesh + materials + animations + skins). */
    readonly gltf = new GltfLoader();
    /** Loader de heightmaps (RGBA → terrain mesh tessellated). */
    readonly heightmap = new HeightmapLoader();
    /** Loader de audio (mp3/ogg/wav via Web Audio API). */
    readonly audio = new AudioLoader();
    /** Loader de fonts (woff/ttf via FontFace + atlas glyph). */
    readonly font = new FontLoader();
}
