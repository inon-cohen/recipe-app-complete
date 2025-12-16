require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const cloudinary = require('cloudinary').v2;
const cors = require('cors');
const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const axios = require('axios'); // חובה לשיטה החדשה

const app = express();
app.use(cors());
app.use(express.json());

const port = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'secret-key';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_API_KEY = process.env.GEMINI_API_KEY; // משתמשים באותו מפתח להכל

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const genAI = new GoogleGenerativeAI(GOOGLE_API_KEY);
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

// --- המנגנון החדש: העיניים והמוח ---
app.post('/api/recipes/upload', authenticateToken, upload.single('image'), async (req, res) => {
  try {
    console.log("1. Starting Hybrid Process...");
    if (!req.file) return res.status(400).json({ error: 'No image' });
    const folderId = req.body.folderId === 'null' ? null : req.body.folderId;

    // א. העלאה לקלאודינרי (גיבוי תמונה)
    const uploadToCloud = () => new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream({ folder: 'recipes' }, (err, res) => err ? reject(err) : resolve(res));
        stream.end(req.file.buffer);
    });
    const cloudRes = await uploadToCloud();
    console.log("2. Image Uploaded");

    // ב. שלב "העיניים" (Google Cloud Vision OCR) - חילוץ טקסט גולמי בלבד
    // זה שירות נפרד שלא "ממציא" כלום, רק קורא מה כתוב.
    const visionUrl = `https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_API_KEY}`;
    const visionRequestBody = {
      requests: [{
        image: { content: req.file.buffer.toString('base64') },
        features: [{ type: 'TEXT_DETECTION' }]
      }]
    };

    const visionResponse = await axios.post(visionUrl, visionRequestBody);
    
    // בדיקה אם נמצא טקסט
    const fullText = visionResponse.data.responses[0]?.fullTextAnnotation?.text;
    
    if (!fullText) {
      console.log("❌ No text found in image");
      return res.status(400).json({ error: "לא הצלחנו לזהות טקסט בתמונה. נסה לצלם ברור יותר." });
    }
    
    console.log("3. OCR Text Extracted (Raw):", fullText.substring(0, 50) + "...");

    // ג. שלב "המוח" (Gemini) - פירמוט הטקסט בלבד
    // אנחנו שולחים לו רק את הטקסט, בלי התמונה. ככה הוא לא יכול "לדמיין" עוגה ולהוסיף לה דברים.
    const model = genAI.getGenerativeModel({ 
      model: "gemini-flash-latest",
      generationConfig: { temperature: 0.0 }
    });
    
    const prompt = `
      I will give you a raw text extracted from a recipe image.
      Your job is to FORMAT this text into JSON.
      
      RULES:
      1. DO NOT ADD anything that is not in the text.
      2. If the text is messy, try to make sense of it, but do not invent ingredients.
      3. Return valid JSON only.

      RAW TEXT:
      """
      ${fullText}
      """

      JSON Structure:
      {
        "title": "Title from text",
        "description": "Short description from text (or empty)",
        "ingredients": [{"name": "item", "amount": "qty", "unit": "unit"}],
        "instructions": ["step 1", "step 2"]
      }
    `;
    
    const result = await model.generateContent(prompt);
    let textResult = result.response.text().replace(/```json/g, "").replace(/```/g, "").trim();
    
    let recipeData;
    try {
        recipeData = JSON.parse(textResult);
    } catch (e) {
        console.error("JSON Parse Error", textResult);
        // במקרה חירום נחזיר את הטקסט הגולמי כתיאור
        recipeData = { 
            title: "מתכון שנסרק (נדרשת עריכה)", 
            description: fullText, 
            ingredients: [], 
            instructions: [] 
        };
    }

    const newRecipe = new Recipe({ ...recipeData, imageUrl: cloudRes.secure_url, userId: req.user.id, folderId });
    await newRecipe.save();
    console.log("4. Recipe Saved Successfully");
    res.json(newRecipe);

  } catch (error) {
    console.error("❌ Error:", error.response?.data || error.message);
    res.status(500).json({ error: "שגיאה בפענוח המתכון. וודא שהתמונה ברורה." });
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