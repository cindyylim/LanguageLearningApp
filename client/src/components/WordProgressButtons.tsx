import React from 'react';
import { WordStatus } from '../shared/types/index';

interface WordProgressButtonsProps {
    currentStatus?: string;
    onUpdate: (status: WordStatus) => void;
}

const WordProgressButtons: React.FC<WordProgressButtonsProps> = ({ currentStatus, onUpdate }) => (
    <div className="flex gap-1">
        <button
            onClick={() => onUpdate(WordStatus.LEARNING)}
            className={`px-2 py-1 text-xs rounded ${currentStatus === WordStatus.LEARNING ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
        >
            Learning
        </button>
        <button
            onClick={() => onUpdate(WordStatus.MASTERED)}
            className={`px-2 py-1 text-xs rounded ${currentStatus === WordStatus.MASTERED ? 'bg-purple-500 text-white' : 'bg-gray-200'}`}
        >
            Mastered
        </button>
    </div>
);

export default WordProgressButtons;
