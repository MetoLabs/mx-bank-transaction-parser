import { Transaction } from '../models/transaction.js';

export class ScotiabankParser {
    /**
     * Parses Scotiabank fixed-width format content
     *
     * @param {string} fileContent
     * @returns {Transaction[]}
     */
    parse(fileContent) {
        const lines = fileContent
            .split(/\r?\n/)
            .map(line => line.trim())
            .filter(line => line && this._looksLikeTransaction(line));

        return lines
            .map(line => this.parseRow(line))
            .filter(Boolean);
    }

    /**
     * Parses a single transaction line with fixed-width format
     *
     * @param {string} line
     * @returns {Transaction|null}
     */
    parseRow(line) {
        try {
            const segments = {
                recordType: line.substring(0, 6),
                accountNumber: line.substring(6, 26),
                date: line.substring(26, 36),
                reference: line.substring(36, 46),
                amount: line.substring(46, 63),
                operationType: line.substring(63, 68),
                balance: line.substring(68, 85),
                description: line.substring(85),
            };

            if (segments.recordType !== 'CHQMXN') return null;

            const date = this._formatDate(segments.date);
            const amount = this._parseNumber(segments.amount);
            const balance = this._parseNumber(segments.balance);
            const type = segments.operationType.toLowerCase().includes('abono') ? 'credit' : 'debit';

            const descriptionInfo = this._parseDescription(segments.description);

            return new Transaction({
                date,
                type,
                amount: type === 'credit' ? amount : -amount,
                balance,
                reference: segments.reference.trim(),
                account: segments.accountNumber.trim(),
                description: descriptionInfo.description,
                bank: {
                    id: '044',
                    code: '40044',
                    name: 'SCOTIABANK',
                },
                raw: JSON.stringify({ segments, descriptionInfo }),
            });
        } catch (error) {
            console.error('Error parsing Scotiabank line:', error, line);
            return null;
        }
    }

    /**
     * Parses the description field to extract meaningful information
     *
     * @param {string} description
     * @returns {Object}
     */
    _parseDescription(description) {
        let cleanDescription = description;

        if (description.includes('TRANSF. INTERBANCARIA SPEI') ||
            description.includes('TRANSF INTERBANCARIA SPEI')) {

            const mainConcept = description.split('SPEI')[1]?.split(/\s+/).slice(1, 4).join(' ').trim() || '';

            const bankMatch = description.match(/SANTANDER|BBVA MEXICO|BANORTE|AFIRME|SCOTIABANK|KUSPIT/i);
            const bank = bankMatch ? bankMatch[0] : '';

            const nameMatch = description.match(/([A-Z][A-Z\s]+\/)?([A-Z][A-Z\s\/]+SA DE CV|[A-Z][A-Z\s]+\/[A-Z])/);
            const beneficiary = nameMatch ? nameMatch[0].replace(/\//g, ' ').trim() : '';

            cleanDescription = `SPEI ${bank} ${mainConcept} ${beneficiary}`.trim().replace(/\s+/g, ' ');
        }

        return {
            description: cleanDescription,
            rawDescription: description
        };
    }

    /**
     * Filters out non-transaction lines
     *
     * @param {string} line
     * @returns {boolean}
     */
    _looksLikeTransaction(line) {
        return line.startsWith('CHQMXN');
    }

    /**
     * Parses number string to float
     *
     * @param {string} str
     * @returns {number}
     */
    _parseNumber(str) {
        if (!str || str.trim() === '') return 0;
        const cleanStr = str.replace(/^0+/, '');
        return parseFloat(cleanStr) || 0;
    }

    /**
     * Converts YYYY/MM/DD to YYYY-MM-DD
     *
     * @param {string} input
     * @returns {string}
     */
    _formatDate(input) {
        if (!input || input.length !== 10) return input;
        return input.replace(/\//g, '-');
    }
}