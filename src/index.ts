//#region Defining JSTC handler
import JSTC from "@briklab/lib/jstc";
JSTC.addCustomHandler("checkurl", (string: any) => {
    if (typeof string !== "string") return false;
    if (!/^[a-zA-Z]+:\/\/[^\s]+$/.test(string)) return false;
    return true;
});
//#endregion Defining JSTC handler

//#region The main reqor class
/**
 * The main class for Reqor.
 */
class Reqor {
    #url: string;
    #params: URLSearchParams;
    #retryConfig?: {
        number: number;
        delay?: {
            number: number;
            increaseFn?: (current: number) => number;
        };
        onRetry?: (retryNumber?: number) => any;
    };
    #timeoutConfig?: {
        onTimeout?: (retryNumber?: number) => any;
        time: number;
    };
    #totalTimeoutConfig?: {
        time: number;
        onTimeout?: () => any;
    };

    readonly timeout: (ms: number) => Reqor;
    readonly retry: (count: number) => Reqor;

    readonly totalTimeout: (ms: number) => Reqor;


    constructor(url: string) {
        this.#url = url;
        this.#params = new URLSearchParams();
        this.timeout = (ms: number) => {
            this.#timeoutConfig = {
                ...(this.#timeoutConfig ?? { time: 0 }),
                time: ms,
            };
            return this;
        }

        this.retry = (count: number) => {

            this.#retryConfig = {
                ...(this.#retryConfig ?? { number: 0 }),
                number: count,
            };
            return this;
        },

            this.totalTimeout = (ms: number) => {
                this.#totalTimeoutConfig = {
                    ...(this.#totalTimeoutConfig ?? { time: 0 }),
                    time: ms,
                };
                return this;
            }

    }

    #buildUrl(extraParams?: { [key: string]: string | number | boolean | null | undefined }[]) {
        const url = new URL(this.#url);
        const merged = new URLSearchParams(url.search);

        for (const [k, v] of this.#params.entries()) {
            merged.append(k, v);
        }

        if (extraParams) {
            for (const obj of extraParams) {
                for (const [k, v] of Object.entries(obj)) {
                    merged.append(k, String(v));
                }
            }
        }

        url.search = merged.toString();
        return url.toString();
    }

    /**
     * ### THIS IS AN ASYNC FUNCTION
     * Send a response to the given URL
     */
    async #get({ signal, url }: { signal?: AbortSignal; url?: string } = {}) {
        if (typeof fetch !== "function") {
            throw new Reqor.Error("fetch API not found.");
        }

        const a = await fetch(url ?? this.#buildUrl(), { method: "GET", signal });

        const b: Reqor.Response = {
            raw: a,
            headers: new Reqor.Headers(a.headers),
            ok: a.ok,
            redirected: a.redirected,
            status: Reqor.createStatus(a.status, a.statusText),
            statusText: a.statusText,
            type: Reqor.createType(a.type),
            url: a.url,
            json: a.json.bind(a),
            text: a.text.bind(a),
            arrayBuffer: a.arrayBuffer.bind(a),
            blob: a.blob.bind(a),
            formData: a.formData.bind(a),
            toJson: a.json.bind(a),
            toText: a.text.bind(a),
            toArrayBuffer: a.arrayBuffer.bind(a),
            toBlob: a.blob.bind(a),
            toFormData: a.formData.bind(a),
            clone: a.clone.bind(a),
            copy: a.clone.bind(a),
            body: new Reqor.Body(a),
            bodyUsed: a.bodyUsed,
        };

        return b;
    }

    params(
        values:
            | { [key: string]: string | number | boolean | null | undefined }
            | Array<{ [key: string]: string | number | boolean | null | undefined }>
            | URLSearchParams,
    ) {
        if (values instanceof URLSearchParams) {
            for (const [k, v] of values.entries()) {
                this.#params.append(k, v);
            }
            return this;
        }

        if (Array.isArray(values)) {
            for (const entry of values) {
                for (const [k, v] of Object.entries(entry)) {
                    if (v === undefined || v === null) continue;
                    this.#params.append(k, String(v));
                }
            }
            return this;
        }

        for (const [k, v] of Object.entries(values)) {
            if (v === undefined || v === null) continue;
            this.#params.append(k, String(v));
        }
        return this;
    }

    onTimeout(handler: (retryNumber?: number) => any) {
        this.#timeoutConfig = {
            ...(this.#timeoutConfig ?? { time: 0 }),
            onTimeout: handler,
        };
        return this;
    }

    onTotalTimeout(handler: () => any) {
        this.#totalTimeoutConfig = {
            ...(this.#totalTimeoutConfig ?? { time: 0 }),
            onTimeout: handler,
        };
        return this;
    }

    onRetry(handler: (retryNumber?: number) => any) {
        this.#retryConfig = {
            ...(this.#retryConfig ?? { number: 0 }),
            onRetry: handler,
        };
        return this;
    }

    retryDelay(number: number, increaseFn?: (current: number) => number) {
        this.#retryConfig = {
            ...(this.#retryConfig ?? { number: 0 }),
            delay: {
                number,
                increaseFn,
            },
        };
        return this;
    }

    async get({
        retry,
        timeout,
        totalTimeout,
        params,
    }: {
        retry?: {
            number: number;
            delay?: {
                number: number;
                increaseFn?: (current: number) => number;
            };
            onRetry?: (retryNumber?: number) => any;
        };
        timeout?: {
            onTimeout?: (retryNumber?: number) => any;
            time: number;
        };
        totalTimeout?: {
            time: number;
            onTimeout?: () => any;
        };
        params?: { [key: string]: string | number | boolean | null | undefined }[]
    } = {}) {
        const effectiveRetry = retry ?? this.#retryConfig;
        const effectiveTimeout = timeout ?? this.#timeoutConfig;
        const effectiveTotalTimeout = totalTimeout ?? this.#totalTimeoutConfig;
        const requestUrl = this.#buildUrl(params);
        const maxRetries = effectiveRetry?.number ?? 0;

        let retried = 0;
        let current: Reqor.Response | undefined;
        let lastError: any;
        let delay = effectiveRetry?.delay?.number ?? 0;

        const retryLoop = (async () => {
            while (retried <= maxRetries) {
                try {
                    if (effectiveTimeout) {
                        const controller = new AbortController();
                        const timer = setTimeout(() => {
                            controller.abort();
                            effectiveTimeout.onTimeout?.(retried);
                        }, effectiveTimeout.time);

                        try {
                            current = await this.#get({ signal: controller.signal, url: requestUrl });
                        } finally {
                            clearTimeout(timer);
                        }
                    } else {
                        current = await this.#get({ url: requestUrl });
                    }

                    if (current?.ok) break;
                } catch (err) {
                    lastError = err;
                }

                retried++;
                if (retried <= maxRetries) {
                    const increaseFn = effectiveRetry?.delay?.increaseFn;
                    if (increaseFn) {
                        delay = increaseFn(delay);
                    }
                    await new Promise(resolve => setTimeout(resolve, delay));
                    effectiveRetry?.onRetry?.(retried);
                }
            }

            if (!current?.ok) {
                throw lastError ?? new Reqor.Error("Failed after retries", "Reqor.get");
            }
            return current;
        })();

        if (effectiveTotalTimeout) {
            const timeoutPromise = new Promise<never>((_, reject) => {
                setTimeout(() => {
                    effectiveTotalTimeout.onTimeout?.();
                    reject(new Reqor.Error("Total timeout exceeded", "Reqor.get"));
                }, effectiveTotalTimeout.time);
            });

            return Promise.race([retryLoop, timeoutPromise]);
        }

        return retryLoop;
    }

}


//#endregion The main reqor class
namespace Reqor {
    /**
     * Error instance used by Reqor.
     */
    //#region Main Error class
    export class Error extends globalThis.Error {
        constructor(message: string, sub?: string) {
            super(message);
            this.name = `[reqor ${sub ? `.${sub}` : ""}] Error`;
            this.stack = `at reqor ${sub ? `.${sub}` : ""} [@briklab/reqor]`;
        }
    }
    //#endregion Main Error class
    //#region Response class
    /**
     * Response returned by **reqor**.
     */
    export interface Response {
        [key: string]: any
        /**
         * Raw Response returned by fetch()
         */
        raw: globalThis.Response;

        /**
         * A easier way to use [**Response.headers**](https://developer.mozilla.org/en-US/docs/Web/API/Response/headers)
         */
        headers: Reqor.Headers;

        /**
         * The **`ok`** read-only property of the Response interface contains a Boolean stating whether the response was successful (status in the range 200-299) or not.
         * 
         * from [**Response.ok**](https://developer.mozilla.org/en-US/docs/Web/API/Response/ok)
         */
        ok: boolean

        /**
         * The **`redirected`** read-only property of the Response interface indicates whether or not the response is the result of a request you made which was redirected.
         * 
         * from [**Response.redirected**](https://developer.mozilla.org/en-US/docs/Web/API/Response/redirected)
         */
        redirected: boolean;

        /**
         * Status of the response.
         */
        status: Reqor.Status,
        /**
         * The **`statusText`** read-only property of the Response interface contains the status message corresponding to the HTTP status code in Response.status.
         * 
         * from [**Response.statusText**](https://developer.mozilla.org/en-US/docs/Web/API/Response/statusText)
         */
        statusText: string,
        /**
         * Type of response.
        */
        type: Reqor.Type;
        /**
         * 
         */
        url: string
    }
    //#endregion
    //#region Headers
    /**
     * **Headers** returned in a Reqor Response
     */
    export class Headers {
        constructor(original: globalThis.Headers) {
            let h: Reqor.Headers.Map = {};
            // an easy wrapper for h.append
            h.new = (name: string, value?: any) => {
                return Reqor.Headers.value(original, name, value);
            };
            h.append = h.new;
            h.getContentType = () =>
                original.get("content-type") || original.get("Content-Type");
            h.add = h.new;
            h.http = Reqor.Headers.HTTPHeaders.create(original);
            h[Symbol.iterator] = original.entries.bind(original);
            h[Symbol.asyncIterator] = async function* () {
                for (const entry of original.entries()) yield entry;
            };
            // MERGING original header functions with h
            h = {
                ...h,
                ...{
                    /**
                     * The **`delete()`** method of the Headers interface deletes a header from the current Headers object.
                     *
                     * from [globalThis.Headers](https://developer.mozilla.org/en-US/docs/Web/API/Headers)
                     */
                    delete: original.delete.bind(original),
                    /**
                     * The **`has()`** method of the Headers interface returns a boolean stating whether a Headers object contains a certain header.
                     *
                     * from [globalThis.Headers](https://developer.mozilla.org/en-US/docs/Web/API/Headers)
                     */
                    has: original.has.bind(original),
                    /**
                     * Returns an iterator allowing to go through all values of the key/value pairs contained in this object.
                     *
                     * from [globalThis.Headers](https://developer.mozilla.org/en-US/docs/Web/API/Headers)
                     */
                    values: original.values.bind(original),
                    /**
                     * Returns an iterator allowing to go through all keys of the key/value pairs contained in this object.
                     *
                     * from [globalThis.Headers](https://developer.mozilla.org/en-US/docs/Web/API/Headers)
                     */
                    keys: original.keys.bind(original),
                    /**
                     * The **`getSetCookie()`** method of the Headers interface returns an array containing the values of all Set-Cookie headers associated with a response.
                     *
                     * from [globalThis.Headers](https://developer.mozilla.org/en-US/docs/Web/API/Headers)
                     */
                    getSetCookie: original.getSetCookie.bind(original),
                    /**
                     * from [globalThis.Headers](https://developer.mozilla.org/en-US/docs/Web/API/Headers)
                     */
                    forEach: original.forEach.bind(original),
                    /**
                     * The **`get()`** method of the Headers interface returns a byte string of all the values of a header within a Headers object with a given name.
                     *
                     * from [globalThis.Headers](https://developer.mozilla.org/en-US/docs/Web/API/Headers)
                     */
                    get: original.get.bind(original),
                    /**
                     * The **`set()`** method of the Headers interface sets a new value for an existing header inside a Headers object, or adds the header if it does not already exist.
                     *
                     * from [globalThis.Headers](https://developer.mozilla.org/en-US/docs/Web/API/Headers)
                     */
                    set: original.set.bind(original),
                    /**
                     * Returns an iterator allowing to go through all key/value pairs contained in this object.
                     *
                     * from [globalThis.Headers](https://developer.mozilla.org/en-US/docs/Web/API/Headers)
                     */
                    entries: original.entries.bind(original),
                },
            };
            return h;
        }
    }
    //#endregion
    //#region Status
    export class Status {
        private _status: number;
        private _statusText: string;

        constructor(status: number, statusText: string) {
            this._status = status;
            this._statusText = statusText;
        }

        get status() { return this._status; }
        get text() { return this._statusText; }

        set(status: number, statusText?: string) {
            this._status = status;
            if (statusText !== undefined) {
                this._statusText = statusText;
            }
        }

        get ok() { return this._status >= 200 && this._status < 300; }
        get redirected() { return this._status >= 300 && this._status < 400; }
        get clientError() { return this._status >= 400 && this._status < 500; }
        get serverError() { return this._status >= 500 && this._status < 600; }

        toString() { return `${this._status} ${this._statusText}`; }
        valueOf() { return this._status; }
        [Symbol.toPrimitive](hint: string) {
            if (hint === "number") return this._status;
            return this.toString();
        }
    }

    export function createStatus(status: number, statusText: string) {
        const controller = new Status(status, statusText);
        return controller
    }
    //#endregion
    //#region Type
    export class Type {
        private _type: string;

        static readonly VALID_TYPES = [
            "basic",
            "cors",
            "error",
            "opaque",
            "opaqueredirect",
        ] as const;

        constructor(type: string) {
            if (!Type.VALID_TYPES.includes(type as any)) {
                throw new Reqor.Error(`Invalid Response.type "${type}"`, "Reqor.Response.Type");
            }
            this._type = type;
        }

        get value() { return this._type; }

        isBasic() { return this._type === "basic"; }
        isCors() { return this._type === "cors"; }
        isError() { return this._type === "error"; }
        isOpaque() { return this._type === "opaque"; }
        isOpaqueRedirect() { return this._type === "opaqueredirect"; }

        toString() { return this._type; }
        valueOf() { return this._type; }
        [Symbol.toPrimitive](_hint: string) {
            return this._type;
        }
    }

    export function createType(type: string) {
        const controller = new Type(type);
        return controller
    }
    export class Body {
        private _response: globalThis.Response;

        constructor(response: globalThis.Response) {
            this._response = response;
        }

        get stream(): ReadableStream<Uint8Array> | null {
            return this._response.body;
        }

        get used(): boolean {
            return this._response.bodyUsed;
        }

        async pump(onChunk: (chunk: Uint8Array) => void) {
            const reader = this._response.body?.getReader();
            if (!reader) return;

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                if (value) onChunk(value);
            }
        }

        pipeTo(dest: WritableStream<Uint8Array>) {
            return this._response.body?.pipeTo(dest);
        }

        pipeThrough<T>(transform: TransformStream<Uint8Array, T>) {
            return this._response.body?.pipeThrough(transform);
        }

        async json<T = any>(): Promise<T> { return this._response.json(); }
        async text(): Promise<string> { return this._response.text(); }
        async arrayBuffer(): Promise<ArrayBuffer> { return this._response.arrayBuffer(); }
        async blob(): Promise<Blob> { return this._response.blob(); }
        async formData(): Promise<FormData> { return this._response.formData(); }
    }


    //#endregion
}

//#region Headers Members
namespace Reqor.Headers {
    export interface Map {
        [key: string]: any;
        [key: symbol]: any;
        /** Creates a new **Key**-**Value** in the header.
         * @example
         * reqor("myurl").get().headers.new("key")("value")
         */
        new?: (name: string, value?: any) => void | ((value: any) => void);
    }
    export function value(headers: globalThis.Headers, k: string, v?: any) {
        headers.append(k, v);
        let d;
        let func = (value?: any) => {
            if (d || !headers.has(k))
                throw new Reqor.Error(
                    "Value is deleted and hence can not be used",
                    "Reqor.Headers.value",
                );
            if (value) {
                headers.set(k, value);
                v = value;
                return func;
            }
        };
        func.toString = () => v;
        func.valueOf = () => v;
        (func as any)[Symbol.toPrimitive] = (hint: string) => {
            if (hint === "number") return Number(v);
            return String(v);
        };
        return new Proxy(func, {
            get(target, property) {
                if (property === "delete") {
                    if (d || !headers.has(k))
                        throw new Reqor.Error(
                            "Value is deleted and hence can not be used",
                            "Reqor.Headers.value.delete",
                        );
                    return () => {
                        headers.delete(k);
                    };
                }
                if (property === Symbol.toPrimitive) return (target as any)[Symbol.toPrimitive];
                if (property === Symbol.toStringTag) return "ReqorHeaderValue";
            },
        });
    }
}
//#endregion
namespace Reqor.Headers.HTTPHeaders {
    type ValidityCheck = string[] | ((value?: string) => boolean);
    type HeaderPrimitive = string | number | boolean;
    type HeaderMode =
        | "mime"
        | "mime-array"
        | "valid-string"
        | "valid-string-array"
        | "any-string"
        | "any-string-array"
        | "number"
        | "number-array"
        | "string-bool"
        | "string-bool-array";
    type HeaderController =
        | MIME
        | MIME_ARRAY
        | VALID_STRING
        | VALID_STRING_ARRAY
        | ANY_STRING
        | ANY_STRING_ARRAY
        | NUMBER_STRING
        | NUMBER_ARRAY
        | STRING_BOOL
        | STRING_BOOL_ARRAY;

    interface HeaderSpec {
        key: string;
        mode: HeaderMode;
        defaultValue: HeaderPrimitive | HeaderPrimitive[];
        validStrings?: ValidityCheck;
    }

    const headerNamePattern = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

    export const contentTypeValidBases = [
        "application",
        "audio",
        "font",
        "example",
        "image",
        "message",
        "model",
        "multipart",
        "text",
        "video",
        "*",
    ] as const;

    const commonHttpMethods = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "TRACE"] as const;

    const HEADER_SPECS: Readonly<Record<string, HeaderSpec>> = {
        accept: { key: "Accept", mode: "mime-array", defaultValue: "text/plain" },
        acceptCharset: { key: "Accept-Charset", mode: "any-string-array", defaultValue: [] },
        acceptEncoding: {
            key: "Accept-Encoding",
            mode: "valid-string-array",
            defaultValue: ["*"],
            validStrings: ["gzip", "deflate", "compress", "br", "zstd", "dcb", "dcz", "identity", "*", ";q="],
        },
        acceptLanguage: { key: "Accept-Language", mode: "any-string-array", defaultValue: [] },
        acceptPatch: { key: "Accept-Patch", mode: "mime-array", defaultValue: "text/plain" },
        acceptPost: { key: "Accept-Post", mode: "mime-array", defaultValue: "text/plain" },
        acceptRanges: {
            key: "Accept-Ranges",
            mode: "valid-string",
            defaultValue: "none",
            validStrings: ["none", "bytes"],
        },
        age: { key: "Age", mode: "number", defaultValue: 0 },
        allow: { key: "Allow", mode: "any-string-array", defaultValue: [] },
        altSvc: { key: "Alt-Svc", mode: "any-string", defaultValue: "" },
        authorization: { key: "Authorization", mode: "any-string", defaultValue: "" },
        cacheControl: { key: "Cache-Control", mode: "any-string", defaultValue: "" },
        connection: { key: "Connection", mode: "any-string-array", defaultValue: [] },
        contentDisposition: { key: "Content-Disposition", mode: "any-string", defaultValue: "" },
        contentEncoding: { key: "Content-Encoding", mode: "any-string-array", defaultValue: [] },
        contentLanguage: { key: "Content-Language", mode: "any-string-array", defaultValue: [] },
        contentLength: { key: "Content-Length", mode: "number", defaultValue: 0 },
        contentRange: { key: "Content-Range", mode: "any-string", defaultValue: "" },
        contentType: { key: "Content-Type", mode: "mime", defaultValue: "text/plain" },
        cookie: { key: "Cookie", mode: "any-string", defaultValue: "" },
        date: { key: "Date", mode: "any-string", defaultValue: "" },
        etag: { key: "ETag", mode: "any-string", defaultValue: "" },
        expires: { key: "Expires", mode: "any-string", defaultValue: "" },
        host: { key: "Host", mode: "any-string", defaultValue: "" },
        ifMatch: { key: "If-Match", mode: "any-string", defaultValue: "" },
        ifModifiedSince: { key: "If-Modified-Since", mode: "any-string", defaultValue: "" },
        ifNoneMatch: { key: "If-None-Match", mode: "any-string", defaultValue: "" },
        ifUnmodifiedSince: { key: "If-Unmodified-Since", mode: "any-string", defaultValue: "" },
        lastModified: { key: "Last-Modified", mode: "any-string", defaultValue: "" },
        link: { key: "Link", mode: "any-string", defaultValue: "" },
        location: { key: "Location", mode: "any-string", defaultValue: "" },
        maxForwards: { key: "Max-Forwards", mode: "number", defaultValue: 0 },
        origin: { key: "Origin", mode: "any-string", defaultValue: "" },
        pragma: { key: "Pragma", mode: "any-string-array", defaultValue: [] },
        range: { key: "Range", mode: "any-string", defaultValue: "" },
        referer: { key: "Referer", mode: "any-string", defaultValue: "" },
        retryAfter: { key: "Retry-After", mode: "any-string", defaultValue: "" },
        server: { key: "Server", mode: "any-string", defaultValue: "" },
        setCookie: { key: "Set-Cookie", mode: "any-string", defaultValue: "" },
        strictTransportSecurity: { key: "Strict-Transport-Security", mode: "any-string", defaultValue: "" },
        transferEncoding: { key: "Transfer-Encoding", mode: "any-string-array", defaultValue: [] },
        upgradeInsecureRequests: {
            key: "Upgrade-Insecure-Requests",
            mode: "valid-string",
            defaultValue: "1",
            validStrings: ["0", "1"],
        },
        userAgent: { key: "User-Agent", mode: "any-string", defaultValue: "" },
        vary: { key: "Vary", mode: "any-string-array", defaultValue: [] },
        wwwAuthenticate: { key: "WWW-Authenticate", mode: "any-string", defaultValue: "" },
        xContentTypeOptions: {
            key: "X-Content-Type-Options",
            mode: "valid-string",
            defaultValue: "nosniff",
            validStrings: ["nosniff"],
        },
        xFrameOptions: {
            key: "X-Frame-Options",
            mode: "valid-string",
            defaultValue: "SAMEORIGIN",
            validStrings: ["DENY", "SAMEORIGIN", "ALLOW-FROM"],
        },
        xXssProtection: {
            key: "X-XSS-Protection",
            mode: "valid-string",
            defaultValue: "1; mode=block",
            validStrings: ["0", "1", "1; mode=block"],
        },

        accessControlAllowCredentials: {
            key: "Access-Control-Allow-Credentials",
            mode: "string-bool",
            defaultValue: "false",
        },
        accessControlAllowHeaders: { key: "Access-Control-Allow-Headers", mode: "any-string-array", defaultValue: [] },
        accessControlAllowMethods: {
            key: "Access-Control-Allow-Methods",
            mode: "valid-string-array",
            defaultValue: ["GET", "POST", "OPTIONS"],
            validStrings: [...commonHttpMethods, "*"],
        },
        accessControlAllowOrigin: { key: "Access-Control-Allow-Origin", mode: "any-string", defaultValue: "*" },
        accessControlExposeHeaders: { key: "Access-Control-Expose-Headers", mode: "any-string-array", defaultValue: [] },
        accessControlMaxAge: { key: "Access-Control-Max-Age", mode: "number", defaultValue: 0 },
        accessControlRequestHeaders: { key: "Access-Control-Request-Headers", mode: "any-string-array", defaultValue: [] },
        accessControlRequestMethod: {
            key: "Access-Control-Request-Method",
            mode: "valid-string",
            defaultValue: "GET",
            validStrings: [...commonHttpMethods],
        },

        // Backward-compatible aliases for previous typoed keys
        accessControlKeyCredentials: {
            key: "Access-Control-Allow-Credentials",
            mode: "string-bool",
            defaultValue: "false",
        },
        accessControlKeyHeaders: {
            key: "Access-Control-Allow-Headers",
            mode: "any-string-array",
            defaultValue: [],
        },
    };
    class MIME {
        protected _value: string;
        protected _h: globalThis.Headers;
        protected _key: string;

        constructor(h: globalThis.Headers, key: string, defaultVal: string = "text/plain") {
            this._h = h;
            this._key = key;
            this._value = h.get(key) ?? defaultVal;
        }

        set(val: string) {
            this._value = val;
            this._h.set(this._key, val);
        }

        base(base: string) {
            const parts = this._value.split("/");
            parts[0] = base;
            this._value = parts.join("/");
            this._h.set(this._key, this._value);
            return this;
        }

        subtype(sub: string) {
            const parts = this._value.split("/");
            parts[1] = sub;
            this._value = parts.join("/");
            this._h.set(this._key, this._value);
            return this;
        }

        toString() { return this._value; }
        valueOf() { return this._value; }
        [Symbol.toPrimitive](hint: string) {
            if (hint === "number") return Number(this._value);
            return this._value;
        }
    }

    class MIME_ARRAY {
        protected _value: string;
        protected _h: globalThis.Headers;
        protected _key: string;

        constructor(h: globalThis.Headers, key: string, defaultVal: string = "text/plain") {
            this._h = h;
            this._key = key;
            this._value = h.get(key) ?? defaultVal;
        }

        get array(): MIME[] {
            return this._value
                .split(",")
                .map((str) => {
                    const [base, subtype] = str.trim().split("/");
                    return new MIME(this._h, this._key).base(base ?? "text").subtype(subtype ?? "plain");
                });
        }

        set(val: string | string[] | MIME[]) {
            if (Array.isArray(val)) {
                this._value = val.map((v) => v.toString()).join(",");
            } else {
                this._value = val;
            }
            this._h.set(this._key, this._value);
        }

        toString() { return this._value; }
        valueOf() { return this._value; }
        [Symbol.toPrimitive](hint: string) {
            if (hint === "number") return Number(this._value);
            return this._value;
        }
        get [Symbol.isConcatSpreadable]() { return true; }
        [Symbol.iterator](): IterableIterator<MIME> {
            return this.array[Symbol.iterator]();
        }
        async *[Symbol.asyncIterator](): AsyncIterableIterator<MIME> {
            for (const item of this.array) yield item;
        }
    }

    class VALID_STRING {
        #key: string;
        #value: string;
        #h: globalThis.Headers;
        #v: ValidityCheck;
        constructor(h: globalThis.Headers, key: string, defaultVal: string = "*", validStrings: ValidityCheck) {
            this.#key = key;
            this.#value = defaultVal;
            this.#h = h;
            this.#v = validStrings;
        }
        isValid(string: string) {
            if (typeof this.#v === "function") return this.#v(string);
            return this.#v.includes(string);
        }
        set(string: string) {
            if (this.isValid(string)) {
                this.#value = string;
                this.#h.set(this.#key, string);
                return;
            }
            throw new Reqor.Error(`Invalid value "${string}" for header "${this.#key}"`, "Reqor.Headers.HTTPHeaders");
        }

        valueOf() { return this.#value; }
        toString() { return this.#value; }
        get value() { return this.#value; }
        get validityArrayOrFunction() { return this.#v; }
        get key() { return this.#key }
        [Symbol.toPrimitive](hint: string) {
            if (hint === "number") return Number(this.#value);
            return this.#value;
        }
    }

    class ANY_STRING extends VALID_STRING {
        constructor(h: globalThis.Headers, key: string, defaultVal: string = "") {
            super(h, key, defaultVal, () => true);
        }
    }

    class NUMBER_STRING extends VALID_STRING {
        constructor(
            h: globalThis.Headers,
            key: string,
            defaultVal: string = "0"
        ) {
            const validityFn = (value?: string) => {
                if (!value) return false;
                return /^[0-9]+$/.test(value);
            };

            super(h, key, defaultVal, validityFn);
        }

        get number(): number {
            return parseInt(this.toString(), 10);
        }

        set number(n: number) {
            const str = String(n);
            if (this.isValid(str)) {
                this.set(str);
            } else {
                throw new Reqor.Error(
                    `Invalid numeric string "${str}" for header "${this.key}"`,
                    "Reqor.Headers.HTTPHeaders"
                );
            }
        }
    }

    class NUMBER_ARRAY {
        #key: string;
        #items: number[] = [];
        #h: globalThis.Headers;

        constructor(h: globalThis.Headers, key: string, defaultVals: number[] = []) {
            this.#h = h;
            this.#key = key;
            const existing = this.#h.get(this.#key);
            if (existing && existing.trim().length > 0) {
                this.#items = existing
                    .split(",")
                    .map((v) => Number(v.trim()))
                    .filter((v) => Number.isFinite(v));
            } else {
                this.#items = defaultVals.filter((v) => Number.isFinite(v));
                if (this.#items.length > 0) {
                    this.#h.set(this.#key, this.toString());
                }
            }
        }

        add(value: number) {
            if (!Number.isFinite(value)) {
                throw new Reqor.Error(`Invalid number "${value}" for header "${this.#key}"`, "Reqor.Headers.HTTPHeaders");
            }
            this.#items.push(value);
            this.#h.set(this.#key, this.toString());
        }

        remove(value: number) {
            this.#items = this.#items.filter((v) => v !== value);
            this.#h.set(this.#key, this.toString());
        }

        set(vals: number[]) {
            this.#items = vals.filter((v) => Number.isFinite(v));
            this.#h.set(this.#key, this.toString());
        }

        get array() { return [...this.#items]; }
        valueOf() { return this.#items.join(","); }
        toString() { return this.#items.join(","); }
        [Symbol.toPrimitive](hint: string) {
            if (hint === "number") return this.#items.length;
            return this.toString();
        }
        get [Symbol.isConcatSpreadable]() { return true; }
        [Symbol.iterator](): IterableIterator<number> {
            return this.array[Symbol.iterator]();
        }
        async *[Symbol.asyncIterator](): AsyncIterableIterator<number> {
            for (const item of this.array) yield item;
        }
    }

    class ANY_STRING_ARRAY {
        #key: string;
        #items: string[] = [];
        #h: globalThis.Headers;

        constructor(h: globalThis.Headers, key: string, defaultVals: string[] = []) {
            this.#h = h;
            this.#key = key;
            const existing = this.#h.get(this.#key);
            if (existing && existing.trim().length > 0) {
                this.#items = existing.split(",").map((v) => v.trim()).filter(Boolean);
            } else {
                this.#items = defaultVals;
            }
            if (this.#items.length > 0) {
                this.#h.set(this.#key, this.#items.join(","));
            }
        }

        add(str: string) {
            this.#items.push(str);
            this.#h.set(this.#key, this.toString());
        }

        remove(str: string) {
            this.#items = this.#items.filter(v => v !== str);
            this.#h.set(this.#key, this.toString());
        }

        set(vals: string[]) {
            this.#items = vals;
            this.#h.set(this.#key, this.toString());
        }

        get array() { return [...this.#items]; }

        valueOf() { return this.#items.join(","); }
        toString() { return this.#items.join(","); }
        [Symbol.toPrimitive](hint: string) {
            if (hint === "number") return this.#items.length;
            return this.toString();
        }
        get [Symbol.isConcatSpreadable]() { return true; }
        [Symbol.iterator](): IterableIterator<string> {
            return this.array[Symbol.iterator]();
        }
        async *[Symbol.asyncIterator](): AsyncIterableIterator<string> {
            for (const item of this.array) yield item;
        }
    }

    class STRING_BOOL extends VALID_STRING {
        constructor(h: globalThis.Headers, key: string, defaultVal: string = "false") {
            super(h, key, defaultVal, ["true", "false"]);
        }
    }

    class VALID_STRING_ARRAY {
        #key: string;
        #items: VALID_STRING[];
        #h: globalThis.Headers;

        constructor(
            h: globalThis.Headers,
            key: string,
            defaultVals: string[] = ["*"],
            validStrings: ValidityCheck,
        ) {
            this.#key = key;
            this.#h = h;
            this.#items = defaultVals.map((val) => new VALID_STRING(h, key, val, validStrings));
            this.#h.set(this.#key, this.#items.map((i) => i.toString()).join(","));
        }

        add(str: string) {
            const v = new VALID_STRING(this.#h, this.#key, str, this.#items[0].validityArrayOrFunction);
            if (v.isValid(str)) {
                this.#items.push(v);
                this.#h.set(this.#key, this.toString());
                return;
            }
            throw new Reqor.Error(`Invalid value "${str}" for header "${this.#key}"`, "Reqor.Headers.HTTPHeaders");
        }

        remove(str: string) {
            this.#items = this.#items.filter((v) => v.toString() !== str);
            this.#h.set(this.#key, this.toString());
        }

        set(vals: string[]) {
            this.#items = vals
                .map((val) => new VALID_STRING(this.#h, this.#key, val, this.#items[0].validityArrayOrFunction))
                .filter((v) => v.isValid(v.toString()));
            this.#h.set(this.#key, this.toString());
        }

        get array() { return this.#items.map((v) => v.toString()); }
        valueOf() { return this.#items.map((v) => v.toString()).join(","); }
        toString() { return this.#items.map((v) => v.toString()).join(","); }
        [Symbol.toPrimitive](hint: string) {
            if (hint === "number") return this.#items.length;
            return this.toString();
        }
        get [Symbol.isConcatSpreadable]() { return true; }
        [Symbol.iterator](): IterableIterator<string> {
            return this.array[Symbol.iterator]();
        }
        async *[Symbol.asyncIterator](): AsyncIterableIterator<string> {
            for (const item of this.array) yield item;
        }
    }

    class STRING_BOOL_ARRAY extends VALID_STRING_ARRAY {
        constructor(h: globalThis.Headers, key: string, defaultVals: string[] = ["false"]) {
            super(h, key, defaultVals, ["true", "false"]);
        }
    }

    function isValidHeaderName(name: string): boolean {
        return name
            .trim()
            .split("-")
            .every((part) => part.length > 0 && headerNamePattern.test(part));
    }

    function toMethodName(headerName: string): string {
        const normalized = headerName.trim().replace(/_/g, "-");
        const kebab = normalized.includes("-")
            ? normalized
            : normalized.replace(/([a-z0-9])([A-Z])/g, "$1-$2");
        const parts = kebab.toLowerCase().split("-").filter(Boolean);
        return parts
            .map((part, index) => (index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)))
            .join("");
    }

    function toHeaderName(name: string): string {
        const normalized = name.trim().replace(/_/g, "-");
        const kebab = normalized.includes("-")
            ? normalized
            : normalized.replace(/([a-z0-9])([A-Z])/g, "$1-$2");
        const header = kebab
            .split("-")
            .filter(Boolean)
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
            .join("-");
        if (!header || !isValidHeaderName(header)) {
            throw new Reqor.Error(`Invalid HTTP header name: "${name}"`, "Reqor.Headers.HTTPHeaders");
        }
        return header;
    }

    function createForSpec(h: globalThis.Headers, spec: HeaderSpec): HeaderController {
        switch (spec.mode) {
            case "mime":
                return new MIME(h, spec.key, String(spec.defaultValue));
            case "mime-array":
                return new MIME_ARRAY(h, spec.key, String(spec.defaultValue));
            case "valid-string":
                if (!spec.validStrings) {
                    throw new Reqor.Error("Missing validity rule for header", "Reqor.Headers.HTTPHeaders");
                }
                return new VALID_STRING(h, spec.key, String(spec.defaultValue), spec.validStrings);
            case "any-string-array":
                if (!Array.isArray(spec.defaultValue)) {
                    throw new Reqor.Error("Expected array default for any-string-array", "Reqor.Headers.HTTPHeaders");
                }
                return new ANY_STRING_ARRAY(h, spec.key, spec.defaultValue.map(String));
            case "any-string":
                return new ANY_STRING(h, spec.key, String(spec.defaultValue));
            case "number":
                return new NUMBER_STRING(h, spec.key, String(spec.defaultValue));
            case "number-array":
                if (!Array.isArray(spec.defaultValue)) {
                    throw new Reqor.Error("Expected array default for number-array", "Reqor.Headers.HTTPHeaders");
                }
                return new NUMBER_ARRAY(h, spec.key, spec.defaultValue.map(Number));
            case "string-bool":
                return new STRING_BOOL(h, spec.key, String(spec.defaultValue));
            case "string-bool-array":
                if (!Array.isArray(spec.defaultValue)) {
                    throw new Reqor.Error("Expected array default for string-bool-array", "Reqor.Headers.HTTPHeaders");
                }
                return new STRING_BOOL_ARRAY(h, spec.key, spec.defaultValue.map(String));
            case "valid-string-array":
                if (!Array.isArray(spec.defaultValue) || !spec.validStrings) {
                    throw new Reqor.Error("Missing validity rule for header array", "Reqor.Headers.HTTPHeaders");
                }
                return new VALID_STRING_ARRAY(h, spec.key, spec.defaultValue.map(String), spec.validStrings);
            default:
                throw new Reqor.Error(`Unsupported header mode "${String(spec.mode)}"`, "Reqor.Headers.HTTPHeaders");
        }
    }

    function toCallableController<T extends HeaderController>(controller: T) {
        return createCallableObject(controller, (v?: unknown) => {
            if (v !== undefined && "set" in controller && typeof controller.set === "function") {
                controller.set(v as never);
            }
            return controller;
        });
    }

    function fromHeaderName(h: globalThis.Headers, headerName: string) {
        const key = toHeaderName(headerName);
        const spec = HEADER_SPECS[toMethodName(key)];
        if (spec) return toCallableController(createForSpec(h, spec));
        return toCallableController(new VALID_STRING(h, key, h.get(key) ?? "", () => true));
    }

    export function create(h: globalThis.Headers) {
        return new Proxy({} as Record<string, unknown>, {
            get(_target, property) {
                if (property === Symbol.iterator) return h.entries.bind(h);
                if (property === Symbol.asyncIterator) {
                    return async function* () {
                        for (const entry of h.entries()) yield entry;
                    };
                }
                if (property === Symbol.toStringTag) return "ReqorHTTPHeaders";
                if (typeof property !== "string") return undefined;
                return fromHeaderName(h, property);
            },
        });
    }

    export function header(h: globalThis.Headers, name: string) {
        return fromHeaderName(h, name);
    }

    export function typed(
        h: globalThis.Headers,
        name: string,
        mode: HeaderMode,
        defaultValue: HeaderPrimitive | HeaderPrimitive[],
        validStrings?: ValidityCheck,
    ) {
        const spec: HeaderSpec = {
            key: toHeaderName(name),
            mode,
            defaultValue,
            validStrings,
        };
        return toCallableController(createForSpec(h, spec));
    }

    export function contentType(h: globalThis.Headers) {
        return fromHeaderName(h, "Content-Type");
    }

    export function accept(h: globalThis.Headers) {
        return fromHeaderName(h, "Accept");
    }

    export function acceptEncoding(h: globalThis.Headers) {
        return fromHeaderName(h, "Accept-Encoding");
    }

    export function acceptLanguage(h: globalThis.Headers) {
        return fromHeaderName(h, "Accept-Language");
    }

    export function acceptPatch(h: globalThis.Headers) {
        return fromHeaderName(h, "Accept-Patch");
    }

    export function acceptPost(h: globalThis.Headers) {
        return fromHeaderName(h, "Accept-Post");
    }
}
function createCallableObject<T extends object>(
    target: T,
    handler: (v?: any) => T,
): T & ((v?: any) => T) {
    const fn = (v?: any) => handler(v);

    (fn as any).valueOf = () =>
        typeof (target as any)?.valueOf === "function"
            ? (target as any).valueOf()
            : target;
    (fn as any).toString = () =>
        typeof (target as any)?.toString === "function"
            ? (target as any).toString()
            : String(target);
    (fn as any)[Symbol.toPrimitive] = (hint: string) => {
        if (typeof (target as any)?.[Symbol.toPrimitive] === "function") {
            return (target as any)[Symbol.toPrimitive](hint);
        }
        if (hint === "number") return Number((fn as any).valueOf());
        if (hint === "string") return (fn as any).toString();
        return (fn as any).valueOf();
    };

    return new Proxy(fn as any, {
        get(innerTarget, property, receiver) {
            if (property in target) {
                const value = (target as any)[property];
                return typeof value === "function" ? value.bind(target) : value;
            }
            return Reflect.get(innerTarget, property, receiver);
        },
        set(innerTarget, property, value, receiver) {
            if (property in target) {
                (target as any)[property] = value;
                return true;
            }
            return Reflect.set(innerTarget, property, value, receiver);
        },
        has(innerTarget, property) {
            return property in target || Reflect.has(innerTarget, property);
        },
        ownKeys(innerTarget) {
            return Array.from(new Set([...Reflect.ownKeys(innerTarget), ...Reflect.ownKeys(target as any)]));
        },
        getOwnPropertyDescriptor(innerTarget, property) {
            return (
                Reflect.getOwnPropertyDescriptor(target as any, property)
                ?? Reflect.getOwnPropertyDescriptor(innerTarget, property)
            );
        },
    }) as T & ((v?: any) => T);
}

namespace Reqor.Headers.HTTPHeaders.ContentType {
    export const validBases = Reqor.Headers.HTTPHeaders.contentTypeValidBases;
    export type validBases = (typeof validBases)[number];
}

/**
 * Create a new reqor class using a easy function way (ClassWrapperFunction())
 * @param url
 * @returns
 */
function reqor(url: string) {
    if (!JSTC.for([url]).check(["checkurl"]))
        throw new Reqor.Error("Invalid URL");
    return new Reqor(url);
}
