import { useState, useEffect } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import axios from 'axios';
import './App.css';

const API_URL = "https://my-recipe-server-wt3u.onrender.com"; 

const FutureLogo = ({ className }) => (
  <img src="/logo.png" alt="לוגו" className={className} style={{ objectFit: 'contain', filter: 'drop-shadow(0 0 8px rgba(0,0,0,0.1))' }} />
);

function App() {
  const [user, setUser] = useState(() => {
    try { const saved = localStorage.getItem('user'); return saved ? JSON.parse(saved) : null; } catch { return null; }
  });
  
  const [token, setToken] = useState(localStorage.getItem('token'));
  
  const [folders, setFolders] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [view, setView] = useState('folders'); 
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [newFolderName, setNewFolderName] = useState('');
  
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null); // תיקון תצוגה מקדימה

  const [isEditing, setIsEditing] = useState(false);
  const [editedRecipe, setEditedRecipe] = useState(null);
  const [showOriginal, setShowOriginal] = useState(false);
  
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [editingFolderId, setEditingFolderId] = useState(null); 
  const [editFolderName, setEditFolderName] = useState(''); 

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');

  useEffect(() => {
    if (token) {
      axios.defaults.baseURL = API_URL;
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      fetchFolders();
      fetchRecipes(null);
    }
  }, [token]);

  // עדכון תצוגה מקדימה כשבוחרים קובץ
  useEffect(() => {
    if (file) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      // ניקוי זיכרון כשהקומפוננטה מתעדכנת
      return () => URL.revokeObjectURL(url);
    } else {
      setPreviewUrl(null);
    }
  }, [file]);

  const openFolder = (folder) => {
    if (editingFolderId) return;
    setSelectedFolder(folder);
    fetchRecipes(folder ? folder._id : null);
    setView('gallery');
  };

  const goHome = () => { setSelectedFolder(null); setView('folders'); setRecipes([]); };

  const fetchFolders = async () => {
    try { const res = await axios.get('/api/folders'); setFolders(res.data); } catch (e) { if (e.response?.status === 401) logout(); }
  };

  const fetchRecipes = async (folderId) => {
    setLoading(true); setErrorMsg('');
    try { const res = await axios.get(`/api/recipes`, { params: { folderId: folderId } }); setRecipes(res.data); } 
    catch (e) { setErrorMsg('תקלה בטעינת מתכונים'); } finally { setLoading(false); }
  };

  const createFolder = async () => {
    if (!newFolderName) return;
    try {
      const res = await axios.post('/api/folders', { name: newFolderName });
      setFolders([...folders, res.data]); setNewFolderName(''); setIsCreatingFolder(false);
    } catch (e) { alert('שגיאה ביצירת תיקייה'); }
  };

  const startEditingFolder = (e, folder) => {
    e.stopPropagation();
    setEditingFolderId(folder._id);
    setEditFolderName(folder.name);
  };

  const saveFolderRename = async (e) => {
    e.stopPropagation();
    try {
      const res = await axios.put(`/api/folders/${editingFolderId}`, { name: editFolderName });
      setFolders(folders.map(f => f._id === editingFolderId ? res.data : f));
      setEditingFolderId(null);
    } catch (err) { alert('שגיאה בשינוי שם התיקייה'); }
  };

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    const formData = new FormData();
    formData.append('image', file);
    formData.append('folderId', selectedFolder ? selectedFolder._id : 'null');
    try {
      const res = await axios.post('/api/recipes/upload', formData);
      setRecipes([res.data, ...recipes]); setSelectedRecipe(res.data); setView('details'); setFile(null); setShowOriginal(false);
    } catch (e) { alert('שגיאה בפיענוח'); } finally { setLoading(false); }
  };

  const handleDishImageUpload = async (e) => {
    const dishFile = e.target.files[0];
    if (!dishFile || !selectedRecipe) return;
    setLoading(true);
    const formData = new FormData();
    formData.append('image', dishFile);
    try {
      const res = await axios.post(`/api/recipes/${selectedRecipe._id}/dish-image`, formData);
      setSelectedRecipe(res.data); setRecipes(recipes.map(r => r._id === res.data._id ? res.data : r));
    } catch (e) { alert('שגיאה בהעלאה'); } finally { setLoading(false); }
  };

  const handleGoogleSuccess = async (response) => {
    try {
      const res = await axios.post(`${API_URL}/api/auth/google`, { token: response.credential });
      const { token, user } = res.data;
      setToken(token); setUser(user);
      localStorage.setItem('token', token); localStorage.setItem('user', JSON.stringify(user));
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      fetchFolders(); fetchRecipes(null);
    } catch (e) { alert('התחברות נכשלה'); }
  };

  const startEditing = () => { setEditedRecipe({ ...selectedRecipe }); setIsEditing(true); };
  const saveEdit = async () => {
    try {
      const res = await axios.put(`/api/recipes/${selectedRecipe._id}`, editedRecipe);
      setSelectedRecipe(res.data); setRecipes(recipes.map(r => r._id === res.data._id ? res.data : r)); setIsEditing(false);
    } catch (e) { alert('שגיאה בשמירה'); }
  };

  const handleDeleteRecipe = async () => {
    if (!window.confirm('האם למחוק את המתכון הזה לצמיתות?')) return;
    try {
      await axios.delete(`/api/recipes/${selectedRecipe._id}`);
      setRecipes(recipes.filter(r => r._id !== selectedRecipe._id));
      setSelectedRecipe(null);
      setView('gallery');
    } catch (e) { alert('שגיאה במחיקה'); }
  };

  const handleEditChange = (f, v) => setEditedRecipe({ ...editedRecipe, [f]: v });
  const handleIngredientChange = (i, f, v) => { const n = [...editedRecipe.ingredients]; n[i][f] = v; setEditedRecipe({ ...editedRecipe, ingredients: n }); };
  const deleteIngredient = (i) => { const n = editedRecipe.ingredients.filter((_, idx) => idx !== i); setEditedRecipe({ ...editedRecipe, ingredients: n }); };
  const addIngredient = () => setEditedRecipe({ ...editedRecipe, ingredients: [...editedRecipe.ingredients, { name: '', amount: '', unit: '' }] });
  const handleInstructionChange = (i, v) => { const n = [...editedRecipe.instructions]; n[i] = v; setEditedRecipe({ ...editedRecipe, instructions: n }); };
  const addInstruction = () => setEditedRecipe({ ...editedRecipe, instructions: [...editedRecipe.instructions, ""] });
  const deleteInstruction = (i) => { const n = editedRecipe.instructions.filter((_, idx) => idx !== i); setEditedRecipe({ ...editedRecipe, instructions: n }); };

  const logout = () => { setToken(null); setUser(null); localStorage.removeItem('token'); localStorage.removeItem('user'); };

  if (!token) return (
    <div className="login-container glass-effect">
       <button className="theme-toggle-login icon-btn" onClick={toggleTheme}><i className={`ph ph-${theme === 'dark' ? 'sun' : 'moon'}`}></i></button>
      <div className="login-content">
        <FutureLogo className="login-logo" />
        <h1>הכניסה למטבח שלי</h1>
        <div className="google-btn-wrapper glow-hover"><GoogleLogin onSuccess={handleGoogleSuccess} theme={theme === 'dark' ? "filled_black" : "filled_blue"} shape="pill" /></div>
      </div>
    </div>
  );

  return (
    <div className="app-layout">
      <header className="app-header glass-effect">
        <div className="brand" onClick={goHome}>
          <FutureLogo className="header-logo" />
          <span className="logo-text">{user?.name?.split(' ')[0] || 'My'}'s Kitchen</span>
        </div>
        <div className="header-actions">
          <button className="icon-btn theme-btn" onClick={toggleTheme}><i className={`ph ph-${theme === 'dark' ? 'sun' : 'moon'}`}></i></button>
          <button onClick={logout} className="icon-btn logout-btn"><i className="ph ph-sign-out"></i></button>
        </div>
      </header>

      <main className="app-main">
        {view === 'folders' && (
          <div className="folders-grid-container fade-in">
            <h2>📚 ספר המתכונים שלי</h2>
            <div className="folders-grid">
              <div className="folder-card general-folder glass-effect glow-hover-card" onClick={() => openFolder(null)}>
                <div className="folder-icon"><i className="ph ph-house-line"></i></div>
                <h3>כללי / הכל</h3>
                <p>כל המתכונים ללא שיוך</p>
              </div>
              {folders.map(f => (
                <div key={f._id} className="folder-card glass-effect glow-hover-card" onClick={() => openFolder(f)}>
                  {editingFolderId === f._id ? (
                    <div className="rename-folder-box" onClick={e => e.stopPropagation()}>
                      <input autoFocus value={editFolderName} onChange={e => setEditFolderName(e.target.value)} className="rename-input" />
                      <button className="icon-btn success small" onClick={saveFolderRename}><i className="ph ph-check"></i></button>
                    </div>
                  ) : (
                    <>
                      <button className="edit-folder-btn" onClick={(e) => startEditingFolder(e, f)}><i className="ph ph-pencil-simple"></i></button>
                      <div className="folder-icon"><i className="ph ph-folder-notch-open"></i></div>
                      <h3>{f.name}</h3>
                    </>
                  )}
                </div>
              ))}
              {!isCreatingFolder ? (
                <div className="folder-card add-folder-card" onClick={() => setIsCreatingFolder(true)}>
                  <i className="ph ph-plus"></i><span>צור תיקייה</span>
                </div>
              ) : (
                <div className="folder-card create-folder-form glass-effect">
                  <input autoFocus value={newFolderName} onChange={e => setNewFolderName(e.target.value)} placeholder="שם התיקייה..." />
                  <div className="form-actions">
                    <button onClick={() => setIsCreatingFolder(false)}>ביטול</button>
                    <button className="save-btn" onClick={createFolder}>שמור</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {(view === 'folders' || view === 'gallery') && (
          <button className="fab-add glow-hover" onClick={() => setView('upload')}>
            <i className="ph ph-camera"></i><span>סרוק מתכון</span>
          </button>
        )}

        {/* --- מסך העלאה מתוקן ומרכזי --- */}
        {view === 'upload' && (
          <div className="upload-container-wrapper fade-in">
            <div className="content-container glass-effect">
              <div className="upload-header">
                <button className="icon-btn back-btn" onClick={() => view === 'folders' ? setView('folders') : setView('gallery')}><i className="ph ph-arrow-right"></i></button>
                <h2>סריקה חדשה</h2>
              </div>
              <div className="upload-zone-wrapper">
                <input type="file" id="file" accept="image/*" onChange={e => setFile(e.target.files[0])} hidden />
                <label htmlFor="file" className={`upload-label glass-effect-inset ${previewUrl ? 'has-file' : ''}`}>
                  {previewUrl ? 
                    <div className="preview-img" style={{backgroundImage: `url(${previewUrl})`}}></div> : 
                    <div className="upload-placeholder"><i className="ph ph-camera-rotate icon-huge bounce"></i><p>לחץ לצילום מתכון</p></div>
                  }
                </label>
              </div>
              {file && (
                <button className="action-btn primary full-width glow-hover" onClick={handleUpload} disabled={loading}>
                  {loading ? <><i className="ph ph-spinner spin"></i> מפענח...</> : <><i className="ph ph-magic-wand"></i> סרוק ושמור</>}
                </button>
              )}
            </div>
          </div>
        )}

        {view === 'gallery' && (
          <div className="gallery-container fade-in">
            <div className="gallery-header">
              <button className="icon-btn back-btn" onClick={goHome}><i className="ph ph-arrow-right"></i></button>
              <h2>📂 {selectedFolder ? selectedFolder.name : 'כללי'}</h2>
            </div>
            <div className={`gallery-grid ${recipes.length === 0 ? 'empty' : ''}`}>
              {loading && <div className="loading-state"><i className="ph ph-spinner spin icon-huge highlight"></i></div>}
              {!loading && !errorMsg && recipes.length === 0 && (
                <div className="empty-state glass-effect">
                  <i className="ph ph-cooking-pot icon-huge faded"></i><p>אין כאן מתכונים עדיין.</p>
                </div>
              )}
              {recipes.map(recipe => (
                <div key={recipe._id} className="recipe-card glass-effect glow-hover-card" onClick={() => { setSelectedRecipe(recipe); setView('details'); setShowOriginal(false); }}>
                  <div className="card-img-wrapper">
                     <div className="card-img" style={{backgroundImage: `url(${recipe.dishImageUrl || recipe.imageUrl})`}}></div>
                     <div className="card-overlay"></div>
                  </div>
                  <div className="card-info">
                    <h3>{recipe.title}</h3>
                    <span className="date"><i className="ph ph-clock"></i> {new Date(recipe.createdAt).toLocaleDateString('he-IL')}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {view === 'details' && selectedRecipe && (
          <div className="details-container fade-in">
            <div className="details-actions-bar glass-effect">
               <button className="icon-btn" onClick={() => setView('gallery')}><i className="ph ph-arrow-right"></i></button>
               {!isEditing ? (
                 <div className="view-actions">
                   <button className="icon-btn danger" onClick={handleDeleteRecipe}><i className="ph ph-trash"></i></button>
                   <button className="icon-btn primary glow-hover" onClick={startEditing}><i className="ph ph-pencil-simple"></i></button>
                 </div>
               ) : (
                 <div className="edit-actions-group">
                   <button className="icon-btn danger" onClick={() => setIsEditing(false)}><i className="ph ph-x"></i></button>
                   <button className="icon-btn success glow-hover" onClick={saveEdit}><i className="ph ph-check"></i></button>
                 </div>
               )}
            </div>
            
            {!isEditing && (
              <div className="ai-warning glass-effect-inset">
                <i className="ph ph-warning-circle"></i>
                <span>וודאו שהמתכון תקין.</span>
              </div>
            )}

            <div className="hero-section">
              <div className="hero-img-wrapper glass-effect">
                {selectedRecipe.dishImageUrl ? (
                  <>
                     <img src={selectedRecipe.dishImageUrl} className="hero-img" alt="המנה" />
                     <label className="floating-action-btn change-img-btn glass-effect"><i className="ph ph-camera"></i><input type="file" accept="image/*" onChange={handleDishImageUpload} hidden /></label>
                  </>
                ) : (
                  <div className="no-dish-placeholder">
                     <i className="ph ph-pizza icon-huge highlight"></i>
                     <p>איך יצא? צרף תמונה!</p>
                     <label className="action-btn primary glow-hover"><i className="ph ph-plus"></i> הוסף תמונה<input type="file" accept="image/*" onChange={handleDishImageUpload} hidden /></label>
                  </div>
                )}
              </div>
            </div>
            
            <div className="details-scroll-area">
              <div className="details-card glass-effect">
                {!isEditing ? (
                  <div className="view-mode-header">
                    <h1>{selectedRecipe.title}</h1>
                    {selectedRecipe.description && <p className="desc">{selectedRecipe.description}</p>}
                  </div>
                ) : (
                  <div className="edit-mode-header edit-section">
                    <input className="edit-input title-input" value={editedRecipe.title} onChange={e => handleEditChange('title', e.target.value)} />
                    <div className="folder-selector-wrapper">
                      <label>תיקייה:</label>
                      <select className="edit-input folder-select" value={editedRecipe.folderId || 'null'} onChange={e => handleEditChange('folderId', e.target.value === 'null' ? null : e.target.value)}>
                        <option value="null">🏠 כללי</option>
                        {folders.map(f => ( <option key={f._id} value={f._id}>📂 {f.name}</option> ))}
                      </select>
                    </div>
                    <textarea className="edit-input desc-input" value={editedRecipe.description} onChange={e => handleEditChange('description', e.target.value)} />
                  </div>
                )}
                
                <div className="split-layout">
                  <div className="section-box glass-effect-inset">
                    <h3><i className="ph ph-shopping-cart highlight"></i> מצרכים</h3>
                    <ul className="ingredients-list">
                      {(!isEditing ? selectedRecipe.ingredients : editedRecipe.ingredients).map((ing, i) => (
                        <li key={i} className={isEditing ? 'edit-row' : 'view-row'}>
                          {!isEditing ? ( <><span className="amount highlight">{ing.amount} {ing.unit}</span> <span className="name">{ing.name}</span></> ) : (
                            <>
                              <input placeholder="כמות" value={ing.amount} onChange={e => handleIngredientChange(i, 'amount', e.target.value)} className="edit-input small" />
                              <input placeholder="יחידה" value={ing.unit} onChange={e => handleIngredientChange(i, 'unit', e.target.value)} className="edit-input small" />
                              <input placeholder="שם" value={ing.name} onChange={e => handleIngredientChange(i, 'name', e.target.value)} className="edit-input medium" />
                              <button className="icon-btn danger small" onClick={() => deleteIngredient(i)}><i className="ph ph-trash"></i></button>
                            </>
                          )}
                        </li>
                      ))}
                    </ul>
                    {isEditing && <button className="add-item-btn" onClick={addIngredient}>+ הוסף</button>}
                  </div>

                  <div className="section-box glass-effect-inset">
                    <h3><i className="ph ph-cooking-pot highlight"></i> הוראות</h3>
                    <ol className="instructions-list">
                      {(!isEditing ? selectedRecipe.instructions : editedRecipe.instructions).map((step, i) => (
                        <li key={i} className={isEditing ? 'edit-row' : 'view-row'}>
                          {!isEditing ? ( <span className="step-text">{step}</span> ) : (
                             <>
                              <textarea value={step} onChange={e => handleInstructionChange(i, e.target.value)} className="edit-input textarea-step" />
                              <button className="icon-btn danger small" onClick={() => deleteInstruction(i)}><i className="ph ph-trash"></i></button>
                             </>
                          )}
                        </li>
                      ))}
                    </ol>
                    {isEditing && <button className="add-item-btn" onClick={addInstruction}>+ הוסף</button>}
                  </div>
                </div>

                <div className="original-scan-section">
                  <button className={`toggle-original-btn glass-effect ${showOriginal ? 'active' : ''}`} onClick={() => setShowOriginal(!showOriginal)}>
                     <i className={`ph ph-caret-${showOriginal ? 'up' : 'down'}`}></i> {showOriginal ? 'הסתר מקור' : 'הצג צילום מקור'}
                  </button>
                  {showOriginal && ( <div className="original-image-wrapper glass-effect fade-in"><img src={selectedRecipe.imageUrl} alt="סריקה מקורית" /></div> )}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;