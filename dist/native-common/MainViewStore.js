"use strict";
/**
 * MainViewStore.tsx
 *
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT license.
 *
 * A simple store that publishes changes to the main element
 * provided by the app.
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
var subscribableevent_1 = require("subscribableevent");
var MainViewStore = /** @class */ (function (_super) {
    __extends(MainViewStore, _super);
    function MainViewStore() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    MainViewStore.prototype.getMainView = function () {
        return this._mainView;
    };
    MainViewStore.prototype.setMainView = function (view) {
        this._mainView = view;
        this.fire();
    };
    return MainViewStore;
}(subscribableevent_1.default));
exports.MainViewStore = MainViewStore;
exports.default = new MainViewStore();
