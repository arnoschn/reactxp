"use strict";
/**
 * Text.tsx
 *
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT license.
 *
 * Android-specific implementation of Text component.
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
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", { value: true });
var React = require("react");
var RN = require("react-native");
var AccessibilityUtil_1 = require("../native-common/AccessibilityUtil");
var Styles_1 = require("../native-common/Styles");
var Text_1 = require("../native-common/Text");
var _styles = {
    defaultText: Styles_1.default.createTextStyle({
        includeFontPadding: false,
        textAlignVertical: 'center'
    })
};
var Text = /** @class */ (function (_super) {
    __extends(Text, _super);
    function Text() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    Text.prototype._getStyles = function () {
        return [_styles.defaultText, this.props.style];
    };
    // We override the render method to work around a couple of Android-specific
    // bugs in RN. First, numberOfLines needs to be set to null rather than 0 to
    // indicate an unbounded number of lines. Second, ellipsizeMode needs to be set
    // to null to indicate the default behavior.
    Text.prototype.render = function () {
        var importantForAccessibility = AccessibilityUtil_1.default.importantForAccessibilityToString(this.props.importantForAccessibility);
        var extendedProps = {
            maxContentSizeMultiplier: this.props.maxContentSizeMultiplier
        };
        return (React.createElement(RN.Text, __assign({ style: this._getStyles(), ref: this._onMount, importantForAccessibility: importantForAccessibility, numberOfLines: this.props.numberOfLines === 0 ? undefined : this.props.numberOfLines, allowFontScaling: this.props.allowFontScaling, ellipsizeMode: this.props.ellipsizeMode, onPress: this.props.onPress, textBreakStrategy: this.props.textBreakStrategy, testID: this.props.testId }, extendedProps), this.props.children));
    };
    return Text;
}(Text_1.Text));
exports.Text = Text;
exports.default = Text;
