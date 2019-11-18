"use strict";
/**
 * Storage.ts
 *
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT license.
 *
 * Native implementation of the cross-platform database storage abstraction.
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
var RX = require("../common/Interfaces");
var Storage = /** @class */ (function (_super) {
    __extends(Storage, _super);
    function Storage() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    Storage.prototype.getItem = function (key) {
        var deferred = SyncTasks.Defer();
        RN.AsyncStorage.getItem(key, function (error, result) {
            if (!error) {
                deferred.resolve(result || undefined);
            }
            else {
                deferred.reject(error);
            }
        }).catch(function (err) {
            deferred.reject(err);
        });
        return deferred.promise();
    };
    Storage.prototype.setItem = function (key, value) {
        var deferred = SyncTasks.Defer();
        RN.AsyncStorage.setItem(key, value, function (error) {
            if (!error) {
                deferred.resolve(void 0);
            }
            else {
                deferred.reject(error);
            }
        }).catch(function (err) {
            deferred.reject(err);
        });
        return deferred.promise();
    };
    Storage.prototype.removeItem = function (key) {
        var deferred = SyncTasks.Defer();
        RN.AsyncStorage.removeItem(key, function (error) {
            if (!error) {
                deferred.resolve(void 0);
            }
            else {
                deferred.reject(error);
            }
        }).catch(function (err) {
            deferred.reject(err);
        });
        return deferred.promise();
    };
    Storage.prototype.clear = function () {
        var deferred = SyncTasks.Defer();
        RN.AsyncStorage.clear(function (error) {
            if (!error) {
                deferred.resolve(void 0);
            }
            else {
                deferred.reject(error);
            }
        }).catch(function (err) {
            deferred.reject(err);
        });
        return deferred.promise();
    };
    return Storage;
}(RX.Storage));
exports.Storage = Storage;
exports.default = new Storage();
