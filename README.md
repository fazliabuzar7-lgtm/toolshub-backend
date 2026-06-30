# ToolsHub Backend — Real PDF Processing API

یہ backend آپ کے ToolsHub website کے PDF tools کو حقیقی (real) بناتا ہے۔
PDF to Word, Merge, Split, Compress, Watermark, PDF to Text, Rotate — یہ سب اب اصل فائلیں process کرتے ہیں۔

---

## 📋 یہ کیا کرتا ہے

| Endpoint | کام |
|---|---|
| `POST /api/pdf/to-word` | PDF سے اصل متن نکال کر .docx فائل بناتا ہے |
| `POST /api/pdf/merge` | کئی PDFs کو ایک فائل میں جوڑتا ہے |
| `POST /api/pdf/split` | PDF کے ہر صفحے کو الگ کرکے ZIP بناتا ہے |
| `POST /api/pdf/compress` | PDF کا سائز کم کرتا ہے |
| `POST /api/pdf/watermark` | PDF پر اصل watermark ڈالتا ہے |
| `POST /api/pdf/to-text` | PDF سے پورا متن نکالتا ہے |
| `POST /api/pdf/rotate` | PDF کے صفحات گھماتا ہے |

ہر فائل process ہونے کے بعد **فوراً delete** ہو جاتی ہے (privacy کے لیے) — صرف نتیجہ (output) 60 منٹ کے لیے رکھا جاتا ہے، پھر وہ بھی خود بخود صاف ہو جاتا ہے۔

---

## 🖥️ Local Computer پر چلانا (Testing کے لیے)

### Step 1 — Node.js انسٹال کریں
nodejs.org سے Node.js (version 18 یا اس سے اوپر) download کریں۔

### Step 2 — Dependencies انسٹال کریں
```bash
cd toolshub-backend
npm install
```

### Step 3 — Server چلائیں
```bash
npm start
```

اگر سب ٹھیک ہے تو یہ پیغام آئے گا:
```
✅ ToolsHub Backend running on port 5000
```

### Step 4 — Test کریں
Browser میں جائیں: `http://localhost:5000` — اگر یہ JSON دکھائے تو server چل رہا ہے۔

Postman یا curl سے test:
```bash
curl -X POST http://localhost:5000/api/pdf/to-text \
  -F "file=@/path/to/your/test.pdf"
```

---

## 🚀 Render.com پر Deploy کرنا (مفت Hosting)

### Step 1 — کوڈ کو GitHub پر ڈالیں
```bash
cd toolshub-backend
git init
git add .
git commit -m "Initial backend commit"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/toolshub-backend.git
git push -u origin main
```

### Step 2 — Render پر Account بنائیں
[render.com](https://render.com) پر جائیں → "Get Started" → GitHub سے sign up کریں۔

### Step 3 — New Web Service بنائیں
1. Dashboard میں "New +" → "Web Service" پر click کریں
2. اپنا GitHub repo منتخب کریں (toolshub-backend)
3. یہ settings بھریں:
   - **Name:** toolshub-backend
   - **Region:** اپنے قریب ترین منتخب کریں
   - **Branch:** main
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free

### Step 4 — Environment Variable شامل کریں
"Environment" tab میں جائیں اور یہ شامل کریں:
```
ALLOWED_ORIGINS = https://your-frontend-domain.netlify.app
```
(اپنی frontend website کا اصل URL یہاں ڈالیں)

### Step 5 — Deploy
"Create Web Service" پر click کریں — Render خود build کرکے چلا دے گا۔
کچھ منٹ بعد آپ کو ایک URL ملے گا جیسے:
```
https://toolshub-backend.onrender.com
```

⚠️ **یاد رہے:** Free tier پر server 15 منٹ بے کار رہنے کے بعد sleep ہو جاتا ہے۔ پہلی request پر دوبارہ اٹھنے میں 30-50 سیکنڈ لگ سکتے ہیں — یہ normal ہے۔

---

## 🔗 Frontend کو Backend سے جوڑنا

اپنی `toolshub.html` فائل میں، PDF tool کے functions (`doPdfWord`, `doMergePdf` وغیرہ) کو اس طرح بدلنا ہوگا کہ وہ آپ کے Render URL پر اصل API call کریں۔

مثال کے طور پر `doPdfWord` فنکشن میں:

```javascript
async function doPdfWord(){
  const f = document.getElementById('f1')?.files[0];
  if(!f){toast('Please upload a PDF file','wa');return;}

  const formData = new FormData();
  formData.append('file', f);

  animProg('pg1',[{l:'Uploading...',p:30,s:'Sending to server...',d:600}]);

  try {
    const response = await fetch('https://toolshub-backend.onrender.com/api/pdf/to-word', {
      method: 'POST',
      body: formData
    });
    const data = await response.json();

    if(!response.ok) throw new Error(data.error || 'Conversion failed');

    showR('r1', `<div class="res-t">✅ Conversion Complete</div>
      <div class="res-c">Your PDF has been converted successfully.</div>
      <div class="res-acts"><a href="${data.downloadUrl}" download class="rb">⬇️ Download Word File</a></div>`);
    toast('PDF converted!','ok');
  } catch(err) {
    showR('r1', `<div class="res-t">❌ Error</div><div class="res-c" style="color:var(--red)">${err.message}</div>`, false);
    toast(err.message,'er');
  }
}
```

ہر PDF tool function کو اسی pattern پر بدلنا ہوگا — صرف URL endpoint بدلے گا (`/to-word`, `/merge`, `/split`, `/compress`, `/watermark`, `/to-text`, `/rotate`)۔

---

## 🔒 Security Features (یہ پہلے سے شامل ہیں)

- ✅ صرف PDF/Word فائلیں قبول ہوتی ہیں (دوسری فائلیں reject ہو جاتی ہیں)
- ✅ Maximum file size: 50MB
- ✅ Rate limiting: ہر IP سے 15 منٹ میں صرف 100 requests
- ✅ Helmet.js سے secure HTTP headers
- ✅ ہر اپلوڈ شدہ فائل process کے فوراً بعد delete ہو جاتی ہے
- ✅ Output فائلیں صرف 60 منٹ کے لیے رکھی جاتی ہیں

---

## ⚠️ اہم نوٹ

یہ سینڈ باکس ماحول میں `npm install` انٹرنیٹ کی عدم دستیابی کی وجہ سے نہیں چلایا جا سکا — تمام JavaScript فائلوں کی syntax کو `node --check` سے verify کیا گیا ہے اور وہ درست ہیں، لیکن آپ کو خود اپنے computer یا Render پر `npm install` چلا کر یہ یقینی بنانا ہوگا کہ تمام packages صحیح طریقے سے download اور کام کریں۔ اگر کوئی error آئے تو مجھے بتائیں، میں ٹھیک کر دوں گا۔
