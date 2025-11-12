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

        const extractedData = this._extractFromDetailedDescription(record.detailedDescription);

        return new Transaction({
            date,
            type: deposits !== 0 ? 'credit' : 'debit',
            amount,
            balance,
            reference: record.reference || '',
            accountNumber: record.account || '',
            description: extractedData.actualDescription || record.description.trim(),
            beneficiary: extractedData.beneficiary,
            trackingKey: extractedData.trackingKey,
            time: extractedData.time,
            rfc: extractedData.rfc,
            concept: extractedData.concept,
            bank: {
                id: '072',
                code: '40072',
                name: 'BANORTE',
            },
            raw: JSON.stringify(record),
        });
    }

    /**
     * Extracts structured data from the detailed description field
     *
     * @param {string} detailedDescription
     * @returns {Object}
     */
    _extractFromDetailedDescription(detailedDescription) {
        const result = {
            beneficiary: null,
            trackingKey: null,
            time: null,
            rfc: null,
            concept: null,
            actualDescription: null,
            rawDescription: detailedDescription
        };

        try {
            if (!detailedDescription) {
                return result;
            }

            if (detailedDescription.includes('SPEI RECIBIDO')) {
                const extracted = this._extractSpeiReceived(detailedDescription);
                result.beneficiary = extracted.beneficiary;
                result.trackingKey = extracted.trackingKey;
                result.time = extracted.time;
                result.rfc = extracted.rfc;
                result.concept = extracted.concept;
                result.actualDescription = extracted.actualDescription;
            }

            else if (detailedDescription.includes('COMPRA ORDEN DE PAGO SPEI') ||
                detailedDescription.includes('BEM SPEI')) {
                const extracted = this._extractSpeiSent(detailedDescription);
                result.beneficiary = extracted.beneficiary;
                result.trackingKey = extracted.trackingKey;
                result.time = extracted.time;
                result.rfc = extracted.rfc;
                result.concept = extracted.concept;
                result.actualDescription = extracted.actualDescription;
            }

            else if (detailedDescription.includes('COMPENSACION DESFASE SPEI')) {
                const extracted = this._extractCompensation(detailedDescription);
                result.trackingKey = extracted.trackingKey;
                result.actualDescription = extracted.actualDescription;
            }

        } catch (error) {
            console.warn('Error extracting data from Banorte description:', error);
        }

        return result;
    }

    /**
     * Extracts information from SPEI received transactions
     *
     * @param {string} description
     * @returns {Object}
     */
    _extractSpeiReceived(description) {
        const result = {
            beneficiary: null,
            trackingKey: null,
            time: null,
            rfc: null,
            concept: null,
            actualDescription: 'SPEI Recibido'
        };

        const beneficiaryMatch = description.match(/DEL CLIENTE\s+([^,]+),/);
        if (beneficiaryMatch) {
            result.beneficiary = beneficiaryMatch[1].trim();
        }

        const trackingMatch = description.match(/CVE RAST:\s*([^,\s]+)/);
        if (trackingMatch) {
            result.trackingKey = trackingMatch[1].trim();
        }

        const timeMatch = description.match(/HR LIQ:\s*(\d{2}:\d{2}:\d{2})/);
        if (timeMatch) {
            result.time = timeMatch[1];
        }

        const rfcMatch = description.match(/RFC\s+([A-Z&Ñ]{3,4}[0-9]{2}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])[A-Z0-9]{2}[0-9A]),/);
        if (rfcMatch) {
            result.rfc = rfcMatch[1].trim();
        }

        const conceptMatch = description.match(/CONCEPTO:\s*([^,]+),/);
        if (conceptMatch) {
            result.concept = conceptMatch[1].trim();
        }

        const parts = [];
        if (result.concept) parts.push(result.concept);
        if (result.beneficiary) parts.push(result.beneficiary);

        if (parts.length > 0) {
            result.actualDescription = `SPEI Recibido: ${parts.join(' - ')}`;
        }

        return result;
    }

    /**
     * Extracts information from SPEI sent transactions
     *
     * @param {string} description
     * @returns {Object}
     */
    _extractSpeiSent(description) {
        const result = {
            beneficiary: null,
            trackingKey: null,
            time: null,
            rfc: null,
            concept: null,
            actualDescription: 'SPEI Enviado'
        };

        const beneficiaryMatch = description.match(/BENEF:([^,\(]+)/);
        if (beneficiaryMatch) {
            result.beneficiary = beneficiaryMatch[1].trim();
        }

        const trackingMatch = description.match(/CVE RASTREO:\s*([^,\s]+)/);
        if (trackingMatch) {
            result.trackingKey = trackingMatch[1].trim();
        }

        const timeMatch = description.match(/HORA LIQ:\s*(\d{2}:\d{2}:\d{2})/);
        if (timeMatch) {
            result.time = timeMatch[1];
        }

        const rfcMatch = description.match(/RFC:\s*([A-Z&Ñ]{3,4}[0-9]{2}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])[A-Z0-9]{2}[0-9A]),/);
        if (rfcMatch) {
            result.rfc = rfcMatch[1].trim();
        }

        const conceptMatch = description.match(/TRANSFERENCIA,?\s*([^,]+)?/);
        if (conceptMatch && conceptMatch[1]) {
            result.concept = conceptMatch[1].trim();
        } else {
            result.concept = 'Transferencia';
        }

        const parts = [];
        if (result.concept) parts.push(result.concept);
        if (result.beneficiary) parts.push(result.beneficiary);

        if (parts.length > 0) {
            result.actualDescription = `SPEI Enviado: ${parts.join(' - ')}`;
        }

        return result;
    }

    /**
     * Extracts information from compensation transactions
     *
     * @param {string} description
     * @returns {Object}
     */
    _extractCompensation(description) {
        const result = {
            trackingKey: null,
            actualDescription: 'Compensación SPEI'
        };

        const trackingMatch = description.match(/RASTREO\s*:,\s*([^,\s]+)/);
        if (trackingMatch) {
            result.trackingKey = trackingMatch[1].trim();
        }

        return result;
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