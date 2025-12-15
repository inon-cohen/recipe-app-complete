require('dotenv').config();

async function getAvailableModels() {
  const apiKey = process.env.GEMINI_API_KEY;
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

  console.log("🔍 שואל את גוגל אילו מודלים פתוחים למפתח שלך...");

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (data.error) {
      console.error("❌ שגיאה בקבלת הרשימה:", data.error.message);
    } else {
      console.log("✅ הנה המודלים שזמינים לך בוודאות:");
      console.log("------------------------------------------------");
      // מדפיס רק את המודלים שתומכים ב-generateContent (יצירת טקסט)
      const available = data.models
        .filter(m => m.supportedGenerationMethods.includes("generateContent"))
        .map(m => m.name.replace("models/", "")); // מנקה את התחילית המיותרת
      
      console.log(available.join("\n"));
      console.log("------------------------------------------------");
      console.log("👉 תעתיק את אחד השמות האלו בדיוק!");
    }
  } catch (error) {
    console.error("❌ שגיאה כללית:", error.message);
  }
}

getAvailableModels();