const fs = require('fs');

async function testUpload() {
  console.log('🚀 מתחיל בתהליך העלאה...');

  try {
    const formData = new FormData();
    
    // מוודא שהקובץ קיים
    if (!fs.existsSync('./test-recipe.jpg')) {
      throw new Error('לא מצאתי את הקובץ test-recipe.jpg! תגרור תמונה לתיקייה ותשנה לה את השם.');
    }

    const fileBuffer = fs.readFileSync('./test-recipe.jpg');
    
    // אומרים לשרת שזו תמונה
    const blob = new Blob([fileBuffer], { type: 'image/jpeg' });
    
    formData.append('image', blob, 'recipe.jpg');

    console.log('📤 שולח את התמונה לשרת...');
    
    // שים לב: הכתובת צריכה להתאים לנתיב שהגדרנו בשרת
    // בגלל ששמנו הכל ב-server.js הנתיב הוא /api/recipes/upload או הנתיב שהגדרת
    // בוא נניח שהשתמשנו בקוד האחרון שנתתי ל-Clean Slate:
    const response = await fetch('http://localhost:5000/api/recipes/upload', {
      method: 'POST',
      body: formData
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`שגיאת שרת (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    
    console.log('----------------------------------------');
    console.log('🎉 יש הצלחה! ה-AI פיענח את המתכון:');
    console.log(JSON.stringify(data, null, 2));
    console.log('----------------------------------------');

  } catch (error) {
    console.error('❌ שגיאה:', error.message);
  }
}

testUpload();