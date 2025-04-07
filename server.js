// server.js
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const stringSimilarity = require('string-similarity');
const app = express();

const enchantEmojis = {
    "Turbo": "⚡",
    "Toxic": "☠️",
    "Shielded": "🛡️",
    "Fiery": "🔥",
    "Deadly": "🎯",
    "Icy": "❄️",
    "Golden": "🥇",
    "Restorative": "💚",
    "Heavy": "⏳",
    "Radiant": "⛔",
    "Obsidian": "🗡️"
};

function formatPageName(name) {
    return name.trim().replace(/\s+/g, '_'); // Preserve special characters like dashes and numbers
}

function normalizeString(str) {
    return str.toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function tryFuzzyItemName(itemName) {
    const baseUrl = 'https://thebazaar.wiki.gg/wiki/Special:AllPages';
    const visited = new Set();
    const items = [];

    async function scrapePage(url) {
        if (visited.has(url)) return;
        visited.add(url);

        try {
            const { data } = await axios.get(url);
            const $ = cheerio.load(data);
            $('#mw-content-text li a').each((i, el) => {
                const title = $(el).text();
                const href = $(el).attr('href');
                if (title && href && href.includes('/wiki/')) {
                    items.push({ title: title.trim(), href: href.replace('/wiki/', '') });
                }
            });

            const nextLink = $('a[href*="Special:AllPages?from="]').last().attr('href');
            if (nextLink) {
                const nextUrl = 'https://thebazaar.wiki.gg' + nextLink;
                await scrapePage(nextUrl);
            }
        } catch (err) {
            console.error(`Failed to fetch or parse: ${url}`, err.message);
        }
    }

    try {
        await scrapePage(baseUrl);
        if (items.length === 0) throw new Error("No valid items found from wiki.");

        const itemMap = items.reduce((map, entry) => {
            const normalized = normalizeString(entry.title);
            map[normalized] = entry;
            return map;
        }, {});

        const inputNormalized = normalizeString(itemName);
        const matchResult = stringSimilarity.findBestMatch(inputNormalized, Object.keys(itemMap));

                
        if (matchResult.bestMatch.rating >= 0.4) {
            const match = itemMap[matchResult.bestMatch.target];
            
            
            return { title: match.title, href: match.href };
        } else {
            return null;
        }

    } catch (e) {
        console.error("Failed fuzzy item lookup:", e.message);
        return null;
    }
}

app.get('/bazaar', async (req, res) => {
    const query = req.query.q;
    if (!query) return res.send("Please specify an item and enchantment.");

    const args = query.trim().split(" ");
    if (args.length < 2) return res.send("Format: !bazaar [item] [enchantment]");

    const enchantmentName = args.pop();
    let itemName = args.join(" ");

    // Attempt exact match before fuzzy fallback
    const pageName = formatPageName(itemName);
    const url = `https://thebazaar.wiki.gg/wiki/${encodeURIComponent(pageName)}`;
    let response;

    try {
        response = await axios.get(url);
    } catch (err) {
        const fuzzyMatch = await tryFuzzyItemName(itemName);
        if (!fuzzyMatch) {
            return res.send(`Item "${itemName}" not found on the wiki. Please double-check the spelling.`);
        }
        itemName = fuzzyMatch.title;
        const fallbackUrl = `https://thebazaar.wiki.gg/wiki/${fuzzyMatch.href}`;
        
        
                                try {
                response = await axios.get(fallbackUrl);
        } catch (error) {
            return res.send(`Even after fuzzy matching, "${itemName}" could not be found.`);
        }
    }

    try {
        const data = response.data;
        if (!data || data.length === 0) {
            console.error("No data returned from wiki page.");
            return res.send(`Failed to load data for ${itemName}.`);
        }
        const $ = cheerio.load(data);

        let found = false;
        let effectText = "";
        let bestMatch = { rating: 0 };
        let characterName = "Unknown";
        let enchantmentList = [];

        $('aside').each((i, aside) => {
            const headers = $(aside).find('h3');
            headers.each((j, header) => {
                if ($(header).text().toLowerCase().includes("collection")) {
                    const next = $(header).next();
                    if (next && next.text().trim()) {
                        characterName = next.text().trim();
                        return false;
                    }
                }
            });
        });

        $('table').each((i, table) => {
            const caption = $(table).find('caption').text().toLowerCase();
            if (caption.includes("enchantment")) {
                                $(table).find('tr').each((j, row) => {
                    const cells = $(row).find('td');
                    if (cells.length >= 2) {
                        const enchantText = cells.eq(0).text().trim();
                        const effect = cells.eq(1).text().trim();
                        enchantmentList.push({
                            name: enchantText,
                            effect: effect
                        });
                    }
                });
                return false;
            }
        });

                    
        }
            const lastIndex = enchantmentList.length - 1;
            const listOutput = enchantmentList.map((e, idx) => {
                const emoji = enchantEmojis[e.name] || "";
                const entry = `${e.name}${emoji} = ${e.effect}`;
                return idx === lastIndex ? `${entry} | This item belongs to ${characterName}.` : entry;
            }).join(' | ');
            return res.send(`${itemName} Enchantments ✚ ${listOutput}`);
        }

        const names = enchantmentList.map(e => e.name);
        const matchResult = stringSimilarity.findBestMatch(enchantmentName.toLowerCase(), names.map(n => n.toLowerCase()));
        const matchIndex = names.map(n => n.toLowerCase()).indexOf(matchResult.bestMatch.target);

        if (matchResult.bestMatch.rating >= 0.5) {
            const matched = enchantmentList[matchIndex];
            effectText = matched.effect;
            bestMatch = { target: matched.name };
            found = true;
        }

        if (!found) {
            if (enchantmentList.length === 0) {
                return res.send(`${itemName} does not have any enchantments listed.`);
            }
            return res.send(`Enchantment "${enchantmentName}" not found on ${itemName}.`);
        }

        const emote = enchantEmojis[bestMatch.target] || "";
        return res.send(`${itemName} ✚ ${bestMatch.target}${emote} = ${effectText} | This item belongs to ${characterName}.`);
    } catch (error) {
        console.error("Scraper error:", error.message);
        return res.send("The Bazaar Wiki may be down or has changed layout. Don't worry, we have been alerted and are working on a fix. Please try again later.");
    }
});

app.listen(3000, () => console.log('Bazaar scraper API running on port 3000'));
