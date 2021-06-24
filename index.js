const request = require("request-promise");
const {createCanvas, loadImage} = require("canvas");
const hasha = require("hasha");

const SERVERS = ["nougat", "noodle", "nugget", "melon", "mango"];
const TESTS_PER_SERVER = 4;
const PIXEL_CHECK_INTERVAL = 4;

let successCount = 0;
let failCount = 0;

let log = {};

async function testServer(server) {
    if (!log.hasOwnProperty(server)) {
        log[server] = [];
    }

    const model = Math.random() < 0.5 ? "slim" : "steve";
    const name = "mineskin-tester-" + Math.round(Date.now() / 1000);
    const img = makeRandomImage();
    const imgHash = imageHash(img.imageBuffer);

    const start = Date.now();

    let testResult = {};

    const formData = {
        model: model,
        name: name,
        visibility: 1,
        file: {
            value: img.imageBuffer,
            options: {
                filename: name + ".png",
                contentType: "image/png"
            }
        }
    };
    console.log("Testing Server " + server);
    console.log("Model: " + model);
    console.log("Name: " + name);
    console.log("Image Hash: " + imgHash);
    try {
        let res = await request({
            method: "POST",
            url: "https://" + server + ".api.mineskin.org/generate/upload",
            formData: formData,
            headers: {
                "Authorization": "Bearer " + process.env.MINESKIN_API_KEY,
                "User-Agent": "mineskin-tester"
            }
        });
        console.debug("Response: ");
        try {
            res = JSON.parse(res);
        } catch (e) {
            console.warn(e);
        }
        console.debug(JSON.stringify(res, null, 2));

        if (res.error) {
            console.log("FAILED (" + Math.round((Date.now() - start) / 1000) + "s)");
            failCount++;
            console.warn("Error: " + res.error);
            testResult = {
                r: "fail",
                s: server,
                d: (Date.now() - start) / 1000,
                e: res.error || res.statusCode
            };
        } else if (res.id) {
            console.log("SUCCESS (" + Math.round((Date.now() - start) / 1000) + "s)");
            successCount++;
            console.log("New ID: " + res.id);
            testResult = {
                r: "success",
                s: server,
                d: (Date.now() - start) / 1000,
                i: res.id
            };

            if (res.server !== server) {
                console.warn("Server of returned skin does not match the requested server! (req: " + server + ", ret: " + res.server + ")");
            }
            if (res.model !== model) {
                console.warn("Model of returned skin does not match the requested model! (req: " + model + ", ret: " + res.model + ")")
            }

            let mismatchCounter = 0;
            let generatedImgData = await loadImageIntoCanvasData(res.data.texture.url);
            if (img.imageData.width !== generatedImgData.width) {
                console.warn("Width of original image and generated image do not match! (req: " + img.imageData.width + ", ret: " + generatedImgData.width + ")");
                mismatchCounter++;
            } else if (img.imageData.height !== generatedImgData.height) {
                console.warn("Height of original image and generated image do not match! (req: " + img.imageData.height + ", ret: " + generatedImgData.height + ")");
                mismatchCounter++;
            } else {
                let originalData = img.imageData.data;
                let generatedData = generatedImgData.data;
                let i = 0;
                // based on https://gist.github.com/olvado/1048628/d8184b8ea695372e49b403555870a044ec9d25d0#file-getaveragecolourasrgb-js-L29
                while ((i += PIXEL_CHECK_INTERVAL * 4) < originalData.length) {
                    if (originalData[i] !== generatedData[i]) {// R
                        console.warn("Red Value of original image and generated image do not match at index " + i + "! (req: " + originalData[i] + ", ret: " + generatedData[i] + ")");
                        mismatchCounter++;
                    }
                    if (originalData[i + 1] !== generatedData[i + 1]) {// G
                        console.warn("Green Value of original image and generated image do not match at index " + i + "! (req: " + originalData[i + 1] + ", ret: " + generatedData[i + 1] + ")");
                        mismatchCounter++;
                    }
                    if (originalData[i + 2] !== generatedData[i + 2]) {// B
                        console.warn("Blue Value of original image and generated image do not match at index " + i + "! (req: " + originalData[i + 2] + ", ret: " + generatedData[i + 2] + ")");
                        mismatchCounter++;
                    }
                    if (originalData[i + 3] !== generatedData[i + 3]) {// A
                        console.warn("Alpha Value of original image and generated image do not match at index " + i + "! (req: " + originalData[i + 3] + ", ret: " + generatedData[i + 3] + ")");
                        mismatchCounter++;
                    }
                }
            }
            if (mismatchCounter > 0) {
                console.warn("Found a total of " + mismatchCounter + " color mismatches in generated image");
                testResult.m = mismatchCounter;
            } else {
                console.debug("Generated image matches original! Yay!")
            }
        }
    } catch (e) {
        console.log("FAILED (" + Math.round((Date.now() - start) / 1000) + "s)");
        console.warn("Upload failed!");
        console.warn(e);
        let err = e.error;
        try {
            err = JSON.parse(err);
        } catch (e) {
        }
        console.debug(JSON.stringify(err || e));
        failCount++;
        if (err)
            console.warn("Error: " + err.error);

        testResult = {
            r: "fail",
            s: server,
            d: (Date.now() - start) / 1000,
            e: err ? (err.error || err.statusCode) : e
        };
    }
    log[server].push(testResult);
    console.log("  ");

    if (process.env.MINESKIN_TEST_UPLOAD_KEY) {
        request({
            method: "POST",
            url: "https://" + server + ".api.mineskin.org/testing/upload_tester_result",
            json: {
                token: process.env.MINESKIN_TEST_UPLOAD_KEY,
                data: testResult
            },
            headers: {
                "User-Agent": "mineskin-tester"
            }
        });
    }
}

function makeRandomImage(width = 64, height = 64) {
    const canvas = createCanvas(width, height);
    const context = canvas.getContext("2d");
    const imageData = context.getImageData(0, 0, width, height);

    // https://gist.github.com/biovisualize/5400576#file-index-html-L26
    const buffer = new ArrayBuffer(imageData.data.length);
    const clampedBuffer = new Uint8ClampedArray(buffer);
    const data = new Uint32Array(buffer);

    for (let x = 0; x < width; x++) {
        for (let y = 0; y < height; y++) {
            data[y * width + x] =
                (255 << 24) |
                (((Math.random() * 300) % 255) << 16) |
                (((Math.random() * 300) % 255) << 8) |
                (((Math.random() * 300) % 255))
        }
    }

    imageData.data.set(clampedBuffer);
    context.putImageData(imageData, 0, 0);

    // Make Buffer
    const dataUrl = canvas.toDataURL("image/png").substr("data:image/png;base64,".length);
    const imageBuffer = new Buffer(dataUrl, 'base64');
    return {imageBuffer, imageData, data}
}

async function loadImageIntoCanvasData(url, width = 64, height = 64) {
    const canvas = createCanvas(width, height);
    const context = canvas.getContext("2d");
    let img = await loadImage(url);
    context.drawImage(img, 0, 0, width, height);
    return context.getImageData(0, 0, width, height);
}

// https://github.com/MineSkin/api.mineskin.org/blob/master/routes/generate.js#L22
function imageHash(buf) {
    return hasha(buf, {algorithm: 'sha1'});
}

function sleep(t = 1000) {
    return new Promise(resolve => {
        console.debug("Sleeping " + (t / 1000) + "s...");
        setTimeout(resolve, t);
    })
}

// https://stackoverflow.com/questions/2450954/how-to-randomize-shuffle-a-javascript-array/2450976#2450976
function shuffle(array) {
    let currentIndex = array.length, temporaryValue, randomIndex;

    // While there remain elements to shuffle...
    while (0 !== currentIndex) {

        // Pick a remaining element...
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex -= 1;

        // And swap it with the current element.
        temporaryValue = array[currentIndex];
        array[currentIndex] = array[randomIndex];
        array[randomIndex] = temporaryValue;
    }

    return array;
}

async function run() {
    shuffle(SERVERS);

    console.log("Running " + TESTS_PER_SERVER + " tests each on " + SERVERS.length + " servers...");
    for (let i = 0; i < TESTS_PER_SERVER; i++) {
        console.log("Running Test #" + (i + 1));
        for (let server of SERVERS) {
            await sleep(8000);
            await testServer(server);
            await sleep(8000);
        }
        await sleep(8000);
    }
}

// require("fs").writeFileSync("test.png", makeRandomImage());

run().then(() => {
    console.log("done!");

    let successRate = successCount / (TESTS_PER_SERVER * SERVERS.length);

    console.log("Summary: ");
    console.log("TESTS:   " + (TESTS_PER_SERVER * SERVERS.length));
    console.log("SUCCESS: " + successCount);
    console.log("FAIL:    " + failCount);
    console.log("(" + Math.round(successRate * 100) + "% success rate)");
    console.log(" ");
    console.log(JSON.stringify(log, null, 2));

    process.exit(successRate > 0.5 ? 0 : 1);
});

