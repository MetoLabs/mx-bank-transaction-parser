/**
 * Represents a bank transaction.
 */
export class Transaction {
    /**
     * Creates a new Transaction instance.
     *
     * @param {Object} params
     * @param {string} params.date - Transaction date string, format depends on bank
     * @param {string} params.type - Transaction type (e.g. 'Cargo', 'Abono')
     * @param {number} params.amount - Transaction amount
     * @param {number} params.balance - Account balance after transaction
     * @param {string} params.description - Description or concept of transaction
     * @param {string} params.reference - Reference or tracking number
     * @param {string} params.bank - Bank involved in transaction
     * @param {string|null} [params.accountNumber] - Origin/destination account number, if any
     * @param {string|null} [params.beneficiary] - Beneficiary of the transaction, if any
     * @param {string|null} [params.trackingKey] - Internal tracking key, if any
     * @param {string|null} [params.extra] - Raw original line or extra info
     */
    constructor({
                    date,
                    hour = null,
                    type,
                    amount,
                    balance,
                    description,
                    reference,
                    bank,
                    accountNumber = null,
                    beneficiary = null,
                    trackingKey = null,
                    extra = null,
                }) {
        this.date = date;
        this.hour = hour;
        this.type = type;
        this.amount = amount;
        this.balance = balance;
        this.description = description;
        this.reference = reference;
        this.bank = bank;
        this.accountNumber = accountNumber;
        this.beneficiary = beneficiary;
        this.trackingKey = trackingKey;
        this.extra = extra;
    }
}
