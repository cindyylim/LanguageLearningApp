import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';

interface QuizQuestion {
  _id: string;
  question: string;
  type: string;
  options?: string | null;
  context?: string;
  difficulty: string;
  correctAnswer: string;
}

const Quiz: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [quiz, setQuiz] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<{ [key: string]: string }>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    const fetchQuiz = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await axios.get(`${process.env.REACT_APP_API_URL}/quizzes/${id}`);
        setQuiz(res.data.quiz);
      } catch (err: any) {
        setError('Failed to load quiz');
      } finally {
        setLoading(false);
      }
    };
    if (id) fetchQuiz();
  }, [id]);

  const handleChange = (qid: string, value: string) => {
    setAnswers(a => ({ ...a, [qid]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = {
        answers: quiz.questions.map((q: QuizQuestion) => ({
          questionId: q._id,
          answer: answers[q._id] || ''
        })),
      };
      const res = await axios.post(`${process.env.REACT_APP_API_URL}/quizzes/${id}/submit`, payload);
      setResult(res.data.attempt);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to submit quiz');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>;
  if (error) return <div className="text-red-500 text-center py-8">{error}</div>;
  if (!quiz) return null;

  if (result) {
    return (
      <div className="max-w-xl mx-auto">
        <h1 className="text-2xl font-bold mb-2">Quiz Results</h1>
        <div className="mb-4">Score: <span className="font-bold text-primary-600">{Math.round((result.score ?? 0) * 100)}%</span></div>
        <div className="mb-4">Correct Answers: {result.correctAnswers} / {result.totalQuestions}</div>
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-2">Review Answers</h2>
          {quiz.questions.map((q: QuizQuestion, idx: number) => {
            const userAnswer = (result.answers && result.answers.find((a: any) => a.questionId === q._id)) || {};
            const isCorrect = userAnswer.isCorrect;
            return (
              <div key={q._id} className="mb-4 p-4 rounded border bg-gray-50">
                <div className="font-semibold mb-1">Q{idx + 1}. {q.question}</div>
                {q.context && <div className="mb-1 text-xs text-gray-500">{q.context}</div>}
                <div className="mb-1">
                  <span className="font-medium">Your answer:</span> {userAnswer.answer || <span className="italic text-gray-400">No answer</span>}
                  {isCorrect !== undefined && (
                    <span className={isCorrect ? 'ml-2 text-success-600 font-bold' : 'ml-2 text-red-600 font-bold'}>
                      {isCorrect ? 'Correct' : 'Incorrect'}
                    </span>
                  )}
                </div>
                <div className="mb-1">
                  <span className="font-medium">Correct answer:</span> {q.correctAnswer}
                </div>
              </div>
            );
          })}
        </div>
        <button className="btn-secondary" onClick={() => navigate('/quizzes')}>Back to Quizzes</button>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">{quiz.title}</h1>
      <div className="mb-4 text-gray-600">{quiz.description}</div>
      <form onSubmit={handleSubmit} className="space-y-6">
        {quiz.questions.map((q: QuizQuestion, idx: number) => (
          <div key={q._id} className="card">
            <div className="mb-2 font-semibold">Q{idx + 1}. {q.question}</div>
            {q.context && <div className="mb-2 text-xs text-gray-500">{q.context}</div>}
            {q.type === 'multiple_choice' && q.options ? (
              <div className="space-y-1">
                {JSON.parse(q.options).map((opt: string, i: number) => (
                  <label key={i} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name={q._id}
                      value={opt}
                      checked={answers[q._id] === opt}
                      onChange={() => handleChange(q._id, opt)}
                      className="form-radio"
                    />
                    {opt}
                  </label>
                ))}
              </div>
            ) : (
              <input
                className="input-field"
                type="text"
                placeholder="Your answer"
                value={answers[q._id] || ''}
                onChange={e => handleChange(q._id, e.target.value)}
              />
            )}
          </div>
        ))}
        <button type="submit" className="btn-primary w-full" disabled={submitting}>{submitting ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mx-auto"></div> : 'Submit Quiz'}</button>
      </form>
    </div>
  );
};

export default Quiz;

 