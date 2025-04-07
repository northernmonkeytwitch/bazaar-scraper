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
    // Shiny intentionally omitted
};

app.get('/bazaar', async (req, res) => {
    const query = req.query.q;
    if (!query) return res.send("Please specify an item and enchantment.");

    const [itemNameRaw, enchantmentRaw] = query.split(/ (.+)/); // Splits on first space
    if (!itemNameRaw || !enchantmentRaw) return res.send("Format: !bazaar [item] [enchantment]");

    const itemName = itemNameRaw.trim();
    const enchantmentName = enchantmentRaw.trim();
    const pageName = itemName.replace(/ /g, '_');
    const url = `https://thebazaar.wiki.gg/wiki/${encodeURIComponent(pageName)}`;

    try {
        const { data } = await axios.get(url);
        const $ = cheerio.load(data);

        let found = false;
        let effectText = "";
        let bestMatch = { rating: 0 };
        let characterName = "Unknown";
        let enchantmentList = [];

        // Extract character from <aside> under h3 "Collection"
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

        // Find all tables with captions containing "Enchantment"
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
                return false; // break after finding enchantment table
            }
        });

        // Check if user wants to list all enchantments
        if (enchantmentName.toLowerCase() === 'list') {
            if (enchantmentList.length === 0) {
                return res.send(`No enchantments found for ${itemName}.`);
            }
            const lastIndex = enchantmentList.length - 1;
            const listOutput = enchantmentList.map((e, idx) => {
                const emoji = enchantEmojis[e.name] || "";
                const entry = `${e.name}${emoji} = ${e.effect}`;
                return idx === lastIndex ? `${entry} | This item belongs to ${characterName}.` : entry;
            }).join(' | ');
            return res.send(`${itemName} Enchantments ✚ ${listOutput}`);
        }

        // Use string similarity to find the closest match
        const names = enchantmentList.map(e => e.name);
        const match = stringSimilarity.findBestMatch(enchantmentName, names).bestMatch;

        if (match.rating >= 0.5) {
            const matched = enchantmentList.find(e => e.name === match.target);
            effectText = matched.effect;
            bestMatch = match;
            found = true;
        }

        if (!found) {
            return res.send(`Enchantment \"${enchantmentName}\" not found on ${itemName}.`);
        }

        const emote = enchantEmojis[bestMatch.target] || "";
        return res.send(`${itemName} ✚ ${bestMatch.target}${emote} = ${effectText} | This item belongs to ${characterName}.`);
    } catch (error) {
        console.error("Scraper error:", error.message);
        return res.send("The Bazaar Wiki may be down or has changed layout. Don't worry, we have been alerted and are working on a fix. Please try again later.");
    }
});

app.listen(3000, () => console.log('Bazaar scraper API running on port 3000'));
