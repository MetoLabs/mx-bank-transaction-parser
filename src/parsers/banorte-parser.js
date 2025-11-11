import { Transaction } from '../models/transaction.js';

export class BanorteParser {
    /**
     * Parses Banorte CSV content with English headers
     *
     * @param {string} fileContent
     * @returns {Transaction[]}
     */
    parse(fileContent) {
        const lines = fileContent
            .split(/\r?\n/)
            .map(line => line.trim())
            .filter(line => line && !this._isHeader(line));

        if (lines.length === 0) return [];

        const firstLine = fileContent.split(/\r?\n/)[0].trim();
        const spanishHeaders = firstLine.split('|').map(h => h.trim());
        const englishHeaders = spanishHeaders.map(header => this._mapHeaderToEnglish(header));

        return lines
            .map(line => {
                const columns = line.split('|').map(col => col.trim());

                const record = {};
                englishHeaders.forEach((header, index) => {
                    record[header] = columns[index] || '';
                });

                return this.parseRow(record);
            })
            .filter(Boolean);
    }

    /**
     * Maps Spanish headers to English
     *
     * @param {string} spanishHeader
     * @returns {string}
     */
    _mapHeaderToEnglish(spanishHeader) {
        const headerMap = {
            'Cuenta': 'account',
            'Fecha De Operación': 'operationDate',
            'Fecha': 'date',
            'Referencia': 'reference',
            'Descripción': 'description',
            'Cod. Transac': 'transactionCode',
            'Sucursal': 'branch',
            'Depósitos': 'deposits',
            'Retiros': 'withdrawals',
            'Saldo': 'balance',
            'Movimiento': 'movement',
            'Descripción Detallada': 'detailedDescription',
            'Cheque': 'check'
        };

        return headerMap[spanishHeader] || spanishHeader;
    }

    /**
     * Check if line is header
     */
    _isHeader(line) {
        return line.includes('Cuenta') && line.includes('Fecha') && line.includes('Descripción');
    }

    /**
     * Parses a single transaction record with English headers
     *
     * @param {Object} record
     * @returns {Transaction|null}
     */
    parseRow(record) {
        if (!record.date || !record.description) {
            return null;
        }

        const date = this._formatDate(record.date);
        const deposits = this._parseCurrency(record.deposits);
        const withdrawals = this._parseCurrency(record.withdrawals);
        const balance = this._parseCurrency(record.balance);
        const amount = deposits !== 0 ? deposits : -withdrawals;

        return new Transaction({
            date,
            type: deposits !== 0 ? 'credit' : 'debit',
            amount,
            balance,
            reference: record.reference || '',
            accountNumber: record.account || '',
            description: record.description.trim(),
            bank: {
                id: '072',
                code: '40072',
                name: 'BANORTE',
            },
            raw: JSON.stringify(record),
        });
    }

    /**
     * Parses currency format with dollar sign and commas
     *
     * @param {string} str
     * @returns {number}
     */
    _parseCurrency(str) {
        if (!str || str.trim() === '' || str === '$0.00') return 0;
        const cleanStr = str.replace(/\$/g, '').replace(/,/g, '').trim();
        return parseFloat(cleanStr) || 0;
    }

    /**
     * Converts DD/MM/YYYY to YYYY-MM-DD
     *
     * @param {string} input
     * @returns {string}
     */
    _formatDate(input) {
        const [day, month, year] = input.split('/');
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
}