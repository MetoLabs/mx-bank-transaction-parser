import fs from 'fs/promises';
import path from 'path';
import { getParserForBank } from '../src/index.js';

// Map of bank to file extension
const fileTypes = {
    afirme: 'csv',
    banbajio: 'csv',
    banorte: 'txt',
    banregio: 'csv',
    bbva: 'txt',
    hsbc: 'xlsx',
    santander: 'csv',
    scotiabank: 'txt',
};

async function testParser() {
    const bankName = process.argv[2];

    if (!bankName) {
        console.error('Usage: node test/local-test.js <bank-name>');
        process.exit(1);
    }

    const ext = fileTypes[bankName.toLowerCase()];
    if (!ext) {
        console.error(`Unknown bank or unsupported file type for "${bankName}"`);
        process.exit(1);
    }

    const sampleFilePath = path.resolve(`./test/samples/${bankName}-sample.${ext}`);

    try {
        const fileContent = await fs.readFile(sampleFilePath, 'utf-8');
        const parser = getParserForBank(bankName);
        const transactions = parser.parse(fileContent);

        console.log(`Parsed ${transactions.length} transactions for ${bankName}:\n`);
        for (const [i, tx] of transactions.entries()) {
            console.log(`#${i + 1}:`, JSON.stringify(tx, null, 2));
        }
    } catch (err) {
        console.error(`Error testing parser for "${bankName}":`, err.message);
    }
}

testParser();
