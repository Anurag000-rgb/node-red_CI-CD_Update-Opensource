/**
 * Copyright JS Foundation and other contributors, http://js.foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 **/

var express = require("express");
var path = require('path');

var comms = require("./comms");
var library = require("./library");

var auth = require("../auth");
var needsPermission = auth.needsPermission;
var runtime;
var log;
var apiUtil = require("../util");

var ensureRuntimeStarted = function(req,res,next) {
    if (!runtime.isStarted()) {
        log.error("Node-RED runtime not started");
        res.status(503).send("Not started");
    } else {
        next();
    }
}

module.exports = {
    init: function(server, _runtime) {
        runtime = _runtime;
        log = runtime.log;
        var settings = runtime.settings;
        if (!settings.disableEditor) {

            comms.init(server,runtime);

            var ui = require("./ui");
            ui.init(runtime);
            var editorApp = express();
            if (settings.requireHttps === true) {
                editorApp.enable('trust proxy');
                editorApp.use(function (req, res, next) {
                    if (req.secure) {
                        next();
                    } else {
                        res.redirect('https://' + req.headers.host + req.originalUrl);
                    }
                });
            }
            editorApp.get("/",ensureRuntimeStarted,ui.ensureSlash,ui.editor);
            editorApp.get("/icons/:module/:icon",ui.icon);
            editorApp.get("/icons/:scope/:module/:icon",ui.icon);

            var theme = require("./theme");
            theme.init(runtime);
            editorApp.use("/theme",theme.app());
            editorApp.use("/",ui.editorResources);

            // //Projects
            // var projects = require("./projects");
            // projects.init(runtime);
            // editorApp.get("/projects",projects.app());

            // Locales
            var locales = require("./locales");
            locales.init(runtime);
            editorApp.get('/locales/nodes',locales.getAllNodes,apiUtil.errorHandler);
            editorApp.get(/locales\/(.+)\/?$/,locales.get,apiUtil.errorHandler);

            // Library
            var library = require("./library");
            library.init(editorApp,runtime);
            editorApp.post(new RegExp("/library/flows\/(.*)"),needsPermission("library.write"),library.post,apiUtil.errorHandler);
            editorApp.get("/library/flows",needsPermission("library.read"),library.getAll,apiUtil.errorHandler);
            editorApp.get(new RegExp("/library/flows\/(.*)"),needsPermission("library.read"),library.get,apiUtil.errorHandler);

            // Credentials
            var credentials = require("./credentials");
            credentials.init(runtime);
            editorApp.get('/credentials/:type/:id', needsPermission("credentials.read"),credentials.get,apiUtil.errorHandler);

            return editorApp;
        }
    },
    start: function() {
        var catalogPath = path.resolve(path.join(__dirname,"locales"));
        return runtime.i18n.registerMessageCatalogs([
            {namespace: "editor",   dir: catalogPath, file:"editor.json"},
            {namespace: "jsonata",  dir: catalogPath, file:"jsonata.json"},
            {namespace: "infotips", dir: catalogPath, file:"infotips.json"}
        ]).then(function(){
            comms.start();
        });
    },
    stop: comms.stop,
    publish: comms.publish,
    registerLibrary: library.register
}
