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

// Define a temporary directory for caching sheet data
const TEMP_DIR = path.join(process.cwd(), "temp_sheet_data");

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
        client_secret: key.credentials.client_secret, // Corrected from key.client_secret
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

// Helper to convert A1 notation (e.g., "A1", "B10") to 0-indexed [row, col]
function a1ToRowCol(a1) {
    const colMatch = a1.match(/([A-Z]+)(\d+)/);
    if (!colMatch) {
        return [null, null];
    }
    let colStr = colMatch[1];
    let rowNum = parseInt(colMatch[2], 10);

    let col = 0;
    for (let i = 0; i < colStr.length; i++) {
        col = col * 26 + (colStr.charCodeAt(i) - 'A'.charCodeAt(0) + 1);
    }
    return [rowNum - 1, col - 1]; // Convert to 0-indexed
}


/**
 * Extracts cards for a single set based on precise location from the Index.
 * @param {Array<Array<string>>} sheetValues The raw data for the specific sheet.
 * @param {object} setInfo Object containing packId, packName, sheetName, startRow, startCol, endRow, promptCardsCount, responseCardsCount.
 * @returns {Array<Array<any>>} An array of parsed cards for this set, each as [packId, cardText, pickCount (if prompt), cardType].
 */
function extractCardsFromSetBlock(sheetValues, setInfo) {
    const cardsForSet = [];
    const { packId, packName, startRow, startCol, endRow, promptCardsCount, responseCardsCount } = setInfo;

    let mechanicLabelRow = -1;
    let promptLabelRow = -1; // Row where "Prompt" label is found
    let responseLabelRow = -1; // Row where "Response" label is found

    // --- DEBUGGING LOGS FOR SPECIFIC SETS ---
    const debugSets = [
        "CARDSETNAMEHERE",
        'CARDSETNAMEHERE'
    ];
    const isDebuggingThisSet = debugSets.includes(packName);

    if (isDebuggingThisSet) {
        console.log(`\n--- Debugging "${packName}" (Sheet: "${setInfo.sheetName}", Start: ${startRow + 1},${startCol + 1}, End: ${endRow + 1}) ---`);
        console.log(`Expected Prompt: ${promptCardsCount}, Expected Response: ${responseCardsCount}`);
    }
    // --- END DEBUGGING LOGS ---

    // Search downwards from the set's starting row in the assumed label column (startCol)
    // The search is bounded by the calculated endRow for this set.
    for (let r = startRow; r <= endRow && r < sheetValues.length; r++) {
        const row = sheetValues[r];
        if (row && row.length > startCol) {
            const cellContent = String(row[startCol] || '').trim().toLowerCase();

            // --- OVERRIDE FOR MISLABELED CARDS ---
            let effectiveLabel = cellContent;
            if (effectiveLabel === "line") {
                effectiveLabel = "mechanic";
            }
            if (packName === "PACKNAMEGOESHERE" && setInfo.sheetName === "Stand Alone Games") {
                if (r >= 5644 && r <= 5948) { effectiveLabel = "response"; }
            } else if (packName === "PACKNAMEGOESHERE" && setInfo.sheetName === "CAH Packs") {
                if (effectiveLabel === "prompt") { effectiveLabel = "response"; }
            }
            // --- END OVERRIDE ---

            if (effectiveLabel === "mechanic" && mechanicLabelRow === -1) {
                mechanicLabelRow = r;
                if (isDebuggingThisSet) console.log(`Found FIRST "Mechanic" label at row ${r + 1}, col ${startCol + 1}`);
            } else if (effectiveLabel === "prompt" && promptLabelRow === -1) { // Find the FIRST "Prompt" label
                promptLabelRow = r;
                if (isDebuggingThisSet) console.log(`Found FIRST "Prompt" label at row ${r + 1}, col ${startCol + 1}`);
            } else if (effectiveLabel === "response" && responseLabelRow === -1) { // Find the FIRST "Response" label
                responseLabelRow = r;
                if (isDebuggingThisSet) console.log(`Found FIRST "Response" label at row ${r + 1}, col ${startCol + 1}`);
            }
        }
    }

    if (isDebuggingThisSet) {
        if (mechanicLabelRow === -1) console.log("Did NOT find 'Mechanic' label.");
        if (promptLabelRow === -1) console.log("Did NOT find 'Prompt' label.");
        if (responseLabelRow === -1) console.log("Did NOT find 'Response' label.");
    }

    // Extract Mechanic Cards (dynamic count until empty cell or new label is found)
    if (mechanicLabelRow !== -1) {
        let currentMechanicCardCount = 0;
        // Start from mechanicLabelRow, and continue as long as conditions are met
        for (let r = mechanicLabelRow; r <= endRow && r < sheetValues.length; r++) {
            const cardRow = sheetValues[r];
            const labelCellContent = (cardRow && cardRow.length > startCol) ? String(cardRow[startCol] || '').trim().toLowerCase() : '';
            const cardText = (cardRow && cardRow.length > startCol + 1) ? String(cardRow[startCol + 1] || '').trim() : '';

            // Normalize "line" to "mechanic"
            const effectiveLabel = labelCellContent === "line" ? "mechanic" : labelCellContent;

            // Stop conditions:
            // 1. We encounter a 'set' label in the label column
            if (effectiveLabel === "set") {
                if (isDebuggingThisSet) console.log(`  Mechanic Card (Row ${r + 1}, Col ${startCol + 1}): (Stopping due to label "${effectiveLabel}")`);
                break;
            }

            // Skip conditions:
            // 1. Card text is empty
            if (cardText === '') {
                if (isDebuggingThisSet) console.log(`  Mechanic Card (Row ${r + 1}, Col ${startCol + 2}): (Card text was empty, skipping)`);
                continue;
            }

            // Only add if there's actual card text and the label is "mechanic"
            if (cardText && effectiveLabel === "mechanic") {
                cardsForSet.push([
                    packId,
                    replaceExoticChars(cardText),
                    null, // Mechanic cards don't have a pick count
                    'mechanic'
                ]);
                currentMechanicCardCount++;
                if (isDebuggingThisSet) console.log(`  Mechanic Card ${currentMechanicCardCount} (Row ${r + 1}, Col ${startCol + 2}): "${cardText}"`);
            } else if (isDebuggingThisSet && labelCellContent !== "mechanic") {
                console.log(`  Mechanic Card (Row ${r + 1}, Col ${startCol + 2}): (Skipping - label is not "mechanic")`);
            }
        }
        if (isDebuggingThisSet) console.log(`Extracted ${currentMechanicCardCount} Mechanic cards.`);
    }


    // Extract Prompt Cards (fixed count, but with break conditions and mechanic handling)
    if (promptCardsCount > 0 && promptLabelRow !== -1) {
        let extractedPromptCards = 0; // Counter for actual prompt cards extracted in this block
        for (let r = promptLabelRow; extractedPromptCards < promptCardsCount && r <= endRow && r < sheetValues.length; r++) {
            const cardRow = sheetValues[r];
            const labelCellContent = (cardRow && cardRow.length > startCol) ? String(cardRow[startCol] || '').trim().toLowerCase() : '';
            const cardText = (cardRow && cardRow.length > startCol + 1) ? String(cardRow[startCol + 1] || '').trim() : '';

            // --- OVERRIDE FOR MISLABELED CARDS ---
            let effectiveLabel = labelCellContent;
            if (packName === "PACKNAMEGOESHERE" && setInfo.sheetName === "Stand Alone Games") {
                if (r >= 5644 && r <= 5948) { effectiveLabel = "response"; }
            } else if (packName === "PACKNAMEGOESHERE" && setInfo.sheetName === "CAH Packs") {
                if (effectiveLabel === "prompt") { effectiveLabel = "response"; }
            }
            // --- END OVERRIDE ---

            // Hard stop conditions for the prompt block
            // Stop if we hit a set label
            if (effectiveLabel === "set") {
                if (isDebuggingThisSet) console.log(`  Prompt Card (Row ${r + 1}, Col ${startCol + 1}): (Stopping prompt extraction due to label "${effectiveLabel}")`);
                break;
            }

            // Skip conditions:
            // 1. Card text is empty
            if (cardText === '') {
                if (isDebuggingThisSet) console.log(`  Prompt Card (Row ${r + 1}, Col ${startCol + 2}): (Card text was empty, skipping)`);
                continue;
            }
            // Skip if we hit a mechanic label
            if (effectiveLabel === "mechanic") {
                if (isDebuggingThisSet) console.log(`  Prompt Card (Row ${r + 1}, Col ${startCol + 1}): (Skipping mechanic label "${effectiveLabel}")`);
                continue;
            }

            // If it's an actual prompt card
            if (effectiveLabel === "prompt") {
                if (cardText) {
                    let pickCount = 1;
                    const explicitPickMatch = cardText.match(/\{(\d+)\}/);
                    if (explicitPickMatch) {
                        pickCount = parseInt(explicitPickMatch[1], 10);
                    } else if (cardRow[startCol + 2]) {
                        const pickContent = String(cardRow[startCol + 2]).trim().toUpperCase();
                        const pickMatch = pickContent.match(/PICK\s+(\d+)/);
                        if (pickMatch) {
                            pickCount = parseInt(pickMatch[1], 10);
                        } else if (pickContent === "PICK") {
                            const pickValue = parseInt(cardRow[startCol + 3], 10);
                            if (!isNaN(pickValue) && pickValue > 0) {
                                pickCount = pickValue;
                            }
                        }
                    } else if (cardText === "Make a haiku.") {
                        pickCount = 3;
                    }
                    cardsForSet.push([
                        packId,
                        replaceExoticChars(cardText.replace(/_+/g, "_")),
                        pickCount,
                        'prompt'
                    ]);
                    if (isDebuggingThisSet) console.log(`  Prompt Card ${extractedPromptCards + 1} (Row ${r + 1}, Col ${startCol + 2}): "${cardText}"`);
                    extractedPromptCards++;
                } else if (isDebuggingThisSet) {
                    console.log(`    (Card text was empty, skipping)`);
                }
            } else if (isDebuggingThisSet) {
                console.log(`  Prompt Card (Row ${r + 1}, Col ${startCol + 1}): (Skipping unexpected label "${effectiveLabel}")`);
            }
        }
        if (isDebuggingThisSet) console.log(`Extracted ${extractedPromptCards} Prompt cards in Prompt block.`);
    }


    // Extract Response Cards (fixed count, but with break conditions and mechanic handling)
    if (responseCardsCount > 0 && responseLabelRow !== -1) {
        let extractedResponseCards = 0; // Counter for actual response cards extracted in this block
        for (let r = responseLabelRow; extractedResponseCards < responseCardsCount && r <= endRow && r < sheetValues.length; r++) {
            const cardRow = sheetValues[r];
            const labelCellContent = (cardRow && cardRow.length > startCol) ? String(cardRow[startCol] || '').trim().toLowerCase() : '';
            const cardText = (cardRow && cardRow.length > startCol + 1) ? String(cardRow[startCol + 1] || '').trim() : '';

            // --- OVERRIDE FOR MISLABELED CARDS ---
            let effectiveLabel = labelCellContent;
            if (packName === "PACKNAMEGOESHERE" && setInfo.sheetName === "Stand Alone Games") {
                if (r >= 5644 && r <= 5948) { effectiveLabel = "response"; }
            } else if (packName === "PACKNAMEGOESHERE" && setInfo.sheetName === "CAH Packs") {
                if (effectiveLabel === "prompt") { effectiveLabel = "response"; }
            }
            // --- END OVERRIDE ---

            // Hard stop conditions for the response block
            // Stop if we hit a set label
            if (effectiveLabel === "set") {
                if (isDebuggingThisSet) console.log(`  Response Card (Row ${r + 1}, Col ${startCol + 1}): (Stopping response extraction due to label "${effectiveLabel}")`);
                break;
            }

            // Skip conditions:
            // 1. Card text is empty
            if (cardText === '') {
                if (isDebuggingThisSet) console.log(`  Response Card (Row ${r + 1}, Col ${startCol + 2}): (Card text was empty, skipping)`);
                continue;
            }
            // Skip if we hit a mechanic label
            if (effectiveLabel === "mechanic") {
                if (isDebuggingThisSet) console.log(`  Response Card (Row ${r + 1}, Col ${startCol + 1}): (Skipping mechanic label "${effectiveLabel}")`);
                continue;
            }

            // If it's an actual response card
            if (effectiveLabel === "response") {
                if (cardText) {
                    cardsForSet.push([
                        packId,
                        replaceExoticChars(cardText),
                        null, // Response cards don't have a pick count
                        'response'
                    ]);
                    if (isDebuggingThisSet) console.log(`  Response Card ${extractedResponseCards + 1} (Row ${r + 1}, Col ${startCol + 2}): "${cardText}"`);
                    extractedResponseCards++;
                } else if (isDebuggingThisSet) {
                    console.log(`    (Card text was empty, skipping)`);
                }
            } else if (isDebuggingThisSet) {
                console.log(`  Response Card (Row ${r + 1}, Col ${startCol + 1}): (Skipping unexpected label "${effectiveLabel}")`);
            }
        }
        if (isDebuggingThisSet) console.log(`Extracted ${extractedResponseCards} Response cards in Response block.`);
    }
    if (isDebuggingThisSet) console.log(`--- End Debugging "${packName}" ---`);

    return cardsForSet;
}


const SPREADSHEET_ID = "1Pp04v9plwiJwg8u-DrCHd4Fsf9ro3NhxOvISwc0bC4Y"; // Your main spreadsheet ID

async function saveCardsToJSON(auth) {
    console.log("saveCardsToJSON(auth)");
    const sheets = google.sheets({ version: "v4", auth });

    // Ensure the temporary directory exists
    await fs.mkdir(TEMP_DIR, { recursive: true });

    // Step 1: Fetch the Index sheet (with caching)
    console.log("Fetching Index sheet...");
    let indexRows = [];
    const indexCachePath = path.join(TEMP_DIR, "Index.json");

    try {
        const cachedIndex = await fs.readFile(indexCachePath, 'utf8');
        indexRows = JSON.parse(cachedIndex);
        console.log("Index sheet data loaded from cache.");
    } catch (readErr) {
        // If cache read fails, fetch from API
        try {
            const indexResponse = await sheets.spreadsheets.values.get({
                spreadsheetId: SPREADSHEET_ID,
                range: "Index!A:H", // Assuming the index sheet is named "Index" and covers columns A to H
            });
            indexRows = indexResponse.data.values;
            console.log("Index sheet data fetched from API.");
            await fs.writeFile(indexCachePath, JSON.stringify(indexRows), 'utf8');
            console.log("Index sheet data saved to cache.");
        } catch (apiErr) {
            console.error("Error fetching Index sheet from API: " + apiErr);
            return;
        }
    }

    if (!indexRows || indexRows.length === 0) {
        console.log("No data found in the Index sheet.");
        return;
    }
    console.log("Index sheet data processed.");


    // Step 2: Parse Index Data and prepare set information with endRow
    let setsToProcess = [];
    const SET_NAME_COL_INDEX = 0;
    const SHEET_NAME_COL_INDEX = 2;
    const STARTING_CELL_COL_INDEX = 4;
    const MECHANIC_CARDS_COUNT_COL_INDEX = 5;
    const PROMPT_CARDS_COUNT_COL_INDEX = 6; // 6 for New Spreadsheet, 5 for Old
    const RESPONSE_CARDS_COUNT_COL_INDEX = 7; // 7 for New Spreadsheet, 6 for Old

    for (let i = 1; i < indexRows.length; i++) { // Skip header row
        const row = indexRows[i];
        if (!row || row.length < RESPONSE_CARDS_COUNT_COL_INDEX + 1) {
            continue; // Skip empty or incomplete rows
        }

        const setName = String(row[SET_NAME_COL_INDEX] || '').trim();
        let sheetName = String(row[SHEET_NAME_COL_INDEX] || '').trim(); // Use let for potential override
        let startingCell = String(row[STARTING_CELL_COL_INDEX] || '').trim(); // Use let for potential override
        let mechanicCardsCount = parseInt(row[MECHANIC_CARDS_COUNT_COL_INDEX] || '0', 10); // Use let for potential override
        let promptCardsCount = parseInt(row[PROMPT_CARDS_COUNT_COL_INDEX] || '0', 10); // Use let for potential override
        let responseCardsCount = parseInt(row[RESPONSE_CARDS_COUNT_COL_INDEX] || '0', 10); // Use let for potential override

        // --- MANUAL OVERRIDES FOR STARTING CELLS ---
        if (setName === "SETNAMEGOESHERE") {
            console.log(`Overriding Starting Cell for "${setName}" from "${startingCell}" to "REPLACEME".`);
            startingCell = "REPLACEME"; // Corrected starting cell
        } else if (setName === "SETNAMEGOESHERE") {
            console.log(`Overriding Starting Cell for "${setName}" from "${startingCell}" to "REPLACEME".`);
            startingCell = "REPLACEME";
        }
        // --- END MANUAL OVERRIDES ---

        // --- MANUAL OVERRIDES FOR CARD COUNTS ---
        if (setName === "SETNAMEGOESHERE") {
            console.log(`Overriding Response Cards Count for "${setName}" from ${responseCardsCount} to 319.`);
            responseCardsCount = 319;
        } else if (setName === "SETNAMEGOESHERE") {
            console.log(`Overriding Response Cards Count for "${setName}" from ${responseCardsCount} to 159.`);
            responseCardsCount = 159;
        }
        // --- END MANUAL OVERRIDES FOR CARD COUNTS ---


        if (setName && sheetName && startingCell && (promptCardsCount > 0 || responseCardsCount > 0)) {
            const normalizedSetName = normalizeName(setName);

            // Determine official status based on sheetName
            const isOfficial = sheetName.startsWith("CAH");

            if (!packMap[normalizedSetName]) {
                packMap[normalizedSetName] = {
                    id: nanoid(),
                    official: isOfficial,
                    sheetName: sheetName, // Store the sheet name here
                };
            }

            const [startRowIndex, startColIndex] = a1ToRowCol(startingCell);
            if (startRowIndex === null || startColIndex === null) {
                console.warn(`Invalid Starting Cell format for set "${setName}": ${startingCell}. Skipping.`);
                continue;
            }

            // Filter out non-sheet names or problematic names from the Index's Sheet column
            if (sheetName &&
                !sheetName.includes("not available") &&
                !sheetName.includes("transcribed") &&
                !sheetName.includes("Rebranded") &&
                sheetName !== "Updates" && // Explicitly exclude "Updates"
                sheetName !== "currently not avaiable" && // Typo in original list
                sheetName !== "PDF purchased; pending transcription" &&
                sheetName !== "PDF purchased, pending transcription"
            ) {
                setsToProcess.push({
                    packId: packMap[normalizedSetName].id,
                    packName: normalizedSetName,
                    sheetName: sheetName,
                    startRow: startRowIndex,
                    startCol: startColIndex,
                    mechanicCardsCount: mechanicCardsCount,
                    promptCardsCount: promptCardsCount,
                    responseCardsCount: responseCardsCount,
                    endRow: -1, // Will be calculated later
                });
            } else {
                console.log(`Skipping set "${setName}" due to problematic sheet name "${sheetName}" from Index.`);
            }
        }
    }

    // Sort setsToProcess to correctly calculate endRow for each set
    // Group by sheetName, then sort by startCol, then by startRow
    const setsBySheetAndCol = {};
    for (const set of setsToProcess) {
        if (!setsBySheetAndCol[set.sheetName]) {
            setsBySheetAndCol[set.sheetName] = {};
        }
        if (!setsBySheetAndCol[set.sheetName][set.startCol]) {
            setsBySheetAndCol[set.sheetName][set.startCol] = [];
        }
        setsBySheetAndCol[set.sheetName][set.startCol].push(set);
    }

    // Calculate endRow for each set within its column
    const finalSetsToProcess = [];
    for (const sheetName in setsBySheetAndCol) {
        for (const startCol in setsBySheetAndCol[sheetName]) {
            const setsInColumn = setsBySheetAndCol[sheetName][startCol].sort((a, b) => a.startRow - b.startRow);
            for (let i = 0; i < setsInColumn.length; i++) {
                const currentSet = setsInColumn[i];
                const nextSetInColumn = setsInColumn[i + 1];

                if (nextSetInColumn) {
                    // The endRow for the current set is the row BEFORE the next set's startRow
                    currentSet.endRow = nextSetInColumn.startRow - 1;
                } else {
                    // If it's the last set in this column, its endRow will be capped by the actual sheet's last row.
                    currentSet.endRow = 99999; // A very large number, will be capped by actual sheet length
                }
                finalSetsToProcess.push(currentSet);
            }
        }
    }
    setsToProcess = finalSetsToProcess; // Replace the original array with the one containing calculated endRows

    console.log(`Identified ${setsToProcess.length} sets from Index to extract cards.`);


    // Step 3: Fetch all data for each unique sheet mentioned in setsToProcess (with caching)
    const uniqueSheetNamesToFetch = new Set(setsToProcess.map(set => set.sheetName));
    const allSheetData = {}; // To store raw data for each sheet

    for (const sheetName of uniqueSheetNamesToFetch) {
        const sheetCachePath = path.join(TEMP_DIR, `${sheetName}.json`);
        let sheetValues = [];

        try {
            const cachedSheet = await fs.readFile(sheetCachePath, 'utf8');
            sheetValues = JSON.parse(cachedSheet);
            console.log(`Loaded data for sheet "${sheetName}" from cache.`);
        } catch (readErr) {
            // If cache read fails, fetch from API
            console.log(`Fetching all data from sheet: "${sheetName}" from API...`);
            try {
                const sheetDataResponse = await sheets.spreadsheets.values.get({
                    spreadsheetId: SPREADSHEET_ID,
                    range: `${sheetName}!A:ZZ`, // Fetch a very wide range to capture horizontal data
                });
                sheetValues = sheetDataResponse.data.values || [];
                console.log(`Fetched ${sheetValues.length} rows from "${sheetName}".`);
                await fs.writeFile(sheetCachePath, JSON.stringify(sheetValues), 'utf8');
                console.log(`Data for sheet "${sheetName}" saved to cache.`);
            } catch (apiErr) {
                console.warn(`Could not fetch data from sheet "${sheetName}" from API: ${apiErr.message}`);
            }
        }
        allSheetData[sheetName] = sheetValues;
    }

    // Step 4: Extract cards for each set using the precise location from Index
    console.log("Extracting cards based on Index data...");
    let allParsedCards = []; // Each card will be [packId, cardText, pickCount, cardType]

    for (const setInfo of setsToProcess) {
        const sheetValues = allSheetData[setInfo.sheetName];
        if (!sheetValues || sheetValues.length === 0) {
            console.warn(`Sheet "${setInfo.sheetName}" not found or empty for set "${setInfo.packName}". Skipping card extraction for this set.`);
            continue;
        }

        // Cap the endRow for the last set on a sheet to the actual sheet's last row
        if (setInfo.endRow === 99999) {
            setInfo.endRow = sheetValues.length - 1;
        }

        const cardsFromSet = extractCardsFromSetBlock(sheetValues, setInfo);
        allParsedCards = allParsedCards.concat(cardsFromSet);
        // console.log(`Extracted ${cardsFromSet.length} cards for set "${setInfo.packName}" from sheet "${setInfo.sheetName}".`);
    }
    console.log(`Total cards extracted: ${allParsedCards.length}`);

    // Step 5: Validate extracted card counts against Index data
    console.log("\n--- Validating Extracted Card Counts ---");
    const actualCardCounts = {}; // { packId: { prompt: count, response: count, mechanic: count } }

    for (const card of allParsedCards) {
        const packId = card[0];
        const cardType = card[3]; // 'prompt', 'response', 'mechanic'

        if (!actualCardCounts[packId]) {
            actualCardCounts[packId] = { prompt: 0, response: 0, mechanic: 0 };
        }
        // Count actual prompt, response, and mechanic cards separately
        actualCardCounts[packId][cardType]++;
    }

    let discrepanciesFound = false;

    for (const setInfo of setsToProcess) {
        const actual = actualCardCounts[setInfo.packId] || { prompt: 0, response: 0, mechanic: 0 };

        const expectedMechanicCount = setInfo.mechanicCardsCount;
        const expectedPromptCount = setInfo.promptCardsCount;
        const expectedResponseCount = setInfo.responseCardsCount;
        const expectedTotalCards = expectedMechanicCount + expectedPromptCount + expectedResponseCount;

        const actualPromptCount = actual.prompt;
        const actualResponseCount = actual.response;
        const actualMechanicCount = actual.mechanic;

        const actualTotalCardsExcludingMechanics = actualPromptCount + actualResponseCount;
        const actualTotalCardsIncludingMechanics = actualPromptCount + actualResponseCount + actualMechanicCount;

        // A discrepancy is flagged if any of the counts (Prompt, Response, or Mechanic) mismatch the expected values from the Index.
        const promptMismatch = expectedPromptCount !== actualPromptCount;
        const responseMismatch = expectedResponseCount !== actualResponseCount;
        const mechanicMismatch = expectedMechanicCount !== actualMechanicCount;
        const totalMismatch = expectedTotalCards !== actualTotalCardsIncludingMechanics;

        if (promptMismatch || responseMismatch || mechanicMismatch || totalMismatch) {
            discrepanciesFound = true;
            let warningMsg = `DISCREPANCY for "${setInfo.packName}" (Sheet: "${setInfo.sheetName}", Start: ${setInfo.startRow + 1},${setInfo.startCol + 1}, End: ${setInfo.endRow + 1}):\n`;
            
            warningMsg += `  Mechanic: Expected ${expectedMechanicCount}, Found ${actualMechanicCount}${mechanicMismatch ? ' <---' : ''}\n`;
            warningMsg += `  Prompt:   Expected ${expectedPromptCount}, Found ${actualPromptCount}${promptMismatch ? ' <---' : ''}\n`;
            warningMsg += `  Response: Expected ${expectedResponseCount}, Found ${actualResponseCount}${responseMismatch ? ' <---' : ''}\n`;
            
            if (totalMismatch) {
                warningMsg += `  TOTAL:    Expected ${expectedTotalCards}, Found ${actualTotalCardsIncludingMechanics} (Prompt+Response+Mechanic) <---`;
            }

            // Specific hint for index errors
            if (promptMismatch && mechanicMismatch && (actualPromptCount + actualMechanicCount === expectedPromptCount)) {
                warningMsg += `\n  HINT: The Index "Prompt" count seems to include Mechanic cards. Update Index Prompt to ${actualPromptCount} and Mechanic to ${actualMechanicCount}.`;
            }

            console.warn(warningMsg);
        }
    }
    if (!discrepanciesFound) {
        console.log("All extracted card counts match the Index data!");
    }
    console.log("----------------------------------------\n");


    // Step 6: Separate and index cards, then save to JSON
    console.log("Separating and indexing cards...");
    let packs = {};
    // Re-populate packs based on packMap which was updated during parsing
    for (let name in packMap) {
        let pack = packMap[name];
        packs[pack.id] = {
            name,
            white: [],
            black: [], // Black cards are now only 'prompt' type
            mechanic: [], // New array for mechanic cards
            official: pack.official,
            sheetName: pack.sheetName, // Added sheetName to the pack object
        };
    }

    let white = [];
    let black = []; // Will contain only prompt cards
    let mechanic = []; // Will contain mechanic cards

    let blackIndexes = new Set(); // Use Set for efficient deduplication of lowercased text
    let whiteIndexes = new Set(); // Use Set for efficient deduplication of lowercased text
    let mechanicIndexes = new Set(); // Use Set for efficient deduplication of lowercased text

    let finalBlackCards = []; // To store unique black card objects
    let finalWhiteCards = []; // To store unique white card strings
    let finalMechanicCards = []; // To store unique mechanic card strings

    for (let card of allParsedCards) {
        if (!card[1]) { // Skip if card text is empty
            continue;
        }
        const textLower = String(card[1]).toLowerCase();
        const cardType = card[3];

        if (cardType === 'prompt') {
            // Check if this exact card (text + pick) already exists in our final list
            const existingBlackCardIndex = finalBlackCards.findIndex(bc =>
                String(bc.text).toLowerCase() === textLower && bc.pick === card[2]
            );

            let cardIndex;
            if (existingBlackCardIndex === -1) {
                finalBlackCards.push({
                    text: card[1],
                    pick: card[2],
                });
                cardIndex = finalBlackCards.length - 1;
            } else {
                cardIndex = existingBlackCardIndex;
            }

            if (packs[card[0]]) {
                packs[card[0]].black.push(cardIndex);
            } else {
                console.warn(`Pack ID ${card[0]} not found for prompt card: ${card[1]}`);
            }

        } else if (cardType === 'response') {
            let cardIndex;
            const existingWhiteCardIndex = finalWhiteCards.findIndex(wc =>
                String(wc).toLowerCase() === textLower
            );

            if (existingWhiteCardIndex === -1) {
                finalWhiteCards.push(String(card[1]).trim());
                cardIndex = finalWhiteCards.length - 1;
            } else {
                cardIndex = existingWhiteCardIndex;
            }

            if (packs[card[0]]) {
                packs[card[0]].white.push(cardIndex);
            } else {
                console.warn(`Pack ID ${card[0]} not found for white card: ${card[1]}`);
            }
        } else if (cardType === 'mechanic') {
            let cardIndex;
            const existingMechanicCardIndex = finalMechanicCards.findIndex(mc =>
                String(mc).toLowerCase() === textLower
            );

            if (existingMechanicCardIndex === -1) {
                finalMechanicCards.push(String(card[1]).trim());
                cardIndex = finalMechanicCards.length - 1;
            } else {
                cardIndex = existingMechanicCardIndex;
            }

            if (packs[card[0]]) {
                packs[card[0]].mechanic.push(cardIndex);
            } else {
                console.warn(`Pack ID ${card[0]} not found for mechanic card: ${card[1]}`);
            }
        }
    }

    console.log(
        `saving... (${finalWhiteCards.length} white, ${finalBlackCards.length} black, ${finalMechanicCards.length} mechanic)`
    );

    try {
        await fs.writeFile(
            "./cah-all-compact.json",
            JSON.stringify({ white: finalWhiteCards, black: finalBlackCards, mechanic: finalMechanicCards, packs: Object.values(packs) }, null, 2) // Added null, 2 for pretty printing
        );
        console.log("cah-all-compact.json created successfully in the project root!");
    } catch (fileErr) {
        console.error("Error writing cah-all-compact.json:", fileErr);
    }
}

authorize().then(saveCardsToJSON).catch(console.error);