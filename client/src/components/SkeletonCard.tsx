import React from 'react';

interface SkeletonCardProps {
    className?: string;
}

export const SkeletonCard: React.FC<SkeletonCardProps> = ({ className = '' }) => (
    <div className={`animate-pulse bg-white rounded-lg shadow p-4 ${className}`}>
        <div className="h-4 bg-gray-200 rounded w-3/4 mb-4"></div>
        <div className="space-y-2">
            <div className="h-3 bg-gray-200 rounded w-full"></div>
            <div className="h-3 bg-gray-200 rounded w-5/6"></div>
        </div>
    </div>
);

export const SkeletonLine: React.FC<{ className?: string }> = ({ className = '' }) => (
    <div className={`animate-pulse h-4 bg-gray-200 rounded ${className}`}></div>
);

export const SkeletonButton: React.FC<{ className?: string }> = ({ className = '' }) => (
    <div className={`animate-pulse h-10 bg-gray-200 rounded ${className}`}></div>
);
