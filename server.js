const express = require('express');
const axios = require('axios');
const { parse } = require('node-html-parser');
const ics = require('ics');

const app = express();
const ASHDOD_ID = '1198';
const SEASON_ID = '27'; 

// הזיכרון שלנו! פה נשמור את היומן אחרי שהוא מוכן
let cachedIcs = ""; 

const clean = (str) => {
    if (!str) return "";
    return str.replace(/&nbsp;/g, ' ').replace(/\u00a0/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
};

// ==========================================
// מנוע סריקת הרקע - רץ לבד, לאט ובשקט!
// ==========================================
const scrapeDataInBackground = async () => {
    while (true) { // לולאה אינסופית שרצה כל עוד השרת חי
        console.log(`>>> מתחיל סריקת רקע איטית (עונה ${SEASON_ID})...`);
        const events = [];

        for (let round = 1; round <= 36; round++) {
            const url = `https://www.football.org.il//Components.asmx/League_AllTables?league_id=40&season_id=${SEASON_ID}&box=0&round_id=${round}`;
            
            try {
                // לבקשתך: ממתינים 5 שניות שלמות בין מחזור למחזור! אין סיכוי שניחסם.
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
                // שומרים את היומן המוכן בזיכרון של השרת
                cachedIcs = value.replace('VERSION:2.0', 
                    'VERSION:2.0\r\