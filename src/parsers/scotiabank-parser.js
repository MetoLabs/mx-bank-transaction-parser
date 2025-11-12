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
                description: line.substring(135, 165),
                extra: line.substring(85),
            };

            if (segments.recordType !== 'CHQMXN') return null;

            const date = this._formatDate(segments.date);
            const amount = this._parseNumber(segments.amount);
            const balance = this._parseNumber(segments.balance);
            const type = segments.operationType.toLowerCase().includes('abono') ? 'credit' : 'debit';

            const descriptionInfo = this._parseDescription(segments.description, line, type);

            return new Transaction({
                date,
                type,
                amount: type === 'credit' ? amount : -amount,
                balance,
                reference: segments.reference.trim(),
                accountNumber: segments.accountNumber.trim().replace(/^0+/g, '') || null,
                description: descriptionInfo.actualDescription,
                beneficiary: descriptionInfo.beneficiary,
                trackingKey: descriptionInfo.trackingKey,
                time: descriptionInfo.time,
                concept: descriptionInfo.concept,
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
     * Parses the description field to extract meaningful information using fixed positions
     *
     * @param {string} description - Main description from columns 135-165
     * @param {string} fullLine - Full line for hour extraction
     * @param {string} type
     * @returns {Object}
     */
    _parseDescription(description, fullLine, type) {
        const result = {
            description: description.trim(),
            actualDescription: description.trim(),
            beneficiary: null,
            trackingKey: null,
            time: null,
            concept: null,
            rawDescription: description
        };

        try {
            result.concept = description.trim();
            result.actualDescription = result.concept;

            if (fullLine.includes('TRANSF. INTERBANCARIA SPEI') ||
                fullLine.includes('TRANSF INTERBANCARIA SPEI')) {

                if (type === 'credit') {
                    const extracted = this._extractSpeiReceived(fullLine);
                    result.beneficiary = extracted.beneficiary;
                    result.trackingKey = extracted.trackingKey;
                    result.time = extracted.time;
                } else {
                    const extracted = this._extractSpeiSent(fullLine);
                    result.beneficiary = extracted.beneficiary;
                    result.trackingKey = extracted.trackingKey;
                    result.time = extracted.time;
                }
            }

        } catch (error) {
            console.warn('Error parsing Scotiabank description:', error, description);
        }

        return result;
    }

    /**
     * Extracts information from SPEI received transactions (credit)
     */
    _extractSpeiReceived(fullLine) {
        const result = {
            beneficiary: null,
            trackingKey: null,
            time: null
        };

        const timeMatch = fullLine.match(/(\d{2}:\d{2}:\d{2})/);
        if (timeMatch) {
            result.time = timeMatch[1];
        }

        const trackingPatterns = [
            /(MBAN\d{20})/,
            /(BNET\d{20})/,
            /(8846APR[12]\d{17})/,
            /(7875APR[12]\d{17})/,
            /(241\d{12}\d+)/,
            /(\d{20,30})/
        ];

        for (const pattern of trackingPatterns) {
            const match = fullLine.match(pattern);
            if (match) {
                result.trackingKey = match[1];
                break;
            }
        }

        if (fullLine.length >= 250) {
            const beneficiarySection = fullLine.substring(200);
            const beneficiaryMatch = beneficiarySection.match(/([A-Z][A-Z\s\.\(\)\&]+?SA DE CV|[A-Z][A-Z\s\.\(\)\&]+?(?=\/|\d|$))/);
            if (beneficiaryMatch) {
                result.beneficiary = beneficiaryMatch[1].trim();
            }
        }

        if (!result.beneficiary) {
            const beneficiaryMatch = fullLine.match(/\/([A-Z][A-Z\s\.\(\)\&]+?)\s*(?:\/|\d{10,20}|$)/);
            if (beneficiaryMatch) {
                result.beneficiary = beneficiaryMatch[1].trim();
            }
        }

        return result;
    }

    /**
     * Extracts information from SPEI sent transactions (debit)
     */
    _extractSpeiSent(fullLine) {
        const result = {
            beneficiary: null,
            trackingKey: null,
            time: null
        };

        const timeMatch = fullLine.match(/(\d{2}:\d{2}:\d{2})/);
        if (timeMatch) {
            result.time = timeMatch[1];
        }

        const beneficiaryMatch = fullLine.match(/SEL TRANSF\. INTERBANCARIA SPEI\s+[A-Z\s]+\s+([A-Z][A-Z\s]+?)\s+(?:\d+\s+\d{2}:\d{2}:\d{2}|Fecha)/);
        if (beneficiaryMatch) {
            result.beneficiary = beneficiaryMatch[1].trim();
        }

        const trackingMatch = fullLine.match(/\d{8}\s+(\d{8})\s+\d{2}:\d{2}:\d{2}\d{8}[A-Z0-9]+\d+/);
        if (trackingMatch) {
            result.trackingKey = trackingMatch[1];
        }

        return result;
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