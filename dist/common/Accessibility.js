"use strict";
/**
 * Accessibility.ts
 *
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT license.
 *
 * Common wrapper for accessibility helper exposed from ReactXP.
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
var RX = require("../common/Interfaces");
var Accessibility = /** @class */ (function (_super) {
    __extends(Accessibility, _super);
    function Accessibility() {
        var _this = _super !== null && _super.apply(this, arguments) || this;
        _this.screenReaderChangedEvent = new subscribableevent_1.default();
        _this.newAnnouncementReadyEvent = new subscribableevent_1.default();
        return _this;
    }
    Accessibility.prototype.isHighContrastEnabled = function () {
        return false;
    };
    Accessibility.prototype.announceForAccessibility = function (announcement) {
        this.newAnnouncementReadyEvent.fire(announcement);
    };
    return Accessibility;
}(RX.Accessibility));
exports.Accessibility = Accessibility;
exports.default = Accessibility;
