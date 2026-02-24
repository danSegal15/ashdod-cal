const express = require('express');
const axios = require('axios');
const { parse } = require('node-html-parser');
const ics = require('ics');

const app = express();
const ASHDOD_ID = '1198';
const SEASON_ID = '27';

// פונקציית ניקוי
const clean = (str) => str ? str.replace(/&nbsp;/g, ' ').replace(/\u00a0/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim() : "";

// --- מערכת מעקב: נראה בדיוק מה קורה בשרת ---
app.use((req, res, next) => {
    console.log(`[${new Date().toLocaleTimeString()}] בקשה נכנסה לנתיב: ${req.url}`);
    next();
});

// נתיב הבריאות (מהיר במיוחד)
app.get('/health', (req, res) => {
    res.status(200).send('OK - I am alive');
});

app.get('/', async (req, res) => {
    console.log(`>>> מתחיל סריקה מלאה (עונה ${SEASON_ID}) <<<`);
    const events = [];

    try {
        for (let round = 1; round <= 36; round++) {
            const url = `https://www.football.org.il//Components.asmx/League_AllTables?league_id=40&season_id=${SEASON_ID}&box=0&round_id=${round}`;
            
            try {
                // השהיה קצרה מאוד כדי לא לעכב את ה-Deploy יותר מדי
                await new Promise(r => setTimeout(r, 100));
                const response = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 5000 });

                let htmlData = response.data;
                const xmlMatch = htmlData.match(/<HtmlData>(.*?)<\/HtmlData>/is);
                if (!xmlMatch) continue;

                htmlData = xmlMatch[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>');
                const root = parse(htmlData);
                const rows = root.querySelectorAll('.table_row');

                rows.forEach(row => {
                    const content = row.rawText || "";
                    if (content.includes('אשדוד') || row.getAttribute('data-team1') === ASHDOD_ID || row.getAttribute('data-team2') === ASHDOD_ID) {
                        const cols = row.querySelectorAll('.table_col');
                        if (cols.length < 4) return;

                        const dateStr = clean(row.querySelector('.game-date')?.innerText);
                        const [day, month, year] = dateStr.split('/').map(Number);
                        const timeStr = clean(cols[3]?.innerText.replace('שעה', ''));
                        const timeMatch = timeStr.match(/(\d{2}):(\d{2})/);
                        
                        const teamNames = cols[1]?.querySelectorAll('.team-name-text');
                        const t1 = clean(teamNames[0]?.innerText || "אשדוד");
                        const t2 = clean(teamNames[1]?.innerText || "יריבה");

                        events.push({
                            uid: `msa-${round}-${day}-${month}@ashdod.com`,
                            title: `⚽ ${t1} - ${t2}`,
                            start: timeMatch ? [year, month, day, parseInt(timeMatch[1]), parseInt(timeMatch[2])] : [year, month, day],
                            duration: timeMatch ? { hours: 2 } : undefined,
                            description: `מחזור ${round} | ליגת העל`,
                            location: clean(cols[2]?.innerText.replace('מגרש', ''))
                        });
                    }
                });
            } catch (e) {}
        }

        const { value } = ics.createEvents(events);
        const finalIcs = (value || "").replace('VERSION:2.0', 
            'VERSION:2.0\r\nX-WR-CALNAME:מ.ס. אשדוד - לוח משחקים 🐬\r\nX-WR-TIMEZONE:Asia/Jerusalem\r\nREFRESH-INTERVAL;VALUE=DURATION:PT4H'
        );

        res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
        res.send(finalIcs);
        console.log(`>>> סריקה הושלמה: נמצאו ${events.length} משחקים <<<`);

    } catch (err) {
        res.status(500).send("Error");
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));