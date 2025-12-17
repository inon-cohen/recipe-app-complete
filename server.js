require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const cloudinary = require('cloudinary').v2;
const cors = require('cors');
const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');

const app = express();
app.use(cors());
app.use(express.json());

const port = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'secret-key';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// שימוש במפתח ה-AI הקיים שלך
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const upload = multer({ storage: multer.memoryStorage() });
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

// --- Models ---
const userSchema = new mongoose.Schema({
  googleId: { type: String, required: true, unique: true },
  email: String,
  name: String,
  picture: String,
});
const User = mongoose.models.User || mongoose.model('User', userSchema);

const folderSchema = new mongoose.Schema({
  name: String,
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
});
const Folder = mongoose.models.Folder || mongoose.model('Folder', folderSchema);

const recipeSchema = new mongoose.Schema({
  title: String,
  description: String,
  ingredients: [{ name: String, amount: String, unit: String }],
  instructions: [String],
  imageUrl: String,
  dishImageUrl: String,
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  folderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Folder' },
  createdAt: { type: Date, default: Date.now }
});
const Recipe = mongoose.models.Recipe || mongoose.model('Recipe', recipeSchema);

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB Connected!'))
  .catch(err => console.error('❌ MongoDB Error:', err));

// --- Middleware ---
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// --- Routes ---

app.post('/api/auth/google', async (req, res) => {
  const { token } = req.body;
  try {
    const ticket = await googleClient.verifyIdToken({ idToken: token, audience: GOOGLE_CLIENT_ID });
    const { sub: googleId, email, name, picture } = ticket.getPayload();
    let user = await User.findOne({ googleId });
    if (!user) {
      user = new User({ googleId, email, name, picture });
      await user.save();
    }
    const appToken = jwt.sign({ id: user._id, name: user.name }, JWT_SECRET);
    res.json({ token: appToken, user });
  } catch (error) {
    res.status(401).json({ error: 'Login failed' });
  }
});

app.get('/api/folders', authenticateToken, async (req, res) => {
  const folders = await Folder.find({ userId: req.user.id });
  res.json(folders);
});

app.post('/api/folders', authenticateToken, async (req, res) => {
  const newFolder = new Folder({ name: req.body.name, userId: req.user.id });
  await newFolder.save();
  res.json(newFolder);
});

app.put('/api/folders/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    const folder = await Folder.findOneAndUpdate({ _id: id, userId: req.user.id }, { name }, { new: true });
    if (!folder) return res.status(404).json({ error: 'Folder not found' });
    res.json(folder);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/recipes', authenticateToken, async (req, res) => {
  try {
    const { folderId } = req.query;
    const query = { userId: req.user.id };
    if (folderId && folderId !== 'null') query.folderId = folderId;
    else query.folderId = null;
    const recipes = await Recipe.find(query).sort({ createdAt: -1 });
    res.json(recipes);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// --- סריקה יציבה עם הנחיות קשוחות ---
app.post('/api/recipes/upload', authenticateToken, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No image' });
    const folderId = req.body.folderId === 'null' ? null : req.body.folderId;

    const uploadToCloud = () => new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream({ folder: 'recipes' }, (err, res) => err ? reject(err) : resolve(res));
        stream.end(req.file.buffer);
    });
    const cloudRes = await uploadToCloud();

    // --- התיקון: חזרה למודל היציב (Flash) אבל עם טמפרטורה 0 ---
    const model = genAI.getGenerativeModel({ 
      model: "gemini-1.5-flash", // זה המודל שעובד בטוח
      generationConfig: { temperature: 0.0 } // 0.0 = רובוט ללא דמיון
    });
    
    // הנחיה "רצחנית" נגד המצאות
    const prompt = `
      TASK: You are a dumb data entry machine. You interpret OCR text from an image.
      
      STRICT RULES:
      1. TRANSCRIPTION ONLY: Write EXACTLY what you see. Do NOT add missing ingredients.
      2. NO GUESSING: If the image says "Flour", DO NOT write "1 cup Flour". Leave amount empty.
      3. LANGUAGE: Keep Hebrew text exactly as is.
      4. DO NOT add "Salt", "Pepper", "Water", "Oil" if they are not explicitly written.
      
      Return ONLY valid JSON:
      {
        "title": "Title from image",
        "description": "Description from image (or empty)",
        "ingredients": [{"name": "exact item", "amount": "exact amount", "unit": "exact unit"}],
        "instructions": ["step 1", "step 2"]
      }
    `;
    
    const result = await model.generateContent([prompt, { inlineData: { data: req.file.buffer.toString("base64"), mimeType: req.file.mimetype } }]);
    let text = result.response.text().replace(/```json/g, "").replace(/```/g, "").trim();
    
    if (text.startsWith('{') === false) {
       const firstBrace = text.indexOf('{');
       const lastBrace = text.lastIndexOf('}');
       if (firstBrace !== -1 && lastBrace !== -1) {
           text = text.substring(firstBrace, lastBrace + 1);
       }
    }

    let recipeData;
    try {
        recipeData = JSON.parse(text);
    } catch (e) {
        console.error("JSON Parse Error", text);
        return res.status(500).json({ error: "Failed to parse recipe." });
    }

    const newRecipe = new Recipe({ ...recipeData, imageUrl: cloudRes.secure_url, userId: req.user.id, folderId });
    await newRecipe.save();
    res.json(newRecipe);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/recipes/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const updatedRecipe = await Recipe.findOneAndUpdate({ _id: id, userId: req.user.id }, req.body, { new: true });
    if (!updatedRecipe) return res.status(404).json({ error: 'Not found' });
    res.json(updatedRecipe);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.delete('/api/recipes/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const deletedRecipe = await Recipe.findOneAndDelete({ _id: id, userId: req.user.id });
    if (!deletedRecipe) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted successfully' });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/recipes/:id/dish-image', authenticateToken, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No image' });
    const { id } = req.params;
    const uploadToCloud = () => new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream({ folder: 'dishes' }, (err, res) => err ? reject(err) : resolve(res));
        stream.end(req.file.buffer);
    });
    const cloudRes = await uploadToCloud();
    const updatedRecipe = await Recipe.findOneAndUpdate({ _id: id, userId: req.user.id }, { dishImageUrl: cloudRes.secure_url }, { new: true });
    res.json(updatedRecipe);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.listen(port, () => console.log(`🚀 Server on ${port}`));