const express = require('express');
const axios = require('axios');
const { parse } = require('node-html-parser');
const ics = require('ics');

const app = express();
const ASHDOD_ID = '1198'; // מקובע למ.ס. אשדוד

app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    next();
});

// שיניתי את הנתיב שיהיה פשוט הכתובת הראשית
app.get('/', async (req, res) => {
    const events = [];
    console.log(`מתחיל סריקה עבור מ.ס. אשדוד (ID: ${ASHDOD_ID})...`);

    try {
        for (let round = 1; round <= 36; round++) {
            const url = `https://www.football.org.il//Components.asmx/League_AllTables?league_id=40&season_id=27&box=0&round_id=${round}`;
            
            try {
                const response = await axios.get(url, {
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
                });

                // התיקון של ה-XML שחייב להישאר כדי שהנתונים יימשכו
                let htmlData = response.data;
                const xmlMatch = htmlData.match(/<HtmlData>(.*?)<\/HtmlData>/s);
                if (xmlMatch) {
                    htmlData = xmlMatch[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>');
                }

                const root = parse(htmlData);
                const rows = root.querySelectorAll('.table_row');

                rows.forEach(row => {
                    const team1 = row.getAttribute('data-team1');
                    const team2 = row.getAttribute('data-team2');

                    // סינון רק לאשדוד
                    if (team1 !== ASHDOD_ID && team2 !== ASHDOD_ID) return; 

                    const cols = row.querySelectorAll('.table_col');
                    if (cols.length < 5) return;

                    const dateStr = row.querySelector('.game-date').innerText.trim();
                    const [day, month, year] = dateStr.split('/').map(Number);

                    const timeStr = cols[3].innerText.replace('שעה', '').trim();
                    const timeMatch = timeStr.match(/(\d{2}):(\d{2})/);

                    const stadium = cols[2].innerText.replace('מגרש', '').trim();
                    const teamNames = cols[1].querySelectorAll('.team-name-text');
                    const title = teamNames.length === 2 ? `${teamNames[0].innerText.trim()} נגד ${teamNames[1].innerText.trim()}` : "משחק ליגה";

                    const matchType = (team1 === ASHDOD_ID) ? 'משחק בית' : 'משחק חוץ';
                    
                    let event = {
                        // UID קבוע הוא קריטי לסנכרון - אל תשנה אותו!
                        uid: `ashdod-game-round-${round}@football-app.com`, 
                        title: `⚽ ${title}`,
                        description: `מחזור ${round} | ${matchType} | ליגת העל`,
                        location: stadium,
                        status: 'CONFIRMED'
                    };

                    if (timeMatch) {
                        event.start = [year, month, day, parseInt(timeMatch[1]), parseInt(timeMatch[2])];
                        event.duration = { hours: 2 };
                    } else {
                        event.start = [year, month, day];
                        event.title = `⚽ (שעה טרם נקבעה) ${title}`;
                    }

                    events.push(event);
                });
                
            } catch (innerErr) {
                console.log(`בעיה במחזור ${round}`);
            }
        }

        if (events.length === 0) {
            return res.status(404).send("לא נמצאו משחקים.");
        }

        const { error, value } = ics.createEvents(events);
        if (error) throw error;

        // החזרנו בדיוק את ההדרים שאהבת שעבדו קודם
        res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="ms_ashdod.ics"`);
        res.send(value);

    } catch (err) {
        console.error("שגיאה:", err);
        res.status(500).send("שגיאה ביצירת היומן.");
    }
});

// הגדרת פורט שמתאימה ל-Render
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`השרת רץ על פורט ${PORT}`));