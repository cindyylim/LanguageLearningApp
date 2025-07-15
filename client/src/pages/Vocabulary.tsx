import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';

const Vocabulary: React.FC = () => {
  const { user } = useAuth();
  const [lists, setLists] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showListModal, setShowListModal] = useState(false);
  const [showWordModal, setShowWordModal] = useState<string | null>(null); // listId or null
  const [listForm, setListForm] = useState({ 
    name: '', 
    description: '', 
    isPublic: false,
    targetLanguage: user?.targetLanguage || 'es',
    nativeLanguage: user?.nativeLanguage || 'en'
  });
  const [wordForm, setWordForm] = useState({ word: '', translation: '', partOfSpeech: '', difficulty: 'medium' });
  const [saving, setSaving] = useState(false);
  const [showAIModal, setShowAIModal] = useState(false);
  const [aiForm, setAIForm] = useState({
    name: '',
    description: '',
    targetLanguage: user?.targetLanguage || 'es',
    nativeLanguage: user?.nativeLanguage || 'en',
    prompt: '',
    wordCount: 10
  });
  const [aiLoading, setAILoading] = useState(false);

  useEffect(() => {
    fetchLists();
    // eslint-disable-next-line
  }, []);

  // Update form when user data changes
  useEffect(() => {
    if (user) {
      setListForm(prev => ({
        ...prev,
        targetLanguage: user.targetLanguage || 'es',
        nativeLanguage: user.nativeLanguage || 'en'
      }));
    }
  }, [user]);

  const fetchLists = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get(`${process.env.REACT_APP_API_URL}/api/vocabulary`);
      setLists(res.data.vocabularyLists || []);
    } catch (err: any) {
      setError('Failed to load vocabulary lists');
    } finally {
      setLoading(false);
    }
  };

  const handleAddList = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await axios.post(`${process.env.REACT_APP_API_URL}/api/vocabulary`, listForm);
      setShowListModal(false);
      setListForm({ 
        name: '', 
        description: '', 
        isPublic: false,
        targetLanguage: user?.targetLanguage || 'es',
        nativeLanguage: user?.nativeLanguage || 'en'
      });
      fetchLists();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to add list');
    } finally {
      setSaving(false);
    }
  };

  const handleAddWord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showWordModal) return;
    setSaving(true);
    try {
      await axios.post(`${process.env.REACT_APP_API_URL}/api/vocabulary/${showWordModal}/words`, wordForm);
      setShowWordModal(null);
      setWordForm({ word: '', translation: '', partOfSpeech: '', difficulty: 'medium' });
      fetchLists();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to add word');
    } finally {
      setSaving(false);
    }
  };

  const handleAIGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setAILoading(true);
    try {
      await axios.post(`${process.env.REACT_APP_API_URL}/api/vocabulary/generate-ai-list`, aiForm);
      setShowAIModal(false);
      setAIForm({
        name: '',
        description: '',
        targetLanguage: user?.targetLanguage || 'es',
        nativeLanguage: user?.nativeLanguage || 'en',
        prompt: '',
        wordCount: 10
      });
      fetchLists();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to generate vocabulary list');
    } finally {
      setAILoading(false);
    }
  };

  const updateWordProgress = async (wordId: string, status: 'learning' | 'learned' | 'mastered') => {
    try {
      await axios.post(`${process.env.REACT_APP_API_URL}/api/vocabulary/words/${wordId}/progress`, { status });
      fetchLists(); // Refresh to show updated progress
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to update word progress');
    }
  };

  const getProgressColor = (mastery: number) => {
    if (mastery >= 0.8) return 'text-green-600';
    if (mastery >= 0.5) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getProgressText = (mastery: number) => {
    if (mastery >= 0.8) return 'Mastered';
    if (mastery >= 0.5) return 'Learning';
    return 'New';
  };

  const getProgressBarColor = (mastery: number) => {
    if (mastery >= 0.8) return 'bg-green-500';
    if (mastery >= 0.5) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Vocabulary</h1>
        <div className="flex gap-2">
          <button className="btn-primary" onClick={() => setShowListModal(true)}>+ Add New List</button>
          <button className="btn-secondary" onClick={() => setShowAIModal(true)}>✨ Generate with AI</button>
        </div>
      </div>
      {showListModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-30">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md relative">
            <button className="absolute top-2 right-2 text-gray-400 hover:text-gray-600" onClick={() => setShowListModal(false)}>&times;</button>
            <h2 className="text-lg font-bold mb-4">Add New Vocabulary List</h2>
            <form onSubmit={handleAddList} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Name</label>
                <input className="input-field" required value={listForm.name} onChange={e => setListForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <input className="input-field" value={listForm.description} onChange={e => setListForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="isPublic" checked={listForm.isPublic} onChange={e => setListForm(f => ({ ...f, isPublic: e.target.checked }))} />
                <label htmlFor="isPublic" className="text-sm">Public</label>
              </div>
              <button type="submit" className="btn-primary w-full" disabled={saving}>{saving ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mx-auto"></div> : 'Add List'}</button>
            </form>
          </div>
        </div>
      )}
      {showWordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-30">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md relative">
            <button className="absolute top-2 right-2 text-gray-400 hover:text-gray-600" onClick={() => setShowWordModal(null)}>&times;</button>
            <h2 className="text-lg font-bold mb-4">Add Word</h2>
            <form onSubmit={handleAddWord} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Word</label>
                <input className="input-field" required value={wordForm.word} onChange={e => setWordForm(f => ({ ...f, word: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Translation</label>
                <input className="input-field" required value={wordForm.translation} onChange={e => setWordForm(f => ({ ...f, translation: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Part of Speech</label>
                <input className="input-field" value={wordForm.partOfSpeech} onChange={e => setWordForm(f => ({ ...f, partOfSpeech: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Difficulty</label>
                <select className="input-field" value={wordForm.difficulty} onChange={e => setWordForm(f => ({ ...f, difficulty: e.target.value }))}>
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </div>
              <button type="submit" className="btn-primary w-full" disabled={saving}>{saving ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mx-auto"></div> : 'Add Word'}</button>
            </form>
          </div>
        </div>
      )}
      {showAIModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-30">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md relative">
            <button className="absolute top-2 right-2 text-gray-400 hover:text-gray-600" onClick={() => setShowAIModal(false)}>&times;</button>
            <h2 className="text-lg font-bold mb-4">Generate Vocabulary List with AI</h2>
            <form onSubmit={handleAIGenerate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">List Name</label>
                <input className="input-field" required value={aiForm.name} onChange={e => setAIForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <input className="input-field" value={aiForm.description} onChange={e => setAIForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Target Language</label>
                <input className="input-field" required value={aiForm.targetLanguage} onChange={e => setAIForm(f => ({ ...f, targetLanguage: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Native Language</label>
                <input className="input-field" required value={aiForm.nativeLanguage} onChange={e => setAIForm(f => ({ ...f, nativeLanguage: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Topic / Keywords</label>
                <input className="input-field" required value={aiForm.prompt} onChange={e => setAIForm(f => ({ ...f, prompt: e.target.value }))} placeholder="e.g. travel, food, business" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Number of Words</label>
                <input className="input-field" type="number" min={5} max={50} value={aiForm.wordCount} onChange={e => setAIForm(f => ({ ...f, wordCount: Number(e.target.value) }))} />
              </div>
              <button type="submit" className="btn-primary w-full" disabled={aiLoading}>{aiLoading ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mx-auto"></div> : 'Generate List'}</button>
            </form>
          </div>
        </div>
      )}
      {loading ? (
        <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>
      ) : error ? (
        <div className="text-red-500 text-center">{error}</div>
      ) : lists.length === 0 ? (
        <div className="text-gray-500 text-center">No vocabulary lists found. Add your first list!</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {lists.map((list: any) => (
            <div key={list._id} className="card">
              <div className="flex justify-between items-center mb-2">
                <div className="font-semibold text-lg">{list.name}</div>
                <span className="badge badge-primary">{list._count.words} words</span>
              </div>
              <div className="text-sm text-gray-600 mb-1">{list.description || 'No description'}</div>
              <div className="space-y-2 mt-4">
                {list.words && list.words.length > 0 ? list.words.slice(0, 8).map((w: any) => {
                  const mastery = w.progress?.mastery || 0;
                  const status = w.progress?.status || 'not_started';
                  return (
                    <div key={w._id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                      <div className="flex-1">
                        <div className="font-medium">{w.word}</div>
                        <div className="text-sm text-gray-500">{w.translation}</div>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex-1 bg-gray-200 rounded-full h-2">
                            <div 
                              className={`h-2 rounded-full ${getProgressBarColor(mastery)}`}
                              style={{ width: `${mastery * 100}%` }}
                            ></div>
                          </div>
                          <span className={`text-xs font-medium ${getProgressColor(mastery)}`}>
                            {getProgressText(mastery)}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-1 ml-2">
                        <button
                          onClick={() => updateWordProgress(w._id, 'learning')}
                          className={`px-2 py-1 text-xs rounded ${status === 'learning' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
                        >
                          Learning
                        </button>
                        <button
                          onClick={() => updateWordProgress(w._id, 'learned')}
                          className={`px-2 py-1 text-xs rounded ${status === 'learned' ? 'bg-green-500 text-white' : 'bg-gray-200'}`}
                        >
                          Learned
                        </button>
                        <button
                          onClick={() => updateWordProgress(w._id, 'mastered')}
                          className={`px-2 py-1 text-xs rounded ${status === 'mastered' ? 'bg-purple-500 text-white' : 'bg-gray-200'}`}
                        >
                          Mastered
                        </button>
                      </div>
                    </div>
                  );
                }) : <span className="text-gray-400">No words</span>}
                {list.words && list.words.length > 8 && (
                  <span className="badge badge-warning">+{list.words.length - 8} more</span>
                )}
                <button className="btn-secondary text-xs ml-2" onClick={() => setShowWordModal(list._id.toString())}>+ Add Word</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Vocabulary; 