require('dotenv').config();

async function testDirectConnection() {
  const apiKey = process.env.GEMINI_API_KEY;
  
  console.log("🔍 בודק חיבור ישיר לגוגל (בלי ספרייה)...");
  console.log(`🔑 המפתח שלך מתחיל ב: ${apiKey ? apiKey.substring(0, 4) + '...' : 'חסר!'}`);

  // הכתובת הישירה של ה-API
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  const payload = {
    contents: [{
      parts: [{ text: "בדיקה, האם אתה שומע עבור?" }]
    }]
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      console.log("❌ כישלון בחיבור הישיר.");
      console.log(`סטטוס: ${response.status} ${response.statusText}`);
      const errorText = await response.text();
      console.log("פירוט השגיאה מגוגל:", errorText);
    } else {
      const data = await response.json();
      console.log("✅ הצלחה! גוגל ענה לנו ישירות:");
      console.log(JSON.stringify(data, null, 2));
    }
  } catch (error) {
    console.error("❌ שגיאה כללית:", error.message);
  }
}

testDirectConnection();