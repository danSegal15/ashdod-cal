const express = require('express');
const axios = require('axios');
const { parse } = require('node-html-parser');
const ics = require('ics');

const app = express();
const ASHDOD_ID = '1198';
const SEASON_ID = '27'; 

let cachedIcs = ""; 

const clean = (str) => {
    if (!str) return "";
    return str
        .replace(/&amp;nbsp;/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/\u00a0/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
};

const scrapeDataInBackground = async () => {
    while (true) { 
        console.log(`>>> מתחיל סריקת רקע (עונה ${SEASON_ID})...`);
        const events = [];

        for (let round = 1; round <= 36; round++) {
            const url = `https://www.football.org.il//Components.asmx/League_AllTables?league_id=40&season_id=${SEASON_ID}&box=0&round_id=${round}`;
            
            try {
                await new Promise(r => setTimeout(r, 5000)); 
                
                const response = await axios.get(url, { 
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
                    timeout: 8000 
                });

                let htmlData = response.data;
                const xmlMatch = htmlData.match(/<HtmlData>(.*?)<\/HtmlData>/s);
                if (!xmlMatch) continue;

                htmlData = xmlMatch[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>');
                const root = parse(htmlData);
                const rows = root.querySelectorAll('.table_row');

                rows.forEach(row => {
                    const team1 = row.getAttribute('data-team1');
                    const team2 = row.getAttribute('data-team2');
                    const rowText = row.rawText || ""; 

                    if (rowText.includes('אשדוד') || team1 === ASHDOD_ID || team2 === ASHDOD_ID) {
                        const cols = row.querySelectorAll('.table_col');
                        if (cols.length < 4) return; 

                        const dateStr = clean(row.querySelector('.game-date')?.innerText || "");
                        if (!dateStr.includes('/')) return;

                        const [day, month, year] = dateStr.split('/').map(Number);
                        const timeStr = clean(cols[3]?.innerText.replace('שעה', '') || "");
                        const timeMatch = timeStr.match(/(\d{2}):(\d{2})/);
                        const stadium = clean(cols[2]?.innerText.replace('מגרש', '') || "טרם נקבע");
                        
                        const teamNames = cols[1].querySelectorAll('.team-name-text');
                        const t1Name = clean(teamNames[0]?.innerText || "אשדוד");
                        const t2Name = clean(teamNames[1]?.innerText || "יריבה");
                        
                        let event = {
                            uid: `msa-s27-r${round}@ashdod.com`, 
                            title: `⚽ ${t1Name} - ${t2Name}`,
                            description: `מחזור ${round} | ליגת העל`,
                            location: stadium,
                        };

                        if (timeMatch) {
                            event.start = [year, month, day, parseInt(timeMatch[1]), parseInt(timeMatch[2])];
                            event.duration = { hours: 2 };
                        } else {
                            event.start = [year, month, day];
                            event.title = `⏰ (טרם נקבע) ${t1Name} - ${t2Name}`;
                        }
                        events.push(event);
                    }
                });
            } catch (e) {}
        }

        console.log(`>>> סריקת הרקע הושלמה: נמצאו ${events.length} משחקים <<<`);

        if (events.length > 0) {
            const { error, value } = ics.createEvents(events);
            if (!error) {
                const elegantHeaders = [
                    'VERSION:2.0',
                    'X-WR-CALNAME:מ.ס. אשדוד - לוח משחקים 🐬',
                    'X-WR-TIMEZONE:Asia/Jerusalem',
                    'X-WR-CALDESC:לוח משחקים רשמי מסונכרן',
                    'REFRESH-INTERVAL;VALUE=DURATION:PT4H'
                ].join('\r\n');

                cachedIcs = value.replace('VERSION:2.0', elegantHeaders);
            }
        }

        await new Promise(r => setTimeout(r, 3600000));
    }
};

scrapeDataInBackground();

// --- נתיב 1: בדיקת בריאות ל-Render ---
app.get('/health', (req, res) => res.status(200).send('OK'));

// --- נתיב 2: היומן עצמו (ICS) ---
app.get('/calendar.ics', (req, res) => {
    if (cachedIcs) {
        res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
        res.setHeader('Content-Disposition', 'inline; filename="ashdod_games.ics"');
        res.send(cachedIcs);
    } else {
        res.status(503).send("השרת מתעדכן מול ההתאחדות... נסה שוב בעוד 3 דקות.");
    }
});

// --- נתיב 3: דף הנחיתה (עם הלוגו האמיתי) ---
app.get('/', (req, res) => {
    const html = `
    <!DOCTYPE html>
    <html lang="he" dir="rtl">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>מ.ס. אשדוד - לוח משחקים</title>
        <style>
            body { 
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
                background-color: #f4f4f9; 
                display: flex; flex-direction: column; align-items: center; justify-content: center; 
                min-height: 100vh; margin: 0; color: #333; 
            }
            .container { 
                background: white; padding: 40px; border-radius: 16px; 
                box-shadow: 0 10px 25px rgba(0,0,0,0.1); 
                text-align: center; max-width: 400px; width: 85%; 
            }
            /* עדכון CSS ללוגו תמונה */
            .logo { width: 120px; height: auto; margin-bottom: 20px; }
            h1 { color: #d32f2f; margin-bottom: 5px; font-size: 28px; } /* אדום אשדוד */
            h2 { color: #333; margin-top: 0; font-size: 20px; font-weight: normal; margin-bottom: 25px;}
            p { color: #666; margin-bottom: 30px; line-height: 1.6; font-size: 15px; }
            .btn { 
                display: block; width: 100%; padding: 16px; margin-bottom: 15px; 
                border-radius: 10px; text-decoration: none; font-size: 18px; font-weight: bold; 
                transition: all 0.2s; box-sizing: border-box; 
            }
            .btn-apple { background-color: #000; color: #fff; }
            .btn-apple:hover { background-color: #333; transform: translateY(-2px); }
            .btn-google { background-color: #fff; color: #4285F4; border: 2px solid #4285F4; }
            .btn-google:hover { background-color: #e8f0fe; transform: translateY(-2px); }
            .status { 
                margin-top: 25px; padding: 10px; border-radius: 8px; font-size: 13px; font-weight: bold;
                ${cachedIcs ? 'background-color: #e8f5e9; color: #2e7d32;' : 'background-color: #fff3e0; color: #ef6c00;'}
            }
            .footer { margin-top: 20px; font-size: 12px; color: #999; }
        </style>
    </head>
    <body>
        <div class="container">
            <img src="https://www.fcashdod.co.il/wp-content/uploads/2023/08/cropped-fc-ashdod.png" alt="לוגו מ.ס. אשדוד" class="logo">
            <h1>מ.ס. אשדוד</h1>
            <h2>לוח משחקים מתעדכן</h2>
            <p>הוסף את משחקי הקבוצה ישירות ליומן האישי שלך. מתעדכן אוטומטית ברקע מהאתר הרשמי.</p>
			
            <a href="https://www.google.com/calendar/render?cid=http://ashdod-cal.onrender.com/calendar.ics" target="_blank" class="btn btn-google">📅 הוסף ליומן גוגל (Google Calendar)</a>            
            <a href="webcal://ashdod-cal.onrender.com/calendar.ics" class="btn btn-apple">🍏 הוסף ליומן אפל (Apple Calendar)</a>
            
            <div class="status">
                ${cachedIcs ? '✅ הנתונים מעודכנים ומוכנים' : '⏳ השרת סורק כעת נתונים... רענן בעוד דקה'}
            </div>
            
            <div class="footer">לא אפליקציה רשמית | נוצר למען האוהדים</div>
        </div>
    </body>
    </html>
    `;
    res.send(html);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server live on port ${PORT}`));