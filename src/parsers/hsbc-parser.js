import { Transaction } from '../models/transaction.js';
import * as XLSX from 'xlsx';

export class HsbcParser {
    /**
     * Parses HSBC XLSX content
     *
     * @param {Buffer} fileContent
     * @returns {Transaction[]}
     */
    parse(fileContent) {
        try {
            const workbook = XLSX.read(fileContent, { type: 'buffer' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];

            const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

            if (data.length < 2) {
                console.error('No data found in HSBC file');
                return [];
            }

            const headers = data[0].map(header => this._mapHeaderToEnglish(header));

            const accountInfo = this._extractAccountInfo(data[1], headers);
            const accountNumber = accountInfo.accountNumber || '';

            const transactions = [];
            for (let i = 1; i < data.length; i++) {
                const row = data[i];
                if (row.length < headers.length) continue;

                const record = {};
                headers.forEach((header, index) => {
                    record[header] = row[index] || '';
                });

                const transaction = this.parseRow(record, accountNumber);
                if (transaction) {
                    transactions.push(transaction);
                }
            }

            return transactions;

        } catch (error) {
            console.error('Error parsing HSBC file:', error);
            return [];
        }
    }

    /**
     * Maps Spanish headers to English
     *
     * @param {string} spanishHeader
     * @returns {string}
     */
    _mapHeaderToEnglish(spanishHeader) {
        const headerMap = {
            'Nombre de cuenta': 'accountName',
            'Número de cuenta': 'accountNumber',
            'Nombre del banco': 'bankName',
            'Moneda': 'currency',
            'Ubicación': 'location',
            'BIC': 'bic',
            'IBAN': 'iban',
            'Estatus de cuenta': 'accountStatus',
            'Tipo de cuenta': 'accountType',
            'Saldo en libros al cierre': 'closingBookBalance',
            'Saldo en libros final al cierre del ejercicio anterior de': 'previousClosingBookBalance',
            'Saldo disponible al cierre': 'closingAvailableBalance',
            'Saldo final disponible del ejercicio anterior de': 'previousClosingAvailableBalance',
            'Saldo actual en libros': 'currentBookBalance',
            'Saldo actual en libros al': 'currentBookBalanceDate',
            'Saldo actual disponible': 'currentAvailableBalance',
            'Saldo actual disponible al': 'currentAvailableBalanceDate',
            'Referencia bancaria': 'bankReference',
            'Descripción': 'description',
            'Referencia de cliente': 'clientReference',
            'Tipo de TRN': 'transactionType',
            'Importe de crédito': 'creditAmount',
            'Importe del débito': 'debitAmount',
            'Saldo': 'balance',
            'Fecha del apunte': 'entryDate'
        };

        return headerMap[spanishHeader] || spanishHeader;
    }

    /**
     * Extracts account information from first data row
     *
     * @param {Array} firstRow
     * @param {Array} headers
     * @returns {Object}
     */
    _extractAccountInfo(firstRow, headers) {
        const accountInfo = {
            accountNumber: '',
            accountName: '',
            bankName: ''
        };

        headers.forEach((header, index) => {
            const value = firstRow[index] || '';
            switch (header) {
                case 'accountNumber':
                    accountInfo.accountNumber = value.toString();
                    break;
                case 'accountName':
                    accountInfo.accountName = value.toString();
                    break;
                case 'bankName':
                    accountInfo.bankName = value.toString();
                    break;
            }
        });

        return accountInfo;
    }

    /**
     * Parses a single transaction record
     *
     * @param {Object} record
     * @param {string} accountNumber
     * @returns {Transaction|null}
     */
    parseRow(record, accountNumber) {
        if (!record.entryDate || !record.description) {
            return null;
        }

        const date = this._formatDate(record.entryDate);
        const credit = this._parseCurrency(record.creditAmount);
        const debit = this._parseCurrency(record.debitAmount);
        const balance = this._parseCurrency(record.balance);
        const amount = credit !== 0 ? credit : -debit;

        const extractedData = this._extractFromDescription(record.description);

        return new Transaction({
            date,
            type: credit !== 0 ? 'credit' : 'debit',
            amount,
            balance,
            reference: record.clientReference || record.bankReference || '',
            accountNumber: accountNumber,
            description: extractedData.actualDescription || record.description.trim(),
            beneficiary: extractedData.beneficiary,
            trackingKey: extractedData.trackingKey,
            concept: extractedData.concept,
            bank: {
                id: '021',
                code: '40021',
                name: 'HSBC',
            },
            raw: JSON.stringify(record),
        });
    }

    /**
     * Extracts structured data from description field
     *
     * @param {string} description
     * @returns {Object}
     */
    _extractFromDescription(description) {
        const result = {
            beneficiary: null,
            trackingKey: null,
            concept: null,
            actualDescription: description.trim(),
            rawDescription: description
        };

        try {
            if (description.includes('SPEI')) {
                const extracted = this._extractSpeiTransaction(description);
                result.beneficiary = extracted.beneficiary;
                result.trackingKey = extracted.trackingKey;
                result.concept = extracted.concept;
                result.actualDescription = extracted.actualDescription;
            }
            else if (description.includes('TRANSFERENCIA BPI')) {
                const extracted = this._extractBpiTransfer(description);
                result.beneficiary = extracted.beneficiary;
                result.concept = extracted.concept;
                result.actualDescription = extracted.actualDescription;
            }
            else {
                const extracted = this._extractGenericTransaction(description);
                result.beneficiary = extracted.beneficiary;
                result.concept = extracted.concept;
                result.actualDescription = extracted.actualDescription;
            }

        } catch (error) {
            console.warn('Error extracting data from HSBC description:', error);
        }

        return result;
    }

    /**
     * Extracts information from SPEI transactions
     *
     * @param {string} description
     * @returns {Object}
     */
    _extractSpeiTransaction(description) {
        const result = {
            beneficiary: null,
            trackingKey: null,
            concept: null,
            actualDescription: description.trim()
        };

        let cleanDescription = description.replace(/\s+SPEI$/, '').trim();

        const beneficiaryMatch = cleanDescription.match(/^([A-Za-z][A-Za-z\s\.\-]+?(?=\s+\d|$))/);
        if (beneficiaryMatch) {
            result.beneficiary = beneficiaryMatch[1].trim();
        }

        const conceptMatch = cleanDescription.match(/^([A-Za-z][A-Za-z\s\.\-0-9]+?)(?=\s+\d{6,8}\s|$)/);
        if (conceptMatch) {
            result.concept = conceptMatch[1].trim();
            result.actualDescription = result.concept;
        }

        const trackingMatch = cleanDescription.match(/(\d{6,8})(?:\s|$)/);
        if (trackingMatch) {
            result.trackingKey = trackingMatch[1];
        }

        return result;
    }

    /**
     * Extracts information from BPI transfers
     *
     * @param {string} description
     * @returns {Object}
     */
    _extractBpiTransfer(description) {
        const result = {
            beneficiary: null,
            concept: 'Transferencia BPI',
            actualDescription: 'Transferencia BPI'
        };

        const accountMatch = description.match(/CUENTA\s+(\d+)/);
        if (accountMatch) {
            result.trackingKey = accountMatch[1];
        }

        return result;
    }

    /**
     * Extracts information from generic transactions
     *
     * @param {string} description
     * @returns {Object}
     */
    _extractGenericTransaction(description) {
        const result = {
            beneficiary: null,
            concept: null,
            actualDescription: description.trim()
        };

        const conceptMatch = description.match(/^([A-Za-z][A-Za-z\s\.\-]+?)(?=\s+\d|$)/);
        if (conceptMatch) {
            result.concept = conceptMatch[1].trim();
            result.actualDescription = result.concept;
        }

        return result;
    }

    /**
     * Parses currency format with commas
     *
     * @param {string} str
     * @returns {number}
     */
    _parseCurrency(str) {
        if (!str || str === '' || str === 0) return 0;
        const strValue = typeof str === 'string' ? str : str.toString();
        const cleanStr = strValue.replace(/,/g, '').trim();
        return parseFloat(cleanStr) || 0;
    }

    /**
     * Converts DD/MM/YYYY to YYYY-MM-DD
     *
     * @param {string} input
     * @returns {string}
     */
    _formatDate(input) {
        if (!input) return '';
        const strValue = typeof input === 'string' ? input : input.toString();
        const [day, month, year] = strValue.split('/');
        if (!day || !month || !year) return strValue;
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
}