/**
 * Represents a bank transaction.
 */
class Transaction {
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
     * @param {string} [params.extra] - Raw original line or extra info
     */
    constructor({
                    date,
                    type,
                    amount,
                    balance,
                    description,
                    reference,
                    bank,
                    accountNumber = null,
                    beneficiary = null,
                    trackingKey = null,
                    extra = '',
                }) {
        this.date = date;
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

class AfirmeParser {
    /**
     * Parses the entire CSV file content into an array of Transactions.
     *
     * @param {string} fileContent - The full CSV file content as a string.
     * @returns {Transaction[]} Array of parsed transactions.
     */
    parse(fileContent) {
        const lines = fileContent
            .split(/\r?\n/)
            .map(line => line.trim())
            .filter(line => line.length > 0);

        return lines
            .map(line => this.parseRow(line))
            .filter(Boolean);
    }

    /**
     * Parses a single CSV line into a Transaction instance.
     *
     * @param {string} line - A CSV line representing a transaction.
     * @returns {Transaction|null} Parsed Transaction or null if invalid.
     */
    parseRow(line) {
        const parts = this._splitCsvLine(line);
        if (parts.length < 7) return null;

        const description = parts[0];
        const date = this._formatDate(parts[1]);
        const reference = parts[2];
        const debit = parseFloat(parts[3]) || 0;
        const credit = parseFloat(parts[4]) || 0;
        const balance = parseFloat(parts[5]) || 0;
        const account = parts[6];
        const amount = credit !== 0 ? credit : -debit;

        return new Transaction({
            date,
            type: credit !== 0 ? 'credit' : 'debit',
            amount,
            balance,
            reference,
            account,
            description,
            bank: 'Afirme',
            raw: line,
        });
    }

    /**
     * Converts a date string in DD/MM/YY format to ISO YYYY-MM-DD format.
     *
     * @param {string} input - Date string in DD/MM/YY format.
     * @returns {string} Date string in YYYY-MM-DD format.
     */
    _formatDate(input) {
        const [day, month, year] = input.split('/');
        const fullYear = Number(year) > 70 ? `19${year}` : `20${year}`;
        return `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }

    /**
     * Splits a CSV line by commas into an array of fields.
     * Does not handle quoted commas.
     *
     * @param {string} line - A CSV line string.
     * @returns {string[]} Array of CSV fields.
     */
    _splitCsvLine(line) {
        return line.split(',');
    }
}

class BanBajioParser {
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
            .map(line => this.parseRow(line))
            .filter(Boolean);
    }

    /**
     * Parses a single CSV line of BanBajio transaction.
     *
     * @param {string} line - CSV line string.
     * @returns {Transaction|null}
     */
    parseRow(line) {
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

function getDefaultExportFromCjs (x) {
	return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, 'default') ? x['default'] : x;
}

var papaparse_min$1 = {exports: {}};

/* @license
Papa Parse
v5.5.3
https://github.com/mholt/PapaParse
License: MIT
*/
var papaparse_min = papaparse_min$1.exports;

var hasRequiredPapaparse_min;

function requirePapaparse_min () {
	if (hasRequiredPapaparse_min) return papaparse_min$1.exports;
	hasRequiredPapaparse_min = 1;
	(function (module, exports) {
		((e,t)=>{module.exports=t();})(papaparse_min,function r(){var n="undefined"!=typeof self?self:"undefined"!=typeof window?window:void 0!==n?n:{};var d,s=!n.document&&!!n.postMessage,a=n.IS_PAPA_WORKER||false,o={},h=0,v={};function u(e){this._handle=null,this._finished=false,this._completed=false,this._halted=false,this._input=null,this._baseIndex=0,this._partialLine="",this._rowCount=0,this._start=0,this._nextChunk=null,this.isFirstChunk=true,this._completeResults={data:[],errors:[],meta:{}},function(e){var t=b(e);t.chunkSize=parseInt(t.chunkSize),e.step||e.chunk||(t.chunkSize=null);this._handle=new i(t),(this._handle.streamer=this)._config=t;}.call(this,e),this.parseChunk=function(t,e){var i=parseInt(this._config.skipFirstNLines)||0;if(this.isFirstChunk&&0<i){let e=this._config.newline;e||(r=this._config.quoteChar||'"',e=this._handle.guessLineEndings(t,r)),t=[...t.split(e).slice(i)].join(e);}this.isFirstChunk&&U(this._config.beforeFirstChunk)&&void 0!==(r=this._config.beforeFirstChunk(t))&&(t=r),this.isFirstChunk=false,this._halted=false;var i=this._partialLine+t,r=(this._partialLine="",this._handle.parse(i,this._baseIndex,!this._finished));if(!this._handle.paused()&&!this._handle.aborted()){t=r.meta.cursor,i=(this._finished||(this._partialLine=i.substring(t-this._baseIndex),this._baseIndex=t),r&&r.data&&(this._rowCount+=r.data.length),this._finished||this._config.preview&&this._rowCount>=this._config.preview);if(a)n.postMessage({results:r,workerId:v.WORKER_ID,finished:i});else if(U(this._config.chunk)&&!e){if(this._config.chunk(r,this._handle),this._handle.paused()||this._handle.aborted())return void(this._halted=true);this._completeResults=r=void 0;}return this._config.step||this._config.chunk||(this._completeResults.data=this._completeResults.data.concat(r.data),this._completeResults.errors=this._completeResults.errors.concat(r.errors),this._completeResults.meta=r.meta),this._completed||!i||!U(this._config.complete)||r&&r.meta.aborted||(this._config.complete(this._completeResults,this._input),this._completed=true),i||r&&r.meta.paused||this._nextChunk(),r}this._halted=true;},this._sendError=function(e){U(this._config.error)?this._config.error(e):a&&this._config.error&&n.postMessage({workerId:v.WORKER_ID,error:e,finished:false});};}function f(e){var r;(e=e||{}).chunkSize||(e.chunkSize=v.RemoteChunkSize),u.call(this,e),this._nextChunk=s?function(){this._readChunk(),this._chunkLoaded();}:function(){this._readChunk();},this.stream=function(e){this._input=e,this._nextChunk();},this._readChunk=function(){if(this._finished)this._chunkLoaded();else {if(r=new XMLHttpRequest,this._config.withCredentials&&(r.withCredentials=this._config.withCredentials),s||(r.onload=y(this._chunkLoaded,this),r.onerror=y(this._chunkError,this)),r.open(this._config.downloadRequestBody?"POST":"GET",this._input,!s),this._config.downloadRequestHeaders){var e,t=this._config.downloadRequestHeaders;for(e in t)r.setRequestHeader(e,t[e]);}var i;this._config.chunkSize&&(i=this._start+this._config.chunkSize-1,r.setRequestHeader("Range","bytes="+this._start+"-"+i));try{r.send(this._config.downloadRequestBody);}catch(e){this._chunkError(e.message);}s&&0===r.status&&this._chunkError();}},this._chunkLoaded=function(){4===r.readyState&&(r.status<200||400<=r.status?this._chunkError():(this._start+=this._config.chunkSize||r.responseText.length,this._finished=!this._config.chunkSize||this._start>=(e=>null!==(e=e.getResponseHeader("Content-Range"))?parseInt(e.substring(e.lastIndexOf("/")+1)):-1)(r),this.parseChunk(r.responseText)));},this._chunkError=function(e){e=r.statusText||e;this._sendError(new Error(e));};}function l(e){(e=e||{}).chunkSize||(e.chunkSize=v.LocalChunkSize),u.call(this,e);var i,r,n="undefined"!=typeof FileReader;this.stream=function(e){this._input=e,r=e.slice||e.webkitSlice||e.mozSlice,n?((i=new FileReader).onload=y(this._chunkLoaded,this),i.onerror=y(this._chunkError,this)):i=new FileReaderSync,this._nextChunk();},this._nextChunk=function(){this._finished||this._config.preview&&!(this._rowCount<this._config.preview)||this._readChunk();},this._readChunk=function(){var e=this._input,t=(this._config.chunkSize&&(t=Math.min(this._start+this._config.chunkSize,this._input.size),e=r.call(e,this._start,t)),i.readAsText(e,this._config.encoding));n||this._chunkLoaded({target:{result:t}});},this._chunkLoaded=function(e){this._start+=this._config.chunkSize,this._finished=!this._config.chunkSize||this._start>=this._input.size,this.parseChunk(e.target.result);},this._chunkError=function(){this._sendError(i.error);};}function c(e){var i;u.call(this,e=e||{}),this.stream=function(e){return i=e,this._nextChunk()},this._nextChunk=function(){var e,t;if(!this._finished)return e=this._config.chunkSize,i=e?(t=i.substring(0,e),i.substring(e)):(t=i,""),this._finished=!i,this.parseChunk(t)};}function p(e){u.call(this,e=e||{});var t=[],i=true,r=false;this.pause=function(){u.prototype.pause.apply(this,arguments),this._input.pause();},this.resume=function(){u.prototype.resume.apply(this,arguments),this._input.resume();},this.stream=function(e){this._input=e,this._input.on("data",this._streamData),this._input.on("end",this._streamEnd),this._input.on("error",this._streamError);},this._checkIsFinished=function(){r&&1===t.length&&(this._finished=true);},this._nextChunk=function(){this._checkIsFinished(),t.length?this.parseChunk(t.shift()):i=true;},this._streamData=y(function(e){try{t.push("string"==typeof e?e:e.toString(this._config.encoding)),i&&(i=!1,this._checkIsFinished(),this.parseChunk(t.shift()));}catch(e){this._streamError(e);}},this),this._streamError=y(function(e){this._streamCleanUp(),this._sendError(e);},this),this._streamEnd=y(function(){this._streamCleanUp(),r=true,this._streamData("");},this),this._streamCleanUp=y(function(){this._input.removeListener("data",this._streamData),this._input.removeListener("end",this._streamEnd),this._input.removeListener("error",this._streamError);},this);}function i(m){var n,s,a,t,o=Math.pow(2,53),h=-o,u=/^\s*-?(\d+\.?|\.\d+|\d+\.\d+)([eE][-+]?\d+)?\s*$/,d=/^((\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d\.\d+([+-][0-2]\d:[0-5]\d|Z))|(\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d([+-][0-2]\d:[0-5]\d|Z))|(\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d([+-][0-2]\d:[0-5]\d|Z)))$/,i=this,r=0,f=0,l=false,e=false,c=[],p={data:[],errors:[],meta:{}};function y(e){return "greedy"===m.skipEmptyLines?""===e.join("").trim():1===e.length&&0===e[0].length}function g(){if(p&&a&&(k("Delimiter","UndetectableDelimiter","Unable to auto-detect delimiting character; defaulted to '"+v.DefaultDelimiter+"'"),a=false),m.skipEmptyLines&&(p.data=p.data.filter(function(e){return !y(e)})),_()){if(p)if(Array.isArray(p.data[0])){for(var e=0;_()&&e<p.data.length;e++)p.data[e].forEach(t);p.data.splice(0,1);}else p.data.forEach(t);function t(e,t){U(m.transformHeader)&&(e=m.transformHeader(e,t)),c.push(e);}}function i(e,t){for(var i=m.header?{}:[],r=0;r<e.length;r++){var n=r,s=e[r],s=((e,t)=>(e=>(m.dynamicTypingFunction&&void 0===m.dynamicTyping[e]&&(m.dynamicTyping[e]=m.dynamicTypingFunction(e)),true===(m.dynamicTyping[e]||m.dynamicTyping)))(e)?"true"===t||"TRUE"===t||"false"!==t&&"FALSE"!==t&&((e=>{if(u.test(e)){e=parseFloat(e);if(h<e&&e<o)return 1}})(t)?parseFloat(t):d.test(t)?new Date(t):""===t?null:t):t)(n=m.header?r>=c.length?"__parsed_extra":c[r]:n,s=m.transform?m.transform(s,n):s);"__parsed_extra"===n?(i[n]=i[n]||[],i[n].push(s)):i[n]=s;}return m.header&&(r>c.length?k("FieldMismatch","TooManyFields","Too many fields: expected "+c.length+" fields but parsed "+r,f+t):r<c.length&&k("FieldMismatch","TooFewFields","Too few fields: expected "+c.length+" fields but parsed "+r,f+t)),i}var r;p&&(m.header||m.dynamicTyping||m.transform)&&(r=1,!p.data.length||Array.isArray(p.data[0])?(p.data=p.data.map(i),r=p.data.length):p.data=i(p.data,0),m.header&&p.meta&&(p.meta.fields=c),f+=r);}function _(){return m.header&&0===c.length}function k(e,t,i,r){e={type:e,code:t,message:i};void 0!==r&&(e.row=r),p.errors.push(e);}U(m.step)&&(t=m.step,m.step=function(e){p=e,_()?g():(g(),0!==p.data.length&&(r+=e.data.length,m.preview&&r>m.preview?s.abort():(p.data=p.data[0],t(p,i))));}),this.parse=function(e,t,i){var r=m.quoteChar||'"',r=(m.newline||(m.newline=this.guessLineEndings(e,r)),a=false,m.delimiter?U(m.delimiter)&&(m.delimiter=m.delimiter(e),p.meta.delimiter=m.delimiter):((r=((e,t,i,r,n)=>{var s,a,o,h;n=n||[",","\t","|",";",v.RECORD_SEP,v.UNIT_SEP];for(var u=0;u<n.length;u++){for(var d,f=n[u],l=0,c=0,p=0,g=(o=void 0,new E({comments:r,delimiter:f,newline:t,preview:10}).parse(e)),_=0;_<g.data.length;_++)i&&y(g.data[_])?p++:(d=g.data[_].length,c+=d,void 0===o?o=d:0<d&&(l+=Math.abs(d-o),o=d));0<g.data.length&&(c/=g.data.length-p),(void 0===a||l<=a)&&(void 0===h||h<c)&&1.99<c&&(a=l,s=f,h=c);}return {successful:!!(m.delimiter=s),bestDelimiter:s}})(e,m.newline,m.skipEmptyLines,m.comments,m.delimitersToGuess)).successful?m.delimiter=r.bestDelimiter:(a=true,m.delimiter=v.DefaultDelimiter),p.meta.delimiter=m.delimiter),b(m));return m.preview&&m.header&&r.preview++,n=e,s=new E(r),p=s.parse(n,t,i),g(),l?{meta:{paused:true}}:p||{meta:{paused:false}}},this.paused=function(){return l},this.pause=function(){l=true,s.abort(),n=U(m.chunk)?"":n.substring(s.getCharIndex());},this.resume=function(){i.streamer._halted?(l=false,i.streamer.parseChunk(n,true)):setTimeout(i.resume,3);},this.aborted=function(){return e},this.abort=function(){e=true,s.abort(),p.meta.aborted=true,U(m.complete)&&m.complete(p),n="";},this.guessLineEndings=function(e,t){e=e.substring(0,1048576);var t=new RegExp(P(t)+"([^]*?)"+P(t),"gm"),i=(e=e.replace(t,"")).split("\r"),t=e.split("\n"),e=1<t.length&&t[0].length<i[0].length;if(1===i.length||e)return "\n";for(var r=0,n=0;n<i.length;n++)"\n"===i[n][0]&&r++;return r>=i.length/2?"\r\n":"\r"};}function P(e){return e.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}function E(C){var S=(C=C||{}).delimiter,O=C.newline,x=C.comments,I=C.step,A=C.preview,T=C.fastMode,D=null,L=false,F=null==C.quoteChar?'"':C.quoteChar,j=F;if(void 0!==C.escapeChar&&(j=C.escapeChar),("string"!=typeof S||-1<v.BAD_DELIMITERS.indexOf(S))&&(S=","),x===S)throw new Error("Comment character same as delimiter");true===x?x="#":("string"!=typeof x||-1<v.BAD_DELIMITERS.indexOf(x))&&(x=false),"\n"!==O&&"\r"!==O&&"\r\n"!==O&&(O="\n");var z=0,M=false;this.parse=function(i,t,r){if("string"!=typeof i)throw new Error("Input must be a string");var n=i.length,e=S.length,s=O.length,a=x.length,o=U(I),h=[],u=[],d=[],f=z=0;if(!i)return w();if(T||false!==T&&-1===i.indexOf(F)){for(var l=i.split(O),c=0;c<l.length;c++){if(d=l[c],z+=d.length,c!==l.length-1)z+=O.length;else if(r)return w();if(!x||d.substring(0,a)!==x){if(o){if(h=[],k(d.split(S)),R(),M)return w()}else k(d.split(S));if(A&&A<=c)return h=h.slice(0,A),w(true)}}return w()}for(var p=i.indexOf(S,z),g=i.indexOf(O,z),_=new RegExp(P(j)+P(F),"g"),m=i.indexOf(F,z);;)if(i[z]===F)for(m=z,z++;;){if(-1===(m=i.indexOf(F,m+1)))return r||u.push({type:"Quotes",code:"MissingQuotes",message:"Quoted field unterminated",row:h.length,index:z}),E();if(m===n-1)return E(i.substring(z,m).replace(_,F));if(F===j&&i[m+1]===j)m++;else if(F===j||0===m||i[m-1]!==j){ -1!==p&&p<m+1&&(p=i.indexOf(S,m+1));var y=v(-1===(g=-1!==g&&g<m+1?i.indexOf(O,m+1):g)?p:Math.min(p,g));if(i.substr(m+1+y,e)===S){d.push(i.substring(z,m).replace(_,F)),i[z=m+1+y+e]!==F&&(m=i.indexOf(F,z)),p=i.indexOf(S,z),g=i.indexOf(O,z);break}y=v(g);if(i.substring(m+1+y,m+1+y+s)===O){if(d.push(i.substring(z,m).replace(_,F)),b(m+1+y+s),p=i.indexOf(S,z),m=i.indexOf(F,z),o&&(R(),M))return w();if(A&&h.length>=A)return w(true);break}u.push({type:"Quotes",code:"InvalidQuotes",message:"Trailing quote on quoted field is malformed",row:h.length,index:z}),m++;}}else if(x&&0===d.length&&i.substring(z,z+a)===x){if(-1===g)return w();z=g+s,g=i.indexOf(O,z),p=i.indexOf(S,z);}else if(-1!==p&&(p<g||-1===g))d.push(i.substring(z,p)),z=p+e,p=i.indexOf(S,z);else {if(-1===g)break;if(d.push(i.substring(z,g)),b(g+s),o&&(R(),M))return w();if(A&&h.length>=A)return w(true)}return E();function k(e){h.push(e),f=z;}function v(e){var t=0;return t=-1!==e&&(e=i.substring(m+1,e))&&""===e.trim()?e.length:t}function E(e){return r||(void 0===e&&(e=i.substring(z)),d.push(e),z=n,k(d),o&&R()),w()}function b(e){z=e,k(d),d=[],g=i.indexOf(O,z);}function w(e){if(C.header&&!t&&h.length&&!L){var s=h[0],a=Object.create(null),o=new Set(s);let n=false;for(let r=0;r<s.length;r++){let i=s[r];if(a[i=U(C.transformHeader)?C.transformHeader(i,r):i]){let e,t=a[i];for(;e=i+"_"+t,t++,o.has(e););o.add(e),s[r]=e,a[i]++,n=true,(D=null===D?{}:D)[e]=i;}else a[i]=1,s[r]=i;o.add(i);}n&&console.warn("Duplicate headers found and renamed."),L=true;}return {data:h,errors:u,meta:{delimiter:S,linebreak:O,aborted:M,truncated:!!e,cursor:f+(t||0),renamedHeaders:D}}}function R(){I(w()),h=[],u=[];}},this.abort=function(){M=true;},this.getCharIndex=function(){return z};}function g(e){var t=e.data,i=o[t.workerId],r=false;if(t.error)i.userError(t.error,t.file);else if(t.results&&t.results.data){var n={abort:function(){r=true,_(t.workerId,{data:[],errors:[],meta:{aborted:true}});},pause:m,resume:m};if(U(i.userStep)){for(var s=0;s<t.results.data.length&&(i.userStep({data:t.results.data[s],errors:t.results.errors,meta:t.results.meta},n),!r);s++);delete t.results;}else U(i.userChunk)&&(i.userChunk(t.results,n,t.file),delete t.results);}t.finished&&!r&&_(t.workerId,t.results);}function _(e,t){var i=o[e];U(i.userComplete)&&i.userComplete(t),i.terminate(),delete o[e];}function m(){throw new Error("Not implemented.")}function b(e){if("object"!=typeof e||null===e)return e;var t,i=Array.isArray(e)?[]:{};for(t in e)i[t]=b(e[t]);return i}function y(e,t){return function(){e.apply(t,arguments);}}function U(e){return "function"==typeof e}return v.parse=function(e,t){var i=(t=t||{}).dynamicTyping||false;U(i)&&(t.dynamicTypingFunction=i,i={});if(t.dynamicTyping=i,t.transform=!!U(t.transform)&&t.transform,!t.worker||!v.WORKERS_SUPPORTED)return i=null,v.NODE_STREAM_INPUT,"string"==typeof e?(e=(e=>65279!==e.charCodeAt(0)?e:e.slice(1))(e),i=new(t.download?f:c)(t)):true===e.readable&&U(e.read)&&U(e.on)?i=new p(t):(n.File&&e instanceof File||e instanceof Object)&&(i=new l(t)),i.stream(e);(i=(()=>{var e;return !!v.WORKERS_SUPPORTED&&(e=(()=>{var e=n.URL||n.webkitURL||null,t=r.toString();return v.BLOB_URL||(v.BLOB_URL=e.createObjectURL(new Blob(["var global = (function() { if (typeof self !== 'undefined') { return self; } if (typeof window !== 'undefined') { return window; } if (typeof global !== 'undefined') { return global; } return {}; })(); global.IS_PAPA_WORKER=true; ","(",t,")();"],{type:"text/javascript"})))})(),(e=new n.Worker(e)).onmessage=g,e.id=h++,o[e.id]=e)})()).userStep=t.step,i.userChunk=t.chunk,i.userComplete=t.complete,i.userError=t.error,t.step=U(t.step),t.chunk=U(t.chunk),t.complete=U(t.complete),t.error=U(t.error),delete t.worker,i.postMessage({input:e,config:t,workerId:i.id});},v.unparse=function(e,t){var n=false,_=true,m=",",y="\r\n",s='"',a=s+s,i=false,r=null,o=false,h=((()=>{if("object"==typeof t){if("string"!=typeof t.delimiter||v.BAD_DELIMITERS.filter(function(e){return  -1!==t.delimiter.indexOf(e)}).length||(m=t.delimiter),"boolean"!=typeof t.quotes&&"function"!=typeof t.quotes&&!Array.isArray(t.quotes)||(n=t.quotes),"boolean"!=typeof t.skipEmptyLines&&"string"!=typeof t.skipEmptyLines||(i=t.skipEmptyLines),"string"==typeof t.newline&&(y=t.newline),"string"==typeof t.quoteChar&&(s=t.quoteChar),"boolean"==typeof t.header&&(_=t.header),Array.isArray(t.columns)){if(0===t.columns.length)throw new Error("Option columns is empty");r=t.columns;} void 0!==t.escapeChar&&(a=t.escapeChar+s),t.escapeFormulae instanceof RegExp?o=t.escapeFormulae:"boolean"==typeof t.escapeFormulae&&t.escapeFormulae&&(o=/^[=+\-@\t\r].*$/);}})(),new RegExp(P(s),"g"));"string"==typeof e&&(e=JSON.parse(e));if(Array.isArray(e)){if(!e.length||Array.isArray(e[0]))return u(null,e,i);if("object"==typeof e[0])return u(r||Object.keys(e[0]),e,i)}else if("object"==typeof e)return "string"==typeof e.data&&(e.data=JSON.parse(e.data)),Array.isArray(e.data)&&(e.fields||(e.fields=e.meta&&e.meta.fields||r),e.fields||(e.fields=Array.isArray(e.data[0])?e.fields:"object"==typeof e.data[0]?Object.keys(e.data[0]):[]),Array.isArray(e.data[0])||"object"==typeof e.data[0]||(e.data=[e.data])),u(e.fields||[],e.data||[],i);throw new Error("Unable to serialize unrecognized input");function u(e,t,i){var r="",n=("string"==typeof e&&(e=JSON.parse(e)),"string"==typeof t&&(t=JSON.parse(t)),Array.isArray(e)&&0<e.length),s=!Array.isArray(t[0]);if(n&&_){for(var a=0;a<e.length;a++)0<a&&(r+=m),r+=k(e[a],a);0<t.length&&(r+=y);}for(var o=0;o<t.length;o++){var h=(n?e:t[o]).length,u=false,d=n?0===Object.keys(t[o]).length:0===t[o].length;if(i&&!n&&(u="greedy"===i?""===t[o].join("").trim():1===t[o].length&&0===t[o][0].length),"greedy"===i&&n){for(var f=[],l=0;l<h;l++){var c=s?e[l]:l;f.push(t[o][c]);}u=""===f.join("").trim();}if(!u){for(var p=0;p<h;p++){0<p&&!d&&(r+=m);var g=n&&s?e[p]:p;r+=k(t[o][g],p);}o<t.length-1&&(!i||0<h&&!d)&&(r+=y);}}return r}function k(e,t){var i,r;return null==e?"":e.constructor===Date?JSON.stringify(e).slice(1,25):(r=false,o&&"string"==typeof e&&o.test(e)&&(e="'"+e,r=true),i=e.toString().replace(h,a),(r=r||true===n||"function"==typeof n&&n(e,t)||Array.isArray(n)&&n[t]||((e,t)=>{for(var i=0;i<t.length;i++)if(-1<e.indexOf(t[i]))return  true;return  false})(i,v.BAD_DELIMITERS)||-1<i.indexOf(m)||" "===i.charAt(0)||" "===i.charAt(i.length-1))?s+i+s:i)}},v.RECORD_SEP=String.fromCharCode(30),v.UNIT_SEP=String.fromCharCode(31),v.BYTE_ORDER_MARK="\ufeff",v.BAD_DELIMITERS=["\r","\n",'"',v.BYTE_ORDER_MARK],v.WORKERS_SUPPORTED=!s&&!!n.Worker,v.NODE_STREAM_INPUT=1,v.LocalChunkSize=10485760,v.RemoteChunkSize=5242880,v.DefaultDelimiter=",",v.Parser=E,v.ParserHandle=i,v.NetworkStreamer=f,v.FileStreamer=l,v.StringStreamer=c,v.ReadableStreamStreamer=p,n.jQuery&&((d=n.jQuery).fn.parse=function(o){var i=o.config||{},h=[];return this.each(function(e){if(!("INPUT"===d(this).prop("tagName").toUpperCase()&&"file"===d(this).attr("type").toLowerCase()&&n.FileReader)||!this.files||0===this.files.length)return  true;for(var t=0;t<this.files.length;t++)h.push({file:this.files[t],inputElem:this,instanceConfig:d.extend({},i)});}),e(),this;function e(){if(0===h.length)U(o.complete)&&o.complete();else {var e,t,i,r,n=h[0];if(U(o.before)){var s=o.before(n.file,n.inputElem);if("object"==typeof s){if("abort"===s.action)return e="AbortError",t=n.file,i=n.inputElem,r=s.reason,void(U(o.error)&&o.error({name:e},t,i,r));if("skip"===s.action)return void u();"object"==typeof s.config&&(n.instanceConfig=d.extend(n.instanceConfig,s.config));}else if("skip"===s)return void u()}var a=n.instanceConfig.complete;n.instanceConfig.complete=function(e){U(a)&&a(e,n.file,n.inputElem),u();},v.parse(n.file,n.instanceConfig);}}function u(){h.splice(0,1),e();}}),a&&(n.onmessage=function(e){e=e.data;void 0===v.WORKER_ID&&e&&(v.WORKER_ID=e.workerId);"string"==typeof e.input?n.postMessage({workerId:v.WORKER_ID,results:v.parse(e.input,e.config),finished:true}):(n.File&&e.input instanceof File||e.input instanceof Object)&&(e=v.parse(e.input,e.config))&&n.postMessage({workerId:v.WORKER_ID,results:e,finished:true});}),(f.prototype=Object.create(u.prototype)).constructor=f,(l.prototype=Object.create(u.prototype)).constructor=l,(c.prototype=Object.create(c.prototype)).constructor=c,(p.prototype=Object.create(u.prototype)).constructor=p,v}); 
	} (papaparse_min$1));
	return papaparse_min$1.exports;
}

var papaparse_minExports = requirePapaparse_min();
var Papa = /*@__PURE__*/getDefaultExportFromCjs(papaparse_minExports);

class BanorteParser {
    /**
     * Parses the entire Banorte pipe-delimited file content into an array of Transactions.
     *
     * @param {string} fileContent - The full text content of the Banorte file.
     * @returns {Transaction[]} Array of parsed Transaction objects.
     */
    parse(fileContent) {
        const { data } = Papa.parse(fileContent, {
            delimiter: '|',
            header: true,
            skipEmptyLines: true,
            transformHeader: header => header.trim(),
            transform: value => value.trim(),
        });

        return data
            .map(record => this.parseRecord(record))
            .filter(Boolean);
    }

    /**
     * Parses a single Banorte transaction record object into a Transaction instance.
     *
     * @param {Object} record - Parsed CSV record object with keys from header.
     * @param {string} record.Cuenta - Account number.
     * @param {string} record['Fecha De Operación'] - Transaction date (DD/MM/YYYY).
     * @param {string} record.Referencia - Reference code.
     * @param {string} record.Descripción - Description of transaction.
     * @param {string} record.Depósitos - Deposits amount (currency formatted).
     * @param {string} record.Retiros - Withdrawals amount (currency formatted).
     * @param {string} record.Saldo - Balance after transaction (currency formatted).
     * @returns {Transaction|null} Transaction instance or null if required fields missing.
     */
    parseRecord(record) {
        const {
            Cuenta: account,
            'Fecha De Operación': dateStr,
            Referencia: reference,
            Descripción: description,
            Depósitos: depositsStr,
            Retiros: withdrawalsStr,
            Saldo: balanceStr,
        } = record;

        if (!account || !dateStr) return null;

        const date = this._formatDate(dateStr);
        const deposits = this._parseMoney(depositsStr);
        const withdrawals = this._parseMoney(withdrawalsStr);
        const balance = this._parseMoney(balanceStr);
        const amount = deposits !== 0 ? deposits : -withdrawals;

        return new Transaction({
            date,
            type: deposits !== 0 ? 'credit' : 'debit',
            amount,
            balance,
            reference,
            account,
            description,
            bank: 'Banorte',
            raw: JSON.stringify(record),
        });
    }

    /**
     * Parses a currency string (e.g. "$13,295.61") into a float number.
     *
     * @param {string} str - Currency formatted string.
     * @returns {number} Parsed numeric value or 0 if invalid.
     */
    _parseMoney(str) {
        if (!str) return 0;
        return parseFloat(str.replace(/[$,]/g, '')) || 0;
    }

    /**
     * Converts a date string from DD/MM/YYYY format to ISO YYYY-MM-DD.
     *
     * @param {string} input - Date string in DD/MM/YYYY format.
     * @returns {string} Reformatted date string in YYYY-MM-DD format.
     */
    _formatDate(input) {
        const [day, month, year] = input.split('/');
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
}

class BbvaParser {
    /**
     * Parses the full BBVA TXT content.
     *
     * @param {string} fileContent
     * @returns {Transaction[]}
     */
    parse(fileContent) {
        const lines = fileContent
            .split(/\r?\n/)
            .map(line => line.trim())
            .filter(line => this._looksLikeTransaction(line));

        return lines
            .map(line => this.parseRow(line))
            .filter(Boolean);
    }

    /**
     * Parses a single transaction line.
     *
     * @param {string} line
     * @returns {Transaction|null}
     */
    parseRow(line) {
        const regex = /^(\d{2}-\d{2}-\d{4})\s+(.+?)\s+([\d,]+\.\d{2})?\s*([\d,]+\.\d{2})?\s+([\d,]+\.\d{2})$/;
        const match = line.match(regex);

        if (!match) return null;

        const [, dateStr, description, debitStr, creditStr, balanceStr] = match;

        const date = this._formatDate(dateStr);
        const debit = this._parseNumber(debitStr);
        const credit = this._parseNumber(creditStr);
        const balance = this._parseNumber(balanceStr);
        const amount = credit !== 0 ? credit : -debit;

        return new Transaction({
            date,
            type: credit !== 0 ? 'credit' : 'debit',
            amount,
            balance,
            reference: '',
            account: '',
            description: description.trim(),
            bank: 'BBVA',
            raw: line,
        });
    }

    /**
     * Filters out headers and irrelevant lines.
     *
     * @param {string} line
     * @returns {boolean}
     */
    _looksLikeTransaction(line) {
        return /^\d{2}-\d{2}-\d{4}/.test(line);
    }

    /**
     * Parses number with commas as thousands separator.
     *
     * @param {string} str
     * @returns {number}
     */
    _parseNumber(str) {
        if (!str) return 0;
        return parseFloat(str.replace(/,/g, ''));
    }

    /**
     * Converts DD-MM-YYYY to YYYY-MM-DD.
     *
     * @param {string} input
     * @returns {string}
     */
    _formatDate(input) {
        const [day, month, year] = input.split('-');
        return `${year}-${month}-${day}`;
    }
}

class ScotiabankParser {
    /**
     * Parses a Scotiabank TXT file content into a list of transactions.
     *
     * @param {string} fileContent
     * @returns {Transaction[]}
     */
    parse(fileContent) {
        const lines = fileContent
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 100);

        const transactions = [];

        for (const line of lines) {
            const accountType = line.substring(0, 3);
            const currency = line.substring(3, 6);
            const rawAccountNumber = line.substring(6, 26);
            const accountNumber = rawAccountNumber.replace(/^0+/, ''); // Strip leading zeros
            const date = line.substring(28, 36);

            transactions.push(new Transaction({
                date,
                type: accountType,
                currency,
                reference: null,
                accountNumber,
                description: '',
                amount: 0,
                balance: 0,
                bank: 'Scotiabank',
                trackingKey: '',
                beneficiary: '',
                extra: line,
            }));
        }

        return transactions;
    }
}

/**
 * Returns the appropriate parser instance for a given bank name.
 *
 * @param {string} bankName - Name of the bank (case-insensitive)
 * @returns {BaseParser} Instance of a parser for the specified bank
 * @throws {Error} If no parser is available for the given bank
 */
function getParserForBank(bankName) {
    switch (bankName.toLowerCase()) {
        case 'afirme':
            return new AfirmeParser();
        case 'banbajio':
            return new BanBajioParser();
        case 'banorte':
            return new BanorteParser();
        case 'bbva':
            return new BbvaParser();
        case 'scotiabank':
            return new ScotiabankParser();
        default:
            throw new Error(`No parser available for bank: ${bankName}`);
    }
}

export { getParserForBank };
//# sourceMappingURL=index.esm.mjs.map
