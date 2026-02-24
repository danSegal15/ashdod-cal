const express = require('express');
const axios = require('axios');
const { parse } = require('node-html-parser');
const ics = require('ics');

const app = express();
const ASHDOD_ID = '1198';
const SEASON_ID = '27'; 

// פונקציית ניקוי אגרסיבית לכל סוגי הרווחים והסימנים
const clean = (str) => {
    if (!str) return "";
    return str
        .replace(/&nbsp;/g, ' ')       // ישויות HTML
        .replace(/\u00a0/g, ' ')       // רווח קשיח ביוניקוד
        .replace(/&amp;/g, '&')        // אמפרסנד
        .replace(/\s+/g, ' ')          // צמצום כפל רווחים
        .trim();
};

app.get('/health', (req, res) => res.status(200).send('OK'));

app.get('/', async (req, res) => {
    console.log(`--- סריקה אלגנטית התחילה ---`);
    const events = [];

    try {
        for (let round = 1; round <= 36; round++) {
            const url = `https://www.football.org.il//Components.asmx/League_AllTables?league_id=40&season_id=${SEASON_ID}&box=0&round_id=${round}`;
            
            try {
                // המתנה קלה כדי למנוע חסימה
                await new Promise(r => setTimeout(r, 150));
                const response = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });

                let htmlData = response.data;
                const xmlMatch = htmlData.match(/<HtmlData>(.*?)<\/HtmlData>/is);
                if (!xmlMatch) continue;

                htmlData = xmlMatch[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>');
                const root = parse(htmlData);
                const rows = root.querySelectorAll('.table_row');

                rows.forEach(row => {
                    const text = row.innerText || "";
                    if (text.includes('אשדוד') || row.getAttribute('data-team1') === ASHDOD_ID || row.getAttribute('data-team2') === ASHDOD_ID) {
                        const cols = row.querySelectorAll('.table_col');
                        if (cols.length < 4) return;

                        const dateStr = clean(row.querySelector('.game-date')?.innerText);
                        if (!dateStr.includes('/')) return;

                        const [day, month, year] = dateStr.split('/').map(Number);
                        const timeStr = clean(cols[3]?.innerText.replace('שעה', '') || "");
                        const timeMatch = timeStr.match(/(\d{2}):(\d{2})/);
                        const stadium = clean(cols[2]?.innerText.replace('מגרש', '') || "טרם נקבע");
                        
                        // ניקוי יסודי של שמות הקבוצות
                        const teamNames = cols[1]?.querySelectorAll('.team-name-text');
                        const t1Name = clean(teamNames[0]?.innerText || "אשדוד");
                        const t2Name = clean(teamNames[1]?.innerText || "יריבה");

                        events.push({
                            uid: `ashdod-v3-${round}-${day}-${month}@msa.com`,
                            title: `⚽ ${t1Name} - ${t2Name}`, // כותרת נקייה
                            start: timeMatch ? [year, month, day, parseInt(timeMatch[1]), parseInt(timeMatch[2])] : [year, month, day],
                            duration: timeMatch ? { hours: 2 } : undefined,
                            description: `מחזור ${round} | ליגת העל`,
                            location: stadium,
                        });
                    }
                });
            } catch (e) {}
        }

        const { value } = ics.createEvents(events);
        
        // --- הזרקה של השם וההגדרות בצורה שגוגל לא יוכל להתעלם ---
        const elegantValue = value
            .replace(/PRODID:.*?\r\n/g, 'PRODID:M.S. Ashdod Calendar\r\n')
            .replace('VERSION:2.0', 
                'VERSION:2.0\r\n' +
                'X-WR-CALNAME:מ.ס. אשדוד - לוח משחקים 🐬\r\n' +
                'X-WR-TIMEZONE:Asia/Jerusalem\r\n' +
                'X-WR-CALDESC:לוח משחקים רשמי\r\n' +
                'REFRESH-INTERVAL;VALUE=DURATION:PT4H\r\n' +
                'METHOD:PUBLISH'
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