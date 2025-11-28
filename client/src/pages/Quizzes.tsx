import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { ListVocabulary } from '../types/vocabulary';
import { QuizAttempt } from './Analytics';
import { QuizQuestion } from './Quiz';
import { getErrorMessage } from '../types/errors';

interface Quiz {
  _id: string;
  attempts: QuizAttempt[];
  createdAt: string;
  description: string;
  difficulty: string;
  questionCount: number;
  questions: QuizQuestion[];
  title: string;
  updatedAt: string;
  userId: string;
  _count: { questions: number, attempts: number }
}
const Quizzes: React.FC = () => {
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [vocabLists, setVocabLists] = useState<ListVocabulary[]>([]);
  const [form, setForm] = useState({
    vocabularyListId: '',
    difficulty: 'medium',
    questionCount: 10,
  });
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    const fetchQuizzes = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await axios.get(`${process.env.REACT_APP_API_URL}/quizzes`);
        setQuizzes(res.data.quizzes || []);
      } catch (err: unknown) {
        setError(getErrorMessage(err) || 'Failed to load quizzes');
      } finally {
        setLoading(false);
      }
    };
    fetchQuizzes();
  }, []);

  const openModal = async () => {
    setShowModal(true);
    if (vocabLists.length === 0) {
      try {
        const res = await axios.get(`${process.env.REACT_APP_API_URL}/vocabulary`);
        setVocabLists(res.data.vocabularyLists || []);
      } catch { }
    }
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setGenerating(true);
    try {
      const res = await axios.post(`${process.env.REACT_APP_API_URL}/quizzes/generate`, form);
      setQuizzes([res.data.quiz, ...quizzes]);
      setShowModal(false);
    } catch (err: unknown) {
      alert(getErrorMessage(err) || 'Failed to generate quiz');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Quizzes</h1>
        <button className="btn-primary" onClick={openModal}>+ Generate New Quiz</button>
      </div>
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-30">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md relative">
            <button className="absolute top-2 right-2 text-gray-400 hover:text-gray-600" onClick={() => setShowModal(false)}>&times;</button>
            <h2 className="text-lg font-bold mb-4">Generate New Quiz</h2>
            <form onSubmit={handleGenerate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Vocabulary List</label>
                <select
                  className="input-field"
                  required
                  value={form.vocabularyListId}
                  onChange={e => setForm(f => ({ ...f, vocabularyListId: e.target.value }))}
                >
                  <option value="">Select a list</option>
                  {vocabLists.map((list: ListVocabulary) => (
                    <option key={list._id} value={list._id}>{list.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Difficulty</label>
                <select
                  className="input-field"
                  value={form.difficulty}
                  onChange={e => setForm(f => ({ ...f, difficulty: e.target.value }))}
                >
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Number of Questions</label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  className="input-field"
                  value={form.questionCount}
                  onChange={e => setForm(f => ({ ...f, questionCount: Number(e.target.value) }))}
                />
              </div>
              <button type="submit" className="btn-primary w-full" disabled={generating}>
                {generating ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mx-auto"></div> : 'Generate Quiz'}
              </button>
            </form>
          </div>
        </div>
      )}
      {loading ? (
        <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>
      ) : error ? (
        <div className="text-red-500 text-center">{error}</div>
      ) : quizzes.length === 0 ? (
        <div className="text-gray-500 text-center">No quizzes found. Generate your first quiz!</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {quizzes.map((quiz: Quiz) => (
            <Link to={`/quizzes/${quiz._id}`} key={quiz._id} className="card hover:shadow-lg transition-shadow">
              <div className="flex justify-between items-center mb-2">
                <div className="font-semibold text-lg">{quiz.title}</div>
                <span className="badge badge-primary">{quiz.difficulty}</span>
              </div>
              <div className="text-sm text-gray-600 mb-1">Questions: {quiz.questionCount}</div>
              <div className="text-xs text-gray-400">Created: {new Date(quiz.createdAt).toLocaleDateString()}</div>
              <div className="mt-2">
                {quiz.attempts && quiz.attempts.length > 0 ? (
                  <span className="badge badge-success">Last Score: {Math.round((quiz.attempts[0]?.score ?? 0) * 100)}%</span>
                ) : (
                  <span className="badge badge-warning">Not Attempted</span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

export default Quizzes; 