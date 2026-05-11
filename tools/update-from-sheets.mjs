import { nanoid } from "nanoid";
import readline from "readline";
import cleanTextUtils from "clean-text-utils";
const replaceExoticChars = cleanTextUtils.replace.exoticChars;

// For Google
import fs from "fs/promises";
import path from "path";
import process from "process";
import { authenticate } from "@google-cloud/local-auth";
import { google } from "googleapis";

// If modifying these scopes, delete token.json.
const SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"];
// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = path.join(process.cwd(), "token.json");
const CREDENTIALS_PATH = path.join(process.cwd(), "credentials.json");

/**
 * Reads previously authorized credentials from the save file.
 *
 * @return {Promise<OAuth2Client|null>}
 */
async function loadSavedCredentialsIfExist() {
    console.log("loadSavedCredentialsIfExist()");
    try {
        const content = await fs.readFile(TOKEN_PATH);
        const credentials = JSON.parse(content);
        return google.auth.fromJSON(credentials);
    } catch (err) {
        return null;
    }
}

/**
 * Serializes credentials to a file comptible with GoogleAUth.fromJSON.
 *
 * @param {OAuth2Client} client
 * @return {Promise<void>}
 */
async function saveCredentials(client) {
    console.log("saveCredentials(client)");
    const content = await fs.readFile(CREDENTIALS_PATH);
    const keys = JSON.parse(content);
    const key = keys.installed || keys.web;
    const payload = JSON.stringify({
        type: "authorized_user",
        client_id: key.client_id,
        client_secret: key.client_secret,
        refresh_token: client.credentials.refresh_token,
    });
    await fs.writeFile(TOKEN_PATH, payload);
}

/**
 * Load or request or authorization to call APIs.
 *
 */
async function authorize() {
    console.log("authorize()");
    let client = await loadSavedCredentialsIfExist();
    if (client) {
        return client;
    }
    client = await authenticate({
        scopes: SCOPES,
        keyfilePath: CREDENTIALS_PATH,
    });
    if (client.credentials) {
        await saveCredentials(client);
    }
    return client;
}

function normalizeName(name) {
    // console.log("normalizeName(name)");
    return name.replace("CAH :", "CAH:").trim();
}

let packMap = {};
function rangeToDeck({ values }) {
    console.log("rangeToDeck({ values })");
    let header = values.shift();
    if (header[0] == "Prompt Cards") {
        return values.map((row) => {
            let name = normalizeName(row[2]);
            if (!packMap[name]) {
                packMap[name] = {
                    id: nanoid(),
                    official: !!row[3].match("CAH"),
                };
            }

            let pickCount = 1; // Default to 1 pick for black cards

            // Check for explicit pick count like {1}, {2}, etc.
            const explicitPickMatch = row[0].match(/\{(\d+)\}/);
            if (explicitPickMatch) {
                pickCount = parseInt(explicitPickMatch[1], 10);
            } else if (row[0] === "Make a haiku.") {
                // Special case for "Make a haiku."
                pickCount = 3;
            }
            // For other cards with underscores (e.g., "You want _? You can't handle _[SAME CARD AGAIN]_!"),
            // the default `pickCount = 1` handles them correctly as per the user's request.
            // The previous `picks.length` logic that caused the issue is removed.

            // console.log(`Processing card: "${row[0]}", calculated pickCount: ${pickCount}`); // Added for debugging

            // Replace all sequences of underscores with a single underscore for the card text.
            const cardText = replaceExoticChars(row[0].replace(/_+/g, "_"));

            return [
                packMap[name].id,
                cardText,
                pickCount,
            ];
        });
    }
    return values.map((row) => {
        let name = normalizeName(row[1]);
        if (!packMap[name]) {
            packMap[name] = { id: nanoid(), official: !!name.match("CAH") };
        }
        return [packMap[name].id, replaceExoticChars(row[0])];
    });
}

/**
 * Prints the names and majors of students in a sample spreadsheet:
 * @see https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit
 * @param {google.auth.OAuth2} auth The authenticated Google OAuth client.
 */
async function saveCardsToJSON(auth) { // Made async
    console.log("saveCardsToJSON(auth)");
    console.log("getting ranges...");
    const sheets = google.sheets({ version: "v4", auth });
    sheets.spreadsheets.values.batchGet(
        {
            spreadsheetId: "1lsy7lIwBe-DWOi2PALZPf5DgXHx9MEvKfRw1GaWQkzg",
            ranges: ["Master Cards List!A:E", "Master Cards List!G:J"],
        },
        async (err, ranges) => { // Made callback async
            if (err) return console.log("The API returned an error: " + err);
            console.log("parsing ranges...");
            let cards = ranges.data.valueRanges.map(rangeToDeck).flat();

            console.log("separating...");
            let packs = {};
            for (let name in packMap) {
                let pack = packMap[name];
                packs[pack.id] = {
                    name,
                    white: [],
                    black: [],
                    official: pack.official,
                };
            }

            let white = [];
            let black = [];
            let blackIndexes = [];
            let whiteIndexes = [];
            for (let card of cards) {
                if (!card[1]) {
                    continue;
                }
                const textLower = card[1].toLowerCase();
                if (card.length > 2) {
                    let index = blackIndexes.indexOf(textLower);
                    if (index === -1) {
                        black.push({
                            text: card[1],
                            pick: card[2],
                        });
                        index = blackIndexes.length;
                        blackIndexes.push(textLower);
                    }
                    packs[card[0]].black.push(index);
                } else {
                    let index = whiteIndexes.indexOf(textLower);
                    if (index === -1) {
                        white.push(card[1].trim());
                        index = whiteIndexes.length; // Corrected line
                        whiteIndexes.push(textLower);
                    }
                    packs[card[0]].white.push(index);
                }
            }

            console.log(
                `saving... (${white.length} white, ${black.length} black)`
            );

            try {
                await fs.writeFile( // Await the writeFile call
                    "./cah-all-compact.json", // Corrected path
                    JSON.stringify({ white, black, packs: Object.values(packs) })
                );
                console.log("cah-all-compact.json created successfully in the project root!");
            } catch (fileErr) {
                console.error("Error writing cah-all-compact.json:", fileErr);
            }
        }
    );
}

authorize().then(saveCardsToJSON).catch(console.error);