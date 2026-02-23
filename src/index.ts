import JSTC from "@briklab/lib/jstc"
JSTC.addCustomHandler("checkurl", (string: any) => {
    if (typeof string !== "string") return false;
    if (!/^[A-Za-z]+:\/\/[A-Za-z0-9.-]+$/.test(string)) return false;
    return true;
});

/**
 * The main class for Reqor.
 */
class Reqor {
    #url: string;
    constructor(url: string) {
        this.#url = url;
    }
    /**
     * ### THIS IS A ASYNC FUNCTION
     * send a response to the given url
     */
    async get() {
        // check if fetch exists or not, else throw a error.
        if (!fetch) throw new Reqor.Error("fetch api not found.")
        // first use fetch to request.   
        let a = await fetch(this.#url, {
            method: "GET",
        })
        // now create the wrapper
        let b: Reqor.Response = {
            raw: a,
            headers: new Reqor.Headers(a.headers)
        }
        return b;
    }
}
namespace Reqor {
    
    /**
     * Error instance used by Reqor.
     */
    export class Error extends globalThis.Error {
        constructor(message: string) {
            super(message);
            this.name = "[reqor] Error"
            this.stack = "at reqor [@briklab/reqor]"
        }
    }
    /**
     * Response returned by **reqor**.
     */
    export interface Response {
        /**
         * Raw Response returned by fetch()
         */
        raw: globalThis.Response;

        /**
         * A easier way to use [**Response.headers**](https://developer.mozilla.org/en-US/docs/Web/API/Response/headers)
         */
        headers: Reqor.Headers;
    }
    /**
     * **Headers** returned in a Reqor Response
     */
    export class Headers {
        constructor(original: Headers) {
            let h: Reqor.Headers.Map = { ...original }
            // an easy wrapper for h.append
            h.new = (name: string, value?: any) => {
                // if value is given, append
                if (!!value) h.append(name, value)

                // if not given, return a function to provide a value so you can append
                else return function (value: any) { h.append(name, value) }
            }
            return h;
        }
    }
}
namespace Reqor.Headers {
    export interface Map {
        [key: string]: any;
        /** Creates a new **Key**-**Value** in the header.
         * @example
         * reqor("myurl").get().headers.new("key")("value")
        */
        new?: (name: string, value?: any) => void | ((value: any) => void);
    }
    export class Value {
        #k:string
        #v:string
        constructor(k:string,v:string){
            // initialize variables
            this.#k = k; this.#v = v;
        }
    }
}
namespace Reqor.Headers.Map {

}
/**
 * Create a new reqor class using a easy function way (ClassWrapperFunction())
 * @param url 
 * @returns 
 */
function reqor(url: string) {
    if (!JSTC.for([url]).check(["checkurl"])) throw new Reqor.Error("Invalid URL")
    return new Reqor(url)
}