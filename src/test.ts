import reqor from "./index.js";

type ReqorInstance = ReturnType<typeof reqor>;
type ReqorResult =
    | Awaited<ReturnType<ReqorInstance["get"]>>
    | Awaited<ReturnType<ReqorInstance["post"]>>;

function assertImmediateResponse(response: ReqorResult) {
    if (!("ok" in response)) {
        throw new Error("Expected an immediate Response, but got a delayed ResponseLater.");
    }
    return response;
}

function assertDelayedResponse(response: ReqorResult) {
    if (!("cancel" in response)) {
        throw new Error("Expected a delayed ResponseLater, but got an immediate Response.");
    }
    return response;
}

async function basicGetExample() {
    const urlParams = new URLSearchParams();
    urlParams.set("by", "url-search-params");

    const response = assertImmediateResponse(
        await reqor("https://jsonplaceholder.typicode.com/todos/1")
            .params({ source: "reqor-test", basic: true })
            .params([{ layer: "array-a" }, { layer: "array-b" }])
            .params(urlParams)
            .get(),
    );

    console.log("[basic] status:", response.status.toString(), "ok:", response.ok);
    console.log("[basic] content-type:", response.headers.getContentType?.() ?? "<none>");
    console.log("[basic] body sample:", (await response.json()).title);
}

async function getWithInlineOptionsExample() {
    const response = assertImmediateResponse(
        await reqor("https://jsonplaceholder.typicode.com/todos/2").get({
            retry: {
                number: 1,
                delay: {
                    number: 150,
                    increaseFn: (current) => current + 150,
                },
                onRetry: (retryNumber) => console.log("[get-inline] retry:", retryNumber),
            },
            timeout: {
                time: 2500,
                onTimeout: (retryNumber) => console.log("[get-inline] timeout on retry:", retryNumber),
            },
            totalTimeout: {
                time: 6000,
                onTimeout: () => console.log("[get-inline] total timeout exceeded"),
            },
            params: [{ mode: "inline-options" }],
        }),
    );

    console.log("[get-inline] final status:", response.status.toString(), "url:", response.url);
}

async function retryAndTimeoutChainExample() {
    const response = assertImmediateResponse(
        await reqor("https://jsonplaceholder.typicode.com/todos/2")
            .retry(2)
            .retryDelay(250, (current) => current + 250)
            .onRetry((retryNumber) => console.log("[get-chain] retry:", retryNumber))
            .timeout(2000)
            .onTimeout((retryNumber) => console.log("[get-chain] timeout on retry:", retryNumber))
            .totalTimeout(7000)
            .onTotalTimeout(() => console.log("[get-chain] total timeout exceeded"))
            .get(),
    );

    console.log("[get-chain] final status:", response.status.toString());
}

async function responseMetadataExample() {
    const response = assertImmediateResponse(await reqor("https://jsonplaceholder.typicode.com/posts/1").get());

    console.log("[meta] status:", Number(response.status), response.status.text, "ok:", response.status.ok);
    console.log(
        "[meta] status ranges:",
        "redirected=", response.status.redirected,
        "clientError=", response.status.clientError,
        "serverError=", response.status.serverError,
    );
    console.log(
        "[meta] type:",
        response.type.toString(),
        "isBasic=", response.type.isBasic(),
        "isCors=", response.type.isCors(),
    );
    console.log("[meta] redirected flag:", response.redirected, "statusText:", response.statusText);
}

async function responseReadersExample() {
    const asText = assertImmediateResponse(await reqor("https://jsonplaceholder.typicode.com/posts/1").get());
    console.log("[readers] text length:", (await asText.text()).length);

    const asJson = assertImmediateResponse(await reqor("https://jsonplaceholder.typicode.com/posts/1").get());
    console.log("[readers] json keys:", Object.keys(await asJson.json()).slice(0, 3));

    const asArrayBuffer = assertImmediateResponse(await reqor("https://jsonplaceholder.typicode.com/posts/1").get());
    console.log("[readers] arrayBuffer bytes:", (await asArrayBuffer.arrayBuffer()).byteLength);

    const asBlob = assertImmediateResponse(await reqor("https://jsonplaceholder.typicode.com/posts/1").get());
    const blob = await asBlob.blob();
    console.log("[readers] blob size/type:", blob.size, blob.type || "<none>");

    const asBodyText = assertImmediateResponse(await reqor("https://jsonplaceholder.typicode.com/posts/1").get());
    console.log("[readers] body.text length:", (await asBodyText.body.text()).length, "used:", asBodyText.body.used);

    const asBodyPump = assertImmediateResponse(await reqor("https://jsonplaceholder.typicode.com/posts/1").get());
    let pumpedBytes = 0;
    await asBodyPump.body.pump((chunk: Uint8Array) => {
        pumpedBytes += chunk.byteLength;
    });
    console.log("[readers] body.pump bytes:", pumpedBytes, "used:", asBodyPump.body.used);
}

async function headersHelperExample() {
    const response = assertImmediateResponse(await reqor("https://jsonplaceholder.typicode.com/posts/1").get());

    console.log("[headers] getContentType:", response.headers.getContentType?.() ?? "<none>");
    console.log("[headers] has(content-type):", response.headers.has("content-type"));

    let headerCount = 0;
    for (const [key, value] of response.headers) {
        headerCount++;
        if (headerCount <= 3) {
            console.log("[headers] sample entry:", key, "=", value);
        }
    }
    console.log("[headers] total entries:", headerCount);

    const httpHeaders = response.headers.http as any;

    const contentType = httpHeaders.contentType();
    const cacheControl = httpHeaders.cacheControl();
    const contentLength = httpHeaders.contentLength();
    const vary = httpHeaders.vary();
    const customHeader = httpHeaders.xReqorDemo();

    console.log("[headers] contentType:", contentType.toString());
    console.log("[headers] cacheControl:", cacheControl.toString());
    console.log("[headers] contentLength number:", contentLength.number);
    console.log("[headers] vary length:", vary.length, "first:", vary.at(0));
    console.log("[headers] custom header value:", customHeader.toString());

    try {
        const demoHeader = response.headers.new?.("x-reqor-demo", "v1") as any;
        demoHeader?.("v2");
        demoHeader?.delete?.();
        console.log("[headers] new/append/add helper works");
    } catch (error) {
        console.log("[headers] mutation helper not available on this runtime:", (error as Error).message);
    }
}

async function postExample() {
    const response = assertImmediateResponse(
        await reqor("https://jsonplaceholder.typicode.com/posts")
            .retry(1)
            .timeout(2000)
            .post(
                {
                    title: "Reqor POST demo",
                    body: "Testing Reqor post() with retries and timeout",
                    userId: 1,
                },
                {
                    params: [{ source: "reqor-test" }],
                },
            ),
    );

    console.log("[post] status:", response.status.toString(), "ok:", response.ok);
    console.log("[post] response title:", (await response.json()).title);
}

async function postDataMethodAndPayloadVariantsExample() {
    const responseFromDataMethod = assertImmediateResponse(
        await reqor("https://jsonplaceholder.typicode.com/posts")
            .data({
                title: "Reqor data() demo",
                body: "Payload provided via .data()",
                userId: 7,
            })
            .post(undefined, {
                params: [{ source: "reqor-test" }],
            }),
    );
    console.log("[post/data] status:", responseFromDataMethod.status.toString());

    const responseFromString = assertImmediateResponse(
        await reqor("https://jsonplaceholder.typicode.com/posts").post("plain-text payload"),
    );
    console.log("[post/string] status:", responseFromString.status.toString());

    const formEncoded = new URLSearchParams();
    formEncoded.set("title", "Reqor URLSearchParams");
    formEncoded.set("userId", "9");
    const responseFromFormEncoded = assertImmediateResponse(
        await reqor("https://jsonplaceholder.typicode.com/posts").post(formEncoded),
    );
    console.log("[post/urlsearchparams] status:", responseFromFormEncoded.status.toString());
}

async function delayedFetchCancelExample() {
    const delayed = assertDelayedResponse(
        await reqor("https://jsonplaceholder.typicode.com/todos/3")
            .after(3000)
            .get(),
    );

    setTimeout(() => {
        const canceled = delayed.cancel();
        console.log("[delayed/cancel] cancel() called:", canceled);
    }, 1000);

    await delayed.done;
    console.log("[delayed/cancel] activated:", delayed.activated, "canceled:", delayed.canceled);
}

async function delayedFetchActivationExample() {
    const delayed = assertDelayedResponse(
        await reqor("https://jsonplaceholder.typicode.com/todos/4")
            .after(500)
            .get(),
    );

    await delayed.done;
    console.log("[delayed/activate] activated:", delayed.activated, "canceled:", delayed.canceled);
}

async function delayedPostActivationExample() {
    const delayed = assertDelayedResponse(
        await reqor("https://jsonplaceholder.typicode.com/posts")
            .after(500)
            .post({ title: "delayed-post", body: "post after delay", userId: 22 }),
    );

    await delayed.done;
    console.log("[delayed/post] activated:", delayed.activated, "canceled:", delayed.canceled);
}

async function main() {
    await basicGetExample();
    await getWithInlineOptionsExample();
    await retryAndTimeoutChainExample();
    await responseMetadataExample();
    await responseReadersExample();
    await headersHelperExample();
    await postExample();
    await postDataMethodAndPayloadVariantsExample();
    await delayedFetchCancelExample();
    await delayedFetchActivationExample();
    await delayedPostActivationExample();
}

main().catch((error) => {
    console.error("[test] failed:", error);
});
