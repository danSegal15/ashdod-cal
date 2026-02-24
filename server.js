const express = require('express');
const axios = require('axios');
const { parse } = require('node-html-parser');
const ics = require('ics');

const app = express();
const ASHDOD_ID = '1198';
const SEASON_ID = '27'; // חזרה לעונה שעבדה לך

// פונקציית עזר לניקוי טקסט מסימני HTML שבורים ורווחים מיותרים
const clean = (str) => {
    if (!str) return "";
    return str
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/\s+/g, ' ')
        .trim();
};

app.get('/health', (req, res) => res.status(200).send('OK'));

app.get('/', async (req, res) => {
    console.log(`--- סריקת אשדוד התחילה: עונה ${SEASON_ID} ---`);
    const events = [];

    try {
        for (let round = 1; round <= 36; round++) {
            const url = `https://www.football.org.il//Components.asmx/League_AllTables?league_id=40&season_id=${SEASON_ID}&box=0&round_id=${round}`;
            
            try {
                const response = await axios.get(url, { 
                    headers: { 'User-Agent': 'Mozilla/5.0' },
                    timeout: 5000 
                });

                let htmlData = response.data;
                const xmlMatch = htmlData.match(/<HtmlData>(.*?)<\/HtmlData>/s);
                if (xmlMatch) {
                    htmlData = xmlMatch[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>');
                }

                const root = parse(htmlData);
                const rows = root.querySelectorAll('.table_row');

                rows.forEach(row => {
                    const t1 = row.getAttribute('data-team1');
                    const t2 = row.getAttribute('data-team2');

                    if (t1 === ASHDOD_ID || t2 === ASHDOD_ID) {
                        const cols = row.querySelectorAll('.table_col');
                        if (cols.length < 5) return;

                        const dateStr = clean(row.querySelector('.game-date')?.innerText || "");
                        if (!dateStr.includes('/')) return;

                        const [day, month, year] = dateStr.split('/').map(Number);
                        const timeStr = clean(cols[3].innerText.replace('שעה', ''));
                        const timeMatch = timeStr.match(/(\d{2}):(\d{2})/);
                        const stadium = clean(cols[2].innerText.replace('מגרש', ''));
                        
                        const teamNames = cols[1].querySelectorAll('.team-name-text');
                        const t1Name = clean(teamNames[0]?.innerText || "");
                        const t2Name = clean(teamNames[1]?.innerText || "");
                        
                        // יצירת מזהה ייחודי קבוע (UID) לסנכרון תקין
                        const gameUid = `msa-s${SEASON_ID}-r${round}-${t1}-${t2}`;

                        let event = {
                            uid: `${gameUid}@ashdod-cal.com`,
                            title: `⚽ ${t1Name} - ${t2Name}`,
                            description: `מחזור ${round} | ליגת העל`,
                            location: stadium,
                            status: 'CONFIRMED',
                            categories: ['Football', 'M.S. Ashdod']
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
                console.log(`שגיאה במחזור ${round}`);
            }
        }

        console.log(`סיום: נמצאו ${events.length} משחקים`);

        const { error, value } = ics.createEvents(events);
        if (error) throw error;

        // --- הזרקת האלגנטיות לקובץ ---
        const elegantValue = value.replace('VERSION:2.0', 
            'VERSION:2.0\r\n' +
            'X-WR-CALNAME:מ.ס. אשדוד - לוח משחקים 🐬\r\n' +
            'X-WR-TIMEZONE:Asia/Jerusalem\r\n' +
            'X-WR-CALDESC:לוח משחקים מסונכרן ומתעדכן אוטומטית\r\n' +
            'REFRESH-INTERVAL;VALUE=DURATION:PT4H\r\n' +
            'X-PUBLISHED-TTL:PT4H'
        );

        res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
        res.setHeader('Content-Disposition', 'inline; filename="calendar.ics"');
        res.send(elegantValue);

    } catch (err) {
        console.error(err);
        res.status(500).send("Error");
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server is Live on port ${PORT}`));