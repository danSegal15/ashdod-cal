const express = require('express');
const axios = require('axios');
const { parse } = require('node-html-parser');
const ics = require('ics');

const app = express();
const ASHDOD_ID = '1198';

app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    next();
});

// --- זה החלק החדש שמונע את העומס ---

// 1. נתיב בדיקת דופק - Render יפנה לכאן ולא יפעיל את הסקראפינג היקר
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

// 2. הנתיב הראשי של היומן
app.get('/', async (req, res) => {
    const ua = req.headers['user-agent'] || '';
    
    // אם מי שפנה הוא בוט של סריקה, נעצור אותו מיד בלי לבזבז משאבים
    if (ua.includes('bot') || ua.includes('crawler') || ua.includes('Spider')) {
        console.log(`Bot blocked: ${ua}`);
        return res.status(200).send('No bots allowed');
    }

    console.log(`Request received from: ${ua}`);
    const events = [];

    try {
        for (let round = 1; round <= 36; round++) {
            const url = `https://www.football.org.il//Components.asmx/League_AllTables?league_id=40&season_id=27&box=0&round_id=${round}`;
            
            try {
                const response = await axios.get(url, {
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
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

                    const dateStr = row.querySelector('.game-date').innerText.trim();
                    const [day, month, year] = dateStr.split('/').map(Number);

                    const timeStr = cols[3].innerText.replace('שעה', '').trim();
                    const timeMatch = timeStr.match(/(\d{2}):(\d{2})/);

                    const stadium = cols[2].innerText.replace('מגרש', '').trim();
                    const teamNames = cols[1].querySelectorAll('.team-name-text');
                    const title = teamNames.length === 2 ? `${teamNames[0].innerText.trim()} נגד ${teamNames[1].innerText.trim()}` : "משחק ליגה";
                    const matchType = (team1 === ASHDOD_ID) ? 'משחק בית' : 'משחק חוץ';
                    
                    let event = {
                        uid: `ashdod-game-round-${round}@msa-cal.com`, 
                        title: `🔥 ${title}`,
                        description: `מחזור ${round} | ${matchType} | ליגת העל`,
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
            } catch (innerErr) {}
        }

        const { error, value } = ics.createEvents(events);
        if (error) throw error;

        res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="ms_ashdod.ics"`);
        res.send(value);

    } catch (err) {
        res.status(500).send("Error");
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));