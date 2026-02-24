const express = require('express');
const axios = require('axios');
const { parse } = require('node-html-parser');
const ics = require('ics');

const app = express();
const ASHDOD_ID = '1198';

// פונקציית עזר לניקוי טקסט מסימני HTML שבורים
const clean = (str) => {
    if (!str) return "";
    return str
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/\s+/g, ' ') // הופך כפל רווחים לרווח אחד
        .trim();
};

app.get('/health', (req, res) => res.status(200).send('OK'));

app.get('/', async (req, res) => {
    const ua = req.headers['user-agent'] || '';
    if (ua.includes('bot') || ua.includes('crawler')) return res.status(200).send('No bots');

    console.log(`Request from: ${ua}`);
    const events = [];

    try {
        for (let round = 1; round <= 36; round++) {
            const url = `https://www.football.org.il//Components.asmx/League_AllTables?league_id=40&season_id=27&box=0&round_id=${round}`;
            
            try {
                const response = await axios.get(url, {
                    headers: { 'User-Agent': 'Mozilla/5.0' }
                });

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

                    if (team1 !== ASHDOD_ID && team2 !== ASHDOD_ID) return; 

                    const cols = row.querySelectorAll('.table_col');
                    if (cols.length < 5) return;

                    const dateStr = clean(row.querySelector('.game-date').innerText);
                    const [day, month, year] = dateStr.split('/').map(Number);

                    const timeStr = clean(cols[3].innerText.replace('שעה', ''));
                    const timeMatch = timeStr.match(/(\d{2}):(\d{2})/);

                    const stadium = clean(cols[2].innerText.replace('מגרש', ''));
                    const teamNames = cols[1].querySelectorAll('.team-name-text');
                    
                    // ניקוי שמות הקבוצות לפני יצירת הכותרת
                    const t1Name = clean(teamNames[0]?.innerText || "");
                    const t2Name = clean(teamNames[1]?.innerText || "");
                    const title = `${t1Name} נגד ${t2Name}`;

                    const matchType = (team1 === ASHDOD_ID) ? 'בית' : 'חוץ';
                    
                    let event = {
                        uid: `ashdod-v2-round-${round}@msa-cal.com`, 
                        title: `🔥 ${title}`,
                        description: `מחזור ${round} | משחק ${matchType} | ליגת העל`,
                        location: stadium,
                        status: 'CONFIRMED'
                    };

                    if (timeMatch) {
                        event.start = [year, month, day, parseInt(timeMatch[1]), parseInt(timeMatch[2])];
                        event.duration = { hours: 2 };
                    } else {
                        event.start = [year, month, day];
                        event.title = `🔥 (שעה טרם נקבעה) ${title}`;
                    }
                    events.push(event);
                });
            } catch (e) {}
        }

        const { error, value } = ics.createEvents(events);
        res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
        res.setHeader('Content-Disposition', 'inline; filename="calendar.ics"');
        res.send(value);

    } catch (err) {
        res.status(500).send("Error");
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Live on port ${PORT}`));