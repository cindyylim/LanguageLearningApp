import React, { useEffect, useState } from 'react';
import axios from 'axios';

const Analytics: React.FC = () => {
  const [progress, setProgress] = useState<any>(null);
  const [recommendations, setRecommendations] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAnalytics = async () => {
      setLoading(true);
      setError(null);
      try {
        const [progressRes, recRes] = await Promise.all([
          axios.get(`${process.env.REACT_APP_API_URL}/api/analytics/progress`),
          axios.get(`${process.env.REACT_APP_API_URL}/api/analytics/recommendations`),
        ]);
        setProgress(progressRes.data);
        setRecommendations(recRes.data);
      } catch (err: any) {
        setError('Failed to load analytics');
      } finally {
        setLoading(false);
      }
    };
    fetchAnalytics();
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Analytics</h1>
      <p className="text-gray-600 mb-6">Track your learning progress and get personalized recommendations.</p>
      {loading ? (
        <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>
      ) : error ? (
        <div className="text-red-500 text-center">{error}</div>
      ) : progress && recommendations ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div>
            <div className="card mb-4">
              <h2 className="text-lg font-semibold mb-2">Progress Summary</h2>
              <ul className="space-y-1">
                <li>Total Words: <span className="font-bold">{progress.summary.totalWords}</span></li>
                <li>Mastered Words: <span className="font-bold text-success-600">{progress.summary.masteredWords}</span></li>
                <li>Needs Review: <span className="font-bold text-warning-600">{progress.summary.needsReview}</span></li>
                <li>Current Streak: <span className="font-bold text-primary-600">{progress.summary.currentStreak}</span></li>
                <li>Average Score: <span className="font-bold">{Math.round((progress.summary.avgScore ?? 0) * 100)}%</span></li>
                <li>Total Study Time: <span className="font-bold">{progress.summary.totalStudyTime} min</span></li>
              </ul>
            </div>
            <div className="card">
              <h2 className="text-lg font-semibold mb-2">Recent Activity</h2>
              <ul className="space-y-1">
                {progress.recentAttempts && progress.recentAttempts.length > 0 ? progress.recentAttempts.map((a: any) => (
                  <li key={a.id} className="flex justify-between text-sm">
                    <span>{a.quiz?.title || 'Quiz'}</span>
                    <span className="text-gray-500">{Math.round((a.score ?? 0) * 100)}%</span>
                  </li>
                )) : <li className="text-gray-400">No recent attempts</li>}
              </ul>
            </div>
          </div>
          <div>
            <div className="card mb-4">
              <h2 className="text-lg font-semibold mb-2">AI Recommendations</h2>
              <ul className="space-y-1">
                {recommendations.focusAreas && recommendations.focusAreas.length > 0 ? recommendations.focusAreas.map((area: string) => (
                  <li key={area} className="badge badge-primary mr-2 mb-1 inline-block">{area.replace('_', ' ')}</li>
                )) : <li className="text-gray-400">No recommendations</li>}
              </ul>
              <div className="mt-2 text-sm text-gray-700">{recommendations.studyPlan}</div>
              <div className="mt-1 text-xs text-gray-500">Estimated time: {recommendations.estimatedTime} min</div>
            </div>
            <div className="card">
              <h2 className="text-lg font-semibold mb-2">Recommended Words</h2>
              <ul className="flex flex-wrap gap-2">
                {recommendations.recommendedWords && recommendations.recommendedWords.length > 0 ? recommendations.recommendedWords.map((w: any) => (
                  <li key={w.id} className="badge badge-success">{w.word} ({w.translation})</li>
                )) : <li className="text-gray-400">No words to review</li>}
              </ul>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default Analytics; 