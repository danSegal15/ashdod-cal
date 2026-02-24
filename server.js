const express = require('express');
const axios = require('axios');
const { parse } = require('node-html-parser');
const ics = require('ics');

const app = express();
const ASHDOD_ID = '1198';
const SEASON_ID = '27'; 

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const clean = (str) => str ? str.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim() : "";

app.get('/health', (req, res) => res.status(200).send('OK'));

app.get('/', async (req, res) => {
    console.log(`--- סריקה אגרסיבית: עונה ${SEASON_ID} ---`);
    const events = [];

    try {
        // סורקים מחזורים (נצמצם ל-30 כדי שיהיה מהיר יותר לבדיקה)
        for (let round = 1; round <= 36; round++) {
            const url = `https://www.football.org.il//Components.asmx/League_AllTables?league_id=40&season_id=${SEASON_ID}&box=0&round_id=${round}`;
            
            try {
                await sleep(150); // המתנה קצרה
                const response = await axios.get(url, { 
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
                });

                let htmlData = response.data;
                const xmlMatch = htmlData.match(/<HtmlData>(.*?)<\/HtmlData>/is);
                if (!xmlMatch) continue;

                htmlData = xmlMatch[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>');
                const root = parse(htmlData);
                const rows = root.querySelectorAll('.table_row');

                if (rows.length > 0 && round === 1) console.log(`מצאתי ${rows.length} שורות במחזור 1`);

                rows.forEach(row => {
                    const text = row.rawText || "";
                    // אם כתוב "אשדוד" בשורה - אנחנו לוקחים אותה!
                    if (text.includes('אשדוד') || row.getAttribute('data-team1') === ASHDOD_ID || row.getAttribute('data-team2') === ASHDOD_ID) {
                        const cols = row.querySelectorAll('.table_col');
                        if (cols.length < 3) return;

                        const dateStr = clean(row.querySelector('.game-date')?.innerText);
                        if (!dateStr.includes('/')) return;

                        const [day, month, year] = dateStr.split('/').map(Number);
                        const timeStr = clean(cols[3]?.innerText.replace('שעה', '') || "");
                        const timeMatch = timeStr.match(/(\d{2}):(\d{2})/);
                        const stadium = clean(cols[2]?.innerText.replace('מגרש', '') || "טרם נקבע");
                        
                        // שליפת שמות קבוצות גמישה
                        const teams = cols[1]?.innerText || "";
                        const title = clean(teams.replace(/\s+/g, ' '));

                        events.push({
                            uid: `ashdod-s27-r${round}-${day}-${month}@msa.com`,
                            title: `⚽ ${title}`,
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

        console.log(`סיימתי. נמצאו ${events.length} משחקים.`);

        if (events.length === 0) {
            const emptyIcs = "BEGIN:VCALENDAR\nVERSION:2.0\nX-WR-CALNAME:מ.ס. אשדוד - אין נתונים\nEND:VCALENDAR";
            return res.status(200).send(emptyIcs);
        }

        const { value } = ics.createEvents(events);
        const finalIcs = value.replace('VERSION:2.0', 
            'VERSION:2.0\r\nX-WR-CALNAME:מ.ס. אשדוד - לוח משחקים 🐬\r\nX-WR-TIMEZONE:Asia/Jerusalem\r\nREFRESH-INTERVAL;VALUE=DURATION:PT4H'
        );

        res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
        res.send(finalIcs);

    } catch (err) {
        res.status(500).send("Error");
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server live on port ${PORT}`));