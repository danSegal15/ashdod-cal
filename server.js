const express = require('express');
const axios = require('axios');
const { parse } = require('node-html-parser');
const ics = require('ics');

const app = express();
const ASHDOD_ID = '1198';
const SEASON_ID = '27'; 

// פונקציית המתנה למניעת חסימות (Rate Limiting)
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// פונקציית ניקוי אגרסיבית לרווחים ותווים שבורים
const clean = (str) => {
    if (!str) return "";
    return str
        .replace(/&nbsp;/g, ' ')
        .replace(/\u00a0/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/\s+/g, ' ')
        .trim();
};

// 1. נתיב מהיר עבור Render - חובה להגדיר ב-Settings של Render ל- /health
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

// 2. נתיב היומן המרכזי
app.get('/', async (req, res) => {
    console.log(`--- סריקת אשדוד התחילה (עונה ${SEASON_ID}) ---`);
    const events = [];

    try {
        for (let round = 1; round <= 36; round++) {
            const url = `https://www.football.org.il//Components.asmx/League_AllTables?league_id=40&season_id=${SEASON_ID}&box=0&round_id=${round}`;
            
            try {
                await sleep(150); // הפסקה קצרה בין בקשות
                const response = await axios.get(url, { 
                    headers: { 'User-Agent': 'Mozilla/5.0' },
                    timeout: 7000 
                });

                let htmlData = response.data;
                const xmlMatch = htmlData.match(/<HtmlData>(.*?)<\/HtmlData>/is);
                if (!xmlMatch) continue;

                htmlData = xmlMatch[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>');
                const root = parse(htmlData);
                const rows = root.querySelectorAll('.table_row');

                rows.forEach(row => {
                    const rowContent = row.rawText || "";
                    const t1Id = row.getAttribute('data-team1');
                    const t2Id = row.getAttribute('data-team2');

                    // חיפוש חזק: לפי ID או לפי השם בטקסט
                    if (t1Id === ASHDOD_ID || t2Id === ASHDOD_ID || rowContent.includes('אשדוד')) {
                        const cols = row.querySelectorAll('.table_col');
                        if (cols.length < 4) return;

                        const dateStr = clean(row.querySelector('.game-date')?.innerText);
                        if (!dateStr.includes('/')) return;

                        const [day, month, year] = dateStr.split('/').map(Number);
                        const timeStr = clean(cols[3]?.innerText.replace('שעה', '') || "");
                        const timeMatch = timeStr.match(/(\d{2}):(\d{2})/);
                        const stadium = clean(cols[2]?.innerText.replace('מגרש', '') || "טרם נקבע");
                        
                        const teamNames = cols[1]?.querySelectorAll('.team-name-text');
                        const t1Name = clean(teamNames[0]?.innerText || "אשדוד");
                        const t2Name = clean(teamNames[1]?.innerText || "יריבה");

                        events.push({
                            uid: `msa-final-r${round}-${day}-${month}@ashdod.com`,
                            title: `⚽ ${t1Name} - ${t2Name}`,
                            start: timeMatch ? [year, month, day, parseInt(timeMatch[1]), parseInt(timeMatch[2])] : [year, month, day],
                            duration: timeMatch ? { hours: 2 } : undefined,
                            description: `מחזור ${round} | ליגת העל`,
                            location: stadium,
                        });
                    }
                });
            } catch (e) {
                console.log(`שגיאה במחזור ${round}`);
            }
        }

        console.log(`סריקה הושלמה. נמצאו ${events.length} משחקים.`);

        if (events.length === 0) {
            return res.status(200).send("BEGIN:VCALENDAR\nVERSION:2.0\nX-WR-CALNAME:מ.ס. אשדוד - אין נתונים\nEND:VCALENDAR");
        }

        const { error, value } = ics.createEvents(events);
        if (error) throw error;

        // הזרקת המטא-דאטה לאלגנטיות (שם היומן ואזור זמן)
        const finalIcs = value.replace('VERSION:2.0', 
            'VERSION:2.0\r\n' +
            'X-WR-CALNAME:מ.ס. אשדוד - לוח משחקים 🐬\r\n' +
            'X-WR-TIMEZONE:Asia/Jerusalem\r\n' +
            'X-WR-CALDESC:לוח משחקים רשמי מסונכרן של מ.ס. אשדוד\r\n' +
            'REFRESH-INTERVAL;VALUE=DURATION:PT4H'
        );

        res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
        res.setHeader('Content-Disposition', 'inline; filename="ashdod_games.ics"');
        res.send(finalIcs);

    } catch (err) {
        console.error(err);
        res.status(500).send("Error");
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));