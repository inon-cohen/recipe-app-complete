require('dotenv').config();
const { GoogleGenerativeAI } = require("@google/generative-ai");

async function checkModels() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  console.log("מתחבר לגוגל לבדוק מודלים...");

  try {
    // ננסה לקבל את המודל הגנרי כדי לגשת ל-ListModels (דרך עקיפה)
    // או פשוט ננסה להריץ בדיקה על מודל בסיסי ביותר
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });
    
    console.log("מנסה להריץ בדיקה עם 'gemini-pro' (הכי יציב)...");
    const result = await model.generateContent("Hello");
    const response = await result.response;
    console.log("✅ הצלחה! המודל 'gemini-pro' עובד.");
    console.log("תשובה:", response.text());

  } catch (error) {
    console.error("❌ שגיאה בבדיקה:", error.message);
    if (error.message.includes("404")) {
        console.log("נראה שגם gemini-pro לא מזוהה. נסה את gemini-1.5-flash-001");
    }
  }
}

checkModels();