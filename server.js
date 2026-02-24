const express = require('express');
const axios = require('axios');
const { parse } = require('node-html-parser');
const ics = require('ics');

const app = express();
const ASHDOD_ID = '1198';
const SEASON_ID = '27'; 

// פונקציית עזר להמתנה (מונע חסימות)
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const clean = (str) => {
    if (!str) return "";
    return str.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
};

app.get('/health', (req, res) => res.status(200).send('OK'));

app.get('/', async (req, res) => {
    console.log(`--- התחלת סריקה חמקנית לאשדוד (עונה ${SEASON_ID}) ---`);
    const events = [];

    try {
        for (let round = 1; round <= 36; round++) {
            const url = `https://www.football.org.il//Components.asmx/League_AllTables?league_id=40&season_id=${SEASON_ID}&box=0&round_id=${round}`;
            
            try {
                // המתנה של 200 מילי-שניות בין בקשה לבקשה כדי לא להיחסם
                await sleep(200);

                const response = await axios.get(url, { 
                    headers: { 
                        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
                    },
                    timeout: 10000 
                });

                let htmlData = response.data;
                const xmlMatch = htmlData.match(/<HtmlData>(.*?)<\/HtmlData>/is);
                if (!xmlMatch) continue;

                htmlData = xmlMatch[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>');
                const root = parse(htmlData);
                const rows = root.querySelectorAll('.table_row');

                rows.forEach(row => {
                    const t1 = row.getAttribute('data-team1');
                    const t2 = row.getAttribute('data-team2');
                    const rowText = row.innerText || "";

                    if (t1 === ASHDOD_ID || t2 === ASHDOD_ID || rowText.includes('אשדוד')) {
                        const cols = row.querySelectorAll('.table_col');
                        if (cols.length < 4) return;

                        const dateStr = clean(row.querySelector('.game-date')?.innerText || "");
                        if (!dateStr.includes('/')) return;

                        const [day, month, year] = dateStr.split('/').map(Number);
                        const timeStr = clean(cols[3]?.innerText.replace('שעה', '') || "");
                        const timeMatch = timeStr.match(/(\d{2}):(\d{2})/);
                        const stadium = clean(cols[2]?.innerText.replace('מגרש', '') || "טרם נקבע");
                        
                        const teamNames = cols[1]?.querySelectorAll('.team-name-text');
                        const t1Name = clean(teamNames[0]?.innerText || "קבוצה א");
                        const t2Name = clean(teamNames[1]?.innerText || "קבוצה ב");
                        
                        events.push({
                            uid: `ashdod-s27-r${round}@msa.com`,
                            title: `⚽ ${t1Name} - ${t2Name}`,
                            start: timeMatch ? [year, month, day, parseInt(timeMatch[1]), parseInt(timeMatch[2])] : [year, month, day],
                            duration: timeMatch ? { hours: 2 } : undefined,
                            description: `מחזור ${round} | ליגת העל`,
                            location: stadium,
                        });
                    }
                });
            } catch (e) {
                console.log(`מחזור ${round} נכשל: ${e.message}`);
            }
        }

        console.log(`סריקה הסתיימה. נמצאו ${events.length} משחקים.`);

        if (events.length === 0) {
            return res.status(200).send("BEGIN:VCALENDAR\nVERSION:2.0\nX-WR-CALNAME:מ.ס. אשדוד - אין נתונים\nEND:VCALENDAR");
        }

        const { error, value } = ics.createEvents(events);
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