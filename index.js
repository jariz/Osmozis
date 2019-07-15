const delay = require('delay');
const { getAuthUrl } = require('./getAuthUrl');
const { run } = require('./run');
const fetch = require('node-fetch');
const queryString = require('querystring');
const { writeFile } = require('fs');
const { promisify } = require('util');
const writeFilePromise = promisify(writeFile);
const replaceColor = require('replace-color');
const color = require('color');
const PrettyError = require('pretty-error');
const every = require('every');
const pe = new PrettyError();
const faker = require('faker');

let renewalRunning = false;
if (process.getuid() !== 0) {
    console.log('must be ran as root (required for spoof)');
    return;
}

const spoof = async () => {
    console.log ('Spoof required, spoofing... ☁')

    // spoof mac
    await run('./node_modules/.bin/spoof randomize en0');

    // reconnect wifi (macOS ONLY)
    await run('networksetup -setairportnetwork en0 "Hotzone 14 - Le Royannais"');

    // wait for network to come back up online
    const redirectUrl = null
    while (!redirectUrl) {
        try {
            redirectUrl = await getAuthUrl();
        } catch (ex) {
            console.log('Network appears to be down, retrying in a second');
        }
        await delay(1000);
    }

    console.log('Network appears to be up again, going to attempt a renewal...');
}

const giveMeWifi = async () => {
    renewalRunning = true;

    // get sess token
    const redirectUrl = await getAuthUrl()

    if (!redirectUrl) {
        return;
    }

    console.log('Block detected. Attempting renewal.')

    let authenticated = false;

    while (!authenticated) {
        try {
            const token = new URL(redirectUrl).searchParams.get('key');

            // grab current color
            const targetColor = await fetch('https://auth.osmoziswifi.com/api/auth-portal/v1/captchas', {
                headers: {
                    'X-Session-Token': token,
                },
                method: 'POST',
            })
                .then(resp => resp.json())
                .then(json => json.color);

            // download captcha
            await fetch(`https://auth.osmoziswifi.com/api/auth-portal/v1/captchas/current?v=1563187435355&session-token=${token}`)
                .then(x => x.arrayBuffer())
                .then(x => writeFilePromise('current.png', Buffer.from(x)));

            console.log('Captcha color:', targetColor);

            // color target characters white
            const colors = {
                type: 'rgb',
                // weird hack needed here because color lib parses 'green' as only partially green(?!)
                targetColor: targetColor === 'green' ? [0, 255, 0] : color(targetColor).array(),
                replaceColor: [255, 255, 255],
            };
            await replaceColor({
                image: 'current.png',
                colors,
            })
                .then(image => image.write('current_proc.png'));

            // now that our target color is white, replace every other color
            for (const current of ['yellow', 'red', 'green']) {
                const colors = {
                    type: 'rgb',
                    targetColor: current === 'green' ? [0, 255, 0] : color(current).array(),
                    replaceColor: [0, 0, 0],
                };
                await replaceColor({
                    image: 'current_proc.png',
                    colors,
                })
                    .then(image => image.write('current_proc.png'));
            }

            // guess it!
            const out = await run('tesseract current_proc.png - --dpi 72 -l script/Latin --psm 7');
            const code = out.replace(/[\s\n]/g, '').toUpperCase();
            console.log('code: ' + code);

            // send challenge
            const { statusCode } = await fetch('https://auth.osmoziswifi.com/api/auth-portal/v1/authentications', {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'X-Session-Token': token,
                },
                body: JSON.stringify({
                    'trial_auth': {
                        'email': faker.internet.email(),
                        'captchaCode': code
                    }
                }),
            }).then(a => a.json());

            // trial expired. mac spoof needed
            if (statusCode === -102) {
                await spoof();
            }

            authenticated = statusCode === 0;

            if (!authenticated) {
                console.log('Failure, retrying. 😭🔄')
            }
        } catch (ex) {
            console.log(`Failure (${ex.message}), retrying.`);
        }
    }

    console.log("We're in 😎✌️");
    renewalRunning = false;
};

const go = () => {
    if (!renewalRunning) {
        giveMeWifi()
            .catch(x => console.error(pe.render(x)));
    }
}

setInterval(() => go(), 1000);
go();