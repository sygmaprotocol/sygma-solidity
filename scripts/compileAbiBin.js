#!/usr/bin/env node
// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only

const fs = require("fs");
const rimraf = require("rimraf");

const BUILD_PATH = "./build/bindings/";
const ABI_PATH = BUILD_PATH + "abi/"
const BIN_PATH = BUILD_PATH + "bin/"
const RUNTIME_PATH = BUILD_PATH + "runtime/"

// Loop through all the files in the temp directory
fs.readdir("./build/contracts", function (err, files) {
    if (err) {
        console.error("Could not list the directory.", err);
        process.exit(1);
    }

    // Remove old build
    rimraf.sync(BUILD_PATH);

    // Create empty dirs
    fs.mkdirSync(BUILD_PATH)
    if (!fs.existsSync(ABI_PATH)) {
        fs.mkdirSync(ABI_PATH);
    }
    if (!fs.existsSync(BIN_PATH)) {
        fs.mkdirSync(BIN_PATH);
    }
    if (!fs.existsSync(RUNTIME_PATH)) {
        fs.mkdirSync(RUNTIME_PATH);
    }

    files.forEach(function (file) {
        const basename = file.split(".")[0];
        const path = "./build/contracts/" + file
        const rawdata = fs.readFileSync(path);
        const contract = JSON.parse(rawdata);
        // eslint-disable-next-line prefer-const
        let {abi, bytecode} = contract;
        bytecode = bytecode.substring(2);

        if (abi.length === 0) return;
        fs.writeFileSync(ABI_PATH + basename + ".abi"  , JSON.stringify(abi));
        fs.writeFileSync(BIN_PATH + basename + ".bin", bytecode);
    });
});
