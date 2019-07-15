/* eslint-disable no-console */
// executes a process and returns a promise while redirecting its stdout + stdin to our own

const cp = require('child_process');
const chalk = require('chalk');

exports.run = (command, options = {}) => {
    // probably don't pass too advanced commands into this function, because this 'argument parser' is kinda dumb
    const args = command.split(' ');
    const cmd = args.splice(0, 1)[0];

    console.log(chalk`$ {dim ${command}}`);
    return new Promise((resolve, reject) => {
        let out = '';
        const child = cp.spawn(cmd, args, {
            // stdio: 'inherit',
            // shell: true,
            ...options
        });

        child.stdout.on('data', data => {
            out += data.toString();
        })

        child.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(`Process ${command} exited with code ${code}`));
            } else {
                resolve(out);
            }
        });
    });
};