import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Link } from 'react-router-dom';

const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSummary = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await axios.get(`${process.env.REACT_APP_API_URL}/api/analytics/progress`);
        setSummary(res.data.summary);
      } catch (err: any) {
        setError('Failed to load dashboard data');
      } finally {
        setLoading(false);
      }
    };
    fetchSummary();
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Welcome, {user?.name || 'Learner'}!</h1>
      <p className="text-gray-600 mb-6">Here’s a quick overview of your language learning journey.</p>
      {loading ? (
        <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>
      ) : error ? (
        <div className="text-red-500 text-center">{error}</div>
      ) : summary ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 mb-8">
          <div className="card">
            <div className="text-lg font-semibold">Words Learned</div>
            <div className="text-3xl font-bold text-primary-600">{summary.totalWords}</div>
          </div>
          <div className="card">
            <div className="text-lg font-semibold">Mastered Words</div>
            <div className="text-3xl font-bold text-success-600">{summary.masteredWords}</div>
          </div>
          <div className="card">
            <div className="text-lg font-semibold">Quizzes Taken</div>
            <div className="text-3xl font-bold text-primary-600">{summary.totalQuizzesTaken ?? '-'}</div>
          </div>
          <div className="card">
            <div className="text-lg font-semibold">Current Streak</div>
            <div className="text-3xl font-bold text-warning-600">{summary.currentStreak}</div>
          </div>
          <div className="card">
            <div className="text-lg font-semibold">Average Score</div>
            <div className="text-3xl font-bold">{Math.round((summary.avgScore ?? 0) * 100)}%</div>
          </div>
          <div className="card">
            <div className="text-lg font-semibold">Study Time</div>
            <div className="text-3xl font-bold">{summary.totalStudyTime} min</div>
          </div>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-4 mt-4">
        <Link to="/vocabulary" className="btn-primary">Go to Vocabulary</Link>
        <Link to="/quizzes" className="btn-secondary">Go to Quizzes</Link>
        <Link to="/analytics" className="btn-secondary">View Analytics</Link>
      </div>
    </div>
  );
};

export default Dashboard; 