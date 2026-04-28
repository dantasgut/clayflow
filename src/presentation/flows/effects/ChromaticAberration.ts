import { PostProcessEffect } from '../../resources/PostProcessEffect';

export class ChromaticAberration extends PostProcessEffect {
    get name(): string { return 'ChromaticAberration'; }
    get fragmentEntry(): string { return 'fs_chromatic'; }
}
