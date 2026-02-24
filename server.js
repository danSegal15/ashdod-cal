const express = require('express');
const axios = require('axios');
const { parse } = require('node-html-parser');
const ics = require('ics');

const app = express();
const ASHDOD_ID = '1198';
const SEASON_ID = '27'; 

let cachedIcs = ""; 

// === התיקון נמצא כאן: ניקוי משוריין נגד קידודים כפולים ===
const clean = (str) => {
    if (!str) return "";
    return str
        .replace(/&amp;nbsp;/g, ' ')  // קידוד כפול של רווח HTML
        .replace(/&nbsp;/gi, ' ')     // רווח HTML רגיל (גם באותיות גדולות)
        .replace(/\u00a0/g, ' ')      // רווח קשיח שקוף ביוניקוד
        .replace(/&amp;/g, '&')       // תיקון לאמפרסנד
        .replace(/&quot;/g, '"')      // מרכאות
        .replace(/&#39;/g, "'")       // גרש
        .replace(/\s+/g, ' ')         // צמצום כפל רווחים לרווח אחד
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
                console.log(`שגיאה במחזור ${round} - מדלג.`);
            }
        }

        console.log(`>>> סריקת הרקע הושלמה: נמצאו ${events.length} משחקים <<<`);

        if (events.length > 0) {
            const { error, value } = ics.createEvents(events);
            if (!error) {
                const elegantHeaders = [
                    'VERSION:2.0',
                    'X-WR-CALNAME:מ.ס. אשדוד - לוח משחקים 🐬',
                    'X-WR-TIMEZONE:Asia/Jerusalem',
                    'X-WR-CALDESC:לוח משחקים רשמי',
                    'REFRESH-INTERVAL;VALUE=DURATION:PT4H'
                ].join('\r\n');

                cachedIcs = value.replace('VERSION:2.0', elegantHeaders);
            }
        }

        await new Promise(r => setTimeout(r, 3600000));
    }
};

scrapeDataInBackground();

app.get('/health', (req, res) => res.status(200).send('OK'));

app.get('/', (req, res) => {
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline; filename="calendar.ics"');
    
    if (cachedIcs) {
        res.send(cachedIcs);
    } else {
        res.send("BEGIN:VCALENDAR\nVERSION:2.0\nX-WR-CALNAME:מ.ס. אשדוד - הנתונים בטעינה (רענן עוד 3 דק)\nEND:VCALENDAR");
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server live on port ${PORT}`));