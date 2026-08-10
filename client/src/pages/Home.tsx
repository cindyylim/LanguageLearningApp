import React, { useState } from 'react';
import { Link, useNavigate, Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import {
  SparklesIcon,
  ClipboardDocumentIcon,
  ClipboardDocumentCheckIcon,
  UserIcon,
  AcademicCapIcon,
  BoltIcon,
  ChartBarIcon,
  GlobeAltIcon
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

const Home: React.FC = () => {
  const { user, loginDemo } = useAuthStore();
  const navigate = useNavigate();
  const [loadingDemo, setLoadingDemo] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [copiedPassword, setCopiedPassword] = useState(false);

  if (user) return <Navigate to="/dashboard" replace />;

  const handleDemoLogin = async () => {
    setLoadingDemo(true);
    try {
      await loginDemo();
      navigate('/dashboard');
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingDemo(false);
    }
  };

  const copyToClipboard = (text: string, isEmail: boolean) => {
    navigator.clipboard.writeText(text);
    if (isEmail) {
      setCopiedEmail(true);
      setTimeout(() => setCopiedEmail(false), 2000);
      toast.success('Email copied to clipboard!');
    } else {
      setCopiedPassword(true);
      setTimeout(() => setCopiedPassword(false), 2000);
      toast.success('Password copied to clipboard!');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-slate-900 to-indigo-950 text-white flex flex-col justify-between">
      {/* Navigation Header */}
      <header className="max-w-7xl w-full mx-auto px-6 py-6 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="bg-indigo-500 p-2.5 rounded-xl shadow-lg shadow-indigo-500/30">
            <AcademicCapIcon className="h-7 w-7 text-white" />
          </div>
          <span className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-indigo-200">
          </span>
        </div>
        <div className="flex items-center space-x-3">
          <Link
            to="/login"
            className="text-sm font-semibold text-indigo-200 hover:text-white px-4 py-2 rounded-lg transition-colors"
          >
            Sign In
          </Link>
          <Link
            to="/register"
            className="text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-lg shadow-md shadow-indigo-600/30 transition-all hover:scale-[1.02]"
          >
            Get Started
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <main className="max-w-6xl w-full mx-auto px-4 py-8 flex-grow flex flex-col items-center justify-center">
        <div className="text-center max-w-3xl mb-10">
          <div className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-400/20 text-indigo-300 text-xs font-semibold uppercase tracking-wider mb-6">
            <SparklesIcon className="h-4 w-4 text-indigo-400" />
            <span>AI-Powered Language Learning</span>
          </div>

          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight mb-6 leading-tight">
            Master Any Language <br />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-300 via-sky-300 to-emerald-300">
              With Interactive AI Quizzes
            </span>
          </h1>

          <p className="text-lg md:text-xl text-slate-300 mb-8 leading-relaxed max-w-2xl mx-auto">
            Generate custom vocabulary lists, test your mastery with adaptive AI quizzes, and track your retention with spaced repetition.
          </p>
        </div>

        {/* Demo Account Section */}
        <section className="w-full max-w-2xl mb-12">
          <div className="relative group rounded-3xl p-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 shadow-2xl shadow-indigo-500/20">
            <div className="bg-slate-900/90 backdrop-blur-xl rounded-[22px] p-6 sm:p-8">
              <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-800">
                <div className="flex items-center space-x-3">
                  <div className="bg-emerald-500/20 text-emerald-400 p-2 rounded-xl">
                    <UserIcon className="h-6 w-6" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                      Try Demo Account
                      <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-medium px-2.5 py-0.5 rounded-full">
                        Instant Access
                      </span>
                    </h2>
                    <p className="text-xs sm:text-sm text-slate-400">Explore all features immediately without creating an account.</p>
                  </div>
                </div>
              </div>

              {/* Demo Credentials Box */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                {/* Email Box */}
                <div className="bg-slate-800/80 border border-slate-700/60 rounded-xl p-3.5 flex items-center justify-between">
                  <div className="overflow-hidden pr-2">
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">Demo Email</span>
                    <span className="text-sm font-mono text-indigo-200 truncate block">test@email.com</span>
                  </div>
                  <button
                    onClick={() => copyToClipboard('test@email.com', true)}
                    className="p-2 text-slate-400 hover:text-white bg-slate-700/50 hover:bg-slate-700 rounded-lg transition-colors"
                    title="Copy Email"
                  >
                    {copiedEmail ? (
                      <ClipboardDocumentCheckIcon className="h-5 w-5 text-emerald-400" />
                    ) : (
                      <ClipboardDocumentIcon className="h-5 w-5" />
                    )}
                  </button>
                </div>

                {/* Password Box */}
                <div className="bg-slate-800/80 border border-slate-700/60 rounded-xl p-3.5 flex items-center justify-between">
                  <div className="overflow-hidden pr-2">
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">Demo Password</span>
                    <span className="text-sm font-mono text-indigo-200 truncate block">12345678$</span>
                  </div>
                  <button
                    onClick={() => copyToClipboard('12345678$', false)}
                    className="p-2 text-slate-400 hover:text-white bg-slate-700/50 hover:bg-slate-700 rounded-lg transition-colors"
                    title="Copy Password"
                  >
                    {copiedPassword ? (
                      <ClipboardDocumentCheckIcon className="h-5 w-5 text-emerald-400" />
                    ) : (
                      <ClipboardDocumentIcon className="h-5 w-5" />
                    )}
                  </button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={handleDemoLogin}
                  disabled={loadingDemo}
                  className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-semibold py-3 px-6 rounded-xl shadow-lg shadow-emerald-500/25 flex items-center justify-center space-x-2 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
                >
                  {loadingDemo ? (
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  ) : (
                    <>
                      <BoltIcon className="h-5 w-5" />
                      <span>One-Click Demo Login</span>
                    </>
                  )}
                </button>

                <Link
                  to="/login"
                  className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold py-3 px-6 rounded-xl border border-slate-700 flex items-center justify-center text-sm transition-colors"
                >
                  Manual Sign In
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Feature Highlights Grid */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-4xl">
          <div className="bg-slate-800/40 border border-slate-800 rounded-2xl p-5 backdrop-blur-sm">
            <div className="bg-indigo-500/10 text-indigo-400 p-2.5 rounded-xl w-fit mb-3">
              <SparklesIcon className="h-6 w-6" />
            </div>
            <h3 className="text-base font-bold text-white mb-1">AI Vocabulary Generation</h3>
            <p className="text-sm text-slate-400">Instantly generate rich themed word lists tailored to your learning goals.</p>
          </div>

          <div className="bg-slate-800/40 border border-slate-800 rounded-2xl p-5 backdrop-blur-sm">
            <div className="bg-purple-500/10 text-purple-400 p-2.5 rounded-xl w-fit mb-3">
              <ChartBarIcon className="h-6 w-6" />
            </div>
            <h3 className="text-base font-bold text-white mb-1">Adaptive Quizzes</h3>
            <p className="text-sm text-slate-400">Multiple question styles and difficulty levels powered by OpenAI.</p>
          </div>

          <div className="bg-slate-800/40 border border-slate-800 rounded-2xl p-5 backdrop-blur-sm">
            <div className="bg-sky-500/10 text-sky-400 p-2.5 rounded-xl w-fit mb-3">
              <GlobeAltIcon className="h-6 w-6" />
            </div>
            <h3 className="text-base font-bold text-white mb-1">Multi-Language & Analytics</h3>
            <p className="text-sm text-slate-400">Track progress, retain words with spaced repetition across multiple target languages.</p>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="py-6 border-t border-slate-800/60 text-center text-xs text-slate-500">
        <p>© {new Date().getFullYear()} Powered by OpenAI.</p>
      </footer>
    </div>
  );
};

export default Home;