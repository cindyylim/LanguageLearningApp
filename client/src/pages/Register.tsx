import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import LanguageDropdown from '../components/LanguageDropdown';

const proficiencyLevels = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
];

const Register: React.FC = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [reenterPassword, setReenterPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [nativeLanguage, setNativeLanguage] = useState('en');
  const [targetLanguage, setTargetLanguage] = useState('es');
  const [proficiencyLevel, setProficiencyLevel] = useState('beginner');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const { register } = useAuthStore();
  const navigate = useNavigate();

  // Password validation function
  const isPasswordValid = (pw: string) => {
    return (
      pw.length >= 8 &&
      /[0-9]/.test(pw) &&
      /[^A-Za-z0-9]/.test(pw)
    );
  };

  const handleTargetLanguageChange = (code: string) => {
    setTargetLanguage(code);
  };

  const handleNativeLanguageChange = (code: string) => {
    setNativeLanguage(code);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    if (!isPasswordValid(password)) {
      setPasswordError('Password must be at least 8 characters long and include a number and a symbol.');
      return;
    }
    if (password !== reenterPassword) {
      setPasswordError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      await register({
        name,
        email,
        password,
        nativeLanguage,
        targetLanguage,
        proficiencyLevel,
      });
      navigate('/dashboard');
    } catch (error) {
      console.log(error);
      // Error handled by AuthContext toast
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Create your account
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Start your language learning journey
          </p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                Name
              </label>
              <input
                id="name"
                name="name"
                type="text"
                autoComplete="name"
                required
                value={name}
                onChange={e => setName(e.target.value)}
                className="input-field mt-1"
                placeholder="Your name"
              />
            </div>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="input-field mt-1"
                placeholder="you@email.com"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Password
              </label>
              <div className="relative mt-1">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="input-field pr-10"
                  placeholder="Create a password"
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-5.523 0-10-4.477-10-10 0-1.657.336-3.234.938-4.675M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  ) : (
                    <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0zm2.121-2.121A9.969 9.969 0 0122 9c0 5.523-4.477 10-10 10a9.969 9.969 0 01-7.071-2.929m14.142-14.142A9.969 9.969 0 002 9c0 5.523 4.477 10 10 10a9.969 9.969 0 007.071-2.929" /></svg>
                  )}
                </button>
              </div>
            </div>
            <div>
              <label htmlFor="reenterPassword" className="block text-sm font-medium text-gray-700">
                Re-enter Password
              </label>
              <div className="relative mt-1">
                <input
                  id="reenterPassword"
                  name="reenterPassword"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  value={reenterPassword}
                  onChange={e => setReenterPassword(e.target.value)}
                  className="input-field pr-10"
                  placeholder="Re-enter your password"
                />
              </div>
              {passwordError && <div className="text-red-500 text-xs mt-1">{passwordError}</div>}
              <div className="text-xs text-gray-500 mt-1">
                Password must be at least 8 characters, include a number and a symbol.
              </div>
            </div>
            <div>
              <label htmlFor="nativeLanguage" className="block text-sm font-medium text-gray-700">
                Native Language
              </label>
              <LanguageDropdown onCodeSelect={handleNativeLanguageChange}></LanguageDropdown>
            </div>
            <div>
              <label htmlFor="targetLanguage" className="block text-sm font-medium text-gray-700">
                Language You Want to Learn
              </label>
              <LanguageDropdown onCodeSelect={handleTargetLanguageChange}></LanguageDropdown>
            </div>
            <div>
              <label htmlFor="proficiencyLevel" className="block text-sm font-medium text-gray-700">
                Proficiency Level
              </label>
              <select
                id="proficiencyLevel"
                name="proficiencyLevel"
                value={proficiencyLevel}
                onChange={e => setProficiencyLevel(e.target.value)}
                className="input-field mt-1"
              >
                {proficiencyLevels.map(level => (
                  <option key={level.value} value={level.value}>{level.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full flex justify-center py-3"
            >
              {loading ? (
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
              ) : (
                'Sign up'
              )}
            </button>
          </div>
          <div className="text-center">
            <p className="text-sm text-gray-600">
              Already have an account?{' '}
              <Link to="/login" className="font-medium text-primary-600 hover:text-primary-500">
                Sign in here
              </Link>
            </p>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Register; 