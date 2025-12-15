import { useState, useEffect } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import axios from 'axios';
import './App.css';

// --- רכיב הלוגו החדש (תמונה) ---
const FutureLogo = ({ className }) => (
  <img 
    src="/logo.png" 
    alt="לוגו" 
    className={className}
    style={{ 
      objectFit: 'contain', // שומר על הפרופורציות של הלוגו
      filter: 'drop-shadow(0 0 8px rgba(0,0,0,0.2))'
    }}
  />
);

function App() {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  
  const [folders, setFolders] = useState([]);
  const [recipes, setRecipes] = useState([]);
  
  const [view, setView] = useState('gallery'); 
  const [loading, setLoading] = useState(false);
  
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [file, setFile] = useState(null);

  const [isEditing, setIsEditing] = useState(false);
  const [editedRecipe, setEditedRecipe] = useState(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // --- Theme State ---
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      fetchFolders();
      fetchRecipes(null);
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      fetchRecipes(selectedFolder ? selectedFolder._id : null);
      setView('gallery');
      setSelectedRecipe(null);
      setIsEditing(false);
      setIsMobileMenuOpen(false);
    }
  }, [selectedFolder]);

  // --- API Functions ---
  const fetchFolders = async () => {
    try {
      const res = await axios.get('https://my-recipe-server-wt3u.onrender.com/api/folders');
      setFolders(res.data);
    } catch (e) { console.error(e); logout(); }
  };
  const fetchRecipes = async (folderId) => {
    setLoading(true);
    try {
      const res = await axios.get(`https://my-recipe-server-wt3u.onrender.com/api/recipes`, { params: { folderId: folderId } });
      setRecipes(res.data);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };
  const handleGoogleSuccess = async (response) => {
    try {
      const res = await axios.post('https://my-recipe-server-wt3u.onrender.com/api/auth/google', { token: response.credential });
      const { token, user } = res.data;
      setToken(token); setUser(user); localStorage.setItem('token', token);
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      fetchFolders();
    } catch (e) { alert('התחברות נכשלה'); }
  };
  const createFolder = async () => {
    if (!newFolderName) return;
    try {
      const res = await axios.post('https://my-recipe-server-wt3u.onrender.com/api/folders', { name: newFolderName });
      setFolders([...folders, res.data]); setNewFolderName('');
    } catch (e) { alert('שגיאה ביצירת תיקייה'); }
  };
  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    const formData = new FormData();
    formData.append('image', file);
    formData.append('folderId', selectedFolder ? selectedFolder._id : 'null');
    try {
      const res = await axios.post('https://my-recipe-server-wt3u.onrender.com/api/recipes/upload', formData);
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
      const res = await axios.post(`https://my-recipe-server-wt3u.onrender.com/api/recipes/${selectedRecipe._id}/dish-image`, formData);
      setSelectedRecipe(res.data); setRecipes(recipes.map(r => r._id === res.data._id ? res.data : r));
    } catch (e) { alert('שגיאה בהעלאת תמונה'); } finally { setLoading(false); }
  };
  const startEditing = () => { setEditedRecipe({ ...selectedRecipe }); setIsEditing(true); };
  
  // --- שמירה עם אפשרות שינוי תיקייה ---
  const saveEdit = async () => {
    try {
      const res = await axios.put(`https://my-recipe-server-wt3u.onrender.com/api/recipes/${selectedRecipe._id}`, editedRecipe);
      setSelectedRecipe(res.data); 
      // מעדכנים את הרשימה (אם החלפנו תיקייה, זה בסדר שהמתכון יישאר על המסך עד שנעבור תיקייה)
      setRecipes(recipes.map(r => r._id === res.data._id ? res.data : r)); 
      setIsEditing(false);
    } catch (e) { alert('שגיאה בשמירה'); }
  };

  const handleEditChange = (field, value) => setEditedRecipe({ ...editedRecipe, [field]: value });
  const handleIngredientChange = (index, field, value) => {
    const newIngredients = [...editedRecipe.ingredients]; newIngredients[index][field] = value; setEditedRecipe({ ...editedRecipe, ingredients: newIngredients });
  };
  const deleteIngredient = (index) => {
    const newIngredients = editedRecipe.ingredients.filter((_, i) => i !== index); setEditedRecipe({ ...editedRecipe, ingredients: newIngredients });
  };
  const addIngredient = () => setEditedRecipe({ ...editedRecipe, ingredients: [...editedRecipe.ingredients, { name: '', amount: '', unit: '' }] });
  const handleInstructionChange = (index, value) => {
    const newInstructions = [...editedRecipe.instructions]; newInstructions[index] = value; setEditedRecipe({ ...editedRecipe, instructions: newInstructions });
  };
  const addInstruction = () => setEditedRecipe({ ...editedRecipe, instructions: [...editedRecipe.instructions, ""] });
  const deleteInstruction = (index) => {
      const newInstructions = editedRecipe.instructions.filter((_, i) => i !== index); setEditedRecipe({ ...editedRecipe, instructions: newInstructions });
  };
  const logout = () => { setToken(null); setUser(null); localStorage.removeItem('token'); setFolders([]); setRecipes([]); };

  if (!token) return (
    <div className="login-container glass-effect">
       <button className="theme-toggle-login icon-btn" onClick={toggleTheme} title="החלף מצב">
          <i className={`ph ph-${theme === 'dark' ? 'sun' : 'moon'}`}></i>
      </button>

      <div className="login-content">
        <FutureLogo className="login-logo bounce" />
        <h1>הכניסה למטבח העתידני</h1>
        <p>המתכונים שלך, בכל מקום ובכל זמן.</p>
        <div className="google-btn-wrapper glow-hover">
          <GoogleLogin onSuccess={handleGoogleSuccess} theme={theme === 'dark' ? "filled_black" : "filled_blue"} shape="pill" />
        </div>
      </div>
    </div>
  );

  return (
    <div className="app-layout">
      
      <header className="app-header glass-effect">
        <div className="brand">
          <FutureLogo className="header-logo" />
          <span className="logo-text">{user?.name.split(' ')[0]}'s Kitchen</span>
        </div>
        
        <div className="header-actions">
          <button className="icon-btn theme-btn" onClick={toggleTheme}>
            <i className={`ph ph-${theme === 'dark' ? 'sun' : 'moon'}`}></i>
          </button>

          <button className="icon-btn mobile-only" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
            <i className={`ph ph-${isMobileMenuOpen ? 'x' : 'list'}`}></i>
          </button>
          <button onClick={logout} className="icon-btn logout-btn desktop-only" title="יציאה">
            <i className="ph ph-sign-out"></i>
          </button>
        </div>
      </header>

      <aside className={`app-sidebar glass-effect ${isMobileMenuOpen ? 'open' : ''}`}>
        <div className="sidebar-header mobile-only">
          <h3>תיקיות</h3>
        </div>
        
        <nav className="folders-nav">
           <button className={`nav-item ${!selectedFolder ? 'active' : ''}`} onClick={() => setSelectedFolder(null)}>
            <i className="ph ph-house-line"></i> כללי
          </button>
          {folders.map(f => (
            <button key={f._id} className={`nav-item ${selectedFolder?._id === f._id ? 'active' : ''}`} onClick={() => setSelectedFolder(f)}>
              <i className="ph ph-folder-notch"></i> {f.name}
            </button>
          ))}
        </nav>

        <div className="add-folder-container">
          <div className="add-folder-input-wrapper glass-effect-inset">
            <input value={newFolderName} onChange={e => setNewFolderName(e.target.value)} placeholder="תיקייה חדשה..." />
            <button className="icon-btn add-btn" onClick={createFolder} disabled={!newFolderName}><i className="ph ph-plus"></i></button>
          </div>
        </div>

         <button onClick={logout} className="nav-item logout-item mobile-only">
            <i className="ph ph-sign-out"></i> יציאה
          </button>
      </aside>

      <main className="app-main">
        {view === 'gallery' && (
          <button className="fab-add glow-hover" onClick={() => setView('upload')}>
            <i className="ph ph-scan"></i>
            <span className="desktop-only">סרוק מתכון</span>
          </button>
        )}

        {view === 'upload' && (
          <div className="content-container glass-effect fade-in">
            <div className="upload-header">
              <button className="icon-btn back-btn" onClick={() => setView('gallery')}><i className="ph ph-arrow-right"></i></button>
              <h2>סריקה ל: <span className="highlight">{selectedFolder ? selectedFolder.name : 'כללי'}</span></h2>
            </div>
            
            <div className="upload-zone-wrapper">
              <input type="file" id="file" accept="image/*" onChange={e => setFile(e.target.files[0])} hidden />
              <label htmlFor="file" className={`upload-label glass-effect-inset ${file ? 'has-file' : ''}`}>
                {file ? (
                  <div className="preview-img" style={{backgroundImage: `url(${URL.createObjectURL(file)})`}}></div>
                ) : (
                   <div className="upload-placeholder">
                      <i className="ph ph-camera-rotate icon-huge bounce"></i>
                      <p>לחץ לצילום או גרירת תמונה</p>
                   </div>
                )}
              </label>
            </div>
            
            {file && (
              <button className="action-btn primary full-width glow-hover" onClick={handleUpload} disabled={loading}>
                {loading ? <><i className="ph ph-spinner spin"></i> מפענח...</> : <><i className="ph ph-magic-wand"></i> הפעל סריקה חכמה</>}
              </button>
            )}
          </div>
        )}

        {view === 'gallery' && (
          <div className={`gallery-grid fade-in ${recipes.length === 0 ? 'empty' : ''}`}>
            {loading && <div className="loading-state"><i className="ph ph-spinner spin icon-huge highlight"></i><p>טוען נתונים...</p></div>}
            
            {!loading && recipes.length === 0 && (
              <div className="empty-state glass-effect">
                <i className="ph ph-cooking-pot icon-huge faded"></i>
                <p>התיקייה ריקה. זה הזמן להתחיל לבשל!</p>
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
                  <span className="date"><i className="ph ph-calendar"></i> {new Date(recipe.createdAt).toLocaleDateString('he-IL')}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {view === 'details' && selectedRecipe && (
          <div className="details-container fade-in">
            <div className="details-actions-bar glass-effect">
               <button className="icon-btn" onClick={() => setView('gallery')}><i className="ph ph-arrow-right"></i></button>
               
               {!isEditing ? (
                 <button className="icon-btn primary glow-hover" onClick={startEditing} title="ערוך"><i className="ph ph-pencil-simple"></i></button>
               ) : (
                 <div className="edit-actions-group">
                   <button className="icon-btn danger" onClick={() => setIsEditing(false)} title="ביטול"><i className="ph ph-x"></i></button>
                   <button className="icon-btn success glow-hover" onClick={saveEdit} title="שמור"><i className="ph ph-check"></i></button>
                 </div>
               )}
            </div>
            
            <div className="hero-section">
              <div className="hero-img-wrapper glass-effect">
                {selectedRecipe.dishImageUrl ? (
                  <>
                     <img src={selectedRecipe.dishImageUrl} className="hero-img" alt="המנה" />
                     <label className="floating-action-btn change-img-btn glass-effect">
                       <i className="ph ph-camera"></i>
                       <input type="file" accept="image/*" onChange={handleDishImageUpload} hidden />
                     </label>
                  </>
                ) : (
                  <div className="no-dish-placeholder">
                     <i className="ph ph-pizza icon-huge highlight"></i>
                     <p>אין תמונה של המנה המוכנה.</p>
                     <label className="action-btn primary glow-hover">
                       <i className="ph ph-plus"></i> הוסף תמונה עכשיו
                       <input type="file" accept="image/*" onChange={handleDishImageUpload} hidden />
                     </label>
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
                    <input className="edit-input title-input" value={editedRecipe.title} onChange={e => handleEditChange('title', e.target.value)} placeholder="שם המתכון" />
                    
                    {/* --- בחירת קטגוריה (תיקייה) --- */}
                    <div className="folder-selector-wrapper">
                      <label><i className="ph ph-folder-notch-open"></i> שייך לתיקייה:</label>
                      <select 
                        className="edit-input folder-select"
                        value={editedRecipe.folderId || 'null'} 
                        onChange={e => handleEditChange('folderId', e.target.value === 'null' ? null : e.target.value)}
                      >
                        <option value="null">🏠 כללי (ללא תיקייה)</option>
                        {folders.map(f => (
                          <option key={f._id} value={f._id}>📂 {f.name}</option>
                        ))}
                      </select>
                    </div>

                    <textarea className="edit-input desc-input" value={editedRecipe.description} onChange={e => handleEditChange('description', e.target.value)} placeholder="תיאור קצר" />
                  </div>
                )}
                
                <div className="split-layout">
                  <div className="section-box glass-effect-inset">
                    <h3><i className="ph ph-shopping-cart highlight"></i> מצרכים</h3>
                    <ul className="ingredients-list">
                      {(!isEditing ? selectedRecipe.ingredients : editedRecipe.ingredients).map((ing, i) => (
                        <li key={i} className={isEditing ? 'edit-row' : 'view-row'}>
                          {!isEditing ? (
                            <><span className="amount highlight">{ing.amount} {ing.unit}</span> <span className="name">{ing.name}</span></>
                          ) : (
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
                    {isEditing && <button className="add-item-btn" onClick={addIngredient}><i className="ph ph-plus"></i> הוסף מצרך</button>}
                  </div>

                  <div className="section-box glass-effect-inset">
                    <h3><i className="ph ph-cooking-pot highlight"></i> הוראות הכנה</h3>
                    <ol className="instructions-list">
                      {(!isEditing ? selectedRecipe.instructions : editedRecipe.instructions).map((step, i) => (
                        <li key={i} className={isEditing ? 'edit-row' : 'view-row'}>
                          {!isEditing ? (
                            <span className="step-text">{step}</span>
                          ) : (
                             <>
                              <textarea value={step} onChange={e => handleInstructionChange(i, e.target.value)} className="edit-input textarea-step" />
                              <button className="icon-btn danger small" onClick={() => deleteInstruction(i)}><i className="ph ph-trash"></i></button>
                             </>
                          )}
                        </li>
                      ))}
                    </ol>
                    {isEditing && <button className="add-item-btn" onClick={addInstruction}><i className="ph ph-plus"></i> הוסף שלב</button>}
                  </div>
                </div>

                <div className="original-scan-section">
                  <button className={`toggle-original-btn glass-effect ${showOriginal ? 'active' : ''}`} onClick={() => setShowOriginal(!showOriginal)}>
                     <i className={`ph ph-caret-${showOriginal ? 'up' : 'down'}`}></i>
                     {showOriginal ? 'הסתר סריקה מקורית' : 'הצג סריקה מקורית'}
                  </button>
                  
                  {showOriginal && (
                    <div className="original-image-wrapper glass-effect fade-in">
                      <img src={selectedRecipe.imageUrl} alt="סריקה מקורית" />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {isMobileMenuOpen && <div className="sidebar-overlay mobile-only fade-in" onClick={() => setIsMobileMenuOpen(false)}></div>}
    </div>
  );
}

export default App;