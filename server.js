const express = require('express');
const axios = require('axios');
const { parse } = require('node-html-parser');
const ics = require('ics');

const app = express();
const ASHDOD_ID = '1198';

app.get('/calendar.ics', async (req, res) => {
    const events = [];
    console.log('מתחיל סריקה עבור מ.ס. אשדוד...');

    try {
        for (let round = 1; round <= 36; round++) {
            const url = `https://www.football.org.il//Components.asmx/League_AllTables?league_id=40&season_id=27&box=0&round_id=${round}`;
            
            try {
                const response = await axios.get(url, {
                    headers: { 'User-Agent': 'Mozilla/5.0' }
                });

                let htmlData = response.data;
                const xmlMatch = htmlData.match(/<HtmlData>(.*?)<\/HtmlData>/s);
                if (xmlMatch) htmlData = xmlMatch[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>');

                const root = parse(htmlData);
                const rows = root.querySelectorAll('.table_row');

                rows.forEach(row => {
                    const team1 = row.getAttribute('data-team1');
                    const team2 = row.getAttribute('data-team2');

                    if (team1 !== ASHDOD_ID && team2 !== ASHDOD_ID) return; 

                    const cols = row.querySelectorAll('.table_col');
                    const dateStr = row.querySelector('.game-date').innerText.trim();
                    if (!dateStr) return;
                    
                    const [day, month, year] = dateStr.split('/').map(Number);
                    const timeStr = cols[3].innerText.replace('שעה', '').trim();
                    const timeMatch = timeStr.match(/(\d{2}):(\d{2})/);
                    const stadium = cols[2].innerText.replace('מגרש', '').trim();
                    const teamNames = cols[1].querySelectorAll('.team-name-text');
                    const title = teamNames.length === 2 ? `${teamNames[0].innerText.trim()} נגד ${teamNames[1].innerText.trim()}` : "משחק ליגה";

                    let event = {
                        // ה-UID הזה קריטי לסנכרון! הוא אומר ליומן "זה אותו משחק"
                        uid: `game-round-${round}-ashdod@msa.com`, 
                        title: `🐬 ${title}`,
                        description: `מחזור ${round} | ליגת העל`,
                        location: stadium,
                        status: 'CONFIRMED',
                        busyStatus: 'BUSY'
                    };

                    if (timeMatch) {
                        event.start = [year, month, day, parseInt(timeMatch[1]), parseInt(timeMatch[2])];
                        event.duration = { hours: 2 };
                    } else {
                        event.start = [year, month, day];
                        event.title = `🐬 [שעה טרם נקבעה] ${title}`;
                    }
                    events.push(event);
                });
            } catch (e) {}
        }

        const { error, value } = ics.createEvents(events);
        
        // --- החלק הקריטי לתיקון ה-Subscription ---
        
        // 1. הגדרת כותרות (Headers) שמכריחות סנכרון
        res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
        res.setHeader('Content-Disposition', 'inline; filename=calendar.ics');
        
        // 2. מניעת שמירה בזיכרון (Cache) כדי שהיומן יבדוק את השרת כל פעם מחדש
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');

        // 3. הוספת פקודות iCal שגוגל ואפל מחפשים כדי להפעיל Sub
        const cleanValue = value
            .replace('VERSION:2.0', 'VERSION:2.0\r\nX-WR-CALNAME:מ.ס. אשדוד - לוח משחקים\r\nX-WR-TIMEZONE:Asia/Jerusalem\r\nX-PUBLISHED-TTL:PT4H\r\nREFRESH-INTERVAL;VALUE=DURATION:PT4H');

        res.send(cleanValue);

    } catch (err) {
        res.status(500).send("Error");
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));