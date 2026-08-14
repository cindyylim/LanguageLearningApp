import api from '../lib/api';
import { WordStatus } from '../shared/types/index';

export function getProgressColor(status?: string) {
    if (status === WordStatus.MASTERED) return 'text-green-600';
    if (status === WordStatus.LEARNING) return 'text-yellow-600';
    return 'text-red-600';
}

export function getProgressText(status?: string) {
    if (status === WordStatus.MASTERED) return 'Mastered';
    if (status === WordStatus.LEARNING) return 'Learning';
    return 'New';
}

export function getProgressBarColor(status?: string) {
    if (status === WordStatus.MASTERED) return 'bg-green-500';
    if (status === WordStatus.LEARNING) return 'bg-yellow-500';
    return 'bg-red-500';
}

export function getProgressBarWidth(status?: string) {
    if (status === WordStatus.MASTERED) return '100%';
    if (status === WordStatus.LEARNING) return '66%';
    return '33%';
}

export async function updateWordProgressApi(wordId: string, status: WordStatus) {
    const res = await api.post(`/vocabulary/words/${wordId}/progress`, { status });
    return res.data.progress;
}
