import { Transaction } from '../models/transaction.js';
import * as csv from 'csv-parse/sync';

export class BanBajioParser {
    /**
     * Parses BanBajio CSV content with new format
     *
     * @param {string} fileContent
     * @returns {Transaction[]}
     */
    parse(fileContent) {
        try {
            const records = csv.parse(fileContent, {
                delimiter: ',',
                quote: '"',
                skip_empty_lines: true,
                trim: true,
                relax_column_count: true,
                cast: (value, context) => {
                    if (context.column === 9 || context.column === 10 || context.column === 11) {
                        return this._parseNumber(value);
                    }
                    return value;
                }
            });

            return records
                .map(record => this.parseRow(record))
                .filter(Boolean)
                .reverse();
        } catch (error) {
            console.error('Error parsing BanBajio file:', error);
            return [];
        }
    }

    /**
     * Parses a single transaction record with new format
     *
     * @param {Object} record
     * @returns {Transaction|null}
     */
    parseRow(record) {
        if (!record[1] || !record[4]) {
            return null;
        }

        const date = this._formatDate(record[1]);
        const debit = this._parseNumber(record[6] || '0');
        const credit = this._parseNumber(record[7] || '0');
        const balance = this._parseNumber(record[8] || '0');
        const amount = credit !== 0 ? credit : -debit;

        const extractedData = this._extractFromDescription(record[4]);

        const accountNumber = record[0] || '';

        return new Transaction({
            date,
            hour: extractedData.hour || null,
            type: credit !== 0 ? 'credit' : 'debit',
            amount,
            balance,
            reference: extractedData.reference || record[3] || '',
            accountNumber: accountNumber,
            description: extractedData.actualDescription || record[4].trim(),
            beneficiary: extractedData.beneficiary || null,
            trackingKey: extractedData.trackingKey || null,
            rfc: extractedData.rfc || null,
            concept: extractedData.concept || null,
            bank: {
                id: '030',
                code: '40030',
                name: 'BAJIO',
            },
            raw: JSON.stringify(record),
        });
    }

    /**
     * Extracts structured data from the description field
     *
     * @param {string} description
     * @returns {Object}
     */
    _extractFromDescription(description) {
        const result = {
            trackingKey: null,
            reference: null,
            hour: null,
            beneficiary: null,
            rfc: null,
            concept: null,
            actualDescription: description.trim(),
            rawDescription: description
        };

        try {
            const trackingMatch1 = description.match(/Clave de Rastreo:\s*(\S+)/);
            const trackingMatch2 = description.match(/Clave de Rastreo:\s*([A-Z0-9]+)/);
            if (trackingMatch1) {
                result.trackingKey = trackingMatch1[1].trim();
            } else if (trackingMatch2) {
                result.trackingKey = trackingMatch2[1].trim();
            }

            const refMatch1 = description.match(/Referencia:\s*([^|]+)/);
            const refMatch2 = description.match(/Número de Referencia:\s*([^|]+)/);
            if (refMatch1) {
                result.reference = refMatch1[1].trim();
            } else if (refMatch2) {
                result.reference = refMatch2[1].trim();
            }

            const hourMatch = description.match(/Hora:\s*(\d{2}:\d{2}:\d{2})/);
            if (hourMatch) {
                result.hour = hourMatch[1].trim();
            }

            const rfcMatch1 = description.match(/RFC Ordenante:\s*([A-Z&Ñ]{3,4}[0-9]{2}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])[A-Z0-9]{2}[0-9A])/);
            const rfcMatch2 = description.match(/RFC Beneficiario:\s*([^|]+)/);
            if (rfcMatch1) {
                result.rfc = rfcMatch1[1].trim();
            } else if (rfcMatch2) {
                result.rfc = rfcMatch2[1].trim();
            }

            const conceptMatch = description.match(/Concepto del Pago:\s*([^|]+)/);
            if (conceptMatch) {
                result.concept = conceptMatch[1].trim();
            }

            if (description.includes('SPEI Recibido:')) {
                const beneficiaryMatch = description.match(/Ordenante:\s*([^|]+?)\s+Cuenta Ordenante:/);
                if (beneficiaryMatch) {
                    result.beneficiary = beneficiaryMatch[1].trim();
                }

                const institutionMatch = description.match(/Institucion contraparte:\s*([^|]+?)\s+Ordenante:/);
                if (institutionMatch) {
                    result.counterpartInstitution = institutionMatch[1].trim();
                }
            } else if (description.includes('SPEI Enviado:')) {
                const beneficiaryMatch = description.match(/Beneficiario:\s*([^|]+?)\s+Cuenta Beneficiario:/);
                if (beneficiaryMatch) {
                    result.beneficiary = beneficiaryMatch[1].trim();
                }

                const institutionMatch = description.match(/Institucion Receptora:\s*([^|]+)/);
                if (institutionMatch) {
                    result.counterpartInstitution = institutionMatch[1].trim();
                }
            }

            result.actualDescription = this._buildActualDescription(description, result);

        } catch (error) {
            console.warn('Error extracting data from BanBajio description:', error);
        }

        return result;
    }

    /**
     * Builds a cleaner description from extracted parts
     *
     * @param {string} originalDescription
     * @param {Object} extractedData
     * @returns {string}
     */
    _buildActualDescription(originalDescription, extractedData) {
        if (originalDescription.includes('SPEI Recibido:')) {
            const parts = [];
            if (extractedData.counterpartInstitution) {
                parts.push(extractedData.counterpartInstitution);
            }
            if (extractedData.beneficiary) {
                parts.push(extractedData.beneficiary);
            }
            if (parts.length > 0) {
                return `SPEI Recibido: ${parts.join(' - ')}`;
            }
            return 'SPEI Recibido';
        }

        if (originalDescription.includes('SPEI Enviado:')) {
            const parts = [];
            if (extractedData.counterpartInstitution) {
                parts.push(extractedData.counterpartInstitution);
            }
            if (extractedData.beneficiary) {
                parts.push(extractedData.beneficiary);
            }
            if (parts.length > 0) {
                return `SPEI Enviado: ${parts.join(' - ')}`;
            }
            return 'SPEI Enviado';
        }

        if (originalDescription.includes('Comisión') || originalDescription.includes('IVA Comisión')) {
            const commissionMatch = originalDescription.match(/(Comisión[^|]+)/);
            if (commissionMatch) {
                return commissionMatch[1].trim();
            }
            return originalDescription.split('|')[0]?.trim() || originalDescription;
        }

        return originalDescription.split('|')[0]?.trim() || originalDescription;
    }

    /**
     * Parses number with commas as thousands separator and quotes
     *
     * @param {string} str
     * @returns {number}
     */
    _parseNumber(str) {
        if (!str || str.trim() === '') return 0;
        const cleanStr = str.replace(/["',]/g, '').trim();
        return parseFloat(cleanStr) || 0;
    }

    /**
     * Converts DD/MM/YYYY to YYYY-MM-DD
     *
     * @param {string} input
     * @returns {string}
     */
    _formatDate(input) {
        const parts = input.split('/');
        if (parts.length === 3) {
            const day = parts[0].padStart(2, '0');
            const month = parts[1].padStart(2, '0');
            const year = parts[2];
            return `${year}-${month}-${day}`;
        }
        return input;
    }
}