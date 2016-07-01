#!/usr/bin/env node
/*
 * Copyright (C) 2013-2016 Stéphane Péchard.
 *
 * This file is part of PhotoBackup.
 *
 * PhotoBackup is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * PhotoBackup is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

(function () {
    'use strict';

    // command line documentation
    var doc = "\n" +
            "PhotoBackup NodeJS server.\n" +
            "\n" +
            "Usage:\n" +
            "  photobackup init [<username>]\n" +
            "  photobackup run [<username>]\n" +
            "  photobackup (-h | --help)\n" +
            "  photobackup --version\n" +
            "\n" +
            "Options:\n" +
            "  -h --help     Show this screen.\n" +
            "  --version     Show version.\n";

    // imports
    var bcrypt = require('bcrypt');
    var bodyParser = require('body-parser');
    var docopt = require('docopt').docopt;
    var express = require('express');
    var fs = require('fs');
    var ini = require('ini');
    var pb_init = require('./init').init;
    var multer = require('multer');
    var path = require('path');
    var packagejson = require(path.join(__dirname, 'package.json'));

    // variables
    var app = express();
    var args = docopt(doc, {version: packagejson.version});
    var home = process.env[(process.platform === 'win32') ? 'USERPROFILE' : 'HOME'];
    var config_path = path.join(home, '.photobackup');
    var config = {};

    // compute some internal information
    var username = ''; // default
    if (args.hasOwnProperty('<username>') && args['<username>'] !== null) {
        username = args['<username>'];
    }
    var section_name = 'photobackup'; // default
    if (username.length > 0) {
        section_name += '-' + username;
    }


    // which command to activate
    if (args.init) {
        pb_init(config_path, username, section_name);
    } else if (args.run) {

        try {
            config = ini.parse(fs.readFileSync(config_path, 'utf-8'));

            var port = 8420; // default
            if (config.hasOwnProperty(section_name) && config[section_name].hasOwnProperty('Port')) {
                port = config[section_name].Port;
            }
            var address = '127.0.0.1';
            if (config.hasOwnProperty(section_name) && config[section_name].hasOwnProperty('BindAddress')) {
                address = config[section_name].BindAddress;
            }

            app.listen(port, address, function () {
                console.log('PhotoBackup client listening on http://' + address + ':' + port + '\n');
            });

        } catch (e) {
            if (e instanceof Error && e.code === 'ENOENT') {
                var option = (username.length > 0) ? ' ' + username : '';
                console.error("Can't read configuration file, running 'photobackup init" + option + "'");
                pb_init(config_path, username, section_name);
            } else {
                console.error("Unknown error: " + e);
            }
        }
    }


    if (config.hasOwnProperty(section_name)) {

        // multer creates the directory if it does not exist
        app.use(multer({
            dest: config[section_name].MediaRoot,
            rename: function (fieldname, filename) { return filename; }
        }));
        // allows to access body parameters of the requests, because you have to...
        app.use(bodyParser.urlencoded({ extended: true }));


        ////////////
        // routes //
        ////////////
        app.get('/', function (req, res) {
            res.redirect('https://photobackup.github.io/');
            pblog(console.log, res.req.method + ' ' + res.req.url, res.statusCode);
        });


        app.post('/', function (req, res) {
            var password, filesize;
            try {
                password = req.body.password;
                filesize = parseInt(req.body.filesize, 10);
            } catch (err) {
                end(res, 400, 'missing parameter in the request! => ' + err);
            }

            if (!bcrypt.compareSync(password, config[section_name].PasswordBcrypt)) {
                end(res, 403, 'wrong password!');
            }
            if (!req.files.hasOwnProperty('upfile')) {
                end(res, 403, 'missing upfile');
            }
            if (!req.files.upfile.hasOwnProperty('fieldname')) {
                end(res, 403, 'upfile has no filedname!');
            }
            if (req.files.upfile.fieldname !== 'upfile') {
                end(res, 403, "upfile should be named 'upfile'!");
            }
            if (filesize !== req.files.upfile.size) {
                end(res, 411, 'file sizes do not match!');
            }

            // file is saved by some NodeJS magic...
            res.send();
            if (res.statusCode === 200) {
                pblog(console.log, res.req.method + ' ' + res.req.url, res.statusCode);
            }
        });


        app.post('/test', function (req, res) {
            var password = req.body.password;
            if (password !== config[section_name].Password) {
                end(res, 403, 'wrong password!');
            }

            fs.access(config[section_name].MediaRoot, fs.W_OK, function (err) {
                if (err) {
                    end(res, 500, "Can't write to MEDIA_ROOT!");
                } else {
                    res.send();
                    // console.log(res.req.method + ' ' + res.req.url, res.statusCode);
                    pblog(console.log, res.req.method + ' ' + res.req.url, res.statusCode);
                }
            });
        });
    }


    // show error and return response
    function end(res, code, message) {
        res.status(code).send({ error: message });
        pblog(console.error, res.req.method + ' ' + res.req.url, code + ' => ' + message);
    }


    // minimalist logger
    function pblog(console_func, message, suffix) {
        console_func((new Date()).toISOString(), message || '', suffix || '');
    }
}());
