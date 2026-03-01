import JSTC from "@briklab/lib/jstc";
JSTC.addCustomHandler("checkurl", (string: any) => {
  if (typeof string !== "string") return false;
  if (!/^[a-zA-Z]+:\/\/[^\s]+$/.test(string)) return false;
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
    if (!fetch) throw new Reqor.Error("fetch api not found.");
    // first use fetch to request.
    let a = await fetch(this.#url, {
      method: "GET",
    });
    // now create the wrapper
    let b: Reqor.Response = {
      raw: a,
      headers: new Reqor.Headers(a.headers),
    };
    return b;
  }
}
namespace Reqor {
  /**
   * Error instance used by Reqor.
   */
  export class Error extends globalThis.Error {
    constructor(message: string, sub?: string) {
      super(message);
      this.name = `[reqor ${sub ? `.${sub}` : ""}] Error`;
      this.stack = `at reqor ${sub ? `.${sub}` : ""} [@briklab/reqor]`;
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
    constructor(original: globalThis.Headers) {
      let h: Reqor.Headers.Map = {};
      // an easy wrapper for h.append
      h.new = (name: string, value?: any) => {
        return Reqor.Headers.value(original, name, value);
      };
      h.append = h.new;
      h.getContentType = () =>
        original.get("content-type") || original.get("Content-Type");
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
      },
    });
  }
}

namespace Reqor.Headers.HTTPHeaders {
  export function contentType(h: globalThis.Headers) {
    const b = new ContentType(h);

    const a = (v?: string) => {
      if (v !== undefined) b.set(v);
      return b;
    };

    a.valueOf = () => b.toString();
    a.toString = () => b.toString();

    return a;
  }
  class ContentType {
    #v: string;
    base: Function;
    subtype: Function;
    set(val: string) {
      this.#v = val;
    }
    constructor(h: globalThis.Headers) {
      this.#v =
        (h.get("Content-Type") || h.get("content-type")) ?? "text/plain";
      this.base = (base: Reqor.Headers.HTTPHeaders.ContentType.validBases) => {
        let a = this.#v.split("/");
        a[0] = base;
        this.#v = a.join("/");
        return this;
      };
      this.base.toString = () => this.#v.split("/")[0];
      this.base.valueOf = () => this.#v.split("/")[0];

      this.subtype = (str: string) => {
        let a = this.#v.split("/");
        a[1] = str;
        this.#v = a.join("/");
        return this;
      };
      this.subtype.toString = () => this.#v.split("/")[1];
      this.subtype.valueOf = () => this.#v.split("/")[1];
      this.valueOf = () => this.#v;
      this.toString = () => this.#v;
    }
  }
}
namespace Reqor.Headers.HTTPHeaders.ContentType {
  export const validBases = [
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
  ] as const;
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
