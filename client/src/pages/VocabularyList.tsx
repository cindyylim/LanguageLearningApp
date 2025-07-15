import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';

const VocabularyList: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [list, setList] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showEditListModal, setShowEditListModal] = useState(false);
  const [editListForm, setEditListForm] = useState({ name: '', description: '' });
  const [showEditWordModal, setShowEditWordModal] = useState<string | null>(null);
  const [editWordForm, setEditWordForm] = useState({ word: '', translation: '', partOfSpeech: '', difficulty: 'medium' });
  const [deleting, setDeleting] = useState(false);
  const [deleteWordId, setDeleteWordId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchList = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await axios.get(`${process.env.REACT_APP_API_URL}/api/vocabulary/${id}`);
        setList(res.data.vocabularyList);
      } catch (err: any) {
        setError('Failed to load vocabulary list');
      } finally {
        setLoading(false);
      }
    };
    if (id) fetchList();
  }, [id]);

  useEffect(() => {
    if (list) {
      setEditListForm({ name: list.name || '', description: list.description || '' });
    }
  }, [list]);

  const handleEditList = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await axios.put(`${process.env.REACT_APP_API_URL}/api/vocabulary/${id}`, editListForm);
      setShowEditListModal(false);
      // Refresh list
      const res = await axios.get(`${process.env.REACT_APP_API_URL}/api/vocabulary/${id}`);
      setList(res.data.vocabularyList);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to update list');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteList = async () => {
    setDeleting(true);
    try {
      await axios.delete(`${process.env.REACT_APP_API_URL}/api/vocabulary/${id}`);
      navigate('/vocabulary');
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to delete list');
    } finally {
      setDeleting(false);
    }
  };

  const openEditWord = (w: any) => {
    setEditWordForm({
      word: w.word,
      translation: w.translation,
      partOfSpeech: w.partOfSpeech || '',
      difficulty: w.difficulty || 'medium',
    });
    setShowEditWordModal(w._id);
  };

  const handleEditWord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showEditWordModal) return;
    setSaving(true);
    try {
      await axios.put(`${process.env.REACT_APP_API_URL}/api/vocabulary/${id}/words/${showEditWordModal}`, editWordForm);
      setShowEditWordModal(null);
      // Refresh list
      const res = await axios.get(`${process.env.REACT_APP_API_URL}/api/vocabulary/${id}`);
      setList(res.data.vocabularyList);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to update word');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteWord = async () => {
    if (!deleteWordId) return;
    setDeleting(true);
    try {
      await axios.delete(`${process.env.REACT_APP_API_URL}/api/vocabulary/${id}/words/${deleteWordId}`);
      setDeleteWordId(null);
      // Refresh list
      const res = await axios.get(`${process.env.REACT_APP_API_URL}/api/vocabulary/${id}`);
      setList(res.data.vocabularyList);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to delete word');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-4">
      <div className="flex gap-2 mb-4">
        <button className="btn-secondary" onClick={() => navigate(-1)}>&larr; Back</button>
        <button className="btn-primary" onClick={() => setShowEditListModal(true)}>Edit List</button>
        <button className="btn-danger" onClick={() => setDeleteWordId('LIST')}>Delete List</button>
      </div>
      {/* Edit List Modal */}
      {showEditListModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-30">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md relative">
            <button className="absolute top-2 right-2 text-gray-400 hover:text-gray-600" onClick={() => setShowEditListModal(false)}>&times;</button>
            <h2 className="text-lg font-bold mb-4">Edit Vocabulary List</h2>
            <form onSubmit={handleEditList} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Name</label>
                <input className="input-field" required value={editListForm.name} onChange={e => setEditListForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <input className="input-field" value={editListForm.description} onChange={e => setEditListForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <button type="submit" className="btn-primary w-full" disabled={saving}>{saving ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mx-auto"></div> : 'Save Changes'}</button>
            </form>
          </div>
        </div>
      )}
      {/* Delete List Confirmation */}
      {deleteWordId === 'LIST' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-30">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md relative">
            <button className="absolute top-2 right-2 text-gray-400 hover:text-gray-600" onClick={() => setDeleteWordId(null)}>&times;</button>
            <h2 className="text-lg font-bold mb-4">Delete Vocabulary List</h2>
            <p>Are you sure you want to delete this list? This cannot be undone.</p>
            <div className="flex gap-2 mt-4">
              <button className="btn-danger flex-1" onClick={handleDeleteList} disabled={deleting}>{deleting ? 'Deleting...' : 'Delete'}</button>
              <button className="btn-secondary flex-1" onClick={() => setDeleteWordId(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
      {/* Edit Word Modal */}
      {showEditWordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-30">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md relative">
            <button className="absolute top-2 right-2 text-gray-400 hover:text-gray-600" onClick={() => setShowEditWordModal(null)}>&times;</button>
            <h2 className="text-lg font-bold mb-4">Edit Word</h2>
            <form onSubmit={handleEditWord} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Word</label>
                <input className="input-field" required value={editWordForm.word} onChange={e => setEditWordForm(f => ({ ...f, word: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Translation</label>
                <input className="input-field" required value={editWordForm.translation} onChange={e => setEditWordForm(f => ({ ...f, translation: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Part of Speech</label>
                <input className="input-field" value={editWordForm.partOfSpeech} onChange={e => setEditWordForm(f => ({ ...f, partOfSpeech: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Difficulty</label>
                <select className="input-field" value={editWordForm.difficulty} onChange={e => setEditWordForm(f => ({ ...f, difficulty: e.target.value }))}>
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </div>
              <button type="submit" className="btn-primary w-full" disabled={saving}>{saving ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mx-auto"></div> : 'Save Changes'}</button>
            </form>
          </div>
        </div>
      )}
      {/* Delete Word Confirmation */}
      {deleteWordId && deleteWordId !== 'LIST' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-30">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md relative">
            <button className="absolute top-2 right-2 text-gray-400 hover:text-gray-600" onClick={() => setDeleteWordId(null)}>&times;</button>
            <h2 className="text-lg font-bold mb-4">Delete Word</h2>
            <p>Are you sure you want to delete this word?</p>
            <div className="flex gap-2 mt-4">
              <button className="btn-danger flex-1" onClick={handleDeleteWord} disabled={deleting}>{deleting ? 'Deleting...' : 'Delete'}</button>
              <button className="btn-secondary flex-1" onClick={() => setDeleteWordId(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
      {loading ? (
        <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>
      ) : error ? (
        <div className="text-red-500 text-center py-8">{error}</div>
      ) : list ? (
        <div>
          <h1 className="text-2xl font-bold mb-1">{list.name}</h1>
          <div className="text-gray-600 mb-4">{list.description || 'No description'}</div>
          <div className="mb-2 text-sm text-gray-500">{list.words.length} words</div>
          <div className="space-y-2">
            {list.words.map((w: any) => (
              <div key={w._id} className="p-3 bg-gray-50 rounded flex flex-col md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="font-medium text-lg">{w.word}</div>
                  <div className="text-sm text-gray-500">{w.translation}</div>
                  {w.partOfSpeech && <div className="text-xs text-gray-400">{w.partOfSpeech}</div>}
                  <div className="text-xs text-gray-400">Created: {w.createdAt ? new Date(w.createdAt).toLocaleDateString() : '-'}</div>
                  <div className="text-xs text-gray-400">Updated: {w.updatedAt ? new Date(w.updatedAt).toLocaleDateString() : '-'}</div>
                </div>
                <div className="mt-2 md:mt-0 flex flex-col items-end">
                  <span className="badge badge-primary mb-1">{w.difficulty || 'medium'}</span>
                  {w.progress && (
                    <span className="text-xs text-gray-600">Progress: {Math.round((w.progress.mastery || 0) * 100)}% ({w.progress.status || 'not started'})</span>
                  )}
                  <div className="flex gap-2 mt-2">
                    <button className="btn-secondary text-xs" onClick={() => openEditWord(w)}>Edit</button>
                    <button className="btn-danger text-xs" onClick={() => setDeleteWordId(w._id)}>Delete</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default VocabularyList; 