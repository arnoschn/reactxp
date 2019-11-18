"use strict";
/**
 * Linking.ts
 *
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT license.
 *
 * RN-specific implementation for deep linking.
 */
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
var RN = require("react-native");
var SyncTasks = require("synctasks");
var Interfaces_1 = require("../common/Interfaces");
var Linking_1 = require("../common/Linking");
var Linking = /** @class */ (function (_super) {
    __extends(Linking, _super);
    function Linking() {
        var _this = _super.call(this) || this;
        RN.Linking.addEventListener('url', function (event) {
            _this.deepLinkRequestEvent.fire(event.url);
        });
        return _this;
    }
    Linking.prototype._openUrl = function (url) {
        return SyncTasks.fromThenable(RN.Linking.canOpenURL(url))
            .then(function (value) {
            if (!value) {
                var linkingError = {
                    code: Interfaces_1.Types.LinkingErrorCode.NoAppFound,
                    url: url,
                    description: 'No app found to handle url: ' + url
                };
                return SyncTasks.Rejected(linkingError);
            }
            else {
                return SyncTasks.fromThenable(RN.Linking.openURL(url));
            }
        }).catch(function (error) {
            var linkingError = {
                code: Interfaces_1.Types.LinkingErrorCode.UnexpectedFailure,
                url: url,
                description: error
            };
            return SyncTasks.Rejected(linkingError);
        });
    };
    Linking.prototype.getInitialUrl = function () {
        return SyncTasks.fromThenable(RN.Linking.getInitialURL())
            .then(function (url) { return !!url ? url : undefined; })
            .catch(function (error) {
            var linkingError = {
                code: Interfaces_1.Types.LinkingErrorCode.InitialUrlNotFound,
                description: error
            };
            return SyncTasks.Rejected(linkingError);
        });
    };
    // Launches Email app
    Linking.prototype.launchEmail = function (emailInfo) {
        // Format email info
        var emailUrl = this._createEmailUrl(emailInfo);
        return this._openUrl(emailUrl);
    };
    return Linking;
}(Linking_1.Linking));
exports.Linking = Linking;
exports.default = new Linking();
