import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Navigate } from 'react-router-dom';

const Home: React.FC = () => {
    const { user } = useAuth();
    if (user) return <Navigate to="/dashboard" replace />;
    return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 px-4">
      <div className="max-w-2xl w-full text-center py-16">
        <h1 className="text-4xl md:text-5xl font-extrabold text-primary-700 mb-4">Unlock Your Language Potential</h1>
        <p className="text-lg md:text-xl text-gray-700 mb-6">
          Master new languages with AI-powered quizzes, and smart vocabulary management. Track your progress, get personalized recommendations, and make learning fun and effective!
        </p>
        <ul className="text-left text-gray-700 mb-8 mx-auto max-w-md space-y-2">
          <li>✨ Instantly generate vocabulary lists and quizzes with AI</li>
          <li>🧠 Different difficulty levels for quizzes and spaced repetition for better retention</li>
          <li>📈 Track your learning progress and streaks</li>
          <li>🔒 Secure authentication and personalized dashboard</li>
          <li>🌍 Multi-language support</li>
        </ul>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link to="/register" className="btn-primary text-lg px-8 py-3">Get Started</Link>
          <Link to="/login" className="btn-secondary text-lg px-8 py-3">Login</Link>
        </div>
      </div>
    </div>
  );
};

export default Home; 