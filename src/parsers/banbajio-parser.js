import { Transaction } from '../models/transaction.js';

export class BanBajioParser {
    /**
     * Parses the entire BanBajio CSV file content.
     *
     * @param {string} fileContent - Full CSV content as string.
     * @returns {Transaction[]} Array of transactions.
     */
    parse(fileContent) {
        const lines = fileContent
            .split(/\r?\n/)
            .map(line => line.trim())
            .filter(line => line.length > 0);

        // Skip the first two lines (metadata + headers)
        const dataLines = lines.slice(2);

        return dataLines
            .map(line => this.parseLine(line))
            .filter(Boolean);
    }

    /**
     * Parses a single CSV line of BanBajio transaction.
     *
     * @param {string} line - CSV line string.
     * @returns {Transaction|null}
     */
    parseLine(line) {
        // Split by comma, but beware description may contain commas or pipes.
        // Let's split into exactly 8 fields by limit split:
        // Index, Date, Time, Receipt, Description, Charges, Credits, Balance

        // A naive split on comma might break Description if it contains commas.
        // But from sample, the first 4 fields are fixed-length,
        // So we can split first 5 commas to get 6 fields, then last 2 fields.

        const parts = this._splitCsvWithLimit(line, 7);
        if (parts.length < 8) return null;

        const [
            index,
            dateStr,
            timeStr,
            receipt,
            description,
            chargesStr,
            creditsStr,
            balanceStr,
        ] = parts;

        const date = this._formatDateTime(dateStr, timeStr);
        const charges = this._parseMoney(chargesStr);
        const credits = this._parseMoney(creditsStr);
        const balance = this._parseMoney(balanceStr);
        const amount = credits !== 0 ? credits : -charges;

        return new Transaction({
            date,
            type: credits !== 0 ? 'credit' : 'debit',
            amount,
            balance,
            reference: receipt,
            account: null, // No account in sample
            description,
            bank: 'BanBajio',
            raw: line,
        });
    }

    /**
     * Splits a CSV line string into parts with a maximum number of splits,
     * so description with commas won't break field alignment.
     *
     * @param {string} line
     * @param {number} limit - Max splits (max fields - 1)
     * @returns {string[]}
     */
    _splitCsvWithLimit(line, limit) {
        const parts = [];
        let lastIndex = 0;
        let count = 0;

        for (let i = 0; i < line.length; i++) {
            if (line[i] === ',' && count < limit) {
                parts.push(line.substring(lastIndex, i));
                lastIndex = i + 1;
                count++;
            }
        }
        parts.push(line.substring(lastIndex));
        return parts;
    }

    /**
     * Parses money strings like "58928.00" into number.
     *
     * @param {string} str
     * @returns {number}
     */
    _parseMoney(str) {
        if (!str) return 0;
        // Remove commas and parse float
        return parseFloat(str.replace(/,/g, '')) || 0;
    }

    /**
     * Converts date and time strings into ISO 8601 date-time string.
     *
     * @param {string} dateStr - e.g. "28-Nov-2024"
     * @param {string} timeStr - e.g. "09:33:24"
     * @returns {string} ISO date-time string "YYYY-MM-DDTHH:mm:ss"
     */
    _formatDateTime(dateStr, timeStr) {
        // Convert DD-MMM-YYYY (like 28-Nov-2024) to YYYY-MM-DD
        const months = {
            Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
            Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
        };
        const [day, mon, year] = dateStr.split('-');
        const monthNum = months[mon] || '01';

        // Combine into ISO 8601
        return `${year}-${monthNum}-${day.padStart(2, '0')}T${timeStr}`;
    }
}
