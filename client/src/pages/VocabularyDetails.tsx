import React from 'react';
import { PencilSquareIcon, TrashIcon } from '@heroicons/react/24/outline';
import { Word } from '../types/vocabulary';
import { SkeletonCard } from '../components/SkeletonCard';
import { useVocabularyDetails } from '../hooks/useVocabularyDetails';
import { useNavigate } from 'react-router-dom';


const VocbularyDetails: React.FC = () => {
  const navigate = useNavigate();

  const {
    state,
    dispatch,
    handleEditList,
    handleDeleteList,
    openEditWord,
    handleEditWord,
    handleDeleteWord,
    updateWordProgress
  } = useVocabularyDetails();

  const {
    list,
    loading,
    error,
    showEditListModal,
    editListForm,
    showEditWordModal,
    editWordForm,
    deleting,
    deleteWordId,
    saving,
  } = state;


  // Calculate progress stats
  const totalWords = list?.words?.length || 0;
  const mastered = list?.words?.filter((w: Word) => (w.progress?.mastery ?? 0) === 1).length || 0;
  const learning = list?.words?.filter((w: Word) => (w.progress?.mastery ?? 0) < 1).length || 0;
  const percentMastered = totalWords ? Math.round((mastered / totalWords) * 100) : 0;
  const percentLearning = totalWords ? Math.round((learning / totalWords) * 100) : 0;

  return (
    <div className="max-w-2xl mx-auto p-4">
      <div className="flex gap-2 mb-4 items-center">
        <button className="btn-secondary flex items-center gap-2" onClick={() => navigate(-1)}>
          &larr; Back
        </button>
        <button
          className="btn-primary flex items-center gap-2"
          onClick={() => dispatch({ type: 'OPEN_EDIT_LIST_MODAL' })}
        >
          <PencilSquareIcon className="h-5 w-5" /> Edit List
        </button>
        <button
          className="btn-danger flex items-center gap-2"
          onClick={() => dispatch({ type: 'SET_DELETE_WORD_ID', payload: 'LIST' })}
        >
          <TrashIcon className="h-5 w-5" /> Delete List
        </button>
      </div>
      {/* Edit List Modal */}
      {showEditListModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-30">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md relative">
            <button className="absolute top-2 right-2 text-gray-400 hover:text-gray-600" onClick={() => dispatch({ type: 'CLOSE_EDIT_LIST_MODAL' })}>&times;</button>
            <h2 className="text-lg font-bold mb-4">Edit Vocabulary List</h2>
            <form onSubmit={handleEditList} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Name</label>
                <input className="input-field" name="name" required value={editListForm.name} onChange={e => dispatch({ type: 'UPDATE_EDIT_LIST_FORM', payload: { name: e.target.value } })} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <input className="input-field" name="description" value={editListForm.description} onChange={e => dispatch({ type: 'UPDATE_EDIT_LIST_FORM', payload: { description: e.target.value } })} />
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
            <button className="absolute top-2 right-2 text-gray-400 hover:text-gray-600" onClick={() => dispatch({ type: 'SET_DELETE_WORD_ID', payload: null })}>&times;</button>
            <h2 className="text-lg font-bold mb-4">Delete Vocabulary List</h2>
            <p>Are you sure you want to delete this list? This cannot be undone.</p>
            <div className="flex gap-2 mt-4">
              <button className="btn-danger flex-1" onClick={handleDeleteList} disabled={deleting}>{deleting ? 'Deleting...' : 'Delete'}</button>
              <button className="btn-secondary flex-1" onClick={() => dispatch({ type: 'SET_DELETE_WORD_ID', payload: null })}>Cancel</button>
            </div>
          </div>
        </div>
      )}
      {/* Edit Word Modal */}
      {showEditWordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-30">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md relative">
            <button className="absolute top-2 right-2 text-gray-400 hover:text-gray-600" onClick={() => dispatch({ type: 'CLOSE_EDIT_WORD_MODAL' })}>&times;</button>
            <h2 className="text-lg font-bold mb-4">Edit Word</h2>
            <form onSubmit={handleEditWord} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Word</label>
                <input className="input-field" required value={editWordForm.word} onChange={e => dispatch({ type: 'UPDATE_EDIT_WORD_FORM', payload: { word: e.target.value } })} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Translation</label>
                <input className="input-field" required value={editWordForm.translation} onChange={e => dispatch({ type: 'UPDATE_EDIT_WORD_FORM', payload: { translation: e.target.value } })} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Part of Speech</label>
                <input className="input-field" value={editWordForm.partOfSpeech} onChange={e => dispatch({ type: 'UPDATE_EDIT_WORD_FORM', payload: { partOfSpeech: e.target.value } })} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Difficulty</label>
                <select className="input-field" value={editWordForm.difficulty} onChange={e => dispatch({ type: 'UPDATE_EDIT_WORD_FORM', payload: { difficulty: e.target.value } })}>
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
            <button className="absolute top-2 right-2 text-gray-400 hover:text-gray-600" onClick={() => dispatch({ type: 'SET_DELETE_WORD_ID', payload: null })}>&times;</button>
            <h2 className="text-lg font-bold mb-4">Delete Word</h2>
            <p>Are you sure you want to delete this word?</p>
            <div className="flex gap-2 mt-4">
              <button className="btn-danger flex-1" onClick={handleDeleteWord} disabled={deleting}>{deleting ? 'Deleting...' : 'Delete'}</button>
              <button className="btn-secondary flex-1" onClick={() => dispatch({ type: 'SET_DELETE_WORD_ID', payload: null })}>Cancel</button>
            </div>
          </div>
        </div>
      )}
      {loading ? (
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <SkeletonCard key={i} className="h-24" />
          ))}
        </div>
      ) : error ? (
        <div className="text-red-500 text-center py-8">{error}</div>
      ) : list ? (
        <div>
          <h1 className="text-2xl font-bold mb-1">{list.name}</h1>
          <div className="text-gray-600 mb-4">{list.description || 'No description'}</div>
          {/* Progress Tracker */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-gray-700">Progress</span>
              <span className="text-xs text-gray-500">{mastered} mastered, {learning} learning</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-4 flex overflow-hidden">
              <div
                className="bg-green-500 h-4"
                style={{ width: `${percentMastered}%` }}
                title="Mastered"
              ></div>
              <div
                className="bg-yellow-400 h-4"
                style={{ width: `${percentLearning}%` }}
                title="Learning"
              ></div>
            </div>
            <div className="flex justify-between text-xs mt-1">
              <span className="text-green-600">{percentMastered}% Mastered</span>
              <span className="text-yellow-600">{percentLearning}% Learning</span>
            </div>
          </div>
          <div className="mb-2 text-sm text-gray-500">{list.words.length} words</div>
          <div className="space-y-2">
            {list.words.map((w: Word) => (
              <div key={w._id} className="word-item p-3 bg-gray-50 rounded flex flex-col md:flex-row md:items-center md:justify-between">
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
                    <button
                      className="p-2 rounded hover:bg-blue-100 text-blue-600"
                      title="Edit Word"
                      onClick={() => openEditWord(w, w._id)}
                    >
                      <PencilSquareIcon className="h-5 w-5" />
                    </button>
                    <button
                      className="p-2 rounded hover:bg-red-100 text-red-600"
                      title="Delete Word"
                      onClick={() => dispatch({ type: 'SET_DELETE_WORD_ID', payload: w._id })}
                    >
                      <TrashIcon className="h-5 w-5" />
                    </button>
                  </div>
                  <div className="flex gap-1 mt-2">
                    <button
                      onClick={() => updateWordProgress(w._id, 'learning')}
                      className={`px-2 py-1 text-xs rounded ${w.progress?.status === 'learning' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
                    >
                      Learning
                    </button>
                    <button
                      onClick={() => updateWordProgress(w._id, 'mastered')}
                      className={`px-2 py-1 text-xs rounded ${w.progress?.status === 'mastered' ? 'bg-purple-500 text-white' : 'bg-gray-200'}`}
                    >
                      Mastered
                    </button>
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

export default VocbularyDetails; 