const request = require("request-promise");
const {createCanvas} = require("canvas");
const hasha = require("hasha");

const SERVERS = ["apple", "nougat", "melon"];
const TESTS_PER_SERVER = 1;

let successCount = 0;
let failCount = 0;

let log = {};

async function testServer(server) {
    if (!log.hasOwnProperty(server)) {
        log[server] = [];
    }

    const model = Math.random() < 0.5 ? "slim" : "steve";
    const name = "mineskin-tester-" + Math.round(Date.now() / 1000);
    const imageData = makeRandomImage();
    const imgHash = imageHash(imageData);

    const start = Date.now();

    const formData = {
        model: model,
        name: name,
        visibility: 0,
        file: {
            value: imageData,
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
            url: "http://" + server + ".api.mineskin.org/generate/upload",
            formData: formData
        });
        console.debug("Response: ");
        try {
            res = JSON.parse(res);
        } catch (e) {
            console.warn(e);
        }
        console.debug(JSON.stringify(res, null, 2));

        if (res.error) {
            console.log("FAILED ("+Math.round((Date.now()-start)/1000)+"s)");
            failCount++;
            console.warn("Error: " + res.error);
            log[server].push({
                r: "fail",
                s: server,
                d: (Date.now()-start)/1000,
                e: res.error
            })
        } else if (res.id) {
            console.log("SUCCESS ("+Math.round((Date.now()-start)/1000)+"s)");
            successCount++;
            console.log("New ID: " + res.id);
            log[server].push({
                r: "success",
                s: server,
                d: (Date.now()-start)/1000,
                ie: res.id
            });

            if (res.server !== server) {
                console.warn("Server of returned skin does not match the requested server! (req: " + server + ", ret: " + res.server + ")");
            }
            if (res.model !== model) {
                console.warn("Model of returned skin does not match the requested model! (req: " + model + ", ret: " + res.model + ")")
            }
        }
    } catch (e) {
        console.log("FAILED ("+Math.round((Date.now()-start)/1000)+"s)");
        console.warn("Upload failed!");
        let err = e.error;
        try {
            err = JSON.parse(err);
        } catch (e) {
        }
        console.debug(JSON.stringify(err || e));
        failCount++;
        if (err)
            console.warn("Error: " + err.error);

        log[server].push({
            r: "fail",
            s: server,
            d: (Date.now()-start)/1000,
            e: err.error
        })
    }
    console.log("  ");
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
    return new Buffer(dataUrl, 'base64');
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

async function run() {
    console.log("Running " + TESTS_PER_SERVER + " tests each on " + SERVERS.length + " servers...");
    for (let i = 0; i < TESTS_PER_SERVER; i++) {
        console.log("Running Test #" + (i+1));
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

    console.log("Summary: ")
    console.log("TESTS:   " + (TESTS_PER_SERVER * SERVERS.length));
    console.log("SUCCESS: " + successCount);
    console.log("FAIL:    " + failCount);
    console.log("(" + Math.round(successCount / (TESTS_PER_SERVER * SERVERS.length) * 100) + "% success rate)");
    console.log(" ");
    console.log(JSON.stringify(log, null, 2));
});

