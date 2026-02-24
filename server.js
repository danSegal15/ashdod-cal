const express = require('express');
const axios = require('axios');
const { parse } = require('node-html-parser');
const ics = require('ics');

const app = express();
const ASHDOD_ID = '1198';
const SEASON_ID = '27'; 

const clean = (str) => {
    if (!str) return "";
    return str.replace(/&nbsp;/g, ' ').replace(/\u00a0/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
};

app.use((req, res, next) => {
    console.log(`[${new Date().toLocaleTimeString()}] בקשה נכנסה לנתיב: ${req.url}`);
    next();
});

app.get('/health', (req, res) => res.status(200).send('OK'));

app.get('/', async (req, res) => {
    console.log(`>>> סורק עונה ${SEASON_ID} (במצב חמקן - קצב איטי)...`);
    const events = [];

    try {
        for (let round = 1; round <= 36; round++) {
            const url = `https://www.football.org.il//Components.asmx/League_AllTables?league_id=40&season_id=${SEASON_ID}&box=0&round_id=${round}`;
            
            try {
                // הגדלנו משמעותית את ההמתנה ל-800 מילי-שניות כדי להיראות כמו גלישה טבעית
                await new Promise(r => setTimeout(r, 800)); 
                
                const response = await axios.get(url, { 
                    headers: { 
                        // התחזות מלאה לדפדפן כרום אמיתי בווינדוס
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                        'Accept-Language': 'he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7'
                    },
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

                    if (team1 === ASHDOD_ID || team2 === ASHDOD_ID) {
                        const cols = row.querySelectorAll('.table_col');
                        if (cols.length < 5) return; 

                        const dateStr = clean(row.querySelector('.game-date')?.innerText || "");
                        if (!dateStr.includes('/')) return;

                        const [day, month, year] = dateStr.split('/').map(Number);
                        const timeStr = clean(cols[3]?.innerText.replace('שעה', '') || "");
                        const timeMatch = timeStr.match(/(\d{2}):(\d{2})/);
                        const stadium = clean(cols[2]?.innerText.replace('מגרש', '') || "");
                        
                        const teamNames = cols[1].querySelectorAll('.team-name-text');
                        const t1Name = clean(teamNames[0]?.innerText || "");
                        const t2Name = clean(teamNames[1]?.innerText || "");
                        
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
            } catch (e) {
                // מדפיס שגיאה רק אם זו לא שגיאת 404/403 רגילה כדי לא להציף את הלוג
                console.log(`שגיאה במחזור ${round}: ${e.message}`);
            }
        }

        console.log(`>>> סריקה הושלמה: נמצאו ${events.length} משחקים <<<`);

        if (events.length === 0) {
            return res.status(200).send("BEGIN:VCALENDAR\nVERSION:2.0\nX-WR-CALNAME:מ.ס. אשדוד - ריק\nEND:VCALENDAR");
        }

        const { error, value } = ics.createEvents(events);
        if (error) throw error;

        const elegantValue = value.replace('VERSION:2.0', 
            'VERSION:2.0\r\n' +
            'X-WR-CALNAME:מ.ס. אשדוד - לוח משחקים 🐬\r\n' +
            'X-WR-TIMEZONE:Asia/Jerusalem\r\n' +
            'X-WR-CALDESC:לוח משחקים רשמי\r\n' +
            'REFRESH-INTERVAL;VALUE=DURATION:PT4H'
        );

        res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
        res.setHeader('Content-Disposition', 'inline; filename="calendar.ics"');
        res.send(elegantValue);

    } catch (err) {
        res.status(500).send("Error");
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server live on port ${PORT}`));