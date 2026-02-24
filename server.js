const express = require('express');
const axios = require('axios');
const { parse } = require('node-html-parser');
const ics = require('ics');

const app = express();
const ASHDOD_ID = '1198';

app.get('/', (req, res) => {
    res.redirect('/calendar.ics');
});

app.get('/calendar.ics', async (req, res) => {
    const events = [];
    console.log('מתחיל סריקה עבור מ.ס. אשדוד...');

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
                    if (!dateStr) return;
                    
                    const [day, month, year] = dateStr.split('/').map(Number);

                    const timeStr = cols[3].innerText.replace('שעה', '').trim();
                    const timeMatch = timeStr.match(/(\d{2}):(\d{2})/);

                    const stadium = cols[2].innerText.replace('מגרש', '').trim();
                    const teamNames = cols[1].querySelectorAll('.team-name-text');
                    const title = teamNames.length === 2 ? `${teamNames[0].innerText.trim()} נגד ${teamNames[1].innerText.trim()}` : "משחק ליגה";
                    const matchType = (team1 === ASHDOD_ID) ? 'משחק בית' : 'משחק חוץ';

                    let event = {
                        uid: `ashdod-round-${round}@ms-ashdod-cal.com`, 
                        title: `🐬 מ.ס. אשדוד: ${title}`,
                        description: `מחזור ${round} | ${matchType} | ליגת העל`,
                        location: stadium,
                        url: url
                    };

                    if (timeMatch) {
                        event.start = [year, month, day, parseInt(timeMatch[1]), parseInt(timeMatch[2])];
                        event.duration = { hours: 2 };
                    } else {
                        event.start = [year, month, day];
                        event.title = `🐬 (טרם נקבעה שעה) מ.ס. אשדוד: ${title}`;
                    }

                    events.push(event);
                });
                
            } catch (innerErr) {
                console.log(`שגיאה בקריאת מחזור ${round}, ממשיך הלאה...`);
            }
        }

        if (events.length === 0) {
            return res.status(404).send("לא נמצאו משחקים של אשדוד.");
        }

        const { error, value } = ics.createEvents(events);
        if (error) throw error;

        const valueWithRefresh = value.replace('VERSION:2.0', 'VERSION:2.0\r\nREFRESH-INTERVAL;VALUE=DURATION:PT4H\r\nX-PUBLISHED-TTL:PT4H');

        res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="ms_ashdod.ics"`);
        res.send(valueWithRefresh);

    } catch (err) {
        console.error(err);
        res.status(500).send("שגיאה כללית בשרת.");
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`שרת מ.ס. אשדוד באוויר על פורט ${PORT}!`));