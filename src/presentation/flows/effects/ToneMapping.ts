import { PostProcessEffect } from '../../resources/PostProcessEffect';

export class ToneMapping extends PostProcessEffect {
    get name(): string {
        return 'ToneMapping';
    }
    get fragmentEntry(): string {
        return 'fs_tonemap';
    }
}
